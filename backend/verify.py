"""Verification script to test the full ML training, feature store, and API endpoints."""

from backend.main import (
    get_model_metrics,
     get_standings,
    health_check,
    list_fixtures,
    list_leagues,
    predictor_engine,
)
from backend.ml.predictor import HAS_XGBOOST


def main() -> None:
    print("HAS_XGBOOST:", HAS_XGBOOST)
    print("Health:", health_check())
    metrics = get_model_metrics()
    print(
        f"Trained on {metrics['train_samples']} matches | Tested on {metrics['test_samples']} matches | "
        f"Ensemble Accuracy: {metrics['ensemble_accuracy']}% | RPS: {metrics['ranked_probability_score']}"
    )
    print("Top 3 Features:", [f["label"] for f in metrics["top_features"][:3]])

    pred = predictor_engine.predict_fixture("Arsenal", "Manchester City", "PL")
    print("Arsenal vs Man City Ensemble 1X2:", pred["probabilities"]["ensemble"])
    print("Most Likely Score:", pred["predicted_score"]["most_likely"])
    print("Simulated Stats:", {
        "xG": f"{pred['simulated_stats']['home_xg']} - {pred['simulated_stats']['away_xg']}",
        "Possession": f"{pred['simulated_stats']['home_possession']}% - {pred['simulated_stats']['away_possession']}%",
        "Shots": f"{pred['simulated_stats']['home_shots']} - {pred['simulated_stats']['away_shots']}",
    })

    ucl_pred = predictor_engine.predict_fixture("Real Madrid", "Bayern Munich", "CL")
    print("Real Madrid vs Bayern Munich (UCL) 1X2:", ucl_pred["probabilities"]["ensemble"])

    leagues = list_leagues()["leagues"]
    print("Leagues configured:", [lg["code"] for lg in leagues])
    pl_table = get_standings("PL")["standings"]
    print("PL Top 3:", [(r["rank"], r["team"], r["points"], r["elo"]) for r in pl_table[:3]])


if __name__ == "__main__":
    main()
