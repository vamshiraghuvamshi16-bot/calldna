"""Revenue X-Ray API. Mount this router in your existing FastAPI app on Render,
or run it standalone: `uvicorn app.main:app --reload`.
"""
import os
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import analyzer, calls, dna, experiments, insights
from .db import fetch_all
from .recommend import recommend

API_KEY = os.getenv("XRAY_API_KEY")  # optional shared secret for the dashboard


def require_key(x_api_key: str | None = Header(default=None)):
    if API_KEY and x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


router = APIRouter(prefix="/xray", tags=["revenue-xray"], dependencies=[Depends(require_key)])


@router.get("/overview")
def get_overview(date_from: date | None = None, date_to: date | None = None):
    data = insights.overview(date_from, date_to)
    data["recommendation"] = recommend(data["bottleneck"], data["concerns"])
    return data


@router.get("/funnel")
def get_funnel(date_from: date | None = None, date_to: date | None = None):
    return insights.funnel(date_from, date_to)


@router.get("/stages/{stage_key}/concerns")
def get_concerns(stage_key: str, date_from: date | None = None, date_to: date | None = None):
    return insights.concerns_at_stage(stage_key, date_from, date_to)


@router.get("/stages/{stage_key}/evidence")
def get_evidence(stage_key: str, category: str | None = None, limit: int = Query(8, le=50)):
    return insights.evidence(stage_key, category, limit)


@router.post("/analyze")
def run_analysis(limit: int = Query(50, le=500)):
    """Tag concerns on new transcripts. Call from a cron job or after each call ends."""
    return analyzer.analyze_pending(limit)


class ExperimentIn(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    hypothesis: str | None = None
    change_description: str | None = None
    target_stage: str
    primary_metric: Literal["progression", "enrollment"] = "progression"


class AssignIn(BaseModel):
    prospect_id: str


class StatusIn(BaseModel):
    status: Literal["draft", "running", "stopped", "completed"]


@router.get("/experiments")
def list_experiments():
    return experiments.list_all()


@router.post("/experiments")
def create_experiment(body: ExperimentIn):
    return experiments.create(body.model_dump())


@router.post("/experiments/{experiment_id}/assign")
def assign_prospect(experiment_id: str, body: AssignIn):
    """Call when a new prospect enters the funnel. Returns which script the agent should use."""
    return experiments.assign(experiment_id, body.prospect_id)


@router.patch("/experiments/{experiment_id}")
def update_status(experiment_id: str, body: StatusIn):
    return experiments.set_status(experiment_id, body.status)


@router.get("/experiments/{experiment_id}/results")
def experiment_results(experiment_id: str):
    res = experiments.results(experiment_id)
    if not res:
        raise HTTPException(404, "Experiment not found")
    return res


# ---------- CALL DNA ----------

class MatchIn(BaseModel):
    stage_key: str
    utterance: str = Field(min_length=3, max_length=2000)
    k: int = Field(5, ge=1, le=10)


@router.post("/dna/build")
def build_fingerprints(limit: int = Query(500, le=5000)):
    """Fingerprint finished calls. Run after /analyze, from the same cron or end-of-call hook."""
    return dna.build_pending(limit)


@router.post("/dna/match")
def match_live(body: MatchIn):
    """Call during a live call whenever the prospect raises something. Returns similar past situations."""
    try:
        return dna.match(body.stage_key, body.utterance, body.k)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.get("/dna/calls/{call_id}")
def call_fingerprint(call_id: str):
    fp = dna.fingerprint(call_id)
    if not fp:
        raise HTTPException(404, "No fingerprint for this call yet")
    return fp


@router.get("/dna/recent")
def recent_fingerprints(limit: int = Query(12, le=50)):
    return dna.recent(limit)


@router.get("/dna/playbook")
def dna_playbook(stage_key: str, concern: str):
    return dna.playbook(stage_key, concern)


@router.get("/stages")
def list_stages():
    return fetch_all("select key, label, seq from stages order by seq")


# ---------- Call guide (the caller's live screen) ----------

calls_router = APIRouter(prefix="/calls", tags=["calls"], dependencies=[Depends(require_key)])


class StartCallIn(BaseModel):
    caller_name: str = Field(min_length=1, max_length=80)
    prospect_name: str | None = Field(default=None, max_length=120)


class StageResultIn(BaseModel):
    stage_key: str
    result: str
    prospect_words: str | None = Field(default=None, max_length=2000)


class CloseCallIn(BaseModel):
    outcome: Literal["enrolled", "follow_up", "not_interested"]
    notes: str | None = Field(default=None, max_length=2000)


@calls_router.get("/guide")
def call_guide():
    """Every stage: what it's for, what prospects tend to say, and the taps for what happened."""
    return calls.guide()


@calls_router.post("")
def start_call(body: StartCallIn):
    return calls.start_call(body.caller_name.strip(), (body.prospect_name or "").strip() or None)


@calls_router.post("/{call_id}/stages")
def save_stage_result(call_id: str, body: StageResultIn):
    return calls.save_stage(call_id, body.stage_key, body.result, body.prospect_words)


@calls_router.post("/{call_id}/close")
def close_call(call_id: str, body: CloseCallIn):
    return calls.close_call(call_id, body.outcome, body.notes)


@calls_router.get("")
def list_calls(limit: int = Query(50, le=200), outcome: str | None = None):
    return calls.list_calls(limit, outcome)


@calls_router.get("/{call_id}")
def get_call(call_id: str):
    return calls.get_call(call_id)


app = FastAPI(title="Revenue X-Ray")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")],
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)
app.include_router(calls_router)


@app.get("/health")
def health():
    """Liveness plus a quick database check. Render pings this; it also wakes a sleeping service."""
    try:
        fetch_all("select 1 as ok")
        return {"ok": True, "database": "ok"}
    except Exception as e:
        return {"ok": False, "database": f"error: {type(e).__name__}"}
