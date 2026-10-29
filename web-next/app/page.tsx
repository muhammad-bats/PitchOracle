"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ClubCrest } from "@/components/ClubCrest";
import { ClubPickerMenu } from "@/components/ClubPickerMenu";
import { ConfirmRetrainDialog } from "@/components/ConfirmRetrainDialog";
import { MomentumScrubber } from "@/components/MomentumScrubber";
import { ScoreMatrix } from "@/components/ScoreMatrix";
import {
  ScorelineDetailSheet,
  type SelectedScorelineDetail,
} from "@/components/ScorelineDetailSheet";
import { SegmentedInspector } from "@/components/SegmentedInspector";
import { TacticalRadar } from "@/components/TacticalRadar";
import { WhatIfSandbox } from "@/components/WhatIfSandbox";
import { resolveClubSeriesColors } from "@/lib/color-guard";
import { createInstantPress } from "@/lib/instant-press";
import type {
  FixtureSummary,
  InspectorTabId,
  LeagueMeta,
  MatchPredictionResponse,
  ModelMetricsResponse,
  StandingsRow,
  TeamProfile,
  ViewId,
  WhatIfState,
} from "@/lib/types";

const PRIMARY_VIEWS: { id: ViewId; label: string }[] = [
  { id: "match-center", label: "Match Center" },
  { id: "standings", label: "Standings & xG" },
  { id: "ml-lab", label: "Model Telemetry" },
];

export default function PitchOraclePage() {
  const [activeView, setActiveView] = useState<ViewId>("match-center");
  const [activeLeague, setActiveLeague] = useState<string>("ALL");
  const [activeInspectorTab, setActiveInspectorTab] =
    useState<InspectorTabId>("matrix-markets");

  const [leagues, setLeagues] = useState<LeagueMeta[]>([]);
  const [teams, setTeams] = useState<TeamProfile[]>([]);
  const [fixtures, setFixtures] = useState<FixtureSummary[]>([]);
  const [selectedFixtureId, setSelectedFixtureId] = useState<string | null>(
    null
  );

  const [homeTeam, setHomeTeam] = useState<string>("Arsenal");
  const [awayTeam, setAwayTeam] = useState<string>("Manchester City");
  const [matchLeague, setMatchLeague] = useState<string>("PL");
  const [validationError, setValidationError] = useState<string | null>(null);

  const [whatIf, setWhatIf] = useState<WhatIfState>({
    homeBoost: 0.0,
    awayBoost: 0.0,
    tempo: 0.0,
    neutralVenue: false,
  });

  const [prediction, setPrediction] = useState<MatchPredictionResponse | null>(
    null
  );
  const [baselinePrediction, setBaselinePrediction] =
    useState<MatchPredictionResponse | null>(null);
  const [activeScrubberIdx, setActiveScrubberIdx] = useState<number | null>(
    null
  );
  const [selectedScoreDetail, setSelectedScoreDetail] =
    useState<SelectedScorelineDetail | null>(null);

  const [standingsLeague, setStandingsLeague] =
    useState<LeagueMeta | null>(null);
  const [standingsRows, setStandingsRows] = useState<StandingsRow[]>([]);
  const [modelMetrics, setModelMetrics] =
    useState<ModelMetricsResponse | null>(null);

  const [confirmRetrainOpen, setConfirmRetrainOpen] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatusLabel, setSyncStatusLabel] = useState<string>(
    "Sync & Retrain Models"
  );
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [isSwapSpinning, setIsSwapSpinning] = useState<boolean>(false);
  const [isMetricPulsing, setIsMetricPulsing] = useState<boolean>(false);
  const [isDarkAppearance, setIsDarkAppearance] = useState<boolean>(true);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    setIsDarkAppearance(!mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDarkAppearance(!e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const resolvedSeries = useMemo(() => {
    const hPrimary =
      prediction?.fixture.home_team.primary_color || "#EF0107";
    const aPrimary =
      prediction?.fixture.away_team.primary_color || "#6CABDD";
    const aSecondary =
      prediction?.fixture.away_team.secondary_color || "#1C2C5B";
    return resolveClubSeriesColors(
      hPrimary,
      aPrimary,
      aSecondary,
      isDarkAppearance
    );
  }, [prediction, isDarkAppearance]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--series-home",
      resolvedSeries.homeColor
    );
    document.documentElement.style.setProperty(
      "--series-away",
      resolvedSeries.awayColor
    );
  }, [resolvedSeries]);

  const triggerMetricPulse = useCallback(() => {
    setIsMetricPulsing(true);
    const t = setTimeout(() => setIsMetricPulsing(false), 320);
    return () => clearTimeout(t);
  }, []);

  const showTransientNotice = useCallback((message: string) => {
    setStatusNotice(message);
    setTimeout(() => {
      setStatusNotice((prev) => (prev === message ? null : prev));
    }, 3200);
  }, []);

  const fetchPrediction = useCallback(
    async (
      hTeam: string,
      aTeam: string,
      lg: string,
      wi: WhatIfState,
      isBaselineCall = false
    ) => {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          home_team: hTeam,
          away_team: aTeam,
          league: lg,
          home_form_boost: wi.homeBoost,
          away_form_boost: wi.awayBoost,
          tactical_tempo: wi.tempo,
          neutral_venue: wi.neutralVenue,
        }),
      });
      if (!res.ok) return;
      const data: MatchPredictionResponse = await res.json();
      setPrediction(data);
      triggerMetricPulse();
      if (
        isBaselineCall ||
        (wi.homeBoost === 0 &&
          wi.awayBoost === 0 &&
          wi.tempo === 0 &&
          !wi.neutralVenue)
      ) {
        setBaselinePrediction(data);
      }
    },
    [triggerMetricPulse]
  );

  const loadStandings = useCallback(async (lgCode: string) => {
    const res = await fetch(`/api/standings/${lgCode}`);
    if (!res.ok) return;
    const data = await res.json();
    setStandingsLeague(data.league);
    setStandingsRows(data.standings);
  }, []);

  useEffect(() => {
    async function bootstrap() {
      const [lgRes, tmRes, fxRes, mmRes] = await Promise.all([
        fetch("/api/leagues"),
        fetch("/api/teams"),
        fetch("/api/fixtures?league=ALL"),
        fetch("/api/model-metrics"),
      ]);
      const lgData = await lgRes.json();
      const tmData = await tmRes.json();
      const fxData = await fxRes.json();
      const mmData = await mmRes.json();

      setLeagues(lgData.leagues || []);
      setTeams(tmData.teams || []);
      setFixtures(fxData.fixtures || []);
      setModelMetrics(mmData);

      if (fxData.fixtures && fxData.fixtures.length > 0) {
        const first: FixtureSummary = fxData.fixtures[0];
        setSelectedFixtureId(first.id);
        setHomeTeam(first.home_team);
        setAwayTeam(first.away_team);
        setMatchLeague(first.league);
        await fetchPrediction(
          first.home_team,
          first.away_team,
          first.league,
          { homeBoost: 0, awayBoost: 0, tempo: 0, neutralVenue: false },
          true
        );
      }
    }
    bootstrap();
  }, [fetchPrediction]);

  const handleLeagueSelect = async (code: string) => {
    setActiveLeague(code);
    const tmUrl =
      code && code !== "ALL" ? `/api/teams?league=${code}` : "/api/teams";
    const [tmRes, fxRes] = await Promise.all([
      fetch(tmUrl),
      fetch(`/api/fixtures?league=${code}`),
    ]);
    const tmData = await tmRes.json();
    const fxData = await fxRes.json();
    setTeams(tmData.teams || []);
    setFixtures(fxData.fixtures || []);

    if (activeView === "standings") {
      await loadStandings(code === "ALL" ? "PL" : code);
    } else if (fxData.fixtures && fxData.fixtures.length > 0) {
      const first: FixtureSummary = fxData.fixtures[0];
      setSelectedFixtureId(first.id);
      setHomeTeam(first.home_team);
      setAwayTeam(first.away_team);
      setMatchLeague(first.league);
      const resetWi = {
        homeBoost: 0,
        awayBoost: 0,
        tempo: 0,
        neutralVenue: false,
      };
      setWhatIf(resetWi);
      await fetchPrediction(
        first.home_team,
        first.away_team,
        first.league,
        resetWi,
        true
      );
    }
  };

  const handleSelectFixture = async (fix: FixtureSummary) => {
    setSelectedFixtureId(fix.id);
    setHomeTeam(fix.home_team);
    setAwayTeam(fix.away_team);
    setMatchLeague(fix.league);
    setValidationError(null);
    const resetWi = {
      homeBoost: 0,
      awayBoost: 0,
      tempo: 0,
      neutralVenue: false,
    };
    setWhatIf(resetWi);
    await fetchPrediction(
      fix.home_team,
      fix.away_team,
      fix.league,
      resetWi,
      true
    );
  };

  const handleSwapTeams = async () => {
    setIsSwapSpinning(true);
    setTimeout(() => setIsSwapSpinning(false), 360);
    const nextHome = awayTeam;
    const nextAway = homeTeam;
    setHomeTeam(nextHome);
    setAwayTeam(nextAway);
    setSelectedFixtureId(null);
    setValidationError(null);
    await fetchPrediction(nextHome, nextAway, matchLeague, whatIf, true);
  };

  const handleRunCustomMatchup = async () => {
    if (homeTeam === awayTeam) {
      setValidationError(
        "A club cannot play against itself. Choose a different away opponent to generate a forecast."
      );
      return;
    }
    setValidationError(null);
    setSelectedFixtureId(null);
    await fetchPrediction(homeTeam, awayTeam, matchLeague, whatIf, true);
  };

  const handleResolveRivalAutomatically = async () => {
    const candidate =
      teams.find((t) => t.name !== homeTeam)?.name || "Manchester City";
    setAwayTeam(candidate);
    setValidationError(null);
    setSelectedFixtureId(null);
    await fetchPrediction(homeTeam, candidate, matchLeague, whatIf, true);
  };

  const handleWhatIfChange = async (nextWi: WhatIfState) => {
    setWhatIf(nextWi);
    await fetchPrediction(homeTeam, awayTeam, matchLeague, nextWi, false);
  };

  const executeSyncAndRetrain = async () => {
    setConfirmRetrainOpen(false);
    if (isSyncing) return;
    setIsSyncing(true);
    setSyncStatusLabel("Syncing Match Data…");
    try {
      const res = await fetch("/api/sync-data", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setModelMetrics(data.metrics);
        setSyncStatusLabel("Models Updated");
        showTransientNotice(
          `Ensemble recalibrated across ${data.metrics.total_historical_matches.toLocaleString()} historical matches.`
        );
        setTimeout(() => {
          setIsSyncing(false);
          setSyncStatusLabel("Sync & Retrain Models");
        }, 2000);
      } else {
        setIsSyncing(false);
        setSyncStatusLabel("Sync & Retrain Models");
      }
    } catch {
      setIsSyncing(false);
      setSyncStatusLabel("Sync & Retrain Models");
    }
  };

  const isWhatIfActive =
    whatIf.homeBoost !== 0 ||
    whatIf.awayBoost !== 0 ||
    whatIf.tempo !== 0 ||
    whatIf.neutralVenue;

  const homeWinDelta =
    prediction && baselinePrediction && isWhatIfActive
      ? Number(
          (
            prediction.probabilities.ensemble.home_win -
            baselinePrediction.probabilities.ensemble.home_win
          ).toFixed(1)
        )
      : 0;

  const awayWinDelta =
    prediction && baselinePrediction && isWhatIfActive
      ? Number(
          (
            prediction.probabilities.ensemble.away_win -
            baselinePrediction.probabilities.ensemble.away_win
          ).toFixed(1)
        )
      : 0;

  const activeViewIndex = Math.max(
    0,
    PRIMARY_VIEWS.findIndex((v) => v.id === activeView)
  );

  return (
    <>
      {/* Functional Layer: Liquid Glass Topbar (`liquid-glass.md`) */}
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-logo" aria-hidden="true">
              <svg
                viewBox="0 0 36 36"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <circle
                  cx="18"
                  cy="18"
                  r="16"
                  stroke="var(--accent-action)"
                  strokeWidth="2.2"
                  fill="var(--surface-elevated)"
                />
                <polygon
                  points="18,9 24,14 22,22 14,22 12,14"
                  stroke="var(--accent-action)"
                  strokeWidth="1.8"
                  fill="var(--accent-action-muted)"
                />
              </svg>
            </div>
            <div>
              <div className="brand-title">
                PitchOracle <span className="brand-badge">Hybrid ML v2.6</span>
              </div>
              <div className="brand-subtitle">
                XGBoost, Random Forest, and Dixon-Coles 10,000x Monte Carlo
                ensemble.
              </div>
            </div>
          </div>

          {/* Primary Navigation Tabs — Title Case + Instant Down-Press + Sliding Thumb */}
          <nav
            className="main-tabs segmented-track"
            role="tablist"
            aria-label="Primary Views"
            style={
              {
                "--active-segment-idx": activeViewIndex,
                "--segment-count": PRIMARY_VIEWS.length,
              } as React.CSSProperties
            }
          >
            <div
              className="segmented-sliding-thumb main-tab-thumb"
              aria-hidden="true"
            />
            {PRIMARY_VIEWS.map((view) => {
              const isSelected = activeView === view.id;
              return (
                <button
                  key={view.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  className={`main-tab ${isSelected ? "active" : ""}`}
                  {...createInstantPress(async () => {
                    setActiveView(view.id);
                    if (view.id === "standings") {
                      await loadStandings(
                        activeLeague === "ALL" ? "PL" : activeLeague
                      );
                    }
                  })}
                >
                  {view.label}
                </button>
              );
            })}
          </nav>

          <div className="topbar-actions">
            <div
              className="telemetry-pill"
              title="Historical matches indexed in FeatureStore"
            >
              <span className="status-dot" aria-hidden="true" />
              <span>
                {modelMetrics
                  ? modelMetrics.total_historical_matches.toLocaleString()
                  : "7,393"}{" "}
                Matches Indexed
              </span>
            </div>
            <button
              type="button"
              className="btn-sync"
              disabled={isSyncing}
              {...createInstantPress(
                () => setConfirmRetrainOpen(true),
                { disabled: isSyncing }
              )}
            >
              <span
                className={isSyncing ? "spin-icon" : ""}
                aria-hidden="true"
              >
                ↻
              </span>{" "}
              {syncStatusLabel}
            </button>
          </div>
        </div>

        {/* Competition Selector Strip — Instant Down-Press */}
        <div
          className="league-strip"
          role="navigation"
          aria-label="Competition Filter"
        >
          <div className="league-strip-inner">
            <button
              type="button"
              className={`league-pill ${
                activeLeague === "ALL" ? "active" : ""
              }`}
              aria-pressed={activeLeague === "ALL"}
              {...createInstantPress(() => handleLeagueSelect("ALL"))}
            >
              All Competitions
            </button>
            {leagues.map((lg) => (
              <button
                key={lg.code}
                type="button"
                className={`league-pill ${
                  activeLeague === lg.code ? "active" : ""
                }`}
                aria-pressed={activeLeague === lg.code}
                {...createInstantPress(() => handleLeagueSelect(lg.code))}
              >
                <span aria-hidden="true">{lg.flag}</span> {lg.name}
              </button>
            ))}
          </div>
        </div>
      </header>

      {/* Non-Intrusive Status Feedback Banner (`feedback.md`) */}
      <div
        className={`status-toast-banner ${statusNotice ? "visible" : ""}`}
        role="status"
        aria-live="polite"
      >
        <span className="status-dot" aria-hidden="true" />
        <span>{statusNotice}</span>
      </div>

      {/* Main Content Workspace */}
      <main id="main-workspace" className="workspace">
        {/* VIEW 1: MATCH CENTER & PREDICTOR */}
        {activeView === "match-center" && (
          <section className="view-section active">
            <div className="match-center-grid">
              {/* Leading Sidebar: Custom Matchup Builder Form + Upcoming Fixtures */}
              <aside className="fixtures-sidebar">
                <form
                  className="surface-card builder-card"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleRunCustomMatchup();
                  }}
                >
                  <div className="card-header-compact">
                    <div className="card-title-sm">
                      <span className="accent-dot" aria-hidden="true" /> Custom
                      Matchup Builder
                    </div>
                    <button
                      type="button"
                      className="btn-swap"
                      title="Swap Home and Away Clubs"
                      {...createInstantPress(handleSwapTeams)}
                    >
                      <span
                        className={`swap-icon ${
                          isSwapSpinning ? "spinning" : ""
                        }`}
                        aria-hidden="true"
                      >
                        ⇄
                      </span>{" "}
                      Swap Clubs
                    </button>
                  </div>
                  <p className="builder-helper">
                    Compare any two clubs across domestic leagues or the
                    Champions League.
                  </p>
                  <div className="builder-selectors">
                    <ClubPickerMenu
                      id="select-home-team"
                      label="Home Club"
                      selectedTeamName={homeTeam}
                      teams={teams}
                      onSelectTeam={(nextTeam) => {
                        setHomeTeam(nextTeam);
                        setValidationError(null);
                      }}
                    />
                    <div className="vs-divider" aria-hidden="true">
                      vs
                    </div>
                    <ClubPickerMenu
                      id="select-away-team"
                      label="Away Club"
                      selectedTeamName={awayTeam}
                      teams={teams}
                      onSelectTeam={(nextTeam) => {
                        setAwayTeam(nextTeam);
                        setValidationError(null);
                      }}
                    />
                  </div>

                  {/* Actionable Inline Conflict Alert (`alerts.md` & `writing.md`) */}
                  {validationError && (
                    <div className="inline-alert-card" role="alert">
                      <div className="inline-alert-title">
                        Identical Home and Away Club
                      </div>
                      <p className="inline-alert-desc">{validationError}</p>
                      <button
                        type="button"
                        className="inline-alert-action"
                        {...createInstantPress(handleResolveRivalAutomatically)}
                      >
                        Choose Rival Club
                      </button>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn-primary-predict"
                    {...createInstantPress(handleRunCustomMatchup)}
                  >
                    Generate Match Forecast
                  </button>
                </form>

                {/* Keyboard & Instant Down-Press Upcoming Fixtures List */}
                <div className="surface-card">
                  <div className="card-header-compact">
                    <div className="card-title-sm">
                      Upcoming Marquee Fixtures
                    </div>
                    <span className="badge-count">{fixtures.length}</span>
                  </div>
                  <div
                    className="fixtures-scroll"
                    role="listbox"
                    aria-label="Upcoming Fixtures"
                  >
                    {fixtures.length > 0 ? (
                      fixtures.map((f) => {
                        const isSelected = f.id === selectedFixtureId;
                        const p = f.probabilities;
                        const maxP = Math.max(p.home_win, p.draw, p.away_win);
                        return (
                          <button
                            key={f.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`fixture-item ${
                              isSelected ? "selected" : ""
                            }`}
                            {...createInstantPress(() =>
                              handleSelectFixture(f)
                            )}
                          >
                            <div className="fixture-meta-top">
                              <span>
                                {f.league_flag} {f.stage}
                              </span>
                              <span className="tabular-nums">{f.date}</span>
                            </div>
                            <div className="fixture-teams-line">
                              <div className="fixture-club-names">
                                <div className="fixture-club-row">
                                  <span
                                    className="color-dot"
                                    style={{ background: f.home_color }}
                                  />
                                  <span>{f.home_short}</span>
                                </div>
                                <div className="fixture-club-row">
                                  <span
                                    className="color-dot"
                                    style={{ background: f.away_color }}
                                  />
                                  <span>{f.away_short}</span>
                                </div>
                              </div>
                              <div className="fixture-pred-pill">
                                <div className="fixture-pred-score">
                                  {f.most_likely_score}
                                </div>
                                <div className="fixture-pred-label">
                                  xG {f.expected_home_goals} –{" "}
                                  {f.expected_away_goals}
                                </div>
                              </div>
                            </div>
                            <div className="fixture-mini-probs">
                              <div
                                className={`mini-prob-box ${
                                  p.home_win === maxP ? "fav" : ""
                                }`}
                              >
                                1: {p.home_win}%
                              </div>
                              <div
                                className={`mini-prob-box ${
                                  p.draw === maxP ? "fav" : ""
                                }`}
                              >
                                X: {p.draw}%
                              </div>
                              <div
                                className={`mini-prob-box ${
                                  p.away_win === maxP ? "fav" : ""
                                }`}
                              >
                                2: {p.away_win}%
                              </div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="empty-state-card">
                        <div className="empty-state-title">
                          No Upcoming Fixtures
                        </div>
                        <p className="empty-state-desc">
                          No marquee fixtures match the current competition
                          filter. Show all competitions to browse upcoming
                          matchups.
                        </p>
                        <button
                          type="button"
                          className="empty-state-action"
                          {...createInstantPress(() =>
                            handleLeagueSelect("ALL")
                          )}
                        >
                          Show All Competitions
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </aside>

              {/* Trailing Main Stage: Forecast Briefing + Segmented Deep-Dive Inspector */}
              {prediction && (
                <div className="forecast-main">
                  {/* Hero Match Scoreboard & 1X2 Probability Bar */}
                  <div className="surface-card hero-forecast-card">
                    <div className="hero-top-meta">
                      <div className="hero-league-badge">
                        {prediction.fixture.league_flag}{" "}
                        {prediction.fixture.league_name}
                      </div>
                      <div className="hero-venue-info">
                        Venue: {prediction.fixture.stadium}
                      </div>
                      <div className="confidence-pill">
                        10,000x Monte Carlo Simulation
                      </div>
                    </div>

                    <div className="hero-teams-row">
                      {/* Home Team */}
                      <div className="hero-team home">
                        <div className="team-crest-wrapper">
                          <ClubCrest
                            tla={prediction.fixture.home_team.tla}
                            primaryColor={
                              prediction.fixture.home_team.primary_color
                            }
                            secondaryColor={
                              prediction.fixture.home_team.secondary_color
                            }
                          />
                        </div>
                        <div className="team-info-block">
                          <h2>{prediction.fixture.home_team.name}</h2>
                          <div className="team-meta-row">
                            <span className="elo-pill">
                              Elo {prediction.fixture.home_team.current_elo}
                            </span>
                            <div className="form-pills">
                              {prediction.fixture.home_team.form_last_5.map(
                                (r, idx) => (
                                  <span
                                    key={`hf-${idx}`}
                                    className={`form-badge ${r}`}
                                  >
                                    {r}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Center Predicted Score Placard — Pulses on live forecast update */}
                      <div
                        className={`hero-score-center ${
                          isMetricPulsing ? "metric-updated-pulse" : ""
                        }`}
                      >
                        <div className="predicted-label">
                          Most Likely Scoreline
                        </div>
                        <div className="predicted-score-box">
                          {prediction.predicted_score.most_likely.score}
                        </div>
                        <div className="predicted-prob-sub">
                          {prediction.predicted_score.most_likely.probability}%
                          Exact Scoreline Probability
                        </div>
                        <div className="xg-comparison-pill">
                          <span style={{ color: "var(--series-home)" }}>
                            {prediction.predicted_score.expected_home_goals} xG
                          </span>
                          <span>•</span>
                          <span style={{ color: "var(--series-away)" }}>
                            {prediction.predicted_score.expected_away_goals} xG
                          </span>
                        </div>
                      </div>

                      {/* Away Team */}
                      <div className="hero-team away">
                        <div className="team-crest-wrapper">
                          <ClubCrest
                            tla={prediction.fixture.away_team.tla}
                            primaryColor={
                              prediction.fixture.away_team.primary_color
                            }
                            secondaryColor={
                              prediction.fixture.away_team.secondary_color
                            }
                          />
                        </div>
                        <div className="team-info-block">
                          <h2>{prediction.fixture.away_team.name}</h2>
                          <div className="team-meta-row">
                            <span className="elo-pill">
                              Elo {prediction.fixture.away_team.current_elo}
                            </span>
                            <div className="form-pills">
                              {prediction.fixture.away_team.form_last_5.map(
                                (r, idx) => (
                                  <span
                                    key={`af-${idx}`}
                                    className={`form-badge ${r}`}
                                  >
                                    {r}
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* 1X2 Win Probability Bar with Ghost Baseline & Live Delta Badges */}
                    <div className="prob-section">
                      <div className="prob-labels">
                        <div className="prob-label-item home">
                          <span className="prob-team-label">
                            {prediction.fixture.home_team.short_name} Win
                          </span>
                          <span className="prob-pct">
                            {prediction.probabilities.ensemble.home_win}%
                          </span>
                          {homeWinDelta !== 0 && (
                            <span
                              className={`delta-pill ${
                                homeWinDelta > 0 ? "pos" : "neg"
                              }`}
                            >
                              {homeWinDelta > 0
                                ? `+${homeWinDelta}% ▲`
                                : `${homeWinDelta}% ▼`}
                            </span>
                          )}
                        </div>

                        <div className="prob-label-item draw">
                          <span className="prob-team-label">Draw</span>
                          <span className="prob-pct">
                            {prediction.probabilities.ensemble.draw}%
                          </span>
                        </div>

                        <div className="prob-label-item away">
                          {awayWinDelta !== 0 && (
                            <span
                              className={`delta-pill ${
                                awayWinDelta > 0 ? "pos" : "neg"
                              }`}
                            >
                              {awayWinDelta > 0
                                ? `+${awayWinDelta}% ▲`
                                : `${awayWinDelta}% ▼`}
                            </span>
                          )}
                          <span className="prob-pct">
                            {prediction.probabilities.ensemble.away_win}%
                          </span>
                          <span className="prob-team-label">
                            {prediction.fixture.away_team.short_name} Win
                          </span>
                        </div>
                      </div>

                      <div className="prob-bar-track">
                        {isWhatIfActive && baselinePrediction && (
                          <div
                            className="prob-ghost-marker"
                            style={{
                              left: `${baselinePrediction.probabilities.ensemble.home_win}%`,
                            }}
                            title={`Baseline Home Win: ${baselinePrediction.probabilities.ensemble.home_win}%`}
                          />
                        )}
                        <div
                          className="prob-bar-fill home"
                          style={{
                            width: `${prediction.probabilities.ensemble.home_win}%`,
                          }}
                        />
                        <div
                          className="prob-bar-fill draw"
                          style={{
                            width: `${prediction.probabilities.ensemble.draw}%`,
                          }}
                        />
                        <div
                          className="prob-bar-fill away"
                          style={{
                            width: `${prediction.probabilities.ensemble.away_win}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* SIGNATURE ELEMENT: 90-Minute Match Clock & xG Pressure Scrubber */}
                    <MomentumScrubber
                      timeline={prediction.simulated_stats.goal_timeline}
                      homeShort={prediction.fixture.home_team.short_name}
                      awayShort={prediction.fixture.away_team.short_name}
                      totalHomeXg={
                        prediction.predicted_score.expected_home_goals
                      }
                      totalAwayXg={
                        prediction.predicted_score.expected_away_goals
                      }
                      activeIntervalIdx={activeScrubberIdx}
                      onSelectInterval={setActiveScrubberIdx}
                    />

                    {/* Tactical Insights Strip */}
                    <div className="insights-strip">
                      {prediction.tactical_insights.map((txt, idx) => (
                        <div key={idx} className="insight-item">
                          {txt}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Interactive What-If Tactical Simulator Controls + Presets Popover */}
                  <WhatIfSandbox
                    homeShort={prediction.fixture.home_team.short_name}
                    awayShort={prediction.fixture.away_team.short_name}
                    whatIf={whatIf}
                    onChange={handleWhatIfChange}
                  />

                  {/* Segmented Analytical Deep-Dive Inspector (Applies Across All Desktop & Mobile Widths) */}
                  <SegmentedInspector
                    activeTab={activeInspectorTab}
                    onSelectTab={setActiveInspectorTab}
                    homeTla={prediction.fixture.home_team.tla}
                    awayTla={prediction.fixture.away_team.tla}
                    homeSeriesColor={resolvedSeries.homeColor}
                    awaySeriesColor={resolvedSeries.awayColor}
                    homeContrastRatio={resolvedSeries.homeContrastRatio}
                    awayContrastRatio={resolvedSeries.awayContrastRatio}
                  />

                  {/* Physically Interruptible Inspector Panels Stage */}
                  <div className="inspector-panels-stage">
                    {/* INSPECTOR PANEL 1: 7x7 Scoreline Matrix + Multi-Model Consensus & Goal Markets */}
                    <div
                      className={`two-col-grid inspector-panel-animated ${
                        activeInspectorTab === "matrix-markets" ? "active" : ""
                      }`}
                      role="tabpanel"
                      aria-hidden={activeInspectorTab !== "matrix-markets"}
                    >
                      <ScoreMatrix
                        scoreMatrix={prediction.predicted_score.score_matrix}
                        mostLikely={prediction.predicted_score.most_likely}
                        topScorelines={
                          prediction.predicted_score.top_scorelines
                        }
                        homeShort={prediction.fixture.home_team.short_name}
                        awayShort={prediction.fixture.away_team.short_name}
                        homeSeriesColor={resolvedSeries.homeColor}
                        awaySeriesColor={resolvedSeries.awayColor}
                        onSelectScoreline={(hg, ag, prob) =>
                          setSelectedScoreDetail({
                            homeGoals: hg,
                            awayGoals: ag,
                            probability: prob,
                            homeShort: prediction.fixture.home_team.short_name,
                            awayShort: prediction.fixture.away_team.short_name,
                            expectedHomeGoals:
                              prediction.predicted_score.expected_home_goals,
                            expectedAwayGoals:
                              prediction.predicted_score.expected_away_goals,
                          })
                        }
                      />

                      <div className="surface-card">
                        <div className="card-header-flex">
                          <div>
                            <h3 className="card-title">
                              Multi-Model Consensus &amp; Goal Markets
                            </h3>
                            <p className="card-subtitle">
                              Comparing gradient-boosted tree classifiers
                              against statistical Poisson models.
                            </p>
                          </div>
                        </div>

                        <div className="model-comparison-list">
                          {[
                            {
                              key: "ensemble" as const,
                              name: "Hybrid Meta-Ensemble (Final)",
                            },
                            {
                              key: "xgboost" as const,
                              name: "XGBoost Gradient Boosted Trees",
                            },
                            {
                              key: "random_forest" as const,
                              name: "Random Forest Classifier",
                            },
                            {
                              key: "dixon_coles" as const,
                              name: "Dixon-Coles Bivariate Poisson",
                            },
                          ].map((m) => {
                            const p = prediction.probabilities[m.key];
                            return (
                              <div key={m.key} className="model-row">
                                <div className="model-row-top">
                                  <span>{m.name}</span>
                                  <div className="model-probs-nums tabular-nums">
                                    <span style={{ color: "var(--series-home)" }}>
                                      1: {p.home_win}%
                                    </span>
                                    <span style={{ color: "var(--series-draw)" }}>
                                      X: {p.draw}%
                                    </span>
                                    <span style={{ color: "var(--series-away)" }}>
                                      2: {p.away_win}%
                                    </span>
                                  </div>
                                </div>
                                <div className="mini-bar-stack">
                                  <div
                                    style={{
                                      width: `${p.home_win}%`,
                                      background: "var(--series-home)",
                                    }}
                                  />
                                  <div
                                    style={{
                                      width: `${p.draw}%`,
                                      background: "var(--series-draw)",
                                    }}
                                  />
                                  <div
                                    style={{
                                      width: `${p.away_win}%`,
                                      background: "var(--series-away)",
                                    }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <div className="markets-divider" />
                        <h4 className="sub-section-title">
                          Simulated Goal &amp; BTTS Markets
                        </h4>
                        <div className="markets-grid">
                          {[
                            {
                              label: "Over 1.5 Goals",
                              val: `${prediction.markets.over_1_5}%`,
                            },
                            {
                              label: "Over 2.5 Goals",
                              val: `${prediction.markets.over_2_5}%`,
                            },
                            {
                              label: "Over 3.5 Goals",
                              val: `${prediction.markets.over_3_5}%`,
                            },
                            {
                              label: "Both Teams to Score",
                              val: `${prediction.markets.btts_yes}%`,
                            },
                            {
                              label: `${prediction.fixture.home_team.short_name} or Draw (1X)`,
                              val: `${prediction.markets.double_chance_1x}%`,
                            },
                            {
                              label: `${prediction.fixture.away_team.short_name} or Draw (X2)`,
                              val: `${prediction.markets.double_chance_x2}%`,
                            },
                          ].map((mk) => (
                            <div key={mk.label} className="market-box">
                              <div className="market-name">{mk.label}</div>
                              <div className="market-val tabular-nums">
                                {mk.val}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* INSPECTOR PANEL 2: Simulated 90-Minute Match Stats + Accessible Tactical Radar */}
                    <div
                      className={`two-col-grid inspector-panel-animated ${
                        activeInspectorTab === "telemetry-radar" ? "active" : ""
                      }`}
                      role="tabpanel"
                      aria-hidden={activeInspectorTab !== "telemetry-radar"}
                    >
                      <div className="surface-card">
                        <div className="card-header-flex">
                          <div>
                            <h3 className="card-title">
                              Simulated Match Statistics (90 Min)
                            </h3>
                            <p className="card-subtitle">
                              Projected team output across 10,000 Monte Carlo
                              match simulations.
                            </p>
                          </div>
                        </div>

                        <div className="sim-stats-list">
                          {[
                            {
                              label: "Expected Goals (xG)",
                              h: prediction.simulated_stats.home_xg,
                              a: prediction.simulated_stats.away_xg,
                              suffix: "",
                            },
                            {
                              label: "Ball Possession",
                              h: prediction.simulated_stats.home_possession,
                              a: prediction.simulated_stats.away_possession,
                              suffix: "%",
                            },
                            {
                              label: "Total Shots",
                              h: prediction.simulated_stats.home_shots,
                              a: prediction.simulated_stats.away_shots,
                              suffix: "",
                            },
                            {
                              label: "Shots on Target",
                              h: prediction.simulated_stats.home_sot,
                              a: prediction.simulated_stats.away_sot,
                              suffix: "",
                            },
                            {
                              label: "Big Chances Created",
                              h: prediction.simulated_stats.home_big_chances,
                              a: prediction.simulated_stats.away_big_chances,
                              suffix: "",
                            },
                            {
                              label: "Corner Kicks",
                              h: prediction.simulated_stats.home_corners,
                              a: prediction.simulated_stats.away_corners,
                              suffix: "",
                            },
                            {
                              label: "Pass Accuracy",
                              h: prediction.simulated_stats.home_pass_accuracy,
                              a: prediction.simulated_stats.away_pass_accuracy,
                              suffix: "%",
                            },
                            {
                              label: "Fouls Committed",
                              h: prediction.simulated_stats.home_fouls,
                              a: prediction.simulated_stats.away_fouls,
                              suffix: "",
                            },
                            {
                              label: "Projected Yellow Cards",
                              h: prediction.simulated_stats.home_yellow_cards,
                              a: prediction.simulated_stats.away_yellow_cards,
                              suffix: "",
                            },
                          ].map((r) => {
                            const total = Math.max(0.01, r.h + r.a);
                            const hPct = ((r.h / total) * 100).toFixed(1);
                            const aPct = (100 - parseFloat(hPct)).toFixed(1);
                            return (
                              <div key={r.label} className="stat-comp-row">
                                <div className="stat-comp-header">
                                  <span className="stat-num home tabular-nums">
                                    {r.h}
                                    {r.suffix}
                                  </span>
                                  <span>{r.label}</span>
                                  <span className="stat-num away tabular-nums">
                                    {r.a}
                                    {r.suffix}
                                  </span>
                                </div>
                                <div className="stat-dual-bar">
                                  <div
                                    className="stat-bar-h"
                                    style={{ width: `${hPct}%` }}
                                  />
                                  <div
                                    className="stat-bar-a"
                                    style={{ width: `${aPct}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="surface-card">
                        <div className="card-header-flex">
                          <div>
                            <h3 className="card-title">
                              Tactical Profile Radar (6-Axis)
                            </h3>
                            <p className="card-subtitle">
                              Non-color differentiated polygon comparison (Solid
                              • vs Dashed ◆).
                            </p>
                          </div>
                        </div>

                        <TacticalRadar
                          home={prediction.fixture.home_team}
                          away={prediction.fixture.away_team}
                          homeSeriesColor={resolvedSeries.homeColor}
                          awaySeriesColor={resolvedSeries.awayColor}
                        />
                      </div>
                    </div>

                    {/* INSPECTOR PANEL 3: Explainable AI (XAI) Drivers + Head-to-Head History */}
                    <div
                      className={`two-col-grid inspector-panel-animated ${
                        activeInspectorTab === "xai-h2h" ? "active" : ""
                      }`}
                      role="tabpanel"
                      aria-hidden={activeInspectorTab !== "xai-h2h"}
                    >
                      <div className="surface-card">
                        <div className="card-header-flex">
                          <div>
                            <h3 className="card-title">
                              Explainable AI — Key Matchup Drivers
                            </h3>
                            <p className="card-subtitle">
                              Pre-match feature differentials driving the
                              ensemble forecast.
                            </p>
                          </div>
                        </div>

                        <div className="drivers-list">
                          {prediction.match_drivers.map((d) => (
                            <div key={d.factor} className="driver-item">
                              <div className="driver-top">
                                <span>{d.factor}</span>
                                <span className="driver-adv-pill">
                                  Edge: {d.advantage}
                                </span>
                              </div>
                              <div className="driver-vals">
                                <span>
                                  Home: <strong>{d.home_val}</strong>
                                </span>
                                <span>Impact: {d.impact_score}/100</span>
                                <span>
                                  Away: <strong>{d.away_val}</strong>
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="surface-card">
                        <div className="card-header-flex">
                          <div>
                            <h3 className="card-title">
                              Head-to-Head History &amp; Recent Meetings
                            </h3>
                            <p className="card-subtitle">
                              Historical meetings and recent domestic or
                              continental results.
                            </p>
                          </div>
                        </div>

                        <div className="h2h-kpi-row">
                          <div className="market-box">
                            <div className="market-name">
                              {prediction.fixture.home_team.short_name} Wins
                            </div>
                            <div
                              className="market-val tabular-nums"
                              style={{ color: "var(--series-home)" }}
                            >
                              {prediction.h2h.home_team_wins}
                            </div>
                          </div>
                          <div className="market-box">
                            <div className="market-name">Draws</div>
                            <div
                              className="market-val tabular-nums"
                              style={{ color: "var(--series-draw)" }}
                            >
                              {prediction.h2h.draws}
                            </div>
                          </div>
                          <div className="market-box">
                            <div className="market-name">
                              {prediction.fixture.away_team.short_name} Wins
                            </div>
                            <div
                              className="market-val tabular-nums"
                              style={{ color: "var(--series-away)" }}
                            >
                              {prediction.h2h.away_team_wins}
                            </div>
                          </div>
                          <div className="market-box">
                            <div className="market-name">Avg H2H Goals</div>
                            <div className="market-val tabular-nums">
                              {prediction.h2h.avg_total_goals}
                            </div>
                          </div>
                        </div>

                        <h4 className="sub-section-title">
                          Previous Head-to-Head Meetings
                        </h4>
                        <div>
                          {prediction.h2h.recent_meetings.length > 0 ? (
                            prediction.h2h.recent_meetings.map((m, idx) => (
                              <div
                                key={`${m.date}-${idx}`}
                                className="h2h-meeting-row"
                              >
                                <span
                                  className="tabular-nums"
                                  style={{
                                    color: "var(--text-muted)",
                                    fontSize: "var(--text-xs)",
                                  }}
                                >
                                  {m.date}
                                </span>
                                <span>
                                  <strong>{m.home_team}</strong> vs{" "}
                                  <strong>{m.away_team}</strong>
                                </span>
                                <span className="h2h-score-badge">
                                  {m.fthg} - {m.ftag}
                                </span>
                              </div>
                            ))
                          ) : (
                            /* Actionable Empty State (`writing.md`) */
                            <div className="empty-state-card">
                              <div className="empty-state-title">
                                No Recent Head-to-Head Meetings
                              </div>
                              <p className="empty-state-desc">
                                These clubs have not met in recent seasons. The
                                ensemble forecast relies on Club Elo
                                differential and venue-adjusted expected goals.
                              </p>
                              <button
                                type="button"
                                className="empty-state-action"
                                {...createInstantPress(() =>
                                  setActiveInspectorTab("telemetry-radar")
                                )}
                              >
                                Inspect Tactical Radar
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* VIEW 2: LEAGUE STANDINGS & xG TABLES */}
        {activeView === "standings" && (
          <section className="view-section active">
            <div className="surface-card">
              <div className="card-header-flex">
                <div>
                  <h2 className="card-title">
                    {standingsLeague
                      ? `${standingsLeague.flag} ${standingsLeague.name} — Standings, Club Elo & Expected Goals`
                      : "League Standings & Expected Goals Table"}
                  </h2>
                  <p className="card-subtitle">
                    {standingsLeague?.description ||
                      "Live Club Elo ratings, goal differentials, underlying xG performance, and 5-match form."}
                  </p>
                </div>
              </div>

              <div className="table-responsive">
                <table className="standings-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Club</th>
                      <th>MP</th>
                      <th>W</th>
                      <th>D</th>
                      <th>L</th>
                      <th>GF</th>
                      <th>GA</th>
                      <th>GD</th>
                      <th>xG</th>
                      <th>xGA</th>
                      <th>Club Elo</th>
                      <th>Pts</th>
                      <th>Last 5</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {standingsRows.map((row, idx) => {
                      const nextOpp =
                        standingsRows[(idx + 1) % standingsRows.length]?.team ||
                        "Arsenal";
                      return (
                        <tr key={row.team}>
                          <td
                            className="tabular-nums"
                            style={{ fontWeight: 700 }}
                          >
                            {row.rank}
                          </td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.55rem",
                                fontWeight: 700,
                              }}
                            >
                              <span
                                className="color-dot"
                                style={{ background: row.color }}
                              />
                              <span>{row.team}</span>
                            </div>
                          </td>
                          <td>{row.played}</td>
                          <td>{row.won}</td>
                          <td>{row.drawn}</td>
                          <td>{row.lost}</td>
                          <td>{row.gf}</td>
                          <td>{row.ga}</td>
                          <td
                            style={{
                              fontWeight: 700,
                              color:
                                row.gd >= 0
                                  ? "var(--status-win)"
                                  : "var(--status-loss)",
                            }}
                          >
                            {row.gd >= 0 ? `+${row.gd}` : row.gd}
                          </td>
                          <td>{row.xg.toFixed(1)}</td>
                          <td>{row.xga.toFixed(1)}</td>
                          <td style={{ fontWeight: 700 }}>{row.elo}</td>
                          <td
                            style={{
                              fontWeight: 800,
                              color: "var(--text-primary)",
                              fontSize: "0.95rem",
                            }}
                          >
                            {row.points}
                          </td>
                          <td>
                            <div className="form-pills">
                              {row.form.map((r, fIdx) => (
                                <span
                                  key={`${row.team}-f-${fIdx}`}
                                  className={`form-badge ${r}`}
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn-table-predict"
                              {...createInstantPress(async () => {
                                const lgCode = standingsLeague?.code || "PL";
                                setHomeTeam(row.team);
                                setAwayTeam(nextOpp);
                                setMatchLeague(lgCode);
                                setActiveView("match-center");
                                await fetchPrediction(
                                  row.team,
                                  nextOpp,
                                  lgCode,
                                  whatIf,
                                  true
                                );
                              })}
                            >
                              Simulate Matchup
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {/* VIEW 3: ML MODEL TELEMETRY & FEATURE IMPORTANCE */}
        {activeView === "ml-lab" && modelMetrics && (
          <section className="view-section active">
            <div className="ml-kpi-grid">
              <div className="kpi-card">
                <div className="kpi-label">Historical Matches Indexed</div>
                <div className="kpi-value">
                  {modelMetrics.total_historical_matches.toLocaleString()}
                </div>
                <div className="kpi-sub">
                  {modelMetrics.train_samples.toLocaleString()} training •{" "}
                  {modelMetrics.test_samples.toLocaleString()} out-of-time test
                  samples.
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Ensemble 1X2 Accuracy</div>
                <div className="kpi-value">
                  {modelMetrics.ensemble_accuracy}%
                </div>
                <div className="kpi-sub">
                  XGBoost: {modelMetrics.xgb_accuracy}% • Random Forest:{" "}
                  {modelMetrics.rf_accuracy}%.
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Multi-Class Log Loss</div>
                <div className="kpi-value">
                  {modelMetrics.ensemble_log_loss}
                </div>
                <div className="kpi-sub">
                  Calibrated probability sharpness (lower values indicate
                  superior calibration).
                </div>
              </div>
              <div className="kpi-card">
                <div className="kpi-label">Ranked Probability Score (RPS)</div>
                <div className="kpi-value">
                  {modelMetrics.ranked_probability_score}
                </div>
                <div className="kpi-sub">
                  Evaluated across {modelMetrics.num_features} pre-match
                  engineered features.
                </div>
              </div>
            </div>

            <div className="two-col-grid">
              <div className="surface-card">
                <div className="card-header-flex">
                  <div>
                    <h3 className="card-title">
                      Global Feature Importance (XGBoost vs Random Forest)
                    </h3>
                    <p className="card-subtitle">
                      Relative contribution of top pre-match features across{" "}
                      {modelMetrics.num_features} engineered dimensions.
                    </p>
                  </div>
                </div>
                <div className="feature-imp-list">
                  {(() => {
                    const maxImp = Math.max(
                      ...modelMetrics.top_features.map((f) => f.importance),
                      1
                    );
                    return modelMetrics.top_features.map((f) => {
                      const w = ((f.importance / maxImp) * 100).toFixed(1);
                      return (
                        <div key={f.feature} className="f-imp-row">
                          <div className="f-imp-header">
                            <span>
                              <strong>{f.label}</strong>{" "}
                              <code
                                style={{
                                  color: "var(--text-muted)",
                                  fontSize: "var(--text-xs)",
                                }}
                              >
                                ({f.feature})
                              </code>
                            </span>
                            <span className="tabular-nums">
                              {f.importance}% (XGB: {f.xgb_importance}% | RF:{" "}
                              {f.rf_importance}%)
                            </span>
                          </div>
                          <div className="f-imp-bar-bg">
                            <div
                              className="f-imp-bar-fill"
                              style={{ width: `${w}%` }}
                            />
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>
              </div>

              <div className="surface-card">
                <div className="card-header-flex">
                  <div>
                    <h3 className="card-title">
                      Hybrid Ensemble Architecture &amp; Methodology
                    </h3>
                    <p className="card-subtitle">
                      How PitchOracle combines gradient-boosted trees with
                      statistical count models.
                    </p>
                  </div>
                </div>
                <div className="methodology-content">
                  <div className="method-block">
                    <div className="method-badge">
                      1. XGBoost Multi-Class Classifier (40% Weight)
                    </div>
                    <p>
                      Gradient-boosted decision trees (max_depth=4,
                      n_estimators=220, learning_rate=0.045) trained on 28
                      strictly pre-match features using the multi:softprob
                      objective. Captures non-linear interactions between Club
                      Elo momentum, venue-specific scoring rates, and H2H
                      dominance.
                    </p>
                  </div>
                  <div className="method-block">
                    <div className="method-badge">
                      2. Random Forest Classifier (25% Weight)
                    </div>
                    <p>
                      Bagged ensemble of 260 deep decision trees
                      (min_samples_leaf=8) providing variance reduction and
                      calibrated out-of-bag probability estimates in high-parity
                      matchups.
                    </p>
                  </div>
                  <div className="method-block">
                    <div className="method-badge">
                      3. Dixon-Coles Bivariate Poisson + 10,000x Monte Carlo
                      (35% Weight)
                    </div>
                    <p>
                      Estimates club attacking and defensive rates with
                      low-score correlation parameter ρ = -0.085 to accurately
                      model 0-0, 1-0, 0-1, and 1-1 scorelines, generating the
                      7×7 exact score matrix and 90-minute match telemetry.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Fluid, Physically Interruptible Scoreline Telemetry Sheet (`sheets.md`) */}
      <ScorelineDetailSheet
        detail={selectedScoreDetail}
        onClose={() => setSelectedScoreDetail(null)}
        onApplyTempoForScoreline={(suggestedTempo) =>
          handleWhatIfChange({
            ...whatIf,
            tempo: suggestedTempo,
          })
        }
      />

      {/* Apple HIG Confirmation Alert Dialog for Retraining (`alerts.md`) */}
      <ConfirmRetrainDialog
        isOpen={confirmRetrainOpen}
        onCancel={() => setConfirmRetrainOpen(false)}
        onConfirm={executeSyncAndRetrain}
      />
    </>
  );
}
