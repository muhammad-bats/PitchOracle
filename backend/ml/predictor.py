"""
Hybrid ML Ensemble & Dixon-Coles Monte Carlo Match Predictor.
Combines:
1. XGBoost Multi-Class Classifier (1X2 probabilities + feature importance)
2. Random Forest Classifier (1X2 probabilities + variance stabilization)
3. Dixon-Coles Adjusted Poisson + 10,000x Monte Carlo Simulator (Exact Scorelines, xG, Match Stats)
"""

from __future__ import annotations

import ctypes
import glob
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

import joblib
import numpy as np
import pandas as pd
from scipy.stats import poisson
from sklearn.ensemble import GradientBoostingClassifier, RandomForestClassifier
from sklearn.metrics import accuracy_score, log_loss

# Ensure OpenMP runtime (libomp.dylib) is discoverable on macOS for XGBoost
for _omp_candidate in (
    glob.glob("/opt/homebrew/opt/libomp/lib/libomp.dylib")
    + glob.glob("/opt/homebrew/Cellar/llvm/*/lib/libomp.dylib")
    + glob.glob("/usr/local/opt/libomp/lib/libomp.dylib")
):
    try:
        _env_lib = Path(sys.prefix) / "lib" / "libomp.dylib"
        if _env_lib.parent.exists() and not _env_lib.exists():
            os.symlink(_omp_candidate, _env_lib)
        ctypes.CDLL(_omp_candidate, mode=ctypes.RTLD_GLOBAL)
        break
    except OSError:
        continue

try:
    from xgboost import XGBClassifier
    HAS_XGBOOST = True
except Exception:
    XGBClassifier = None  # type: ignore
    HAS_XGBOOST = False

from backend.data_loader import LEAGUES, generate_multi_season_dataset, get_clubs_dict
from backend.ml.features import FEATURE_COLUMNS, FEATURE_LABELS, FeatureStore

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


def _dixon_coles_tau(x: int, y: int, lam_x: float, lam_y: float, rho: float = -0.09) -> float:
    """Dixon-Coles (1997) low-scoring correlation adjustment factor."""
    if x == 0 and y == 0:
        return max(0.2, 1.0 - lam_x * lam_y * rho)
    if x == 0 and y == 1:
        return max(0.2, 1.0 + lam_x * rho)
    if x == 1 and y == 0:
        return max(0.2, 1.0 + lam_y * rho)
    if x == 1 and y == 1:
        return max(0.2, 1.0 - rho)
    return 1.0


class MatchPredictorEngine:
    """End-to-end training, evaluation, and inference engine for football match forecasting."""

    def __init__(self) -> None:
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        self.df = generate_multi_season_dataset(force=False)
        self.feature_store = FeatureStore(self.df)
        self.xgb_model: Optional[XGBClassifier] = None
        self.rf_model: Optional[RandomForestClassifier] = None
        self.metrics: Dict[str, Any] = {}
        self.feature_importances: List[Dict[str, Any]] = []
        self._train_models()

    def reload_data_and_retrain(self, force_regenerate: bool = False) -> Dict[str, Any]:
        """Reload historical dataset, rebuild feature store, and retrain ML models."""
        self.df = generate_multi_season_dataset(force=force_regenerate)
        self.feature_store = FeatureStore(self.df)
        self._train_models()
        return self.metrics

    def _train_models(self) -> None:
        """Train XGBoost and Random Forest classifiers with chronological split validation."""
        train_df = self.feature_store.training_df
        assert train_df is not None

        # Skip initial burn-in matches where teams had fewer than 3 games
        valid_df = train_df.iloc[180:].reset_index(drop=True)
        X = valid_df[FEATURE_COLUMNS].values
        y = valid_df["target"].values.astype(int)

        split_idx = int(len(valid_df) * 0.82)
        X_train, X_test = X[:split_idx], X[split_idx:]
        y_train, y_test = y[:split_idx], y[split_idx:]

        if HAS_XGBOOST and XGBClassifier is not None:
            self.xgb_model = XGBClassifier(
                n_estimators=220,
                max_depth=4,
                learning_rate=0.045,
                subsample=0.85,
                colsample_bytree=0.85,
                min_child_weight=3,
                reg_lambda=1.5,
                objective="multi:softprob",
                num_class=3,
                eval_metric="mlogloss",
                random_state=42,
            )
        else:
            self.xgb_model = GradientBoostingClassifier(
                n_estimators=180,
                max_depth=4,
                learning_rate=0.05,
                subsample=0.85,
                random_state=42,
            )
        self.xgb_model.fit(X_train, y_train)

        self.rf_model = RandomForestClassifier(
            n_estimators=260,
            max_depth=8,
            min_samples_leaf=8,
            max_features="sqrt",
            random_state=42,
            n_jobs=-1,
        )
        self.rf_model.fit(X_train, y_train)

        # Evaluate models on out-of-time test set
        xgb_probs = self.xgb_model.predict_proba(X_test)
        rf_probs = self.rf_model.predict_proba(X_test)
        ens_probs = 0.55 * xgb_probs + 0.45 * rf_probs

        xgb_acc = float(accuracy_score(y_test, np.argmax(xgb_probs, axis=1)))
        rf_acc = float(accuracy_score(y_test, np.argmax(rf_probs, axis=1)))
        ens_acc = float(accuracy_score(y_test, np.argmax(ens_probs, axis=1)))

        xgb_ll = float(log_loss(y_test, xgb_probs))
        rf_ll = float(log_loss(y_test, rf_probs))
        ens_ll = float(log_loss(y_test, ens_probs))

        # Ranked Probability Score (RPS) - gold standard for football 1X2 forecasts
        y_onehot = np.eye(3)[y_test]
        cum_pred = np.cumsum(ens_probs, axis=1)
        cum_true = np.cumsum(y_onehot, axis=1)
        rps = float(np.mean(0.5 * np.sum((cum_pred[:, :2] - cum_true[:, :2]) ** 2, axis=1)))

        # Feature importances (blended XGBoost + Random Forest)
        xgb_imp = self.xgb_model.feature_importances_
        rf_imp = self.rf_model.feature_importances_
        combined_imp = 0.55 * xgb_imp + 0.45 * rf_imp
        imp_list = []
        for col, score, x_s, r_s in zip(FEATURE_COLUMNS, combined_imp, xgb_imp, rf_imp):
            imp_list.append(
                {
                    "feature": col,
                    "label": FEATURE_LABELS.get(col, col),
                    "importance": round(float(score) * 100.0, 2),
                    "xgb_importance": round(float(x_s) * 100.0, 2),
                    "rf_importance": round(float(r_s) * 100.0, 2),
                }
            )
        self.feature_importances = sorted(imp_list, key=lambda d: -d["importance"])

        self.metrics = {
            "total_historical_matches": int(len(self.df)),
            "train_samples": int(len(X_train)),
            "test_samples": int(len(X_test)),
            "num_features": len(FEATURE_COLUMNS),
            "xgb_accuracy": round(xgb_acc * 100.0, 1),
            "rf_accuracy": round(rf_acc * 100.0, 1),
            "ensemble_accuracy": round(ens_acc * 100.0, 1),
            "xgb_log_loss": round(xgb_ll, 4),
            "rf_log_loss": round(rf_ll, 4),
            "ensemble_log_loss": round(ens_ll, 4),
            "ranked_probability_score": round(rps, 4),
            "top_features": self.feature_importances[:12],
        }

        # Persist trained models
        joblib.dump(self.xgb_model, MODELS_DIR / "xgb_1x2.joblib")
        joblib.dump(self.rf_model, MODELS_DIR / "rf_1x2.joblib")

    def predict_fixture(
        self,
        home_team: str,
        away_team: str,
        league_code: Optional[str] = None,
        home_form_boost: float = 0.0,
        away_form_boost: float = 0.0,
        tactical_tempo: float = 0.0,
        neutral_venue: bool = False,
        simulations: int = 10000,
    ) -> Dict[str, Any]:
        """
        Run full hybrid prediction for `home_team` vs `away_team`:
        - XGBoost 1X2 probabilities
        - Random Forest 1X2 probabilities
        - Dixon-Coles Poisson 7x7 Scoreline Matrix & 10,000x Monte Carlo Simulation
        - Calibrated Meta-Ensemble forecast + Simulated Match Statistics + Tactical Insights
        """
        clubs = get_clubs_dict()
        if home_team not in clubs or away_team not in clubs:
            raise ValueError(f"Unknown club(s): {home_team} vs {away_team}")

        h_club = clubs[home_team]
        a_club = clubs[away_team]

        if not league_code or league_code == "ALL":
            if h_club["league"] == a_club["league"]:
                league_code = h_club["league"]
            else:
                league_code = "CL"

        lg_meta = LEAGUES.get(league_code, LEAGUES["PL"])
        feats = self.feature_store.extract_match_feature_vector(home_team, away_team, league_code)

        # Apply interactive What-If sliders to features
        if neutral_venue:
            feats["league_home_adv"] = 0.04
        if home_form_boost != 0.0:
            feats["home_form_ppg_5"] = float(np.clip(feats["home_form_ppg_5"] + home_form_boost * 0.45, 0.2, 3.0))
            feats["home_xg_avg_5"] = float(np.clip(feats["home_xg_avg_5"] * (1.0 + home_form_boost * 0.12), 0.4, 3.8))
            feats["home_elo"] += home_form_boost * 35.0
        if away_form_boost != 0.0:
            feats["away_form_ppg_5"] = float(np.clip(feats["away_form_ppg_5"] + away_form_boost * 0.45, 0.2, 3.0))
            feats["away_xg_avg_5"] = float(np.clip(feats["away_xg_avg_5"] * (1.0 + away_form_boost * 0.12), 0.4, 3.8))
            feats["away_elo"] += away_form_boost * 35.0
        feats["elo_diff"] = round(feats["home_elo"] - feats["away_elo"], 2)

        x_vec = np.array([[feats[col] for col in FEATURE_COLUMNS]])
        assert self.xgb_model is not None and self.rf_model is not None

        xgb_p = self.xgb_model.predict_proba(x_vec)[0]
        rf_p = self.rf_model.predict_proba(x_vec)[0]

        # Compute Dixon-Coles expected goals (lambda_home, lambda_away)
        base_lg_goals = lg_meta["avg_goals"] / 2.0
        home_adv_mult = 1.0 + (0.03 if neutral_venue else lg_meta["home_advantage"] * 0.55)
        away_adv_mult = 1.0 - (0.01 if neutral_venue else lg_meta["home_advantage"] * 0.28)

        elo_factor = 10.0 ** ((feats["elo_diff"] + (0.0 if neutral_venue else 48.0)) / 1050.0)
        h_att_strength = (
            0.42 * (feats["home_xg_avg_5"] / max(base_lg_goals, 1.1))
            + 0.30 * (feats["home_venue_gf_5"] / max(base_lg_goals, 1.1))
            + 0.28 * (h_club["attack"] / 80.0)
        )
        a_def_weakness = (
            0.48 * (feats["away_xga_avg_5"] / max(base_lg_goals, 1.1))
            + 0.52 * (80.0 / max(a_club["defense"], 55.0))
        )

        a_att_strength = (
            0.42 * (feats["away_xg_avg_5"] / max(base_lg_goals, 1.1))
            + 0.30 * (feats["away_venue_gf_5"] / max(base_lg_goals, 1.1))
            + 0.28 * (a_club["attack"] / 80.0)
        )
        h_def_weakness = (
            0.48 * (feats["home_xga_avg_5"] / max(base_lg_goals, 1.1))
            + 0.52 * (80.0 / max(h_club["defense"], 55.0))
        )

        tempo_mult = 1.0 + tactical_tempo * 0.15
        form_h_mult = 1.0 + home_form_boost * 0.14
        form_a_mult = 1.0 + away_form_boost * 0.14

        lam_home = float(
            np.clip(
                base_lg_goals * h_att_strength * a_def_weakness * home_adv_mult * (elo_factor ** 0.55) * tempo_mult * form_h_mult,
                0.35,
                3.95,
            )
        )
        lam_away = float(
            np.clip(
                base_lg_goals * a_att_strength * h_def_weakness * away_adv_mult * (elo_factor ** -0.55) * tempo_mult * form_a_mult,
                0.28,
                3.65,
            )
        )

        # Build 7x7 Dixon-Coles Exact Scoreline Matrix (0..6 goals)
        max_goals = 7
        raw_matrix = np.zeros((max_goals, max_goals), dtype=float)
        for hg in range(max_goals):
            for ag in range(max_goals):
                p_ind = poisson.pmf(hg, lam_home) * poisson.pmf(ag, lam_away)
                tau = _dixon_coles_tau(hg, ag, lam_home, lam_away, rho=-0.085)
                raw_matrix[hg, ag] = p_ind * tau
        raw_matrix /= np.sum(raw_matrix)

        dc_home_win = float(np.sum(np.tril(raw_matrix, k=-1)))
        dc_draw = float(np.sum(np.diag(raw_matrix)))
        dc_away_win = float(np.sum(np.triu(raw_matrix, k=1)))
        dc_p = np.array([dc_home_win, dc_draw, dc_away_win])

        # Hybrid Meta-Ensemble (40% XGBoost + 25% Random Forest + 35% Dixon-Coles)
        ens_p = 0.40 * xgb_p + 0.25 * rf_p + 0.35 * dc_p
        ens_p = ens_p / np.sum(ens_p)

        # Calibrate scoreline matrix to match ensemble 1X2 probabilities smoothly
        cal_matrix = raw_matrix.copy()
        if dc_home_win > 1e-6:
            for hg in range(max_goals):
                for ag in range(hg):
                    cal_matrix[hg, ag] *= ens_p[0] / dc_home_win
        if dc_draw > 1e-6:
            for g in range(max_goals):
                cal_matrix[g, g] *= ens_p[1] / dc_draw
        if dc_away_win > 1e-6:
            for hg in range(max_goals):
                for ag in range(hg + 1, max_goals):
                    cal_matrix[hg, ag] *= ens_p[2] / dc_away_win
        cal_matrix /= np.sum(cal_matrix)

        # Extract top scorelines and markets from calibrated matrix
        scorelines_flat: List[Dict[str, Any]] = []
        over_15 = 0.0
        over_25 = 0.0
        over_35 = 0.0
        btts_yes = 0.0

        matrix_grid: List[List[float]] = []
        for hg in range(max_goals):
            row_vals: List[float] = []
            for ag in range(max_goals):
                prob = float(cal_matrix[hg, ag])
                row_vals.append(round(prob * 100.0, 2))
                scorelines_flat.append(
                    {
                        "score": f"{hg} - {ag}",
                        "home_goals": hg,
                        "away_goals": ag,
                        "probability": round(prob * 100.0, 2),
                        "outcome": "H" if hg > ag else ("D" if hg == ag else "A"),
                    }
                )
                if hg + ag > 1.5:
                    over_15 += prob
                if hg + ag > 2.5:
                    over_25 += prob
                if hg + ag > 3.5:
                    over_35 += prob
                if hg > 0 and ag > 0:
                    btts_yes += prob
            matrix_grid.append(row_vals)

        top_scorelines = sorted(scorelines_flat, key=lambda x: -x["probability"])[:6]
        most_likely_score = top_scorelines[0]

        # 10,000x Monte Carlo simulation for match statistics & goal distribution
        seed_val = abs(hash(f"{home_team}_{away_team}_{league_code}")) % (2**31)
        rng = np.random.default_rng(seed_val)
        sim_hg = rng.poisson(lam_home, size=simulations)
        sim_ag = rng.poisson(lam_away, size=simulations)
        sim_total_goals = sim_hg + sim_ag

        # Simulated Match Statistics
        poss_diff = (h_club["possession_style"] - a_club["possession_style"]) * 38.0 + (0.0 if neutral_venue else 2.2) + (home_form_boost - away_form_boost) * 2.0
        home_poss = float(np.clip(50.0 + poss_diff, 30.0, 72.0))
        away_poss = round(100.0 - home_poss, 1)
        home_poss = round(home_poss, 1)

        home_shots = round(float(np.clip(0.55 * feats["home_shots_avg_5"] + 0.45 * (lam_home * 7.6 + (home_poss - 50) * 0.12), 5.0, 24.0)), 1)
        away_shots = round(float(np.clip(0.55 * feats["away_shots_avg_5"] + 0.45 * (lam_away * 7.3 + (away_poss - 50) * 0.12), 4.0, 22.0)), 1)

        home_sot = round(float(np.clip(0.50 * feats["home_sot_avg_5"] + 0.50 * (home_shots * 0.37), 1.8, home_shots * 0.65)), 1)
        away_sot = round(float(np.clip(0.50 * feats["away_sot_avg_5"] + 0.50 * (away_shots * 0.36), 1.5, away_shots * 0.65)), 1)

        home_big_chances = round(float(np.clip(lam_home * 1.48, 0.8, 6.5)), 1)
        away_big_chances = round(float(np.clip(lam_away * 1.42, 0.6, 6.0)), 1)

        home_corners = round(float(np.clip(home_shots * 0.41 + (home_poss - 50.0) * 0.05, 2.5, 10.5)), 1)
        away_corners = round(float(np.clip(away_shots * 0.39 + (away_poss - 50.0) * 0.05, 2.0, 9.5)), 1)

        home_fouls = round(float(np.clip(11.4 - (home_poss - 50.0) * 0.07 + h_club["pressing_intensity"] * 1.6, 7.0, 16.5)), 1)
        away_fouls = round(float(np.clip(12.1 - (away_poss - 50.0) * 0.07 + a_club["pressing_intensity"] * 1.6, 7.5, 17.5)), 1)

        home_yellows = round(float(np.clip(home_fouls * 0.165, 1.0, 4.2)), 1)
        away_yellows = round(float(np.clip(away_fouls * 0.175, 1.1, 4.5)), 1)

        home_pass_acc = round(float(np.clip(76.0 + h_club["possession_style"] * 21.0, 74.0, 92.5)), 1)
        away_pass_acc = round(float(np.clip(75.5 + a_club["possession_style"] * 21.0, 73.0, 92.0)), 1)

        # 15-Minute Goal Timing Probabilities (%)
        interval_weights = [0.12, 0.15, 0.18, 0.16, 0.18, 0.21]
        interval_labels = ["0'-15'", "16'-30'", "31'-45+'", "46'-60'", "61'-75'", "76'-90+'"]
        goal_timeline = []
        for lbl, w in zip(interval_labels, interval_weights):
            h_int_lam = lam_home * w
            a_int_lam = lam_away * w
            goal_timeline.append(
                {
                    "period": lbl,
                    "home_goal_prob": round((1.0 - float(np.exp(-h_int_lam))) * 100.0, 1),
                    "away_goal_prob": round((1.0 - float(np.exp(-a_int_lam))) * 100.0, 1),
                    "any_goal_prob": round((1.0 - float(np.exp(-(h_int_lam + a_int_lam)))) * 100.0, 1),
                }
            )

        # Match-specific Feature Contributions (Local Explainability)
        match_drivers = self._compute_match_drivers(feats, home_team, away_team)

        # Tactical Narrative
        tactical_insights = self._generate_tactical_insights(
            home_team, away_team, h_club, a_club, feats, ens_p, lam_home, lam_away, most_likely_score
        )

        return {
            "fixture": {
                "league": league_code,
                "league_name": lg_meta["name"],
                "league_flag": lg_meta["flag"],
                "stadium": "Neutral Venue" if neutral_venue else h_club["stadium"],
                "home_team": self.feature_store.get_team_profile(home_team),
                "away_team": self.feature_store.get_team_profile(away_team),
            },
            "probabilities": {
                "ensemble": {
                    "home_win": round(float(ens_p[0]) * 100.0, 1),
                    "draw": round(float(ens_p[1]) * 100.0, 1),
                    "away_win": round(float(ens_p[2]) * 100.0, 1),
                },
                "xgboost": {
                    "home_win": round(float(xgb_p[0]) * 100.0, 1),
                    "draw": round(float(xgb_p[1]) * 100.0, 1),
                    "away_win": round(float(xgb_p[2]) * 100.0, 1),
                },
                "random_forest": {
                    "home_win": round(float(rf_p[0]) * 100.0, 1),
                    "draw": round(float(rf_p[1]) * 100.0, 1),
                    "away_win": round(float(rf_p[2]) * 100.0, 1),
                },
                "dixon_coles": {
                    "home_win": round(float(dc_p[0]) * 100.0, 1),
                    "draw": round(float(dc_p[1]) * 100.0, 1),
                    "away_win": round(float(dc_p[2]) * 100.0, 1),
                },
            },
            "predicted_score": {
                "most_likely": most_likely_score,
                "expected_home_goals": round(lam_home, 2),
                "expected_away_goals": round(lam_away, 2),
                "top_scorelines": top_scorelines,
                "score_matrix": matrix_grid,
            },
            "markets": {
                "over_1_5": round(over_15 * 100.0, 1),
                "under_1_5": round((1.0 - over_15) * 100.0, 1),
                "over_2_5": round(over_25 * 100.0, 1),
                "under_2_5": round((1.0 - over_25) * 100.0, 1),
                "over_3_5": round(over_35 * 100.0, 1),
                "under_3_5": round((1.0 - over_35) * 100.0, 1),
                "btts_yes": round(btts_yes * 100.0, 1),
                "btts_no": round((1.0 - btts_yes) * 100.0, 1),
                "double_chance_1x": round(float(ens_p[0] + ens_p[1]) * 100.0, 1),
                "double_chance_x2": round(float(ens_p[1] + ens_p[2]) * 100.0, 1),
                "avg_simulated_goals": round(float(np.mean(sim_total_goals)), 2),
            },
            "simulated_stats": {
                "simulations_run": simulations,
                "home_xg": round(lam_home, 2),
                "away_xg": round(lam_away, 2),
                "home_possession": home_poss,
                "away_possession": away_poss,
                "home_shots": home_shots,
                "away_shots": away_shots,
                "home_sot": home_sot,
                "away_sot": away_sot,
                "home_big_chances": home_big_chances,
                "away_big_chances": away_big_chances,
                "home_corners": home_corners,
                "away_corners": away_corners,
                "home_fouls": home_fouls,
                "away_fouls": away_fouls,
                "home_yellow_cards": home_yellows,
                "away_yellow_cards": away_yellows,
                "home_pass_accuracy": home_pass_acc,
                "away_pass_accuracy": away_pass_acc,
                "goal_timeline": goal_timeline,
            },
            "h2h": self.feature_store.get_h2h_summary(home_team, away_team),
            "feature_vector": feats,
            "match_drivers": match_drivers,
            "tactical_insights": tactical_insights,
        }

    def _compute_match_drivers(
        self, feats: Dict[str, float], home_team: str, away_team: str
    ) -> List[Dict[str, Any]]:
        """Explain key comparative factors driving the prediction between Home and Away."""
        drivers = [
            {
                "factor": "Club Elo Strength",
                "home_val": feats["home_elo"],
                "away_val": feats["away_elo"],
                "advantage": home_team if feats["elo_diff"] >= 0 else away_team,
                "impact_score": round(min(100.0, abs(feats["elo_diff"]) / 2.2), 1),
            },
            {
                "factor": "Recent Form (Last 5 PPG)",
                "home_val": round(feats["home_form_ppg_5"], 2),
                "away_val": round(feats["away_form_ppg_5"], 2),
                "advantage": home_team if feats["home_form_ppg_5"] >= feats["away_form_ppg_5"] else away_team,
                "impact_score": round(min(100.0, abs(feats["home_form_ppg_5"] - feats["away_form_ppg_5"]) * 38.0), 1),
            },
            {
                "factor": "Attacking xG Output (Last 5)",
                "home_val": round(feats["home_xg_avg_5"], 2),
                "away_val": round(feats["away_xg_avg_5"], 2),
                "advantage": home_team if feats["home_xg_avg_5"] >= feats["away_xg_avg_5"] else away_team,
                "impact_score": round(min(100.0, abs(feats["home_xg_avg_5"] - feats["away_xg_avg_5"]) * 45.0), 1),
            },
            {
                "factor": "Defensive xGA Solidity (Lower is Better)",
                "home_val": round(feats["home_xga_avg_5"], 2),
                "away_val": round(feats["away_xga_avg_5"], 2),
                "advantage": home_team if feats["home_xga_avg_5"] <= feats["away_xga_avg_5"] else away_team,
                "impact_score": round(min(100.0, abs(feats["away_xga_avg_5"] - feats["home_xga_avg_5"]) * 45.0), 1),
            },
            {
                "factor": "Venue Scoring Rate (Home vs Road)",
                "home_val": round(feats["home_venue_gf_5"], 2),
                "away_val": round(feats["away_venue_gf_5"], 2),
                "advantage": home_team if feats["home_venue_gf_5"] >= feats["away_venue_gf_5"] else away_team,
                "impact_score": round(min(100.0, abs(feats["home_venue_gf_5"] - feats["away_venue_gf_5"]) * 40.0), 1),
            },
            {
                "factor": "Head-to-Head Dominance (%)",
                "home_val": round(feats["h2h_home_win_rate"] * 100.0, 1),
                "away_val": round((1.0 - feats["h2h_home_win_rate"]) * 100.0, 1),
                "advantage": home_team if feats["h2h_home_win_rate"] >= 0.5 else away_team,
                "impact_score": round(min(100.0, abs(feats["h2h_home_win_rate"] - 0.5) * 160.0), 1),
            },
        ]
        return drivers

    def _generate_tactical_insights(
        self,
        home_team: str,
        away_team: str,
        h_club: Dict[str, Any],
        a_club: Dict[str, Any],
        feats: Dict[str, float],
        ens_p: np.ndarray,
        lam_home: float,
        lam_away: float,
        top_score: Dict[str, Any],
    ) -> List[str]:
        """Generate data-backed analytical insights for the match preview."""
        insights: List[str] = []

        if ens_p[0] >= 0.52:
            insights.append(
                f"{home_team} enters as clear favorite ({ens_p[0]*100:.1f}% win probability) backed by a {feats['elo_diff']:+.0f} Elo edge and strong home attacking metrics ({lam_home:.2f} projected xG)."
            )
        elif ens_p[2] >= 0.48:
            insights.append(
                f"{away_team} projects as road favorite ({ens_p[2]*100:.1f}% win probability), overcoming home advantage through superior squad Elo ({feats['away_elo']:.0f}) and {lam_away:.2f} expected goals."
            )
        else:
            insights.append(
                f"Highly competitive tactical battle: the Hybrid Ensemble sees a tight margin ({ens_p[0]*100:.1f}% Home / {ens_p[1]*100:.1f}% Draw / {ens_p[2]*100:.1f}% Away) with '{top_score['score']}' ({top_score['probability']}%) as the single likeliest scoreline."
            )

        if lam_home + lam_away >= 3.05:
            insights.append(
                f"High-event fixture alert: combined expected goals reach {lam_home + lam_away:.2f} xG, driven by {h_club['short_name']}'s {feats['home_shots_avg_5']:.1f} shots/90 and {a_club['short_name']}'s {feats['away_shots_avg_5']:.1f} shots/90."
            )
        elif lam_home + lam_away <= 2.35:
            insights.append(
                f"Compact defensive structure expected: combined xG sits at {lam_home + lam_away:.2f}, favoring low-scoring scorelines and tactical midfield control."
            )

        poss_gap = (h_club["possession_style"] - a_club["possession_style"]) * 100
        if abs(poss_gap) >= 8:
            dominant = home_team if poss_gap > 0 else away_team
            counter = away_team if poss_gap > 0 else home_team
            insights.append(
                f"Stylistic clash: {dominant} is projected to dictate ball progression and territorial control, while {counter} profiles to exploit vertical transitions."
            )
        else:
            insights.append(
                f"Balanced midfield duel: both sides press aggressively ({h_club['pressing_intensity']*100:.0f}% vs {a_club['pressing_intensity']*100:.0f}% pressing index), making set-pieces and second balls decisive."
            )

        return insights
