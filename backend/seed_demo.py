"""Seed ~1,000 fictional prospects with a planted fees-stage bottleneck and a running experiment.

    python seed_demo.py           # add demo data
    python seed_demo.py --reset   # remove previous demo data first

All data is synthetic and tagged source='demo_seed'. The dashboard labels it as demo data.
"""
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

from app.analyzer import rule_extract
from app.db import cursor

random.seed(42)
N = 1000
NOW = datetime.now(timezone.utc)
STAGES = ["enquiry", "discovery", "course_pitch", "placement", "fees", "closing", "enrolled"]
# Probability of moving from stage i to i+1. Fees -> closing is the planted bottleneck.
P_NEXT = [0.90, 0.85, 0.80, 0.85, 0.45, 0.80]
# How the caller answers a fees concern, and how that shifts the fees -> closing odds.
# The experiment's treatment arm is trained to use outcomes_first.
FEE_REPLIES = {
    "outcomes_first": (+0.17, ["Before we talk numbers, let me show you the placement report from the last batch.",
                               "Fair question. 40 students from the last batch were placed, here are the companies."]),
    "emi_offer":      (+0.08, ["We have a no-cost EMI option that splits the fee over 12 months.",
                               "You can pay in monthly instalments, so it's easier on the budget."]),
    "discount":       (+0.02, ["Let me check if a scholarship or discount is available for you.",
                               "I can try to get you an early-bird discount."]),
    "defer":          (-0.15, ["No problem, I'll send you the details on WhatsApp and you can think about it.",
                               "Sure, I'll call you back next week once you've decided."]),
    "reassure":       (0.00,  ["I understand, but the course is really worth it.",
                               "That's a fair point, it's a good investment in your career."]),
}
CONTROL_MIX = {"outcomes_first": 0.12, "emi_offer": 0.22, "discount": 0.20, "defer": 0.20, "reassure": 0.26}
AGENTS = ["agent_01", "agent_02", "agent_03", "agent_04", "agent_05"]
FEE_REVENUE = 45000

LINES = {
    "fees": ["The fee is a bit too expensive for me right now.", "Is there any EMI or discount on the fees?",
             "Honestly the cost is more than my budget."],
    "placement": ["What kind of placement support do you actually give?", "Which companies hired from the last batch, and what salary?",
                  "I'm not sure the job outcomes are real."],
    "parental_approval": ["I need to discuss this with my parents before I decide.", "My father has to approve it first, I'll ask him."],
    "timing": ["Maybe I'll join the next batch, I have exams now.", "Can I start later? I'm busy this month."],
    "course_fit": ["The syllabus looks too basic for me.", "Some modules don't seem relevant to what I want."],
    "trust": ["I saw some reviews online saying it's not genuine.", "Is the certificate accredited?"],
    "competitor": ["Another institute offered something cheaper elsewhere.", "I'm comparing this with another institute."],
}
FILLER_AGENT = ["Agent: Thanks for your interest! Could you tell me about your goals?",
                "Agent: Let me walk you through the programme.", "Agent: Do you have any questions so far?"]
FILLER_PROSPECT = ["Prospect: I want to get into data analytics.", "Prospect: Okay, that sounds good.",
                   "Prospect: I graduated last year and I'm looking to upskill."]


def concern_probs(stall_seq: int | None, max_seq: int) -> dict:
    """Which concerns this prospect voices. Stalling at fees makes fees/placement talk much more likely."""
    fees_seq = STAGES.index("fees") + 1
    if stall_seq == fees_seq:
        return {"fees": 0.75, "placement": 0.45, "parental_approval": 0.30, "trust": 0.10, "competitor": 0.15}
    if stall_seq is not None:
        return {"timing": 0.40, "course_fit": 0.30, "trust": 0.20, "competitor": 0.15, "fees": 0.15}
    p = {"fees": 0.45, "placement": 0.20, "parental_approval": 0.15, "timing": 0.10} if max_seq >= fees_seq else {"timing": 0.2}
    return p


def pick_strategy(arm: str | None) -> str:
    if arm == "treatment" and random.random() < 0.85:
        return "outcomes_first"
    r, acc = random.random(), 0.0
    for k, w in CONTROL_MIX.items():
        acc += w
        if r < acc:
            return k
    return "reassure"


def build_transcript(concerns: list[str], fee_strategy: str | None) -> str:
    # The fees concern, when raised, is the turning point, so it goes last.
    concerns = sorted(concerns, key=lambda c: c == "fees")
    lines = [FILLER_AGENT[0], random.choice(FILLER_PROSPECT), FILLER_AGENT[1]]
    for c in concerns:
        lines.append("Prospect: " + random.choice(LINES[c]))
        if c == "fees" and fee_strategy:
            lines.append("Agent: " + random.choice(FEE_REPLIES[fee_strategy][1]))
        else:
            lines.append("Agent: That's a fair point, let me explain.")
    lines.append(FILLER_AGENT[2])
    return "\n".join(lines)


def main(reset: bool):
    with cursor() as cur:
        if reset:
            cur.execute("delete from experiments where name like '[demo]%'")
            cur.execute("delete from prospects where source = 'demo_seed'")
            print("Removed previous demo data.")

        cur.execute(
            """insert into experiments (name, hypothesis, change_description, target_stage, primary_metric, started_at)
               values ('[demo] Fees discussion: outcomes-first script',
                       'Prospects who see verified placement outcomes before price are less likely to stall at fees.',
                       'Agents present the batch placement report before quoting fees and mention EMI upfront.',
                       'fees', 'progression', %(start)s) returning id""",
            {"start": NOW - timedelta(days=45)},
        )
        exp_id = cur.fetchone()["id"]

        prospects, calls, events, concerns, assignments = [], [], [], [], []
        for i in range(N):
            pid, cid = uuid.uuid4(), uuid.uuid4()
            created = NOW - timedelta(days=90 * (1 - i / N), hours=random.random() * 12)
            in_experiment = created >= NOW - timedelta(days=45)
            arm = random.choice(["control", "treatment"]) if in_experiment else None

            # Walk the funnel. The caller's fees reply shifts the odds at the fees stage.
            fee_strategy = pick_strategy(arm)
            max_seq = 1
            for step, p in enumerate(P_NEXT):
                if STAGES[step] == "fees":
                    p += FEE_REPLIES[fee_strategy][0]
                if random.random() < p:
                    max_seq = step + 2
                else:
                    break

            enrolled = max_seq == len(STAGES)
            recent = created >= NOW - timedelta(days=7)
            outcome = "enrolled" if enrolled else ("open" if recent and random.random() < 0.6 else "lost")
            stall_seq = max_seq if outcome == "lost" else None

            prospects.append((pid, f"DEMO-{i:04d}", "demo_seed", created, outcome,
                              created + timedelta(days=random.randint(2, 14)) if outcome != "open" else None,
                              FEE_REVENUE if enrolled else 0))

            voiced = [c for c, p in concern_probs(stall_seq, max_seq).items() if random.random() < p]
            fees_seq = STAGES.index("fees") + 1
            transcript = build_transcript(voiced, fee_strategy if max_seq >= fees_seq else None)
            started = created + timedelta(hours=random.randint(1, 48))
            agent = random.choice(AGENTS)
            calls.append((cid, pid, agent, started, random.randint(240, 1500), transcript, NOW))

            # Call 1 runs up to the fees discussion; a follow-up call handles closing.
            first_call_max = min(max_seq, fees_seq)
            for seq in range(1, first_call_max + 1):
                events.append((cid, pid, STAGES[seq - 1], started + timedelta(minutes=seq * 3)))
            if max_seq > fees_seq:
                cid2 = uuid.uuid4()
                started2 = started + timedelta(days=random.randint(1, 4))
                calls.append((cid2, pid, agent, started2, random.randint(180, 900),
                              "Agent: Following up on our last call.\nProspect: Yes, I'm ready to go ahead.", NOW))
                events.append((cid2, pid, "closing", started2))
                if enrolled:
                    events.append((cid2, pid, "enrolled", started2 + timedelta(hours=2)))

            last_stage = STAGES[first_call_max - 1]
            for c in rule_extract(transcript):
                concerns.append((cid, pid, last_stage, c["category"], c["excerpt"], "rule"))

            if arm:
                assignments.append((exp_id, pid, arm, created))

        cur.executemany("insert into prospects (id, external_ref, source, created_at, outcome, outcome_at, revenue) "
                        "values (%s,%s,%s,%s,%s,%s,%s)", prospects)
        cur.executemany("insert into calls (id, prospect_id, agent_id, started_at, duration_sec, transcript, analyzed_at) "
                        "values (%s,%s,%s,%s,%s,%s,%s)", calls)
        cur.executemany("insert into call_stage_events (call_id, prospect_id, stage_key, entered_at) values (%s,%s,%s,%s)", events)
        cur.executemany("insert into call_concerns (call_id, prospect_id, stage_key, category, excerpt, source) "
                        "values (%s,%s,%s,%s,%s,%s)", concerns)
        cur.executemany("insert into experiment_assignments (experiment_id, prospect_id, arm, assigned_at) "
                        "values (%s,%s,%s,%s)", assignments)

    enrolled = sum(1 for p in prospects if p[4] == "enrolled")
    print(f"Seeded {N} prospects, {enrolled} enrolled, {len(concerns)} concerns, {len(assignments)} in experiment.")

    from app.dna import build_pending
    print("CALL DNA fingerprints:", build_pending(limit=10000))

    seed_guide_calls()


# A few calls made on the Call guide screen, so "Past calls" isn't empty in a demo.
SAMPLE_CALLS = [
    ("Ananya", "Lead #2041", "enrolled", [
        ("enquiry", "confirmed", "I filled the form yesterday for the data course."),
        ("discovery", "goal_clear", "I'm in final year, I want a data analyst job."),
        ("course_pitch", "liked_course", "The projects part sounds good."),
        ("placement", "convinced", "Okay, those companies are good."),
        ("fees", "fee_ok", "EMI works for me."),
        ("closing", "ready", "Send me the payment link."),
    ]),
    ("Rahul", "Lead #2042", "follow_up", [
        ("enquiry", "confirmed", None),
        ("discovery", "goal_clear", "I work in support, want to move to IT."),
        ("course_pitch", "content_questions", "Is the syllabus up to date?"),
        ("placement", "wants_proof", "Can I talk to someone from the last batch?"),
        ("fees", "needs_emi_or_parents", "I need to ask my parents first."),
    ]),
    ("Ananya", "Lead #2043", "not_interested", [
        ("enquiry", "confirmed", None),
        ("discovery", "goal_unsure", "I'm not sure what I want yet."),
        ("course_pitch", "not_relevant", "This is too basic for me."),
    ]),
    ("Kiran", "Lead #2044", "follow_up", [
        ("enquiry", "call_later", "I'm in class, call me in the evening."),
    ]),
    ("Rahul", "Lead #2045", "not_interested", [
        ("enquiry", "confirmed", None),
        ("discovery", "goal_clear", "Want a job in analytics."),
        ("course_pitch", "liked_course", None),
        ("placement", "convinced", None),
        ("fees", "fee_blocker", "The fee is too expensive for me right now."),
    ]),
    ("Kiran", "Lead #2046", "enrolled", [
        ("enquiry", "confirmed", None),
        ("discovery", "goal_clear", "Switching from mechanical to data."),
        ("course_pitch", "liked_course", None),
        ("placement", "convinced", "Good to see real company names."),
        ("fees", "needs_emi_or_parents", "Is there any EMI?"),
        ("closing", "ready", "Okay, how do I pay?"),
    ]),
]


def seed_guide_calls():
    from app import calls

    with cursor() as cur:
        cur.execute("delete from prospects where source = 'call_guide_sample'")
    for i, (caller, prospect, outcome, steps) in enumerate(SAMPLE_CALLS):
        start = NOW - timedelta(days=len(SAMPLE_CALLS) - i, hours=random.randint(1, 6))
        call = calls.start_call(caller, prospect, started_at=start, source="call_guide_sample")
        for stage, result, words in steps:
            calls.save_stage(call["id"], stage, result, words)
        calls.close_call(call["id"], outcome, None, ended_at=start + timedelta(minutes=4 + 2 * len(steps)))
    print(f"Call guide sample calls: {len(SAMPLE_CALLS)}")


if __name__ == "__main__":
    from app.db import pool
    try:
        main(reset="--reset" in sys.argv)
    finally:
        pool.close()
