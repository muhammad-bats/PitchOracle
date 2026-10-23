/**
 * PitchOracle AI — Frontend Interactive Controller
 * Connects to FastAPI Hybrid ML Ensemble (XGBoost + Random Forest + Dixon-Coles Monte Carlo)
 */

const state = {
  activeView: "match-center",
  activeLeague: "ALL",
  leagues: [],
  teams: [],
  fixtures: [],
  selectedFixtureId: null,
  currentHomeTeam: "Arsenal",
  currentAwayTeam: "Manchester City",
  currentMatchLeague: "PL",
  whatIf: {
    homeBoost: 0.0,
    awayBoost: 0.0,
    tempo: 0.0,
    neutralVenue: false,
  },
  modelMetrics: null,
};

function renderClubCrestSVG(tla, primaryColor, secondaryColor) {
  const safeId = `grad-${tla}-${Math.random().toString(36).substring(2, 7)}`;
  return `
    <svg width="64" height="64" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="${safeId}" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stop-color="${primaryColor}" />
          <stop offset="100%" stop-color="${secondaryColor === '#FFFFFF' ? '#1e293b' : secondaryColor}" />
        </linearGradient>
      </defs>
      <path d="M32 4L56 14V30C56 46.5 45.8 56.2 32 60C18.2 56.2 8 46.5 8 30V14L32 4Z"
        fill="url(#${safeId})" stroke="rgba(255,255,255,0.75)" stroke-width="2.2" />
      <path d="M32 8L52 16.5V30C52 43.8 43.4 52.1 32 55.5C20.6 52.1 12 43.8 12 30V16.5L32 8Z"
        stroke="rgba(255,255,255,0.22)" stroke-width="1.2" fill="rgba(7,11,20,0.28)" />
      <text x="32" y="37" text-anchor="middle" fill="#ffffff"
        font-family="Space Grotesk, sans-serif" font-weight="800" font-size="14" letter-spacing="0.5">${tla}</text>
    </svg>
  `;
}

function renderFormBadges(formArray) {
  if (!formArray || !formArray.length) return "";
  return formArray
    .map((res) => `<span class="form-badge ${res}">${res}</span>`)
    .join("");
}

async function initApp() {
  bindUIEvents();
  await Promise.all([
    loadLeagues(),
    loadTeams("ALL"),
    loadFixtures("ALL"),
    loadModelMetrics(),
  ]);

  if (state.fixtures.length > 0) {
    const first = state.fixtures[0];
    state.selectedFixtureId = first.id;
    state.currentHomeTeam = first.home_team;
    state.currentAwayTeam = first.away_team;
    state.currentMatchLeague = first.league;
    syncSelectDropdowns();
  }
  await runPrediction();
}

function bindUIEvents() {
  // Main view tabs
  document.querySelectorAll(".main-tab").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetView = btn.dataset.view;
      state.activeView = targetView;
      document.querySelectorAll(".main-tab").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".view-section").forEach((sec) => sec.classList.remove("active"));
      document.getElementById(`view-${targetView}`).classList.add("active");

      if (targetView === "standings") {
        const lg = state.activeLeague === "ALL" ? "PL" : state.activeLeague;
        await loadStandings(lg);
      } else if (targetView === "ml-lab") {
        await loadModelMetrics();
      }
    });
  });

  // Swap Home & Away button
  document.getElementById("btn-swap-teams").addEventListener("click", async () => {
    const homeSel = document.getElementById("select-home-team");
    const awaySel = document.getElementById("select-away-team");
    const tmp = homeSel.value;
    homeSel.value = awaySel.value;
    awaySel.value = tmp;
    state.currentHomeTeam = homeSel.value;
    state.currentAwayTeam = awaySel.value;
    state.selectedFixtureId = null;
    renderFixturesList();
    await runPrediction();
  });

  // Custom Matchup Run button
  document.getElementById("btn-run-custom-predict").addEventListener("click", async () => {
    const h = document.getElementById("select-home-team").value;
    const a = document.getElementById("select-away-team").value;
    if (h === a) {
      alert("Please choose two different clubs for Home and Away.");
      return;
    }
    state.currentHomeTeam = h;
    state.currentAwayTeam = a;
    state.selectedFixtureId = null;
    renderFixturesList();
    await runPrediction();
  });

  // What-If Sliders
  const sHome = document.getElementById("slider-home-boost");
  const sAway = document.getElementById("slider-away-boost");
  const sTempo = document.getElementById("slider-tempo");
  const tNeutral = document.getElementById("toggle-neutral-venue");

  const onWhatIfChange = async () => {
    state.whatIf.homeBoost = parseFloat(sHome.value);
    state.whatIf.awayBoost = parseFloat(sAway.value);
    state.whatIf.tempo = parseFloat(sTempo.value);
    state.whatIf.neutralVenue = tNeutral.checked;

    document.getElementById("val-slider-home").textContent =
      (state.whatIf.homeBoost >= 0 ? "+" : "") + state.whatIf.homeBoost.toFixed(1);
    document.getElementById("val-slider-away").textContent =
      (state.whatIf.awayBoost >= 0 ? "+" : "") + state.whatIf.awayBoost.toFixed(1);
    document.getElementById("val-slider-tempo").textContent =
      (state.whatIf.tempo >= 0 ? "+" : "") + state.whatIf.tempo.toFixed(1);

    await runPrediction();
  };

  sHome.addEventListener("input", onWhatIfChange);
  sAway.addEventListener("input", onWhatIfChange);
  sTempo.addEventListener("input", onWhatIfChange);
  tNeutral.addEventListener("change", onWhatIfChange);

  document.getElementById("btn-reset-whatif").addEventListener("click", async () => {
    sHome.value = "0.0";
    sAway.value = "0.0";
    sTempo.value = "0.0";
    tNeutral.checked = false;
    await onWhatIfChange();
  });

  // Sync Data & Retrain button
  document.getElementById("btn-sync-data").addEventListener("click", async () => {
    const btn = document.getElementById("btn-sync-data");
    btn.disabled = true;
    btn.innerHTML = `<span>⏳</span> Syncing & Training...`;
    try {
      const res = await fetch("/api/sync-data", { method: "POST" });
      const data = await res.json();
      state.modelMetrics = data.metrics;
      document.getElementById("header-match-count").textContent =
        data.metrics.total_historical_matches.toLocaleString();
      await loadFixtures(state.activeLeague);
      await runPrediction();
      renderMLTelemetry();
      btn.innerHTML = `<span>✓</span> Models Updated`;
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = `<span id="sync-icon">↻</span> Sync & Retrain`;
      }, 2000);
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `<span id="sync-icon">↻</span> Sync & Retrain`;
    }
  });
}

async function loadLeagues() {
  const res = await fetch("/api/leagues");
  const data = await res.json();
  state.leagues = data.leagues;
  renderLeaguePills();
}

function renderLeaguePills() {
  const container = document.getElementById("league-pills-container");
  const allPill = `
    <button class="league-pill ${state.activeLeague === "ALL" ? "active" : ""}" data-league="ALL">
      <span>🌍</span> All Competitions
    </button>
  `;
  const pills = state.leagues
    .map(
      (lg) => `
      <button class="league-pill ${state.activeLeague === lg.code ? "active" : ""}" data-league="${lg.code}">
        <span>${lg.flag}</span> ${lg.name}
      </button>
    `
    )
    .join("");

  container.innerHTML = allPill + pills;

  container.querySelectorAll(".league-pill").forEach((pill) => {
    pill.addEventListener("click", async () => {
      const code = pill.dataset.league;
      state.activeLeague = code;
      renderLeaguePills();
      await loadTeams(code);
      await loadFixtures(code);

      if (state.activeView === "standings") {
        await loadStandings(code === "ALL" ? "PL" : code);
      } else if (state.fixtures.length > 0) {
        const first = state.fixtures[0];
        state.selectedFixtureId = first.id;
        state.currentHomeTeam = first.home_team;
        state.currentAwayTeam = first.away_team;
        state.currentMatchLeague = first.league;
        syncSelectDropdowns();
        await runPrediction();
      }
    });
  });
}

async function loadTeams(leagueCode) {
  const url = leagueCode && leagueCode !== "ALL" ? `/api/teams?league=${leagueCode}` : "/api/teams";
  const res = await fetch(url);
  const data = await res.json();
  state.teams = data.teams;
  populateTeamDropdowns();
}

function populateTeamDropdowns() {
  const homeSel = document.getElementById("select-home-team");
  const awaySel = document.getElementById("select-away-team");

  const optionsHtml = state.teams
    .map((t) => `<option value="${t.name}">${t.name} (${t.league} • Elo ${Math.round(t.current_elo)})</option>`)
    .join("");

  homeSel.innerHTML = optionsHtml;
  awaySel.innerHTML = optionsHtml;
  syncSelectDropdowns();
}

function syncSelectDropdowns() {
  const homeSel = document.getElementById("select-home-team");
  const awaySel = document.getElementById("select-away-team");
  if ([...homeSel.options].some((o) => o.value === state.currentHomeTeam)) {
    homeSel.value = state.currentHomeTeam;
  } else if (homeSel.options.length > 0) {
    state.currentHomeTeam = homeSel.options[0].value;
    homeSel.value = state.currentHomeTeam;
  }

  if ([...awaySel.options].some((o) => o.value === state.currentAwayTeam)) {
    awaySel.value = state.currentAwayTeam;
  } else if (awaySel.options.length > 1) {
    state.currentAwayTeam = awaySel.options[1].value;
    awaySel.value = state.currentAwayTeam;
  }
}

async function loadFixtures(leagueCode) {
  const res = await fetch(`/api/fixtures?league=${leagueCode || "ALL"}`);
  const data = await res.json();
  state.fixtures = data.fixtures;
  document.getElementById("fixtures-count-badge").textContent = state.fixtures.length;
  renderFixturesList();
}

function renderFixturesList() {
  const container = document.getElementById("fixtures-list-container");
  if (!state.fixtures.length) {
    container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem;">No upcoming fixtures found.</div>`;
    return;
  }

  container.innerHTML = state.fixtures
    .map((f) => {
      const isSelected = f.id === state.selectedFixtureId;
      const p = f.probabilities;
      const maxP = Math.max(p.home_win, p.draw, p.away_win);
      return `
        <div class="fixture-item ${isSelected ? "selected" : ""}" data-id="${f.id}">
          <div class="fixture-meta-top">
            <span>${f.league_flag} ${f.stage}</span>
            <span>${f.date}</span>
          </div>
          <div class="fixture-teams-line">
            <div class="fixture-club-names">
              <div class="fixture-club-row">
                <span class="color-dot" style="background:${f.home_color}"></span>
                <span>${f.home_short}</span>
              </div>
              <div class="fixture-club-row">
                <span class="color-dot" style="background:${f.away_color}"></span>
                <span>${f.away_short}</span>
              </div>
            </div>
            <div class="fixture-pred-pill">
              <div class="fixture-pred-score">${f.most_likely_score}</div>
              <div class="fixture-pred-label">xG ${f.expected_home_goals} - ${f.expected_away_goals}</div>
            </div>
          </div>
          <div class="fixture-mini-probs">
            <div class="mini-prob-box ${p.home_win === maxP ? "fav" : ""}">1: ${p.home_win}%</div>
            <div class="mini-prob-box ${p.draw === maxP ? "fav" : ""}">X: ${p.draw}%</div>
            <div class="mini-prob-box ${p.away_win === maxP ? "fav" : ""}">2: ${p.away_win}%</div>
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".fixture-item").forEach((item) => {
    item.addEventListener("click", async () => {
      const fix = state.fixtures.find((x) => x.id === item.dataset.id);
      if (!fix) return;
      state.selectedFixtureId = fix.id;
      state.currentHomeTeam = fix.home_team;
      state.currentAwayTeam = fix.away_team;
      state.currentMatchLeague = fix.league;
      syncSelectDropdowns();
      renderFixturesList();
      await runPrediction();
    });
  });
}

async function runPrediction() {
  const payload = {
    home_team: state.currentHomeTeam,
    away_team: state.currentAwayTeam,
    league: state.currentMatchLeague,
    home_form_boost: state.whatIf.homeBoost,
    away_form_boost: state.whatIf.awayBoost,
    tactical_tempo: state.whatIf.tempo,
    neutral_venue: state.whatIf.neutralVenue,
  };

  const res = await fetch("/api/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) return;
  const pred = await res.json();
  renderForecastDashboard(pred);
}

function renderForecastDashboard(pred) {
  const { fixture, probabilities, predicted_score, markets, simulated_stats, h2h, match_drivers, tactical_insights } = pred;
  const home = fixture.home_team;
  const away = fixture.away_team;
  const ens = probabilities.ensemble;

  // Hero Header & Teams
  document.getElementById("hero-league-badge").textContent = `${fixture.league_flag} ${fixture.league_name}`;
  document.getElementById("hero-stadium").textContent = `🏟️ ${fixture.stadium}`;

  document.getElementById("home-crest-box").innerHTML = renderClubCrestSVG(home.tla, home.primary_color, home.secondary_color);
  document.getElementById("away-crest-box").innerHTML = renderClubCrestSVG(away.tla, away.primary_color, away.secondary_color);

  document.getElementById("hero-home-name").textContent = home.name;
  document.getElementById("hero-away-name").textContent = away.name;

  document.getElementById("hero-home-elo").textContent = `Elo ${home.current_elo}`;
  document.getElementById("hero-away-elo").textContent = `Elo ${away.current_elo}`;

  document.getElementById("hero-home-form").innerHTML = renderFormBadges(home.form_last_5);
  document.getElementById("hero-away-form").innerHTML = renderFormBadges(away.form_last_5);

  document.getElementById("hero-pred-score").textContent = predicted_score.most_likely.score;
  document.getElementById("hero-pred-score-prob").textContent = `${predicted_score.most_likely.probability}% Scoreline Probability`;
  document.getElementById("hero-home-xg").textContent = `${predicted_score.expected_home_goals} xG`;
  document.getElementById("hero-away-xg").textContent = `${predicted_score.expected_away_goals} xG`;

  // 1X2 Probability Bar
  document.getElementById("prob-label-home").textContent = `${home.short_name.toUpperCase()} WIN`;
  document.getElementById("prob-label-away").textContent = `${away.short_name.toUpperCase()} WIN`;
  document.getElementById("prob-val-home").textContent = `${ens.home_win}%`;
  document.getElementById("prob-val-draw").textContent = `${ens.draw}%`;
  document.getElementById("prob-val-away").textContent = `${ens.away_win}%`;

  document.getElementById("bar-fill-home").style.width = `${ens.home_win}%`;
  document.getElementById("bar-fill-draw").style.width = `${ens.draw}%`;
  document.getElementById("bar-fill-away").style.width = `${ens.away_win}%`;

  // What-If Slider labels
  document.getElementById("label-slider-home").textContent = `${home.short_name} Form Boost`;
  document.getElementById("label-slider-away").textContent = `${away.short_name} Form Boost`;

  // Tactical Insights
  document.getElementById("tactical-insights-container").innerHTML = tactical_insights
    .map((txt) => `<div class="insight-item">${txt}</div>`)
    .join("");

  // 7x7 Scoreline Heatmap
  renderScoreHeatmap(predicted_score, home.short_name, away.short_name);

  // Model Consensus & Goal Markets
  renderModelConsensus(probabilities, markets, home.short_name, away.short_name);

  // Simulated Match Statistics
  renderSimulatedStats(simulated_stats, home.short_name, away.short_name);

  // Tactical Radar & 15-min Goal Timeline
  renderTacticalRadar(home, away);
  renderGoalTimeline(simulated_stats.goal_timeline, home.short_name, away.short_name);

  // Match Drivers & H2H
  renderMatchDrivers(match_drivers);
  renderH2HSummary(h2h, home, away);
}

function renderScoreHeatmap(predictedScore, homeShort, awayShort) {
  document.getElementById("heatmap-away-axis-label").textContent = `${awayShort} Goals (Away) →`;
  document.getElementById("heatmap-home-axis-label").textContent = `${homeShort} Goals (Home) ↓`;

  const grid = document.getElementById("score-heatmap-grid");
  const matrix = predictedScore.score_matrix;
  const bestH = predictedScore.most_likely.home_goals;
  const bestA = predictedScore.most_likely.away_goals;

  let maxProb = 0.01;
  matrix.forEach((row) => row.forEach((v) => { if (v > maxProb) maxProb = v; }));

  let html = `<div class="hm-header-cell">H\\A</div>`;
  for (let ag = 0; ag < 7; ag++) {
    html += `<div class="hm-header-cell">${ag}</div>`;
  }

  for (let hg = 0; hg < 7; hg++) {
    html += `<div class="hm-header-cell">${hg}</div>`;
    for (let ag = 0; ag < 7; ag++) {
      const prob = matrix[hg][ag];
      const intensity = Math.min(1, prob / maxProb);
      let bg;
      if (hg > ag) {
        bg = `rgba(16, 185, 129, ${0.08 + intensity * 0.68})`;
      } else if (hg === ag) {
        bg = `rgba(245, 158, 11, ${0.08 + intensity * 0.65})`;
      } else {
        bg = `rgba(59, 130, 246, ${0.08 + intensity * 0.68})`;
      }
      const isBest = hg === bestH && ag === bestA;
      html += `
        <div class="hm-cell ${isBest ? "best-score" : ""}" style="background:${bg}" title="${homeShort} ${hg} - ${ag} ${awayShort}: ${prob}%">
          <div class="hm-score-lbl">${hg}-${ag}</div>
          <div class="hm-prob-lbl">${prob.toFixed(1)}%</div>
        </div>
      `;
    }
  }
  grid.innerHTML = html;

  document.getElementById("top-scorelines-container").innerHTML = predictedScore.top_scorelines
    .map(
      (item) => `
      <div class="top-score-pill">
        <div class="sc">${item.score}</div>
        <div class="pr">${item.probability}%</div>
      </div>
    `
    )
    .join("");
}

function renderModelConsensus(probabilities, markets, homeShort, awayShort) {
  const models = [
    { key: "ensemble", name: "Hybrid Meta-Ensemble (Final)", badge: "40% XGB • 25% RF • 35% DC" },
    { key: "xgboost", name: "XGBoost Gradient Boosted Trees", badge: "220 Trees • Depth 4" },
    { key: "random_forest", name: "Random Forest Classifier", badge: "260 Trees • Bagged" },
    { key: "dixon_coles", name: "Dixon-Coles Bivariate Poisson", badge: "ρ = -0.085 Adjusted" },
  ];

  document.getElementById("model-consensus-container").innerHTML = models
    .map((m) => {
      const p = probabilities[m.key];
      return `
        <div class="model-row">
          <div class="model-row-top">
            <span>${m.name}</span>
            <div class="model-probs-nums">
              <span style="color:#34d399">1: ${p.home_win}%</span>
              <span style="color:#fbbf24">X: ${p.draw}%</span>
              <span style="color:#60a5fa">2: ${p.away_win}%</span>
            </div>
          </div>
          <div class="mini-bar-stack">
            <div style="width:${p.home_win}%; background:#10b981"></div>
            <div style="width:${p.draw}%; background:#f59e0b"></div>
            <div style="width:${p.away_win}%; background:#3b82f6"></div>
          </div>
        </div>
      `;
    })
    .join("");

  const marketItems = [
    { label: "Over 1.5 Goals", val: `${markets.over_1_5}%` },
    { label: "Over 2.5 Goals", val: `${markets.over_2_5}%` },
    { label: "Over 3.5 Goals", val: `${markets.over_3_5}%` },
    { label: "BTTS — Yes", val: `${markets.btts_yes}%` },
    { label: `${homeShort} or Draw (1X)`, val: `${markets.double_chance_1x}%` },
    { label: `${awayShort} or Draw (X2)`, val: `${markets.double_chance_x2}%` },
  ];

  document.getElementById("goal-markets-container").innerHTML = marketItems
    .map(
      (mk) => `
      <div class="market-box">
        <div class="market-name">${mk.label}</div>
        <div class="market-val">${mk.val}</div>
      </div>
    `
    )
    .join("");
}

function renderSimulatedStats(sim, homeShort, awayShort) {
  const rows = [
    { label: "Expected Goals (xG)", h: sim.home_xg, a: sim.away_xg, suffix: "" },
    { label: "Ball Possession", h: sim.home_possession, a: sim.away_possession, suffix: "%" },
    { label: "Total Shots", h: sim.home_shots, a: sim.away_shots, suffix: "" },
    { label: "Shots on Target", h: sim.home_sot, a: sim.away_sot, suffix: "" },
    { label: "Big Chances Created", h: sim.home_big_chances, a: sim.away_big_chances, suffix: "" },
    { label: "Corner Kicks", h: sim.home_corners, a: sim.away_corners, suffix: "" },
    { label: "Pass Accuracy", h: sim.home_pass_accuracy, a: sim.away_pass_accuracy, suffix: "%" },
    { label: "Fouls Committed", h: sim.home_fouls, a: sim.away_fouls, suffix: "" },
    { label: "Projected Yellow Cards", h: sim.home_yellow_cards, a: sim.away_yellow_cards, suffix: "" },
  ];

  document.getElementById("simulated-stats-container").innerHTML = rows
    .map((r) => {
      const total = Math.max(0.01, r.h + r.a);
      const hPct = ((r.h / total) * 100).toFixed(1);
      const aPct = (100 - parseFloat(hPct)).toFixed(1);
      return `
        <div class="stat-comp-row">
          <div class="stat-comp-header">
            <span class="stat-num home">${r.h}${r.suffix}</span>
            <span>${r.label}</span>
            <span class="stat-num away">${r.a}${r.suffix}</span>
          </div>
          <div class="stat-dual-bar">
            <div class="stat-bar-h" style="width:${hPct}%"></div>
            <div class="stat-bar-a" style="width:${aPct}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderTacticalRadar(home, away) {
  const axes = [
    { label: "Attack", h: home.attack, a: away.attack },
    { label: "Defense", h: home.defense, a: away.defense },
    { label: "Elo Power", h: Math.min(98, (home.current_elo - 1400) / 6.2), a: Math.min(98, (away.current_elo - 1400) / 6.2) },
    { label: "Form", h: Math.min(98, 45 + home.ppg_last_5 * 17), a: Math.min(98, 45 + away.ppg_last_5 * 17) },
    { label: "Possession", h: home.possession_style * 130, a: away.possession_style * 130 },
    { label: "Pressing", h: home.pressing_intensity * 102, a: away.pressing_intensity * 102 },
  ];

  const cx = 145;
  const cy = 120;
  const radius = 84;
  const n = axes.length;

  const getPoint = (idx, val) => {
    const angle = (Math.PI * 2 * idx) / n - Math.PI / 2;
    const r = (Math.max(20, Math.min(100, val)) / 100) * radius;
    return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  };

  let ringsSvg = "";
  [0.35, 0.68, 1.0].forEach((scale) => {
    const pts = axes
      .map((_, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
        return `${cx + radius * scale * Math.cos(angle)},${cy + radius * scale * Math.sin(angle)}`;
      })
      .join(" ");
    ringsSvg += `<polygon points="${pts}" fill="none" stroke="rgba(148,163,184,0.18)" stroke-width="1" />`;
  });

  let axesLines = "";
  let labelsSvg = "";
  axes.forEach((ax, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x2 = cx + radius * Math.cos(angle);
    const y2 = cy + radius * Math.sin(angle);
    const lx = cx + (radius + 24) * Math.cos(angle);
    const ly = cy + (radius + 16) * Math.sin(angle);
    axesLines += `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="rgba(148,163,184,0.18)" stroke-width="1" />`;
    labelsSvg += `<text x="${lx}" y="${ly + 4}" text-anchor="middle" fill="#94a3b8" font-size="10" font-family="JetBrains Mono, monospace">${ax.label}</text>`;
  });

  const homePoly = axes.map((ax, i) => getPoint(i, ax.h).join(",")).join(" ");
  const awayPoly = axes.map((ax, i) => getPoint(i, ax.a).join(",")).join(" ");

  document.getElementById("tactical-radar-container").innerHTML = `
    <svg width="290" height="240" viewBox="0 0 290 240">
      ${ringsSvg}
      ${axesLines}
      <polygon points="${homePoly}" fill="rgba(16, 185, 129, 0.28)" stroke="#10b981" stroke-width="2.2" />
      <polygon points="${awayPoly}" fill="rgba(59, 130, 246, 0.25)" stroke="#3b82f6" stroke-width="2.2" />
      ${labelsSvg}
    </svg>
  `;
}

function renderGoalTimeline(timeline, homeShort, awayShort) {
  document.getElementById("goal-timeline-container").innerHTML = timeline
    .map((item) => {
      const hHeight = Math.min(60, Math.round(item.home_goal_prob * 1.4));
      const aHeight = Math.min(60, Math.round(item.away_goal_prob * 1.4));
      return `
        <div class="tl-col" title="${item.period}: ${homeShort} ${item.home_goal_prob}% | ${awayShort} ${item.away_goal_prob}%">
          <div class="tl-bars">
            <div class="tl-bar-h" style="height:${hHeight}px"></div>
            <div class="tl-bar-a" style="height:${aHeight}px"></div>
          </div>
          <div class="tl-pct">${item.any_goal_prob}%</div>
          <div class="tl-period">${item.period}</div>
        </div>
      `;
    })
    .join("");
}

function renderMatchDrivers(drivers) {
  document.getElementById("match-drivers-container").innerHTML = drivers
    .map(
      (d) => `
      <div class="driver-item">
        <div class="driver-top">
          <span>${d.factor}</span>
          <span class="driver-adv-pill">Edge: ${d.advantage}</span>
        </div>
        <div class="driver-vals">
          <span>Home: <strong>${d.home_val}</strong></span>
          <span>Impact: ${d.impact_score}/100</span>
          <span>Away: <strong>${d.away_val}</strong></span>
        </div>
      </div>
    `
    )
    .join("");
}

function renderH2HSummary(h2h, home, away) {
  const meetingsHtml =
    h2h.recent_meetings && h2h.recent_meetings.length > 0
      ? h2h.recent_meetings
          .map(
            (m) => `
          <div class="h2h-meeting-row">
            <span style="color:var(--text-muted); font-family:var(--font-mono); font-size:0.7rem">${m.date}</span>
            <span><strong>${m.home_team}</strong> vs <strong>${m.away_team}</strong></span>
            <span class="h2h-score-badge">${m.fthg} - ${m.ftag}</span>
          </div>
        `
          )
          .join("")
      : `<div style="color:var(--text-muted); font-size:0.78rem; margin-bottom:0.75rem;">First continental clash in recent dataset — forecast driven by Club Elo & underlying xG profiles.</div>`;

  document.getElementById("h2h-summary-container").innerHTML = `
    <div class="h2h-kpi-row">
      <div class="market-box">
        <div class="market-name">${home.short_name} Wins</div>
        <div class="market-val" style="color:#34d399">${h2h.home_team_wins}</div>
      </div>
      <div class="market-box">
        <div class="market-name">Draws</div>
        <div class="market-val" style="color:#fbbf24">${h2h.draws}</div>
      </div>
      <div class="market-box">
        <div class="market-name">${away.short_name} Wins</div>
        <div class="market-val" style="color:#60a5fa">${h2h.away_team_wins}</div>
      </div>
      <div class="market-box">
        <div class="market-name">Avg H2H Goals</div>
        <div class="market-val">${h2h.avg_total_goals}</div>
      </div>
    </div>
    <h4 class="sub-section-title">Previous H2H Meetings</h4>
    <div>${meetingsHtml}</div>
  `;
}

async function loadStandings(leagueCode) {
  const res = await fetch(`/api/standings/${leagueCode}`);
  const data = await res.json();
  const { league, standings } = data;

  document.getElementById("standings-title").textContent = `${league.flag} ${league.name} — Standings, Club Elo & Expected Goals (xG)`;
  document.getElementById("standings-subtitle").textContent = league.description;

  const tbody = document.getElementById("standings-tbody");
  tbody.innerHTML = standings
    .map(
      (row, idx) => `
      <tr>
        <td style="font-family:var(--font-mono); font-weight:700">${row.rank}</td>
        <td>
          <div style="display:flex; align-items:center; gap:0.55rem; font-weight:700">
            <span class="color-dot" style="background:${row.color}"></span>
            <span>${row.team}</span>
          </div>
        </td>
        <td>${row.played}</td>
        <td>${row.won}</td>
        <td>${row.drawn}</td>
        <td>${row.lost}</td>
        <td>${row.gf}</td>
        <td>${row.ga}</td>
        <td style="font-family:var(--font-mono); color:${row.gd >= 0 ? "#34d399" : "#fb7185"}">${row.gd >= 0 ? "+" + row.gd : row.gd}</td>
        <td style="font-family:var(--font-mono)">${row.xg.toFixed(1)}</td>
        <td style="font-family:var(--font-mono)">${row.xga.toFixed(1)}</td>
        <td style="font-family:var(--font-mono); font-weight:700">${row.elo}</td>
        <td style="font-family:var(--font-mono); font-weight:800; color:#34d399; font-size:0.95rem">${row.points}</td>
        <td><div class="form-pills">${renderFormBadges(row.form)}</div></td>
        <td>
          <button class="btn-table-predict" data-team="${row.team}" data-opp="${standings[(idx + 1) % standings.length].team}" data-lg="${league.code}">
            Forecast Match →
          </button>
        </td>
      </tr>
    `
    )
    .join("");

  tbody.querySelectorAll(".btn-table-predict").forEach((btn) => {
    btn.addEventListener("click", async () => {
      state.currentHomeTeam = btn.dataset.team;
      state.currentAwayTeam = btn.dataset.opp;
      state.currentMatchLeague = btn.dataset.lg;
      document.getElementById("tab-match-center").click();
      syncSelectDropdowns();
      await runPrediction();
    });
  });
}

async function loadModelMetrics() {
  const res = await fetch("/api/model-metrics");
  state.modelMetrics = await res.json();
  document.getElementById("header-match-count").textContent =
    state.modelMetrics.total_historical_matches.toLocaleString();
  renderMLTelemetry();
}

function renderMLTelemetry() {
  const m = state.modelMetrics;
  if (!m) return;

  document.getElementById("ml-kpi-container").innerHTML = `
    <div class="kpi-card">
      <div class="kpi-label">HISTORICAL MATCHES INDEXED</div>
      <div class="kpi-value">${m.total_historical_matches.toLocaleString()}</div>
      <div class="kpi-sub">${m.train_samples.toLocaleString()} Train • ${m.test_samples.toLocaleString()} Out-of-Time Test</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">ENSEMBLE 1X2 ACCURACY</div>
      <div class="kpi-value">${m.ensemble_accuracy}%</div>
      <div class="kpi-sub">XGBoost: ${m.xgb_accuracy}% • Random Forest: ${m.rf_accuracy}%</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">MULTI-CLASS LOG LOSS</div>
      <div class="kpi-value">${m.ensemble_log_loss}</div>
      <div class="kpi-sub">Calibrated probability sharpness (lower is better)</div>
    </div>
    <div class="kpi-card">
      <div class="kpi-label">RANKED PROBABILITY SCORE (RPS)</div>
      <div class="kpi-value">${m.ranked_probability_score}</div>
      <div class="kpi-sub">${m.num_features} Pre-Match Engineered Features</div>
    </div>
  `;

  const maxImp = Math.max(...m.top_features.map((f) => f.importance), 1);
  document.getElementById("feature-importance-container").innerHTML = m.top_features
    .map((f) => {
      const w = ((f.importance / maxImp) * 100).toFixed(1);
      return `
        <div class="f-imp-row">
          <div class="f-imp-header">
            <span><strong>${f.label}</strong> <code style="color:var(--text-muted); font-size:0.7rem">(${f.feature})</code></span>
            <span style="font-family:var(--font-mono); color:#34d399">${f.importance}% (XGB: ${f.xgb_importance}% | RF: ${f.rf_importance}%)</span>
          </div>
          <div class="f-imp-bar-bg">
            <div class="f-imp-bar-fill" style="width:${w}%"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

window.addEventListener("DOMContentLoaded", initApp);
