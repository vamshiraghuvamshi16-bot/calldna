"""Call guide: the endpoints the caller's screen uses during a live call.

  POST /calls                  start a call
  POST /calls/{id}/stages      save what happened at a stage (tap + prospect's words)
  POST /calls/{id}/close       close the call with its outcome
  GET  /calls                  list past calls and the stage each one reached
  GET  /calls/{id}             one call with all its stage results
  GET  /calls/guide            stages: purpose, what prospects tend to say, taps

Every stage result is also written as a stage event, and closing a call updates the
prospect's outcome, so CALL DNA and Insights learn from real calls automatically.
"""
import uuid
from datetime import datetime

from fastapi import HTTPException

from .analyzer import analyze_pending, redact
from .db import cursor, fetch_all, fetch_one

GUIDE_SOURCES = ("call_guide", "call_guide_sample")
OUTCOMES = {
    "enrolled": ("Enrolled", "enrolled"),
    "follow_up": ("Follow-up booked", "open"),
    "not_interested": ("Not interested", "lost"),
}


def guide() -> list[dict]:
    """Stages with their purpose, what prospects tend to say and the result taps.

    `heard_on_past_calls` adds the lines prospects most often said at that stage on
    real calls, so the hints grow from the team's own history.
    """
    stages = fetch_all(
        """select key, label, seq, purpose, prospect_lines, result_options
           from stages where key <> 'enrolled' order by seq"""
    )
    heard = fetch_all(
        """select stage_key, excerpt, count(*) as n
           from call_concerns
           where excerpt is not null and stage_key is not null
           group by stage_key, excerpt
           order by stage_key, n desc"""
    )
    by_stage: dict[str, list[dict]] = {}
    for h in heard:
        lst = by_stage.setdefault(h["stage_key"], [])
        if len(lst) < 3:
            lst.append({"text": h["excerpt"], "times": h["n"]})
    for s in stages:
        s["heard_on_past_calls"] = by_stage.get(s["key"], [])
    return stages


def start_call(caller_name: str, prospect_name: str | None, started_at: datetime | None = None,
               source: str = "call_guide") -> dict:
    with cursor() as cur:
        cur.execute(
            "insert into prospects (external_ref, source) values (%(ref)s, %(src)s) returning id",
            {"ref": prospect_name, "src": source},
        )
        prospect_id = cur.fetchone()["id"]
        cur.execute(
            """insert into calls (prospect_id, agent_id, caller_name, prospect_name, status, started_at)
               values (%(p)s, %(caller)s, %(caller)s, %(name)s, 'in_progress', coalesce(%(at)s, now()))
               returning id, started_at""",
            {"p": prospect_id, "caller": caller_name, "name": prospect_name, "at": started_at},
        )
        call = cur.fetchone()
    return get_call(str(call["id"]))


def _check_id(call_id: str) -> str:
    try:
        return str(uuid.UUID(call_id))
    except ValueError:
        raise HTTPException(404, "Call not found")


def _open_call(cur, call_id: str) -> dict:
    _check_id(call_id)
    cur.execute("select id, prospect_id, status from calls where id = %(id)s", {"id": call_id})
    call = cur.fetchone()
    if not call:
        raise HTTPException(404, "Call not found")
    if call["status"] != "in_progress":
        raise HTTPException(409, "This call is already closed")
    return call


def save_stage(call_id: str, stage_key: str, result: str, prospect_words: str | None) -> dict:
    with cursor() as cur:
        call = _open_call(cur, call_id)
        cur.execute("select key, result_options from stages where key = %(k)s", {"k": stage_key})
        stage = cur.fetchone()
        if not stage or stage_key == "enrolled":
            raise HTTPException(400, "Unknown stage")
        if result not in {o["key"] for o in stage["result_options"]}:
            raise HTTPException(400, "That result isn't one of this stage's options")
        words = redact((prospect_words or "").strip())[:2000] or None
        cur.execute(
            """insert into stage_results (call_id, stage_key, result, prospect_words)
               values (%(c)s, %(s)s, %(r)s, %(w)s)
               on conflict (call_id, stage_key)
               do update set result = excluded.result, prospect_words = excluded.prospect_words,
                             created_at = now()""",
            {"c": call_id, "s": stage_key, "r": result, "w": words},
        )
        cur.execute(
            """insert into call_stage_events (call_id, prospect_id, stage_key)
               select %(c)s, %(p)s, %(s)s
               where not exists (select 1 from call_stage_events where call_id = %(c)s and stage_key = %(s)s)""",
            {"c": call_id, "p": call["prospect_id"], "s": stage_key},
        )
    return get_call(call_id)


def close_call(call_id: str, outcome: str, notes: str | None, ended_at: datetime | None = None) -> dict:
    if outcome not in OUTCOMES:
        raise HTTPException(400, "Outcome must be enrolled, follow_up or not_interested")
    prospect_outcome = OUTCOMES[outcome][1]
    with cursor() as cur:
        call = _open_call(cur, call_id)
        cur.execute(
            """select r.stage_key, r.prospect_words, s.label, s.result_options, r.result
               from stage_results r join stages s on s.key = r.stage_key
               where r.call_id = %(c)s order by s.seq""",
            {"c": call_id},
        )
        results = cur.fetchall()
        # A transcript built from the prospect's own words lets the concern tagger
        # (and so Insights) learn from calls made on this screen.
        lines = []
        for r in results:
            if r["prospect_words"]:
                lines.append(f"Prospect: {r['prospect_words']}")
            label = next((o["label"] for o in r["result_options"] if o["key"] == r["result"]), r["result"])
            lines.append(f"Agent: [{r['label']}] {label}")
        cur.execute(
            """update calls set status = 'closed', outcome = %(o)s, notes = %(n)s,
                      ended_at = coalesce(%(at)s, now()),
                      duration_sec = extract(epoch from (coalesce(%(at)s, now()) - started_at))::int,
                      transcript = %(t)s, analyzed_at = null
               where id = %(c)s""",
            {"o": outcome, "n": (notes or "").strip() or None, "at": ended_at,
             "t": "\n".join(lines) or None, "c": call_id},
        )
        cur.execute(
            """update prospects set outcome = %(po)s,
                      outcome_at = case when %(po)s = 'open' then null else coalesce(%(at)s, now()) end
               where id = %(p)s""",
            {"po": prospect_outcome, "at": ended_at, "p": call["prospect_id"]},
        )
        if outcome == "enrolled":
            cur.execute(
                "insert into call_stage_events (call_id, prospect_id, stage_key) values (%(c)s, %(p)s, 'enrolled')",
                {"c": call_id, "p": call["prospect_id"]},
            )
    try:
        analyze_pending(limit=5)
    except Exception:
        pass  # tagging is a bonus; never block saving a call
    return get_call(call_id)


_CALL_FIELDS = """
  c.id, c.caller_name, c.prospect_name, c.status, c.outcome, c.notes,
  c.started_at, c.ended_at, c.duration_sec,
  (select max(s.seq) from stage_results r join stages s on s.key = r.stage_key where r.call_id = c.id) as reached_seq,
  (select s.label from stage_results r join stages s on s.key = r.stage_key
     where r.call_id = c.id order by s.seq desc limit 1) as reached_label,
  (select count(*) from stage_results r where r.call_id = c.id) as stages_done
"""


def _shape(row: dict) -> dict:
    row["id"] = str(row["id"])
    row["outcome_label"] = OUTCOMES.get(row["outcome"], (None,))[0]
    return row


def get_call(call_id: str) -> dict:
    call_id = _check_id(call_id)
    row = fetch_one(f"select {_CALL_FIELDS} from calls c where c.id = %(id)s", {"id": call_id})
    if not row:
        raise HTTPException(404, "Call not found")
    row = _shape(row)
    row["stages"] = fetch_all(
        """select r.stage_key, s.label, s.seq, r.result, r.prospect_words, r.created_at,
                  (select o->>'label' from jsonb_array_elements(s.result_options) o where o->>'key' = r.result) as result_label,
                  (select o->>'tone' from jsonb_array_elements(s.result_options) o where o->>'key' = r.result) as tone
           from stage_results r join stages s on s.key = r.stage_key
           where r.call_id = %(id)s order by s.seq""",
        {"id": call_id},
    )
    return row


def list_calls(limit: int = 50, outcome: str | None = None) -> list[dict]:
    rows = fetch_all(
        f"""select {_CALL_FIELDS}
            from calls c join prospects p on p.id = c.prospect_id
            where p.source = any(%(src)s)
              and (%(o)s::text is null or c.outcome = %(o)s)
            order by c.started_at desc
            limit %(l)s""",
        {"src": list(GUIDE_SOURCES), "o": outcome, "l": limit},
    )
    return [_shape(r) for r in rows]
