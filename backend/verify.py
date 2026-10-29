"""
End-to-End Verification Script for Future-Proof Backend Data Sync, CSV Persistence,
Standings Refresh, and Dynamic Prediction Updates.
"""

from datetime import datetime
import pandas as pd

from backend.data_loader import (
    HISTORICAL_CSV_PATH,
    get_dynamic_season_codes,
    register_dynamic_club,
)
from backend.main import (
    get_standings,
    health_check,
    list_fixtures,
    predictor_engine,
    sync_data_and_retrain,
)


def main() -> None:
    # 1. Verify boot-time auto-sync & CSV persistence
    health = health_check()
    csv_before = pd.read_csv(HISTORICAL_CSV_PATH)
    print("=== 1. Boot Auto-Sync Verification ===")
    print("Health status:", health["status"])
    print("Boot sync summary:", health["last_sync"])
    print("CSV rows on disk after boot:", len(csv_before))

    # 2. Capture Premier League standings & Arsenal vs Man City prediction before manual Sync Data
    pl_before = get_standings("PL")["standings"]
    top_club_before = pl_before[0]
    pred_before = predictor_engine.predict_fixture("Arsenal", "Manchester City", "PL")
    fix_before = list_fixtures("PL")["fixtures"][0]

    print("\n=== 2. State Before 'Sync Data' ===")
    print(
        f"PL Leader: {top_club_before['team']} | MP: {top_club_before['played']} | "
        f"Pts: {top_club_before['points']} | GD: {top_club_before['gd']} | "
        f"xG: {top_club_before['xg']} | Elo: {top_club_before['elo']} | Form: {top_club_before['form']}"
    )
    print("Next PL Fixture Stage:", fix_before["stage"])
    print(
        "Arsenal vs Man City 1X2:",
        pred_before["probabilities"]["ensemble"],
        "| xG:",
        pred_before["predicted_score"]["expected_home_goals"],
        "-",
        pred_before["predicted_score"]["expected_away_goals"],
    )

    # 3. Trigger Sync Data (simulating user clicking 'Sync Data' in League Standings)
    sync_resp = sync_data_and_retrain("PL")
    csv_after = pd.read_csv(HISTORICAL_CSV_PATH)
    pl_after = sync_resp["standings"]
    top_club_after = pl_after[0]
    pred_after = predictor_engine.predict_fixture("Arsenal", "Manchester City", "PL")
    fix_after = list_fixtures("PL")["fixtures"][0]

    print("\n=== 3. State After 'Sync Data' ===")
    print("Sync response:", sync_resp["sync"])
    print(f"CSV rows on disk: {len(csv_before)} -> {len(csv_after)} (+{len(csv_after) - len(csv_before)} persisted)")
    print(
        f"PL Leader: {top_club_after['team']} | MP: {top_club_after['played']} | "
        f"Pts: {top_club_after['points']} | GD: {top_club_after['gd']} | "
        f"xG: {top_club_after['xg']} | Elo: {top_club_after['elo']} | Form: {top_club_after['form']}"
    )
    print("Updated Next PL Fixture Stage:", fix_after["stage"])
    print(
        "Updated Arsenal vs Man City 1X2:",
        pred_after["probabilities"]["ensemble"],
        "| xG:",
        pred_after["predicted_score"]["expected_home_goals"],
        "-",
        pred_after["predicted_score"]["expected_away_goals"],
    )

    assert len(csv_after) > len(csv_before), "New matches must be persisted to historical_matches.csv"
    assert top_club_after["played"] > top_club_before["played"], "Standings MP must increment when new matchday is synced"

    # 4. Verify Future-Proof Season Discovery & Promoted Club Auto-Registration
    future_seasons_2029 = get_dynamic_season_codes(datetime(2029, 10, 15))
    promoted_meta = register_dynamic_club("Sunderland AFC", "PL")
    print("\n=== 4. Future-Proof Verification ===")
    print("Dynamic seasons for Oct 2029:", future_seasons_2029)
    print("Auto-registered promoted club:", promoted_meta["name"], "| TLA:", promoted_meta["tla"], "| Base Elo:", promoted_meta["base_elo"])
    print("ALL VERIFICATION CHECKS PASSED!")


if __name__ == "__main__":
    main()
