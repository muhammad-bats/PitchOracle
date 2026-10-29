"""
FastAPI Backend for Football Match Forecaster & Score Predictor.
Provides REST API endpoints for predictions, fixtures, standings, H2H, model telemetry,
and serves the interactive frontend application.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend.data_loader import (
    LEAGUES,
    get_clubs_dict,
    get_league_clubs,
    get_upcoming_fixtures,
    sync_live_football_data_uk,
)
from backend.ml.predictor import MatchPredictorEngine

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

app = FastAPI(
    title="PitchOracle — Football Match Forecaster & Score Predictor API",
    description="Hybrid ML Ensemble (XGBoost + Random Forest + Dixon-Coles Monte Carlo) across Premier League, La Liga, Bundesliga, Serie A, Ligue 1 & Champions League.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize global predictor engine on startup (automatically syncs new data into CSV DB on boot)
predictor_engine = MatchPredictorEngine(auto_sync_on_boot=True)


class PredictRequest(BaseModel):
    home_team: str = Field(..., description="Canonical name of the home team")
    away_team: str = Field(..., description="Canonical name of the away team")
    league: Optional[str] = Field("PL", description="Competition code (PL, PD, BL1, SA, FL1, CL)")
    home_form_boost: float = Field(0.0, ge=-1.0, le=1.0, description="What-If modifier for home form (-1.0 to +1.0)")
    away_form_boost: float = Field(0.0, ge=-1.0, le=1.0, description="What-If modifier for away form (-1.0 to +1.0)")
    tactical_tempo: float = Field(0.0, ge=-1.0, le=1.0, description="What-If modifier for match tempo (-1.0 to +1.0)")
    neutral_venue: bool = Field(False, description="Simulate on neutral ground (e.g. UCL Final)")


@app.get("/api/health")
def health_check() -> Dict[str, Any]:
    return {
        "status": "ok",
        "engine": "XGBoost + Random Forest + Dixon-Coles Monte Carlo",
        "leagues": list(LEAGUES.keys()),
        "total_matches_indexed": predictor_engine.metrics.get("total_historical_matches", 0),
        "last_sync": predictor_engine.last_sync_summary,
    }


@app.get("/api/leagues")
def list_leagues() -> Dict[str, Any]:
    leagues_out: List[Dict[str, Any]] = []
    for code, meta in LEAGUES.items():
        clubs = get_league_clubs(code)
        leagues_out.append(
            {
                **meta,
                "team_count": len(clubs),
            }
        )
    return {"leagues": leagues_out}


@app.get("/api/teams")
def list_teams(league: Optional[str] = Query(None, description="Filter by competition code")) -> Dict[str, Any]:
    if league and league != "ALL":
        if league not in LEAGUES:
            raise HTTPException(status_code=404, detail=f"Unknown league code: {league}")
        clubs = get_league_clubs(league)
    else:
        clubs = sorted(get_clubs_dict().values(), key=lambda x: -x["base_elo"])

    enriched = [predictor_engine.feature_store.get_team_profile(c["name"]) for c in clubs]
    return {"teams": enriched}


@app.get("/api/fixtures")
def list_fixtures(league: Optional[str] = Query("ALL", description="Competition filter")) -> Dict[str, Any]:
    raw_fixtures = get_upcoming_fixtures(league)
    enriched_fixtures: List[Dict[str, Any]] = []

    for fix in raw_fixtures:
        pred = predictor_engine.predict_fixture(
            home_team=fix["home_team"],
            away_team=fix["away_team"],
            league_code=fix["league"],
            simulations=2500,
        )
        enriched_fixtures.append(
            {
                **fix,
                "home_elo": pred["fixture"]["home_team"]["current_elo"],
                "away_elo": pred["fixture"]["away_team"]["current_elo"],
                "home_form": pred["fixture"]["home_team"]["form_last_5"],
                "away_form": pred["fixture"]["away_team"]["form_last_5"],
                "probabilities": pred["probabilities"]["ensemble"],
                "most_likely_score": pred["predicted_score"]["most_likely"]["score"],
                "most_likely_prob": pred["predicted_score"]["most_likely"]["probability"],
                "expected_home_goals": pred["predicted_score"]["expected_home_goals"],
                "expected_away_goals": pred["predicted_score"]["expected_away_goals"],
                "over_2_5": pred["markets"]["over_2_5"],
                "btts_yes": pred["markets"]["btts_yes"],
            }
        )

    return {"fixtures": enriched_fixtures}


@app.get("/api/standings/{league_code}")
def get_standings(league_code: str) -> Dict[str, Any]:
    if league_code not in LEAGUES:
        raise HTTPException(status_code=404, detail=f"Unknown league: {league_code}")
    table = predictor_engine.feature_store.get_league_standings(league_code)
    return {
        "league": LEAGUES[league_code],
        "standings": table,
    }


@app.post("/api/predict")
def predict_match_post(req: PredictRequest) -> Dict[str, Any]:
    if req.home_team == req.away_team:
        raise HTTPException(status_code=400, detail="Home and Away teams must be different clubs.")
    try:
        return predictor_engine.predict_fixture(
            home_team=req.home_team,
            away_team=req.away_team,
            league_code=req.league,
            home_form_boost=req.home_form_boost,
            away_form_boost=req.away_form_boost,
            tactical_tempo=req.tactical_tempo,
            neutral_venue=req.neutral_venue,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/predict")
def predict_match_get(
    home_team: str = Query(...),
    away_team: str = Query(...),
    league: str = Query("PL"),
    home_form_boost: float = Query(0.0),
    away_form_boost: float = Query(0.0),
    tactical_tempo: float = Query(0.0),
    neutral_venue: bool = Query(False),
) -> Dict[str, Any]:
    if home_team == away_team:
        raise HTTPException(status_code=400, detail="Home and Away teams must be different clubs.")
    try:
        return predictor_engine.predict_fixture(
            home_team=home_team,
            away_team=away_team,
            league_code=league,
            home_form_boost=home_form_boost,
            away_form_boost=away_form_boost,
            tactical_tempo=tactical_tempo,
            neutral_venue=neutral_venue,
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/model-metrics")
def get_model_metrics() -> Dict[str, Any]:
    return predictor_engine.metrics


@app.post("/api/sync-data")
def sync_data_and_retrain(
    league: Optional[str] = Query("PL", description="Active competition code for updated standings")
) -> Dict[str, Any]:
    sync_res = sync_live_football_data_uk()
    predictor_engine.last_sync_summary = sync_res
    metrics = predictor_engine.reload_data_and_retrain(force_regenerate=False)
    target_lg = league if (league and league != "ALL" and league in LEAGUES) else "PL"
    standings = predictor_engine.feature_store.get_league_standings(target_lg)
    return {
        "sync": sync_res,
        "metrics": metrics,
        "league": LEAGUES[target_lg],
        "standings": standings,
    }


if FRONTEND_DIR.exists():
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


@app.get("/")
def serve_frontend() -> FileResponse:
    return FileResponse(str(FRONTEND_DIR / "index.html"))
