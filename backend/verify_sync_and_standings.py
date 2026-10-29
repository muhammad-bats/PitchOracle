"""
Verification script for data sync and league standings accuracy.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.data_loader import (
    get_clubs_dict,
    get_current_season_label,
    get_league_clubs,
    get_upcoming_fixtures,
    sync_live_football_data_uk,
)
from backend.ml.features import FeatureStore
from backend.ml.predictor import MatchPredictorEngine


def run_checks():
    print("=== Step 1: Testing sync_live_football_data_uk ===")
    res = sync_live_football_data_uk()
    print("Sync response:", res)
    assert res["status"] in ("synced", "up_to_date"), f"Unexpected status: {res}"

    print("\n=== Step 2: Testing active clubs for PL ===")
    current_season = get_current_season_label()
    pl_clubs = get_league_clubs("PL", season=current_season)
    print(f"PL active clubs count: {len(pl_clubs)}")
    assert len(pl_clubs) == 20, f"Expected 20 PL clubs, got {len(pl_clubs)}"
    pl_names = [c["name"] for c in pl_clubs]
    print("Sample PL clubs:", pl_names[:5])
    assert "Arsenal" in pl_names
    assert "Manchester City" in pl_names
    assert "Coventry City" in pl_names
    assert "Leeds United" in pl_names

    print("\n=== Step 3: Testing Predictor Engine Initialization and Standings ===")
    engine = MatchPredictorEngine(auto_sync_on_boot=False)
    pl_table = engine.feature_store.get_league_standings("PL")
    print(f"PL Table team count: {len(pl_table)}")
    assert len(pl_table) == 20, f"Expected 20 clubs in PL table, got {len(pl_table)}"

    for rank, row in enumerate(pl_table[:10], 1):
        print(f"{rank:2d}. {row['team']:22s} P:{row['played']:2d} W:{row['won']:2d} D:{row['drawn']:2d} L:{row['lost']:2d} GF:{row['gf']:2d} GA:{row['ga']:2d} GD:{row['gd']:+3d} Pts:{row['points']:2d} Form:{''.join(row['form'])}")

    # Check Top 5 against real 2026/27 table
    assert pl_table[0]["team"] == "Manchester City" and pl_table[0]["points"] == 21 and pl_table[0]["played"] == 8
    assert pl_table[1]["team"] == "Arsenal" and pl_table[1]["points"] == 21 and pl_table[1]["played"] == 8
    assert pl_table[2]["team"] == "Brighton & Hove Albion" and pl_table[2]["points"] == 16 and pl_table[2]["played"] == 8
    assert pl_table[3]["team"] == "Liverpool" and pl_table[3]["points"] == 15 and pl_table[3]["played"] == 8
    assert pl_table[4]["team"] == "Chelsea" and pl_table[4]["points"] == 13 and pl_table[4]["played"] == 8
    print("✓ Premier League Top 5 verified accurately against official 2026/27 standings!")

    print("\n=== Step 4: Testing La Liga, Bundesliga, Serie A, Ligue 1 ===")
    pd_table = engine.feature_store.get_league_standings("PD")
    print(f"PD (La Liga) table count: {len(pd_table)} | Leader: {pd_table[0]['team']} ({pd_table[0]['points']} pts)")
    assert len(pd_table) == 20
    assert pd_table[0]["team"] == "Barcelona" and pd_table[0]["points"] == 27

    bl1_table = engine.feature_store.get_league_standings("BL1")
    print(f"BL1 (Bundesliga) table count: {len(bl1_table)} | Leader: {bl1_table[0]['team']} ({bl1_table[0]['points']} pts)")
    assert len(bl1_table) == 18
    assert bl1_table[0]["team"] == "Bayern Munich" and bl1_table[0]["points"] == 17

    sa_table = engine.feature_store.get_league_standings("SA")
    print(f"SA (Serie A) table count: {len(sa_table)} | Leader: {sa_table[0]['team']} ({sa_table[0]['points']} pts)")
    assert len(sa_table) == 20
    assert sa_table[0]["team"] == "Inter Milan" and sa_table[0]["points"] == 22

    fl1_table = engine.feature_store.get_league_standings("FL1")
    print(f"FL1 (Ligue 1) table count: {len(fl1_table)} | Leader: {fl1_table[0]['team']} ({fl1_table[0]['points']} pts)")
    assert len(fl1_table) == 18
    assert fl1_table[0]["team"] == "Paris Saint-Germain" and fl1_table[0]["points"] == 17

    print("\n=== Step 5: Testing Upcoming Fixtures ===")
    fixtures = get_upcoming_fixtures("PL")
    print(f"Upcoming PL fixtures generated: {len(fixtures)}")
    for fix in fixtures[:3]:
        print(f"  {fix['stage']} | {fix['home_team']} vs {fix['away_team']} @ {fix['stadium']}")

    print("\n=== Step 6: Testing Prediction Inference ===")
    pred = engine.predict_fixture("Arsenal", "Manchester City", "PL")
    print(f"Prediction Arsenal vs Man City: {pred['probabilities']['ensemble']}")
    print(f"Projected score: {pred['predicted_score']['most_likely']['score']}")
    assert "home_win" in pred["probabilities"]["ensemble"]

    print("\nALL BACKEND VERIFICATION CHECKS PASSED SUCCESSFULLY!")


if __name__ == "__main__":
    run_checks()
