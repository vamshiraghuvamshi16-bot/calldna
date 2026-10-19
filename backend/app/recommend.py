"""Turn a flagged bottleneck + its most over-represented concern into a testable experiment.

Template-based on purpose: the suggestion is a hypothesis to test, not a verdict,
and a fixed playbook keeps it explainable in a demo. Swap in an LLM later if you
want more varied wording.
"""

PLAYBOOK = {
    "fees": ("Explain course value and verified placement outcomes before quoting fees, and offer the EMI option upfront.",
             "Prospects who see outcomes before price are less likely to stall at the fee discussion."),
    "placement": ("Share a verified placement report (batch-wise, with company names) during the pitch.",
                  "Concrete, verifiable outcomes reduce placement doubts."),
    "parental_approval": ("Offer a short parent call or a one-page parent brief before the closing stage.",
                          "Bringing parents in early removes a decision blocker the prospect can't resolve alone."),
    "timing": ("Present the next two batch dates and a seat-hold option instead of a single start date.",
               "Flexible timing keeps 'maybe later' prospects from going cold."),
    "course_fit": ("Run a 5-minute skill check and map the curriculum to the prospect's goal before pitching.",
                   "Prospects who see a personalised fit are more confident the course is for them."),
    "trust": ("Share third-party reviews and alumni contacts before the fee discussion.",
              "Social proof addresses credibility concerns before money is mentioned."),
    "competitor": ("Equip agents with a fair side-by-side comparison sheet.",
                   "Prospects comparing options decide faster with a clear comparison."),
    "other": ("Review the supporting calls with the team to name the concern, then design a targeted test.",
              "The concern isn't categorised yet, so qualitative review comes first."),
}


def recommend(bottleneck: dict | None, concerns: list[dict]) -> dict | None:
    if not bottleneck:
        return None
    top = next((c for c in concerns if c["stalled_share"] > c["progressed_share"]), None)
    category = top["category"] if top else "other"
    action, hypothesis = PLAYBOOK.get(category, PLAYBOOK["other"])
    return {
        "category": category,
        "action": action,
        "hypothesis": hypothesis,
        "target_stage": bottleneck["stage_key"],
        "suggested_name": f"{bottleneck['stage_label']}: {top['label'] if top else 'review'} test",
        "evidence_strength": (
            "strong" if top and top["stalled_total"] >= 50 and (top["over_representation"] or 0) >= 1.5
            else "moderate" if top and top["stalled_total"] >= 20
            else "weak"
        ),
    }
