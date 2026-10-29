/**
 * Canonical TypeScript interfaces for PitchOracle AI FastAPI responses
 * and UI state across Match Center, Standings, and ML Telemetry views.
 */

export type ViewId = "match-center" | "standings" | "ml-lab";

export type InspectorTabId = "matrix-markets" | "telemetry-radar" | "xai-h2h";

export interface LeagueMeta {
  code: string;
  name: string;
  country: string;
  flag: string;
  accent: string;
  highlight: string;
  avg_goals: number;
  home_advantage: number;
  description: string;
  team_count?: number;
}

export interface TeamProfile {
  name: string;
  short_name: string;
  tla: string;
  league: string;
  country: string;
  stadium: string;
  primary_color: string;
  secondary_color: string;
  base_elo: number;
  current_elo: number;
  attack: number;
  defense: number;
  possession_style: number;
  pressing_intensity: number;
  form_last_5: Array<"W" | "D" | "L">;
  ppg_last_5: number;
  xg_last_5: number;
  xga_last_5: number;
}

export interface Probabilities1X2 {
  home_win: number;
  draw: number;
  away_win: number;
}

export interface FixtureSummary {
  id: string;
  league: string;
  league_name: string;
  league_flag: string;
  stage: string;
  date: string;
  kickoff: string;
  stadium: string;
  home_team: string;
  home_short: string;
  home_tla: string;
  home_color: string;
  home_elo: number;
  home_form: Array<"W" | "D" | "L">;
  away_team: string;
  away_short: string;
  away_tla: string;
  away_color: string;
  away_elo: number;
  away_form: Array<"W" | "D" | "L">;
  probabilities: Probabilities1X2;
  most_likely_score: string;
  most_likely_prob: number;
  expected_home_goals: number;
  expected_away_goals: number;
  over_2_5: number;
  btts_yes: number;
}

export interface ScorelineEntry {
  score: string;
  home_goals: number;
  away_goals: number;
  probability: number;
  outcome: "H" | "D" | "A";
}

export interface GoalTimelineInterval {
  period: string;
  home_goal_prob: number;
  away_goal_prob: number;
  any_goal_prob: number;
}

export interface SimulatedStats {
  simulations_run: number;
  home_xg: number;
  away_xg: number;
  home_possession: number;
  away_possession: number;
  home_shots: number;
  away_shots: number;
  home_sot: number;
  away_sot: number;
  home_big_chances: number;
  away_big_chances: number;
  home_corners: number;
  away_corners: number;
  home_fouls: number;
  away_fouls: number;
  home_yellow_cards: number;
  away_yellow_cards: number;
  home_pass_accuracy: number;
  away_pass_accuracy: number;
  goal_timeline: GoalTimelineInterval[];
}

export interface MatchDriver {
  factor: string;
  home_val: number;
  away_val: number;
  advantage: string;
  impact_score: number;
}

export interface H2HMeeting {
  date: string;
  home_team: string;
  away_team: string;
  fthg: number;
  ftag: number;
}

export interface H2HSummary {
  total_meetings: number;
  home_team_wins: number;
  draws: number;
  away_team_wins: number;
  avg_total_goals: number;
  recent_meetings: H2HMeeting[];
}

export interface MatchPredictionResponse {
  fixture: {
    league: string;
    league_name: string;
    league_flag: string;
    stadium: string;
    home_team: TeamProfile;
    away_team: TeamProfile;
  };
  probabilities: {
    ensemble: Probabilities1X2;
    xgboost: Probabilities1X2;
    random_forest: Probabilities1X2;
    dixon_coles: Probabilities1X2;
  };
  predicted_score: {
    most_likely: ScorelineEntry;
    expected_home_goals: number;
    expected_away_goals: number;
    top_scorelines: ScorelineEntry[];
    score_matrix: number[][];
  };
  markets: {
    over_1_5: number;
    under_1_5: number;
    over_2_5: number;
    under_2_5: number;
    over_3_5: number;
    under_3_5: number;
    btts_yes: number;
    btts_no: number;
    double_chance_1x: number;
    double_chance_x2: number;
    avg_simulated_goals: number;
  };
  simulated_stats: SimulatedStats;
  h2h: H2HSummary;
  feature_vector: Record<string, number>;
  match_drivers: MatchDriver[];
  tactical_insights: string[];
}

export interface StandingsRow {
  rank: number;
  team: string;
  short_name: string;
  tla: string;
  color: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  xg: number;
  xga: number;
  elo: number;
  points: number;
  form: Array<"W" | "D" | "L">;
}

export interface ModelFeatureImportance {
  feature: string;
  label: string;
  importance: number;
  xgb_importance: number;
  rf_importance: number;
}

export interface ModelMetricsResponse {
  total_historical_matches: number;
  train_samples: number;
  test_samples: number;
  num_features: number;
  xgb_accuracy: number;
  rf_accuracy: number;
  ensemble_accuracy: number;
  xgb_log_loss: number;
  rf_log_loss: number;
  ensemble_log_loss: number;
  ranked_probability_score: number;
  top_features: ModelFeatureImportance[];
}

export interface WhatIfState {
  homeBoost: number;
  awayBoost: number;
  tempo: number;
  neutralVenue: boolean;
}
