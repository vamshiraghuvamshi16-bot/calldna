"""Process experiments: assign prospects to control/treatment and measure the result.

Assignment is a deterministic hash of (experiment, prospect), so the same
prospect always lands in the same arm and agents can't cherry-pick who gets
the new script.
"""
import hashlib

from .db import fetch_all, fetch_one
from .stats import min_sample_per_arm, two_proportion_test, wilson_interval


def arm_for(experiment_id: str, prospect_id: str) -> str:
    h = hashlib.sha256(f"{experiment_id}:{prospect_id}".encode()).digest()
    return "treatment" if h[0] % 2 else "control"


def create(data: dict) -> dict:
    return fetch_one(
        """insert into experiments (name, hypothesis, change_description, target_stage, primary_metric)
           values (%(name)s, %(hypothesis)s, %(change_description)s, %(target_stage)s, %(primary_metric)s)
           returning *""",
        data,
    )


def assign(experiment_id: str, prospect_id: str) -> dict:
    arm = arm_for(experiment_id, prospect_id)
    return fetch_one(
        """insert into experiment_assignments (experiment_id, prospect_id, arm)
           values (%(e)s, %(p)s, %(arm)s)
           on conflict (experiment_id, prospect_id) do update set arm = experiment_assignments.arm
           returning *""",
        {"e": experiment_id, "p": prospect_id, "arm": arm},
    )


def set_status(experiment_id: str, status: str) -> dict:
    return fetch_one(
        """update experiments set status = %(s)s,
                  ended_at = case when %(s)s in ('stopped','completed') then now() else ended_at end
           where id = %(id)s returning *""",
        {"id": experiment_id, "s": status},
    )


def results(experiment_id: str) -> dict | None:
    exp = fetch_one("select e.*, s.seq as target_seq, s.label as target_label from experiments e "
                    "join stages s on s.key = e.target_stage where e.id = %(id)s", {"id": experiment_id})
    if not exp:
        return None

    # Only prospects that reached the target stage AND have been decided there count.
    arms = fetch_all(
        """
        select a.arm,
               count(*) as n,
               count(*) filter (where m.max_seq > %(seq)s) as progressed,
               count(*) filter (where m.outcome = 'enrolled') as enrolled
        from experiment_assignments a
        join prospect_max_stage m on m.prospect_id = a.prospect_id
        where a.experiment_id = %(id)s
          and m.max_seq >= %(seq)s
          and (m.max_seq > %(seq)s or m.outcome <> 'open')
        group by a.arm
        """,
        {"id": experiment_id, "seq": exp["target_seq"]},
    )
    by_arm = {a["arm"]: a for a in arms}
    empty = {"n": 0, "progressed": 0, "enrolled": 0}
    t, c = by_arm.get("treatment", empty), by_arm.get("control", empty)
    metric = "progressed" if exp["primary_metric"] == "progression" else "enrolled"

    def arm_view(a):
        rate = a[metric] / a["n"] if a["n"] else None
        lo, hi = wilson_interval(a[metric], a["n"])
        return {"n": a["n"], "successes": a[metric], "rate": round(rate, 4) if rate is not None else None,
                "ci": [round(lo, 4), round(hi, 4)]}

    test = two_proportion_test(t[metric], t["n"], c[metric], c["n"])
    baseline = c[metric] / c["n"] if c["n"] else 0.5
    needed = min_sample_per_arm(baseline, 0.05)  # to detect a 5-point lift

    if min(t["n"], c["n"]) < needed:
        verdict = "collecting_data"
    elif test["p_value"] is not None and test["p_value"] < 0.05:
        verdict = "treatment_better" if test["lift_pts"] > 0 else "treatment_worse"
    else:
        verdict = "no_clear_difference"

    return {
        "experiment": {k: v for k, v in exp.items() if k != "target_seq"},
        "metric": exp["primary_metric"],
        "treatment": arm_view(t),
        "control": arm_view(c),
        "test": test,
        "needed_per_arm": needed,
        "verdict": verdict,
    }


def list_all() -> list[dict]:
    exps = fetch_all("select * from experiments order by started_at desc")
    return [results(str(e["id"])) for e in exps]
