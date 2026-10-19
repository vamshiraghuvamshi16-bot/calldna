"""Revenue X-Ray analytics. Plain SQL does the counting; Python does the judging.

Funnel logic
------------
A prospect "reached" stage k if any call hit stage k (enrolled prospects reach
every stage). Progression from k to k+1 is measured only on *decided*
prospects: those that went past k, or whose outcome is closed. Prospects still
open at stage k are in flight, so counting them as drop-offs would make every
recent stage look like a bottleneck.
"""
from datetime import date

from .db import fetch_all, fetch_one
from .stats import wilson_interval

MIN_SAMPLE = 30  # below this we show numbers but refuse to flag a bottleneck

CONCERN_LABELS = {
    "fees": "Fees / affordability",
    "placement": "Placement outcomes",
    "parental_approval": "Parental approval",
    "timing": "Timing / batch dates",
    "course_fit": "Course fit / curriculum",
    "trust": "Trust / credibility",
    "competitor": "Comparing competitors",
    "other": "Other",
}

_RANGE = """
  (%(date_from)s::date is null or created_at >= %(date_from)s::date)
  and (%(date_to)s::date is null or created_at < (%(date_to)s::date + 1))
"""


def _params(date_from: date | None, date_to: date | None, **extra) -> dict:
    return {"date_from": date_from, "date_to": date_to, **extra}


def summary(date_from=None, date_to=None) -> dict:
    row = fetch_one(
        f"""
        select
          count(*)                                        as enquiries,
          count(*) filter (where outcome = 'enrolled')    as enrolments,
          count(*) filter (where outcome = 'lost')        as lost,
          count(*) filter (where outcome = 'open')        as open,
          coalesce(sum(revenue) filter (where outcome = 'enrolled'), 0) as revenue
        from prospects
        where {_RANGE}
        """,
        _params(date_from, date_to),
    )
    decided = row["enrolments"] + row["lost"]
    low, high = wilson_interval(row["enrolments"], decided)
    return {
        **row,
        "revenue": float(row["revenue"]),
        "decided": decided,
        "conversion_rate": round(row["enrolments"] / decided, 4) if decided else None,
        "conversion_ci": [round(low, 4), round(high, 4)],
    }


def funnel(date_from=None, date_to=None) -> list[dict]:
    rows = fetch_all(
        f"""
        with m as (select * from prospect_max_stage where {_RANGE})
        select
          s.key, s.label, s.seq,
          count(m.prospect_id) filter (where m.max_seq >= s.seq) as reached,
          count(m.prospect_id) filter (
            where m.max_seq >= s.seq and (m.max_seq > s.seq or m.outcome <> 'open')
          ) as decided,
          count(m.prospect_id) filter (where m.max_seq > s.seq) as progressed,
          count(m.prospect_id) filter (where m.max_seq = s.seq and m.outcome = 'lost') as lost_here
        from stages s
        left join m on true
        group by s.key, s.label, s.seq
        order by s.seq
        """,
        _params(date_from, date_to),
    )
    last_seq = max(r["seq"] for r in rows) if rows else 0
    out = []
    for r in rows:
        is_final = r["seq"] == last_seq
        rate = (r["progressed"] / r["decided"]) if (r["decided"] and not is_final) else None
        low, high = wilson_interval(r["progressed"], r["decided"]) if rate is not None else (None, None)
        out.append({
            **r,
            "is_final": is_final,
            "progression_rate": round(rate, 4) if rate is not None else None,
            "progression_ci": [round(low, 4), round(high, 4)] if rate is not None else None,
        })
    return out


def bottleneck(date_from=None, date_to=None) -> dict | None:
    """The stage losing the most decided prospects, with enough data to say so."""
    stages = [s for s in funnel(date_from, date_to) if not s["is_final"] and s["decided"] >= MIN_SAMPLE]
    if not stages:
        return None
    worst = max(stages, key=lambda s: s["decided"] - s["progressed"])
    others = [s for s in stages if s["key"] != worst["key"]]
    typical = (
        sum(s["progressed"] for s in others) / sum(s["decided"] for s in others)
        if others and sum(s["decided"] for s in others) else None
    )
    return {
        "stage_key": worst["key"],
        "stage_label": worst["label"],
        "decided": worst["decided"],
        "stalled": worst["decided"] - worst["progressed"],
        "progression_rate": worst["progression_rate"],
        "progression_ci": worst["progression_ci"],
        "typical_progression_rate": round(typical, 4) if typical is not None else None,
    }


def concerns_at_stage(stage_key: str, date_from=None, date_to=None) -> list[dict]:
    """How often each concern appears among prospects who stalled at a stage vs. those who moved past it.

    A concern that is common in both groups is just normal conversation. A concern
    that is much more common among stalled prospects is a lead worth testing.
    """
    rows = fetch_all(
        f"""
        with target as (select seq from stages where key = %(stage)s),
        cohort as (
          select m.prospect_id,
                 (m.max_seq = t.seq and m.outcome = 'lost') as stalled,
                 (m.max_seq > t.seq)                        as progressed
          from prospect_max_stage m, target t
          where m.max_seq >= t.seq and {_RANGE.replace('created_at', 'm.created_at')}
        ),
        tagged as (
          select distinct c.prospect_id, cc.category
          from cohort c join call_concerns cc on cc.prospect_id = c.prospect_id
        )
        select
          cat.category,
          (select count(*) from cohort where stalled)    as stalled_total,
          (select count(*) from cohort where progressed) as progressed_total,
          count(*) filter (where co.stalled)    as stalled_with,
          count(*) filter (where co.progressed) as progressed_with
        from (select distinct category from tagged) cat
        left join tagged t  on t.category = cat.category
        left join cohort co on co.prospect_id = t.prospect_id
        group by cat.category
        """,
        _params(date_from, date_to, stage=stage_key),
    )
    out = []
    for r in rows:
        s_rate = r["stalled_with"] / r["stalled_total"] if r["stalled_total"] else 0
        p_rate = r["progressed_with"] / r["progressed_total"] if r["progressed_total"] else 0
        out.append({
            "category": r["category"],
            "label": CONCERN_LABELS.get(r["category"], r["category"]),
            "stalled_share": round(s_rate, 4),
            "progressed_share": round(p_rate, 4),
            "stalled_with": r["stalled_with"],
            "stalled_total": r["stalled_total"],
            "progressed_with": r["progressed_with"],
            "progressed_total": r["progressed_total"],
            "over_representation": round(s_rate / p_rate, 2) if p_rate else None,
        })
    return sorted(out, key=lambda r: (r["stalled_share"] - r["progressed_share"]), reverse=True)


def evidence(stage_key: str, category: str | None = None, limit: int = 8) -> list[dict]:
    """Redacted excerpts from stalled prospects at this stage, newest first."""
    return fetch_all(
        """
        select cc.id, cc.category, cc.excerpt, cl.started_at, cl.agent_id,
               left(cc.call_id::text, 8) as call_ref
        from call_concerns cc
        join calls cl               on cl.id = cc.call_id
        join prospect_max_stage m   on m.prospect_id = cc.prospect_id
        join stages s               on s.key = %(stage)s
        where m.max_seq = s.seq and m.outcome = 'lost'
          and cc.excerpt is not null
          and (%(category)s::text is null or cc.category = %(category)s)
        order by cl.started_at desc
        limit %(limit)s
        """,
        {"stage": stage_key, "category": category, "limit": limit},
    )


def overview(date_from=None, date_to=None) -> dict:
    """Everything the CEO screen needs in one round trip."""
    b = bottleneck(date_from, date_to)
    concerns = concerns_at_stage(b["stage_key"], date_from, date_to) if b else []
    top = concerns[0] if concerns else None
    return {
        "summary": summary(date_from, date_to),
        "funnel": funnel(date_from, date_to),
        "bottleneck": b,
        "concerns": concerns,
        "evidence": evidence(b["stage_key"], top["category"] if top else None) if b else [],
        "min_sample": MIN_SAMPLE,
    }
