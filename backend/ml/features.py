"""
Feature Engineering Engine for Football Match Forecaster.
Computes strictly pre-match rolling statistics, Dynamic Club Elo, Venue-Specific Form,
Attack/Defense strength indices, and Head-to-Head (H2H) metrics.
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from backend.data_loader import (
    LEAGUES,
    get_clubs_dict,
    get_current_season_label,
    register_dynamic_club,
)

FEATURE_COLUMNS: List[str] = [
    "home_elo",
    "away_elo",
    "elo_diff",
    "home_elo_trend_5",
    "away_elo_trend_5",
    "home_form_ppg_5",
    "away_form_ppg_5",
    "home_form_ppg_10",
    "away_form_ppg_10",
    "home_gf_avg_5",
    "away_gf_avg_5",
    "home_ga_avg_5",
    "away_ga_avg_5",
    "home_xg_avg_5",
    "away_xg_avg_5",
    "home_xga_avg_5",
    "away_xga_avg_5",
    "home_venue_gf_5",
    "away_venue_gf_5",
    "home_venue_ga_5",
    "away_venue_ga_5",
    "home_shots_avg_5",
    "away_shots_avg_5",
    "home_sot_avg_5",
    "away_sot_avg_5",
    "h2h_home_win_rate",
    "h2h_goal_diff_avg",
    "league_home_adv",
]

FEATURE_LABELS: Dict[str, str] = {
    "home_elo": "Home Club Elo Rating",
    "away_elo": "Away Club Elo Rating",
    "elo_diff": "Club Elo Differential",
    "home_elo_trend_5": "Home 5-Match Elo Momentum",
    "away_elo_trend_5": "Away 5-Match Elo Momentum",
    "home_form_ppg_5": "Home Recent Form (Last 5 PPG)",
    "away_form_ppg_5": "Away Recent Form (Last 5 PPG)",
    "home_form_ppg_10": "Home Medium Form (Last 10 PPG)",
    "away_form_ppg_10": "Away Medium Form (Last 10 PPG)",
    "home_gf_avg_5": "Home Goals Scored / Match (L5)",
    "away_gf_avg_5": "Away Goals Scored / Match (L5)",
    "home_ga_avg_5": "Home Goals Conceded / Match (L5)",
    "away_ga_avg_5": "Away Goals Conceded / Match (L5)",
    "home_xg_avg_5": "Home Expected Goals xG (L5)",
    "away_xg_avg_5": "Away Expected Goals xG (L5)",
    "home_xga_avg_5": "Home Expected Goals Conceded xGA (L5)",
    "away_xga_avg_5": "Away Expected Goals Conceded xGA (L5)",
    "home_venue_gf_5": "Home Scoring Rate at Home Venue",
    "away_venue_gf_5": "Away Scoring Rate on the Road",
    "home_venue_ga_5": "Home Defensive Record at Venue",
    "away_venue_ga_5": "Away Defensive Record on the Road",
    "home_shots_avg_5": "Home Total Shots / 90 (L5)",
    "away_shots_avg_5": "Away Total Shots / 90 (L5)",
    "home_sot_avg_5": "Home Shots on Target / 90 (L5)",
    "away_sot_avg_5": "Away Shots on Target / 90 (L5)",
    "h2h_home_win_rate": "Head-to-Head Dominance Index",
    "h2h_goal_diff_avg": "H2H Average Goal Margin",
    "league_home_adv": "Competition Home Advantage Factor",
}


class FeatureStore:
    """
    Processes historical matches chronologically to build:
    1. Training feature matrix (X, y) with zero lookahead leakage
    2. Current snapshot of every team's Elo, rolling stats, form history, and H2H records
    """

    def __init__(self, df: pd.DataFrame) -> None:
        self.df = df.sort_values("date").reset_index(drop=True)
        self.clubs = get_clubs_dict()
        self.current_elo: Dict[str, float] = {
            name: meta["base_elo"] for name, meta in self.clubs.items()
        }
        self.team_history: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        self.venue_home_history: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        self.venue_away_history: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        self.h2h_history: Dict[Tuple[str, str], List[Dict[str, Any]]] = defaultdict(list)
        self.training_df: Optional[pd.DataFrame] = None
        self._build()

    def _get_rolling_metrics(self, team: str, venue: str) -> Dict[str, float]:
        """Compute rolling 5 and 10 match averages for a team prior to kickoff."""
        hist = self.team_history[team]
        club_meta = self.clubs.get(team, {})
        base_att = club_meta.get("attack", 78.0) / 52.0
        base_def = (105.0 - club_meta.get("defense", 78.0)) / 24.0

        if not hist:
            return {
                "elo_trend_5": 0.0,
                "ppg_5": 1.45,
                "ppg_10": 1.45,
                "gf_5": base_att,
                "ga_5": base_def,
                "xg_5": base_att,
                "xga_5": base_def,
                "venue_gf_5": base_att * (1.12 if venue == "home" else 0.90),
                "venue_ga_5": base_def * (0.90 if venue == "home" else 1.12),
                "shots_5": 13.0,
                "sot_5": 4.6,
                "corners_5": 5.2,
                "poss_5": club_meta.get("possession_style", 0.50) * 100.0,
                "clean_sheet_rate_10": 0.30,
                "btts_rate_10": 0.54,
            }

        last_5 = hist[-5:]
        last_10 = hist[-10:]
        v_hist = (
            self.venue_home_history[team][-5:]
            if venue == "home"
            else self.venue_away_history[team][-5:]
        )
        if not v_hist:
            v_hist = last_5

        elo_trend_5 = float(self.current_elo[team] - last_5[0]["elo_before"])
        return {
            "elo_trend_5": round(elo_trend_5, 2),
            "ppg_5": float(np.mean([m["points"] for m in last_5])),
            "ppg_10": float(np.mean([m["points"] for m in last_10])),
            "gf_5": float(np.mean([m["gf"] for m in last_5])),
            "ga_5": float(np.mean([m["ga"] for m in last_5])),
            "xg_5": float(np.mean([m["xg"] for m in last_5])),
            "xga_5": float(np.mean([m["xga"] for m in last_5])),
            "venue_gf_5": float(np.mean([m["gf"] for m in v_hist])),
            "venue_ga_5": float(np.mean([m["ga"] for m in v_hist])),
            "shots_5": float(np.mean([m["shots"] for m in last_5])),
            "sot_5": float(np.mean([m["sot"] for m in last_5])),
            "corners_5": float(np.mean([m["corners"] for m in last_5])),
            "poss_5": float(np.mean([m["poss"] for m in last_5])),
            "clean_sheet_rate_10": float(np.mean([1.0 if m["ga"] == 0 else 0.0 for m in last_10])),
            "btts_rate_10": float(np.mean([1.0 if (m["gf"] > 0 and m["ga"] > 0) else 0.0 for m in last_10])),
        }

    def _get_h2h_features(self, home_team: str, away_team: str) -> Tuple[float, float]:
        """Compute H2H win dominance and average goal differential from home team's perspective."""
        pair_key = tuple(sorted([home_team, away_team]))
        meetings = self.h2h_history[pair_key][-8:]
        if not meetings:
            elo_diff = self.current_elo.get(home_team, 1750.0) - self.current_elo.get(away_team, 1750.0)
            prior_win_rate = float(np.clip(0.46 + elo_diff / 1200.0, 0.18, 0.78))
            return prior_win_rate, round(elo_diff / 220.0, 2)

        pts = []
        gd = []
        for m in meetings:
            if m["home_team"] == home_team:
                gf, ga = m["fthg"], m["ftag"]
            else:
                gf, ga = m["ftag"], m["fthg"]
            pts.append(1.0 if gf > ga else (0.5 if gf == ga else 0.0))
            gd.append(gf - ga)

        return float(np.mean(pts)), float(np.mean(gd))

    def extract_match_feature_vector(
        self, home_team: str, away_team: str, league_code: str = "PL"
    ) -> Dict[str, float]:
        """Build the 28-feature dictionary for any pair of teams."""
        h_elo = self.current_elo.get(home_team, 1750.0)
        a_elo = self.current_elo.get(away_team, 1750.0)
        h_roll = self._get_rolling_metrics(home_team, "home")
        a_roll = self._get_rolling_metrics(away_team, "away")
        h2h_win_rate, h2h_gd = self._get_h2h_features(home_team, away_team)
        lg_adv = LEAGUES.get(league_code, LEAGUES["PL"])["home_advantage"]

        return {
            "home_elo": round(h_elo, 2),
            "away_elo": round(a_elo, 2),
            "elo_diff": round(h_elo - a_elo, 2),
            "home_elo_trend_5": round(h_roll["elo_trend_5"], 2),
            "away_elo_trend_5": round(a_roll["elo_trend_5"], 2),
            "home_form_ppg_5": round(h_roll["ppg_5"], 3),
            "away_form_ppg_5": round(a_roll["ppg_5"], 3),
            "home_form_ppg_10": round(h_roll["ppg_10"], 3),
            "away_form_ppg_10": round(a_roll["ppg_10"], 3),
            "home_gf_avg_5": round(h_roll["gf_5"], 3),
            "away_gf_avg_5": round(a_roll["gf_5"], 3),
            "home_ga_avg_5": round(h_roll["ga_5"], 3),
            "away_ga_avg_5": round(a_roll["ga_5"], 3),
            "home_xg_avg_5": round(h_roll["xg_5"], 3),
            "away_xg_avg_5": round(a_roll["xg_5"], 3),
            "home_xga_avg_5": round(h_roll["xga_5"], 3),
            "away_xga_avg_5": round(a_roll["xga_5"], 3),
            "home_venue_gf_5": round(h_roll["venue_gf_5"], 3),
            "away_venue_gf_5": round(a_roll["venue_gf_5"], 3),
            "home_venue_ga_5": round(h_roll["venue_ga_5"], 3),
            "away_venue_ga_5": round(a_roll["venue_ga_5"], 3),
            "home_shots_avg_5": round(h_roll["shots_5"], 2),
            "away_shots_avg_5": round(a_roll["shots_5"], 2),
            "home_sot_avg_5": round(h_roll["sot_5"], 2),
            "away_sot_avg_5": round(a_roll["sot_5"], 2),
            "h2h_home_win_rate": round(h2h_win_rate, 3),
            "h2h_goal_diff_avg": round(h2h_gd, 3),
            "league_home_adv": float(lg_adv),
        }

    def _build(self) -> None:
        """Iterate chronologically over historical matches to build training rows and update state."""
        feature_rows: List[Dict[str, Any]] = []
        k_factor = 20.0

        for _, row in self.df.iterrows():
            home = str(row["home_team"])
            away = str(row["away_team"])
            lg = str(row["league"])
            fthg = int(row["fthg"])
            ftag = int(row["ftag"])
            ftr = str(row["ftr"])

            if home not in self.clubs:
                self.clubs[home] = register_dynamic_club(home, lg)
            if away not in self.clubs:
                self.clubs[away] = register_dynamic_club(away, lg)
            if home not in self.current_elo:
                self.current_elo[home] = self.clubs[home]["base_elo"]
            if away not in self.current_elo:
                self.current_elo[away] = self.clubs[away]["base_elo"]

            # Extract strictly pre-match features
            feats = self.extract_match_feature_vector(home, away, lg)
            target = 0 if ftr == "H" else (1 if ftr == "D" else 2)
            feats["target"] = target
            feats["fthg"] = fthg
            feats["ftag"] = ftag
            feats["league"] = lg
            feats["season"] = row["season"]
            feats["date"] = row["date"]
            feature_rows.append(feats)

            # Update Elo ratings after match
            h_elo_before = self.current_elo[home]
            a_elo_before = self.current_elo[away]
            exp_home = 1.0 / (1.0 + 10.0 ** ((a_elo_before - (h_elo_before + 55.0)) / 400.0))
            actual_home = 1.0 if ftr == "H" else (0.5 if ftr == "D" else 0.0)
            goal_mult = np.log(abs(fthg - ftag) + 1.0) * 0.7 + 0.65
            delta = k_factor * goal_mult * (actual_home - exp_home)

            self.current_elo[home] = h_elo_before + delta
            self.current_elo[away] = a_elo_before - delta

            h_pts = 3 if ftr == "H" else (1 if ftr == "D" else 0)
            a_pts = 3 if ftr == "A" else (1 if ftr == "D" else 0)
            h_res_char = "W" if ftr == "H" else ("D" if ftr == "D" else "L")
            a_res_char = "W" if ftr == "A" else ("D" if ftr == "D" else "L")

            h_entry = {
                "date": str(row["date"]),
                "season": str(row["season"]),
                "league": lg,
                "opponent": away,
                "venue": "H",
                "gf": fthg,
                "ga": ftag,
                "result": h_res_char,
                "points": h_pts,
                "xg": float(row.get("home_xg", fthg * 0.9 + 0.3)),
                "xga": float(row.get("away_xg", ftag * 0.9 + 0.3)),
                "shots": int(row.get("hs", 12)),
                "sot": int(row.get("hst", 4)),
                "corners": int(row.get("hc", 5)),
                "poss": float(row.get("home_possession", 50.0)),
                "elo_before": h_elo_before,
                "elo_after": self.current_elo[home],
            }
            a_entry = {
                "date": str(row["date"]),
                "season": str(row["season"]),
                "league": lg,
                "opponent": home,
                "venue": "A",
                "gf": ftag,
                "ga": fthg,
                "result": a_res_char,
                "points": a_pts,
                "xg": float(row.get("away_xg", ftag * 0.9 + 0.3)),
                "xga": float(row.get("home_xg", fthg * 0.9 + 0.3)),
                "shots": int(row.get("as", 11)),
                "sot": int(row.get("ast", 4)),
                "corners": int(row.get("ac", 4)),
                "poss": float(row.get("away_possession", 50.0)),
                "elo_before": a_elo_before,
                "elo_after": self.current_elo[away],
            }

            self.team_history[home].append(h_entry)
            self.team_history[away].append(a_entry)
            self.venue_home_history[home].append(h_entry)
            self.venue_away_history[away].append(a_entry)

            pair_key = tuple(sorted([home, away]))
            self.h2h_history[pair_key].append(
                {
                    "date": str(row["date"]),
                    "season": str(row["season"]),
                    "league": lg,
                    "home_team": home,
                    "away_team": away,
                    "fthg": fthg,
                    "ftag": ftag,
                    "ftr": ftr,
                    "home_xg": float(row.get("home_xg", 1.2)),
                    "away_xg": float(row.get("away_xg", 1.1)),
                }
            )

        self.training_df = pd.DataFrame(feature_rows)

    def get_team_profile(self, team_name: str) -> Dict[str, Any]:
        """Return comprehensive current form, recent matches, and metrics for a team."""
        club_meta = self.clubs.get(team_name, {})
        hist = self.team_history.get(team_name, [])
        last_5 = hist[-5:]
        last_10 = hist[-10:]
        roll_home = self._get_rolling_metrics(team_name, "home")
        roll_away = self._get_rolling_metrics(team_name, "away")

        form_5_letters = [m["result"] for m in last_5]
        recent_matches = list(reversed(hist[-6:]))

        return {
            **club_meta,
            "current_elo": round(self.current_elo.get(team_name, 1750.0), 1),
            "form_last_5": form_5_letters,
            "ppg_last_5": round(roll_home["ppg_5"], 2),
            "ppg_last_10": round(roll_home["ppg_10"], 2),
            "gf_avg_5": round(roll_home["gf_5"], 2),
            "ga_avg_5": round(roll_home["ga_5"], 2),
            "xg_avg_5": round(roll_home["xg_5"], 2),
            "xga_avg_5": round(roll_home["xga_5"], 2),
            "shots_avg_5": round(roll_home["shots_5"], 1),
            "sot_avg_5": round(roll_home["sot_5"], 1),
            "corners_avg_5": round(roll_home["corners_5"], 1),
            "possession_avg_5": round(roll_home["poss_5"], 1),
            "clean_sheet_rate": round(roll_home["clean_sheet_rate_10"] * 100.0, 1),
            "btts_rate": round(roll_home["btts_rate_10"] * 100.0, 1),
            "home_gf_avg": round(roll_home["venue_gf_5"], 2),
            "away_gf_avg": round(roll_away["venue_gf_5"], 2),
            "recent_matches": recent_matches,
            "matches_analyzed": len(hist),
        }

    def get_h2h_summary(self, home_team: str, away_team: str) -> Dict[str, Any]:
        """Return detailed Head-to-Head record and recent meetings between two clubs."""
        pair_key = tuple(sorted([home_team, away_team]))
        meetings = list(reversed(self.h2h_history.get(pair_key, [])))

        home_wins = 0
        away_wins = 0
        draws = 0
        home_goals = 0
        away_goals = 0
        btts_count = 0

        for m in meetings:
            if m["home_team"] == home_team:
                hg, ag = m["fthg"], m["ftag"]
            else:
                hg, ag = m["ftag"], m["fthg"]
            home_goals += hg
            away_goals += ag
            if hg > 0 and ag > 0:
                btts_count += 1
            if hg > ag:
                home_wins += 1
            elif hg < ag:
                away_wins += 1
            else:
                draws += 1

        total = len(meetings)
        return {
            "total_meetings": total,
            "home_team_wins": home_wins,
            "draws": draws,
            "away_team_wins": away_wins,
            "home_team_goals": home_goals,
            "away_team_goals": away_goals,
            "avg_total_goals": round((home_goals + away_goals) / total, 2) if total > 0 else 2.75,
            "btts_percentage": round((btts_count / total) * 100.0, 1) if total > 0 else 55.0,
            "recent_meetings": meetings[:6],
        }

    def get_league_standings(self, league_code: str, season: Optional[str] = None) -> List[Dict[str, Any]]:
        """Compute current season league table with xG, GD, Form, and Elo."""
        lg_df = self.df[self.df["league"] == league_code]
        if season is None:
            if not lg_df.empty and "season" in lg_df.columns:
                season = str(lg_df["season"].iloc[-1])
            else:
                season = get_current_season_label()

        sub = lg_df[lg_df["season"] == season]
        if sub.empty:
            sub = lg_df

        stats: Dict[str, Dict[str, Any]] = {}
        for name, meta in self.clubs.items():
            if league_code == "CL" and not meta["ucl_participant"]:
                continue
            if league_code != "CL" and meta["league"] != league_code:
                continue
            stats[name] = {
                "team": name,
                "short_name": meta["short_name"],
                "tla": meta["tla"],
                "color": meta["primary_color"],
                "played": 0,
                "won": 0,
                "drawn": 0,
                "lost": 0,
                "gf": 0,
                "ga": 0,
                "gd": 0,
                "points": 0,
                "xg": 0.0,
                "xga": 0.0,
                "elo": round(float(self.current_elo.get(name, meta["base_elo"])), 1),
                "form": [m["result"] for m in self.team_history.get(name, [])[-5:]],
            }

        for _, row in sub.iterrows():
            h, a = str(row["home_team"]), str(row["away_team"])
            fthg, ftag = int(row["fthg"]), int(row["ftag"])
            hxg, axg = float(row.get("home_xg", fthg)), float(row.get("away_xg", ftag))

            for team, gf, ga, xg, xga in [
                (h, fthg, ftag, hxg, axg),
                (a, ftag, fthg, axg, hxg),
            ]:
                if team not in stats:
                    meta = self.clubs.get(team) or register_dynamic_club(team, league_code)
                    stats[team] = {
                        "team": team,
                        "short_name": meta["short_name"],
                        "tla": meta["tla"],
                        "color": meta["primary_color"],
                        "played": 0,
                        "won": 0,
                        "drawn": 0,
                        "lost": 0,
                        "gf": 0,
                        "ga": 0,
                        "gd": 0,
                        "points": 0,
                        "xg": 0.0,
                        "xga": 0.0,
                        "elo": round(float(self.current_elo.get(team, meta["base_elo"])), 1),
                        "form": [m["result"] for m in self.team_history.get(team, [])[-5:]],
                    }
                st = stats[team]
                st["played"] += 1
                st["gf"] += gf
                st["ga"] += ga
                st["gd"] = st["gf"] - st["ga"]
                st["xg"] = round(st["xg"] + xg, 1)
                st["xga"] = round(st["xga"] + xga, 1)
                if gf > ga:
                    st["won"] += 1
                    st["points"] += 3
                elif gf == ga:
                    st["drawn"] += 1
                    st["points"] += 1
                else:
                    st["lost"] += 1

        ranked = sorted(
            stats.values(),
            key=lambda x: (-x["points"], -x["gd"], -x["gf"], -x["elo"]),
        )
        for idx, item in enumerate(ranked, start=1):
            item["rank"] = idx
        return ranked
