"""CALL DNA: Decision Fingerprints, similarity retrieval and outcome learning.

Pipeline
  1. build_pending(): after a call ends, find its turning point (the last concern the
     prospect raised and the caller's reply to it) and store a fingerprint.
  2. match(): during a live call, take what the prospect just said, find past
     fingerprints from the same stage with the same concern, rank them by text
     similarity, and summarise how each kind of response turned out.
  3. playbook(): outcome rates per response strategy, with sample sizes and 95%
     ranges, so the screen never presents a small sample as a rule.

Everything is "associated with", never "causes": calls differ in many ways besides
the reply. Experiments (experiments.py) are how you confirm a pattern.
"""
import math
import re
from collections import Counter

from .analyzer import RULES, _AGENT_LINE, redact
from .db import cursor, fetch_all, fetch_one
from .stats import two_proportion_test, wilson_interval

STRATEGIES = {
    "outcomes_first": ("Outcomes first", r"placement report|last batch|placed|outcomes?|alumni|hired from"),
    "emi_offer":      ("EMI / instalments", r"\bemi\b|instal+ments?|split the fee|per month|monthly"),
    "discount":       ("Discount / scholarship", r"discount|scholarship|% off|reduce the fee|lower the fee"),
    "parent_call":    ("Involve parents", r"parents?|family|father|mother"),
    "defer":          ("Send details later", r"send you|call you back|get back|think about it|whatsapp|later"),
    "reassure":       ("General reassurance", r".*"),  # fallback
}
STRATEGY_LABELS = {k: v[0] for k, v in STRATEGIES.items()}

CONCERN_CODES = {"fees": "FEE", "placement": "PLC", "parental_approval": "PAR", "timing": "TIM",
                 "course_fit": "FIT", "trust": "TRU", "competitor": "CMP", "other": "OTH"}
STRATEGY_CODES = {"outcomes_first": "OUT", "emi_offer": "EMI", "discount": "DSC",
                  "parent_call": "PAR", "defer": "DEF", "reassure": "RSR"}
MIN_N = 20  # per-strategy sample before we compare


# ---------- fingerprint extraction ----------

def detect_concern(text: str) -> str | None:
    for cat, pattern in RULES.items():
        if re.search(pattern, text or "", re.I):
            return cat
    return None


def classify_strategy(reply: str) -> str:
    for key, (_, pattern) in STRATEGIES.items():
        if key != "reassure" and re.search(pattern, reply or "", re.I):
            return key
    return "reassure"


def turning_point(transcript: str) -> dict | None:
    """The last prospect line that raised a concern, plus the caller's next line."""
    lines = [l.strip() for l in (transcript or "").splitlines() if l.strip()]
    point = None
    for i, line in enumerate(lines):
        if _AGENT_LINE.match(line):
            continue
        said = re.sub(r"^\s*\w+\s*:\s*", "", line)
        concern = detect_concern(said)
        if not concern:
            continue
        reply = next((re.sub(r"^\s*\w+\s*:\s*", "", l) for l in lines[i + 1:] if _AGENT_LINE.match(l)), "")
        point = {"concern": concern, "prospect_quote": redact(said)[:280], "caller_response": redact(reply)[:400]}
    if point:
        point["strategy"] = classify_strategy(point["caller_response"])
    return point


def make_code(stage_seq: int, concern: str, strategy: str) -> str:
    return f"{stage_seq}-{CONCERN_CODES.get(concern, 'OTH')}-{STRATEGY_CODES.get(strategy, 'RSR')}"


def build_pending(limit: int = 500) -> dict:
    """Fingerprint every call that has a transcript and no fingerprint yet."""
    with cursor() as cur:
        cur.execute(
            """
            select c.id, c.prospect_id, c.transcript,
                   (select s.key from call_stage_events e join stages s on s.key = e.stage_key
                     where e.call_id = c.id and s.key <> 'enrolled' order by s.seq desc limit 1) as stage_key,
                   (select s.seq from call_stage_events e join stages s on s.key = e.stage_key
                     where e.call_id = c.id and s.key <> 'enrolled' order by s.seq desc limit 1) as stage_seq
            from calls c
            join prospects p on p.id = c.prospect_id
            left join call_fingerprints f on f.call_id = c.id
            where f.call_id is null and c.transcript is not null
              and coalesce(p.source, '') not like 'call_guide%%'  -- guide calls have no caller wording yet
            order by c.started_at
            limit %(limit)s
            """,
            {"limit": limit},
        )
        rows = cur.fetchall()
        built = skipped = 0
        batch = []
        for r in rows:
            tp = turning_point(r["transcript"])
            if not tp or not r["stage_key"]:
                skipped += 1
                continue
            batch.append({**tp, "call_id": r["id"], "prospect_id": r["prospect_id"], "stage_key": r["stage_key"],
                          "code": make_code(r["stage_seq"], tp["concern"], tp["strategy"])})
            built += 1
        if batch:
            cur.executemany(
                """insert into call_fingerprints
                     (call_id, prospect_id, stage_key, concern, prospect_quote, caller_response, strategy, code)
                   values (%(call_id)s, %(prospect_id)s, %(stage_key)s, %(concern)s, %(prospect_quote)s,
                           %(caller_response)s, %(strategy)s, %(code)s)
                   on conflict (call_id) do nothing""",
                batch,
            )
    return {"built": built, "skipped_no_turning_point": skipped}


# ---------- presentation ----------

def _view(r: dict) -> dict:
    return {
        "call_id": str(r["call_id"]),
        "call_ref": str(r["call_id"])[:8],
        "code": r["code"],
        "stage_key": r["stage_key"],
        "turning_seq": r["turning_seq"],
        "max_seq": r["max_seq"],
        "concern": r["concern"],
        "strategy": r["strategy"],
        "strategy_label": STRATEGY_LABELS.get(r["strategy"], r["strategy"]),
        "prospect_quote": r["prospect_quote"],
        "caller_response": r["caller_response"],
        "outcome": r["outcome"],
        "agent_id": r.get("agent_id"),
        "started_at": r.get("started_at"),
    }


def fingerprint(call_id: str) -> dict | None:
    """End-of-call card: this call's fingerprint plus how its twins turned out."""
    r = fetch_one("select * from call_dna where call_id = %(id)s", {"id": call_id})
    if not r:
        return None
    twins = fetch_all(
        """select outcome, count(*) as n from call_dna
           where code = %(code)s and call_id <> %(id)s group by outcome""",
        {"code": r["code"], "id": call_id},
    )
    t = {row["outcome"]: row["n"] for row in twins}
    decided = t.get("progressed", 0) + t.get("stalled", 0)
    lo, hi = wilson_interval(t.get("progressed", 0), decided)
    return {
        **_view(r),
        "twins": {"total": sum(t.values()), "decided": decided, "progressed": t.get("progressed", 0),
                  "rate": round(t.get("progressed", 0) / decided, 4) if decided else None,
                  "ci": [round(lo, 4), round(hi, 4)]},
    }


def recent(limit: int = 12) -> list[dict]:
    return [_view(r) for r in fetch_all("select * from call_dna order by started_at desc limit %(l)s", {"l": limit})]


# ---------- outcome learning ----------

def playbook(stage_key: str, concern: str) -> dict:
    rows = fetch_all(
        """select strategy,
                  count(*) filter (where outcome = 'progressed') as progressed,
                  count(*) filter (where outcome in ('progressed','stalled')) as decided,
                  count(*) filter (where outcome = 'open') as open
           from call_dna where stage_key = %(stage)s and concern = %(concern)s
           group by strategy""",
        {"stage": stage_key, "concern": concern},
    )
    total_p = sum(r["progressed"] for r in rows)
    total_d = sum(r["decided"] for r in rows)
    out = []
    for r in rows:
        lo, hi = wilson_interval(r["progressed"], r["decided"])
        rest_p, rest_d = total_p - r["progressed"], total_d - r["decided"]
        test = two_proportion_test(r["progressed"], r["decided"], rest_p, rest_d)
        enough = r["decided"] >= MIN_N and rest_d >= MIN_N
        if not enough:
            signal = "too_few_calls"
        elif test["p_value"] is not None and test["p_value"] < 0.05:
            signal = "better_than_rest" if test["lift_pts"] > 0 else "worse_than_rest"
        else:
            signal = "no_clear_difference"
        out.append({
            "strategy": r["strategy"],
            "label": STRATEGY_LABELS.get(r["strategy"], r["strategy"]),
            "decided": r["decided"],
            "open": r["open"],
            "progressed": r["progressed"],
            "rate": round(r["progressed"] / r["decided"], 4) if r["decided"] else None,
            "ci": [round(lo, 4), round(hi, 4)],
            "vs_rest_pts": test["lift_pts"],
            "p_value": test["p_value"],
            "signal": signal,
        })
    out.sort(key=lambda x: (x["rate"] or 0), reverse=True)
    base = total_p / total_d if total_d else None
    return {"stage_key": stage_key, "concern": concern, "decided": total_d,
            "baseline_rate": round(base, 4) if base is not None else None, "strategies": out, "min_n": MIN_N}


# ---------- similarity retrieval ----------

_STOP = set("i a an the is it to of and or for on in my me be this that so can do you your we are with at have has "
            "there any what how but if not just right now".split())


def _tokens(text: str) -> list[str]:
    return [t for t in re.findall(r"[a-z]+", (text or "").lower()) if t not in _STOP and len(t) > 1]


def _rank(query: str, docs: list[dict]) -> list[tuple[float, dict]]:
    """TF-IDF cosine over the candidate set. Swap for pgvector embeddings at scale."""
    toks = [Counter(_tokens(d["prospect_quote"])) for d in docs]
    df = Counter(t for c in toks for t in c)
    n = len(docs) + 1
    idf = {t: math.log(n / (1 + f)) + 1 for t, f in df.items()}

    def vec(c):
        v = {t: tf * idf.get(t, math.log(n) + 1) for t, tf in c.items()}
        norm = math.sqrt(sum(x * x for x in v.values())) or 1.0
        return {t: x / norm for t, x in v.items()}

    q = vec(Counter(_tokens(query)))
    scored = []
    for d, c in zip(docs, toks):
        v = vec(c)
        scored.append((sum(q[t] * v.get(t, 0) for t in q), d))
    return sorted(scored, key=lambda x: x[0], reverse=True)


def match(stage_key: str, utterance: str, k: int = 5) -> dict:
    """'This has happened before': past situations like the one on the call right now."""
    concern = detect_concern(utterance) or "other"
    stage = fetch_one("select key, label, seq from stages where key = %(s)s", {"s": stage_key})
    if not stage:
        raise ValueError("unknown stage")
    candidates = fetch_all(
        """select * from call_dna where stage_key = %(stage)s and concern = %(concern)s
           order by started_at desc limit 3000""",
        {"stage": stage_key, "concern": concern},
    )
    ranked = _rank(utterance, candidates)
    # Prefer decided outcomes in the examples, since open ones can't teach anything yet.
    decided = [(s, d) for s, d in ranked if d["outcome"] != "open"]
    examples = []
    for strat_first in (True, False):  # show a spread of strategies, not five copies of one
        for score, d in decided:
            if len(examples) >= k:
                break
            if strat_first and any(e["strategy"] == d["strategy"] for e in examples):
                continue
            if any(e["call_id"] == str(d["call_id"]) for e in examples):
                continue
            examples.append({**_view(d), "similarity": round(score, 3)})
    pb = playbook(stage_key, concern)
    # One example per response type, ordered best-performing first, each tagged with
    # how that response did overall so a single example is never read as the rule.
    order = {s["strategy"]: i for i, s in enumerate(pb["strategies"])}
    stats = {s["strategy"]: s for s in pb["strategies"]}
    for e in examples:
        e["strategy_rate"] = stats.get(e["strategy"], {}).get("rate")
        e["strategy_n"] = stats.get(e["strategy"], {}).get("decided", 0)
    examples.sort(key=lambda e: (order.get(e["strategy"], 99), -e["similarity"]))
    best = next((s for s in pb["strategies"] if s["signal"] == "better_than_rest"), None)
    worst = next((s for s in reversed(pb["strategies"]) if s["signal"] == "worse_than_rest"), None)
    return {
        "stage": stage,
        "concern": concern,
        "seen_before": len(candidates),
        "examples": examples,
        "playbook": pb,
        "suggestion": {
            "use": best and {"strategy": best["strategy"], "label": best["label"], "rate": best["rate"], "n": best["decided"]},
            "avoid": worst and {"strategy": worst["strategy"], "label": worst["label"], "rate": worst["rate"], "n": worst["decided"]},
            "note": None if best else "Not enough history to single out a response yet. Showing past examples only.",
        },
    }
