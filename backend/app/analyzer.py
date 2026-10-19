"""Turn a call transcript into tagged, redacted concerns.

Two modes:
  * LLM (set ANTHROPIC_API_KEY): reads the transcript and returns structured concerns.
  * Rules (no key, or the LLM call fails): keyword matching. Cruder, but free and
    deterministic, which makes it perfect for demos and tests.
Both paths redact phone numbers and emails before anything is stored.
"""
import json
import os
import re

from .db import cursor

CATEGORIES = ["fees", "placement", "parental_approval", "timing", "course_fit", "trust", "competitor", "other"]

_PHONE = re.compile(r"(\+?\d[\d\s\-]{8,}\d)")
_EMAIL = re.compile(r"[\w.+-]+@[\w-]+\.[\w.]+")


def redact(text: str) -> str:
    return _PHONE.sub("[phone]", _EMAIL.sub("[email]", text or ""))


RULES = {
    "fees": r"\b(fee|fees|price|cost|expensive|afford|emi|loan|discount|budget)\b",
    "placement": r"\b(placement|placements|job|jobs|package|salary|hiring|recruit)\w*",
    "parental_approval": r"\b(parent|parents|father|mother|dad|mom|family)\b.*\b(ask|discuss|approve|permission|decide|talk)",
    "timing": r"\b(next month|next batch|later|exam|exams|busy|start date|timing)\b",
    "course_fit": r"\b(syllabus|curriculum|too basic|too advanced|not relevant|modules)\b",
    "trust": r"\b(reviews?|fake|scam|genuine|accredit\w*|certified|trust\w*)\b",
    "competitor": r"\b(other institute|another institute|competitor|cheaper elsewhere|compar)\w*",
}


_AGENT_LINE = re.compile(r"^\s*(agent|counsellor|counselor|rep|sales)\s*:", re.I)


def _prospect_sentences(text: str) -> list[str]:
    """Sentences spoken by the prospect. Unlabelled transcripts are treated as all-prospect."""
    out = []
    for line in (text or "").splitlines():
        if _AGENT_LINE.match(line):
            continue
        line = re.sub(r"^\s*(prospect|customer|student|caller)\s*:\s*", "", line, flags=re.I)
        out += [s.strip() for s in re.split(r"(?<=[.!?])\s+", line) if s.strip()]
    return out


def rule_extract(transcript: str) -> list[dict]:
    found, seen = [], set()
    for sentence in _prospect_sentences(transcript):
        for cat, pattern in RULES.items():
            if cat not in seen and re.search(pattern, sentence, re.I):
                found.append({"category": cat, "excerpt": redact(sentence)[:280]})
                seen.add(cat)
    return found


_PROMPT = """You analyse sales call transcripts for an education company.
Identify the concerns the PROSPECT raised (not the agent). For each, return:
- category: one of {cats}
- excerpt: one short sentence the prospect said (max 30 words), with names, phone numbers and emails replaced by [name], [phone], [email]

Return ONLY a JSON array, e.g. [{{"category": "fees", "excerpt": "..."}}]. Return [] if there are none.

Transcript:
{transcript}"""


def llm_extract(transcript: str) -> list[dict]:
    import anthropic  # imported lazily so rules-only deployments don't need it

    client = anthropic.Anthropic()
    msg = client.messages.create(
        model=os.getenv("XRAY_MODEL", "claude-haiku-5-5"),
        max_tokens=800,
        messages=[{"role": "user", "content": _PROMPT.format(cats=", ".join(CATEGORIES), transcript=transcript[:20000])}],
    )
    text = "".join(b.text for b in msg.content if b.type == "text")
    match = re.search(r"\[.*\]", text, re.S)
    items = json.loads(match.group(0)) if match else []
    clean = []
    for it in items:
        cat = it.get("category", "other")
        clean.append({
            "category": cat if cat in CATEGORIES else "other",
            "excerpt": redact(str(it.get("excerpt", "")))[:280],
        })
    return clean


def extract(transcript: str) -> tuple[list[dict], str]:
    if os.getenv("ANTHROPIC_API_KEY"):
        try:
            return llm_extract(transcript), "llm"
        except Exception:  # fall back rather than lose the call
            pass
    return rule_extract(transcript), "rule"


def analyze_pending(limit: int = 50) -> dict:
    """Process calls that have a transcript but haven't been analysed yet."""
    with cursor() as cur:
        cur.execute(
            """
            select c.id, c.prospect_id, c.transcript,
                   (select e.stage_key from call_stage_events e join stages s on s.key = e.stage_key
                     where e.call_id = c.id order by s.seq desc limit 1) as last_stage
            from calls c
            where c.analyzed_at is null and c.transcript is not null
            order by c.started_at
            limit %(limit)s
            """,
            {"limit": limit},
        )
        calls = cur.fetchall()

        counts = {"calls": 0, "concerns": 0, "llm": 0, "rule": 0}
        for call in calls:
            concerns, source = extract(call["transcript"])
            for c in concerns:
                cur.execute(
                    """insert into call_concerns (call_id, prospect_id, stage_key, category, excerpt, source)
                       values (%(call)s, %(prospect)s, %(stage)s, %(cat)s, %(excerpt)s, %(source)s)""",
                    {"call": call["id"], "prospect": call["prospect_id"], "stage": call["last_stage"],
                     "cat": c["category"], "excerpt": c["excerpt"], "source": source},
                )
            cur.execute("update calls set analyzed_at = now() where id = %(id)s", {"id": call["id"]})
            counts["calls"] += 1
            counts["concerns"] += len(concerns)
            counts[source] += 1
    return counts
