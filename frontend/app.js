/**
 * PitchOracle — Apple-Inspired Minimalist Frontend Controller
 * Connects to FastAPI Hybrid ML Ensemble (XGBoost + Random Forest + Dixon-Coles Monte Carlo)
 */

const state = {
  activeView: "match-center",
  activeLeague: "ALL",
  fixturesOpen: false,
  leagues: [],
  teams: [],
  fixtures: [],
  selectedFixtureId: null,
  currentHomeTeam: "Arsenal",
  currentAwayTeam: "Manchester City",
  currentMatchLeague: "PL",
  lastPrediction: null,
  activeMatrixCell: null,
  whatIf: {
    homeBoost: 0.0,
    awayBoost: 0.0,
    tempo: 0.0,
    neutralVenue: false,
  },
};

function hexToRgb(hex) {
  const clean = (hex || "#0f172a").replace("#", "").trim();
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return { r: 15, g: 23, b: 42 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function rgbToHex({ r, g, b }) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    "#" +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, "0"))
      .join("")
  );
}

/**
 * Ensure club primary colors look refined and matte on a light white surface
 * (never neon or washed-out yellow/white) and remain distinct between Home and Away.
 */
function normalizeMatteClubColor(primaryHex, secondaryHex) {
  let rgb = hexToRgb(primaryHex);
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;

  // If primary is very bright/light (e.g. yellow/gold/white), prefer a darker secondary if available, or tone it down
  if (luminance > 0.76) {
    if (secondaryHex && secondaryHex.toUpperCase() !== "#FFFFFF") {
      rgb = hexToRgb(secondaryHex);
    } else {
      rgb = { r: Math.round(rgb.r * 0.72), g: Math.round(rgb.g * 0.65), b: Math.round(rgb.b * 0.25) };
    }
  }

  // Soften overly saturated channels slightly so colors feel editorial and matte rather than neon
  const avg = (rgb.r + rgb.g + rgb.b) / 3;
  rgb = {
    r: rgb.r * 0.88 + avg * 0.12,
    g: rgb.g * 0.88 + avg * 0.12,
    b: rgb.b * 0.88 + avg * 0.12,
  };
  return rgbToHex(rgb);
}

function resolveMatchTeamColors(homeClub, awayClub) {
  const homeHex = normalizeMatteClubColor(homeClub.primary_color, homeClub.secondary_color);
  let awayHex = normalizeMatteClubColor(awayClub.primary_color, awayClub.secondary_color);

  const hRgb = hexToRgb(homeHex);
  const aRgb = hexToRgb(awayHex);
  const dist = Math.hypot(hRgb.r - aRgb.r, hRgb.g - aRgb.g, hRgb.b - aRgb.b);

  // If both clubs share a very similar primary color (e.g. two red clubs), use away secondary or slate navy
  if (dist < 75) {
    if (awayClub.secondary_color && awayClub.secondary_color.toUpperCase() !== "#FFFFFF") {
      awayHex = normalizeMatteClubColor(awayClub.secondary_color, "#1e293b");
    } else {
      awayHex = "#334155";
    }
    const newARgb = hexToRgb(awayHex);
    if (Math.hypot(hRgb.r - newARgb.r, hRgb.g - newARgb.g, hRgb.b - newARgb.b) < 65) {
      awayHex = "#2563eb";
    }
  }

  return {
    homeHex,
    awayHex,
    homeRgb: hexToRgb(homeHex),
    awayRgb: hexToRgb(awayHex),
  };
}

function renderClubCrestSVG(tla, clubHex) {
  return `
    <svg width="60" height="60" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="4" width="52" height="52" rx="14" fill="#f8fafc" stroke="#e4e4e7" stroke-width="1.25" />
      <circle cx="30" cy="30" r="19" fill="${clubHex}" fill-opacity="0.12" stroke="${clubHex}" stroke-width="1.75" />
      <text x="30" y="34" text-anchor="middle" fill="#09090b"
        font-family="Newsreader, Georgia, serif"
        font-weight="600" font-size="13" letter-spacing="0.4">${tla}</text>
    </svg>
  `;
}

function renderFormBadges(formArray) {
  if (!formArray || !formArray.length) return "";
  return formArray
    .map((res) => `<span class="form-badge ${res}">${res}</span>`)
    .join("");
}

function setFixturesSheetOpen(isOpen) {
  state.fixturesOpen = isOpen;
  const drawer = document.getElementById("fixtures-drawer");
  const backdrop = document.getElementById("fixtures-backdrop");
  const btn = document.getElementById("btn-toggle-fixtures");
  const btnText = document.getElementById("unveil-btn-text");

  btnText.textContent = "Marquee Fixtures";

  if (isOpen) {
    drawer.classList.add("open");
    backdrop.classList.add("open");
    drawer.setAttribute("aria-hidden", "false");
    btn.classList.add("active");
    btn.setAttribute("aria-expanded", "true");
  } else {
    drawer.classList.remove("open");
    backdrop.classList.remove("open");
    drawer.setAttribute("aria-hidden", "true");
    btn.classList.remove("active");
    btn.setAttribute("aria-expanded", "false");
  }
}

function closeAllCustomDropdowns() {
  document.querySelectorAll(".custom-dropdown").forEach((dd) => {
    dd.classList.remove("open");
    const trig = dd.querySelector(".dropdown-trigger");
    if (trig) trig.setAttribute("aria-expanded", "false");
  });
}

async function initApp() {
  bindUIEvents();
  await Promise.all([
    loadLeagues(),
    loadTeams("ALL"),
    loadFixtures("ALL"),
  ]);

  if (state.fixtures.length > 0) {
    const first = state.fixtures[0];
    state.selectedFixtureId = first.id;
    state.currentHomeTeam = first.home_team;
    state.currentAwayTeam = first.away_team;
    state.currentMatchLeague = first.league;
    syncCustomDropdowns();
  }
  await runPrediction();
}

function bindUIEvents() {
  // Segmented Navigation Tabs (Match Center & League Standings only)
  document.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const targetView = btn.dataset.view;
      state.activeView = targetView;

      document.querySelectorAll(".seg-btn").forEach((b) => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      document.querySelectorAll(".view-section").forEach((sec) => sec.classList.remove("active"));
      document.getElementById(`view-${targetView}`).classList.add("active");

      setFixturesSheetOpen(false);
      closeAllCustomDropdowns();

      if (targetView === "standings") {
        const lg = state.activeLeague === "ALL" ? "PL" : state.activeLeague;
        await loadStandings(lg);
      }
    });
  });

  // Custom Minimalist Dropdowns (Home & Away)
  setupCustomDropdown("home");
  setupCustomDropdown("away");

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".custom-dropdown")) {
      closeAllCustomDropdowns();
    }
  });

  // Marquee Fixtures button & sheet controls
  document.getElementById("btn-toggle-fixtures").addEventListener("click", () => {
    setFixturesSheetOpen(!state.fixturesOpen);
  });

  document.getElementById("btn-close-fixtures").addEventListener("click", () => {
    setFixturesSheetOpen(false);
  });

  document.getElementById("fixtures-backdrop").addEventListener("click", () => {
    setFixturesSheetOpen(false);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (state.fixturesOpen) setFixturesSheetOpen(false);
      closeAllCustomDropdowns();
    }
  });

  // Close Scoreline Matrix Detail Pop-up
  document.getElementById("btn-close-score-popup").addEventListener("click", () => {
    document.getElementById("scoreline-detail-popup").classList.remove("open");
    document.querySelectorAll(".hm-cell.active-cell").forEach((c) => c.classList.remove("active-cell"));
  });

  // Swap Home & Away clubs
  document.getElementById("btn-swap-teams").addEventListener("click", async () => {
    const tmp = state.currentHomeTeam;
    state.currentHomeTeam = state.currentAwayTeam;
    state.currentAwayTeam = tmp;
    state.selectedFixtureId = null;
    syncCustomDropdowns();
    renderFixturesList();
    await runPrediction();
  });

  // Custom Matchup Forecast button
  document.getElementById("btn-run-custom-predict").addEventListener("click", async () => {
    if (state.currentHomeTeam === state.currentAwayTeam) {
      alert("Please select two different clubs for Home and Away.");
      return;
    }
    state.selectedFixtureId = null;
    renderFixturesList();
    await runPrediction();
  });

  // Scenario Sliders
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
      (state.whatIf.homeBoost > 0 ? "+" : "") + state.whatIf.homeBoost.toFixed(1);
    document.getElementById("val-slider-away").textContent =
      (state.whatIf.awayBoost > 0 ? "+" : "") + state.whatIf.awayBoost.toFixed(1);
    document.getElementById("val-slider-tempo").textContent =
      (state.whatIf.tempo > 0 ? "+" : "") + state.whatIf.tempo.toFixed(1);

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

  // Sync Data button — extracts new match data into CSV DB and refreshes Standings, Form, Stats & Predictions
  document.getElementById("btn-sync-data").addEventListener("click", async () => {
    const btn = document.getElementById("btn-sync-data");
    const label = document.getElementById("sync-label");
    btn.disabled = true;
    label.textContent = "Syncing…";
    try {
      const targetLg = state.activeLeague === "ALL" ? "PL" : state.activeLeague;
      await fetch(`/api/sync-data?league=${targetLg}`, { method: "POST" });
      await Promise.all([
        loadTeams(state.activeLeague),
        loadFixtures(state.activeLeague),
        loadStandings(targetLg),
      ]);
      await runPrediction();
      label.textContent = "Updated";
      setTimeout(() => {
        btn.disabled = false;
        label.textContent = "Sync Data";
      }, 1800);
    } catch (err) {
      btn.disabled = false;
      label.textContent = "Sync Data";
    }
  });
}

function setupCustomDropdown(side) {
  const wrapper = document.getElementById(`dropdown-${side}`);
  const trigger = document.getElementById(`trigger-${side}-team`);
  const searchInput = document.getElementById(`search-${side}-team`);

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const wasOpen = wrapper.classList.contains("open");
    closeAllCustomDropdowns();
    if (!wasOpen) {
      wrapper.classList.add("open");
      trigger.setAttribute("aria-expanded", "true");
      searchInput.value = "";
      renderDropdownOptions(side, "");
      setTimeout(() => searchInput.focus(), 40);
    }
  });

  searchInput.addEventListener("input", () => {
    renderDropdownOptions(side, searchInput.value.trim().toLowerCase());
  });

  searchInput.addEventListener("click", (e) => e.stopPropagation());
}

function renderDropdownOptions(side, filterText = "") {
  const listEl = document.getElementById(`options-${side}-team`);
  const currentSelected = side === "home" ? state.currentHomeTeam : state.currentAwayTeam;

  const filtered = state.teams.filter((t) =>
    t.name.toLowerCase().includes(filterText) ||
    t.short_name.toLowerCase().includes(filterText)
  );

  if (!filtered.length) {
    listEl.innerHTML = `<div style="padding:0.55rem 0.65rem; font-size:0.78rem; color:var(--ink-tertiary)">No matching clubs</div>`;
    return;
  }

  // Strictly club name only — no Elo rating next to club names
  listEl.innerHTML = filtered
    .map((t) => {
      const isSel = t.name === currentSelected;
      const swatchColor = normalizeMatteClubColor(t.primary_color, t.secondary_color);
      return `
        <button type="button" class="dropdown-option ${isSel ? "selected" : ""}" data-club="${t.name}" role="option" aria-selected="${isSel}">
          <span class="dropdown-option-left">
            <span class="club-swatch" style="background:${swatchColor}"></span>
            <span>${t.name}</span>
          </span>
          <svg class="dropdown-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
        </button>
      `;
    })
    .join("");

  listEl.querySelectorAll(".dropdown-option").forEach((optBtn) => {
    optBtn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const chosenName = optBtn.dataset.club;
      if (side === "home") {
        if (chosenName === state.currentAwayTeam) {
          state.currentAwayTeam = state.currentHomeTeam;
        }
        state.currentHomeTeam = chosenName;
      } else {
        if (chosenName === state.currentHomeTeam) {
          state.currentHomeTeam = state.currentAwayTeam;
        }
        state.currentAwayTeam = chosenName;
      }
      state.selectedFixtureId = null;
      syncCustomDropdowns();
      closeAllCustomDropdowns();
      renderFixturesList();
      await runPrediction();
    });
  });
}

function syncCustomDropdowns() {
  if (!state.teams.length) return;

  const findOrFirst = (name, fallbackIdx) =>
    state.teams.find((t) => t.name === name) || state.teams[fallbackIdx] || state.teams[0];

  const homeObj = findOrFirst(state.currentHomeTeam, 0);
  let awayObj = findOrFirst(state.currentAwayTeam, 1);
  if (awayObj.name === homeObj.name && state.teams.length > 1) {
    awayObj = state.teams.find((t) => t.name !== homeObj.name) || awayObj;
  }

  state.currentHomeTeam = homeObj.name;
  state.currentAwayTeam = awayObj.name;

  document.getElementById("text-home-trigger").textContent = homeObj.name;
  document.getElementById("swatch-home-trigger").style.background = normalizeMatteClubColor(
    homeObj.primary_color,
    homeObj.secondary_color
  );

  document.getElementById("text-away-trigger").textContent = awayObj.name;
  document.getElementById("swatch-away-trigger").style.background = normalizeMatteClubColor(
    awayObj.primary_color,
    awayObj.secondary_color
  );

  renderDropdownOptions("home", "");
  renderDropdownOptions("away", "");
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
      All Leagues
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

      // Keep Marquee Fixtures initially hidden whenever switching leagues
      setFixturesSheetOpen(false);
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
        syncCustomDropdowns();
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
  syncCustomDropdowns();
}

async function loadFixtures(leagueCode) {
  const res = await fetch(`/api/fixtures?league=${leagueCode || "ALL"}`);
  const data = await res.json();
  state.fixtures = data.fixtures;
  document.getElementById("fixtures-count-badge").textContent = state.fixtures.length;

  const lgObj = state.leagues.find((l) => l.code === leagueCode);
  document.getElementById("sheet-league-title").textContent = lgObj
    ? `${lgObj.name} — Marquee Fixtures`
    : "All Competitions — Marquee Fixtures";

  renderFixturesList();
}

function renderFixturesList() {
  const container = document.getElementById("fixtures-list-container");
  if (!state.fixtures.length) {
    container.innerHTML = `<div style="color: var(--ink-tertiary); font-size: 0.82rem;">No upcoming fixtures available.</div>`;
    return;
  }

  container.innerHTML = state.fixtures
    .map((f) => {
      const isSelected = f.id === state.selectedFixtureId;
      const p = f.probabilities;
      const maxP = Math.max(p.home_win, p.draw, p.away_win);
      return `
        <div class="fixture-card ${isSelected ? "selected" : ""}" data-id="${f.id}">
          <div class="fixture-card-meta">
            <span>${f.league_flag} ${f.stage}</span>
            <span>${f.date}</span>
          </div>
          <div class="fixture-card-body">
            <div class="fixture-clubs">
              <div class="fixture-club-line">
                <span class="club-swatch" style="background:${f.home_color}"></span>
                <span>${f.home_short}</span>
              </div>
              <div class="fixture-club-line">
                <span class="club-swatch" style="background:${f.away_color}"></span>
                <span>${f.away_short}</span>
              </div>
            </div>
            <div class="fixture-score-tag">
              <div class="fixture-score-num">${f.most_likely_score.replace("-", "–")}</div>
              <div class="fixture-xg-sub">${f.expected_home_goals} – ${f.expected_away_goals} xG</div>
            </div>
          </div>
          <div class="fixture-card-probs">
            <div class="prob-chip ${p.home_win === maxP ? "fav" : ""}">1 · ${p.home_win}%</div>
            <div class="prob-chip ${p.draw === maxP ? "fav" : ""}">X · ${p.draw}%</div>
            <div class="prob-chip ${p.away_win === maxP ? "fav" : ""}">2 · ${p.away_win}%</div>
          </div>
        </div>
      `;
    })
    .join("");

  container.querySelectorAll(".fixture-card").forEach((card) => {
    card.addEventListener("click", async () => {
      const fix = state.fixtures.find((x) => x.id === card.dataset.id);
      if (!fix) return;
      state.selectedFixtureId = fix.id;
      state.currentHomeTeam = fix.home_team;
      state.currentAwayTeam = fix.away_team;
      state.currentMatchLeague = fix.league;

      if (state.activeView !== "match-center") {
        document.getElementById("tab-match-center").click();
      }

      syncCustomDropdowns();
      renderFixturesList();
      setFixturesSheetOpen(false);
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
  state.lastPrediction = pred;
  renderForecastDashboard(pred);
}

function renderForecastDashboard(pred) {
  const { fixture, probabilities, predicted_score, markets, simulated_stats, h2h, match_drivers, tactical_insights } = pred;
  const home = fixture.home_team;
  const away = fixture.away_team;
  const ens = probabilities.ensemble;

  // Resolve matte, non-neon team primary colors and apply CSS variables
  const colors = resolveMatchTeamColors(home, away);
  document.documentElement.style.setProperty("--team-home-color", colors.homeHex);
  document.documentElement.style.setProperty("--team-away-color", colors.awayHex);

  // Hero Metadata
  document.getElementById("hero-league-badge").textContent = `${fixture.league_flag} ${fixture.league_name}`;
  document.getElementById("hero-stadium").textContent = fixture.stadium;

  document.getElementById("home-crest-box").innerHTML = renderClubCrestSVG(home.tla, colors.homeHex);
  document.getElementById("away-crest-box").innerHTML = renderClubCrestSVG(away.tla, colors.awayHex);

  document.getElementById("hero-home-name").textContent = home.name;
  document.getElementById("hero-away-name").textContent = away.name;

  document.getElementById("hero-home-elo").textContent = `Elo ${home.current_elo}`;
  document.getElementById("hero-away-elo").textContent = `Elo ${away.current_elo}`;

  document.getElementById("hero-home-form").innerHTML = renderFormBadges(home.form_last_5);
  document.getElementById("hero-away-form").innerHTML = renderFormBadges(away.form_last_5);

  // Elevated Projected Score Modal
  document.getElementById("hero-pred-home-goals").textContent = predicted_score.most_likely.home_goals;
  document.getElementById("hero-pred-away-goals").textContent = predicted_score.most_likely.away_goals;
  document.getElementById("hero-pred-home-bar").style.backgroundColor = colors.homeHex;
  document.getElementById("hero-pred-away-bar").style.backgroundColor = colors.awayHex;
  document.getElementById("hero-pred-score-prob").textContent = `${predicted_score.most_likely.probability}% Exact Probability`;
  document.getElementById("hero-home-xg").textContent = predicted_score.expected_home_goals.toFixed(2);
  document.getElementById("hero-away-xg").textContent = predicted_score.expected_away_goals.toFixed(2);

  // 1X2 Outcome Distribution with Team Primary Colors
  document.getElementById("prob-label-home").textContent = `${home.short_name} Win`;
  document.getElementById("prob-label-away").textContent = `${away.short_name} Win`;
  const valHomeEl = document.getElementById("prob-val-home");
  const valAwayEl = document.getElementById("prob-val-away");
  valHomeEl.textContent = `${ens.home_win}%`;
  valHomeEl.style.color = colors.homeHex;
  document.getElementById("prob-val-draw").textContent = `${ens.draw}%`;
  valAwayEl.textContent = `${ens.away_win}%`;
  valAwayEl.style.color = colors.awayHex;

  document.getElementById("bar-fill-home").style.width = `${ens.home_win}%`;
  document.getElementById("bar-fill-draw").style.width = `${ens.draw}%`;
  document.getElementById("bar-fill-away").style.width = `${ens.away_win}%`;

  // Scenario Slider Labels
  document.getElementById("label-slider-home").textContent = `${home.short_name} Form`;
  document.getElementById("label-slider-away").textContent = `${away.short_name} Form`;

  // Tactical Insights
  document.getElementById("tactical-insights-container").innerHTML = tactical_insights
    .map((txt) => `<div class="insight-item">${txt}</div>`)
    .join("");

  // 7x7 Matrix Heatmap (Using Team Primary Colors + Clickable Pop-up)
  renderScoreHeatmap(predicted_score, home, away, colors);

  // Model Consensus & Markets
  renderModelConsensus(probabilities, markets, home.short_name, away.short_name, colors);

  // Simulated Match Statistics (Using Team Primary Colors)
  renderSimulatedStats(simulated_stats, colors);

  // Tactical Radar & Goal Timing (Using Team Primary Colors)
  renderTacticalRadar(home, away, colors);
  renderGoalTimeline(simulated_stats.goal_timeline, home.short_name, away.short_name);

  // Match Drivers & H2H (Using Team Primary Colors)
  renderMatchDrivers(match_drivers, home.name, away.name, colors);
  renderH2HSummary(h2h, home, away, colors);
}

function renderScoreHeatmap(predictedScore, home, away, colors) {
  document.getElementById("heatmap-away-axis-label").textContent = `${away.short_name} Goals (Away) →`;
  document.getElementById("heatmap-home-axis-label").textContent = `${home.short_name} Goals (Home) ↓`;

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

  const { homeRgb, awayRgb } = colors;

  for (let hg = 0; hg < 7; hg++) {
    html += `<div class="hm-header-cell">${hg}</div>`;
    for (let ag = 0; ag < 7; ag++) {
      const prob = matrix[hg][ag];
      const intensity = Math.min(1, prob / maxProb);
      let bg;
      if (hg > ag) {
        bg = `rgba(${homeRgb.r}, ${homeRgb.g}, ${homeRgb.b}, ${(0.04 + intensity * 0.28).toFixed(3)})`;
      } else if (hg === ag) {
        bg = `rgba(113, 113, 122, ${(0.04 + intensity * 0.25).toFixed(3)})`;
      } else {
        bg = `rgba(${awayRgb.r}, ${awayRgb.g}, ${awayRgb.b}, ${(0.04 + intensity * 0.28).toFixed(3)})`;
      }
      const isBest = hg === bestH && ag === bestA;
      html += `
        <div class="hm-cell ${isBest ? "best-score" : ""}"
             data-hg="${hg}" data-ag="${ag}" data-prob="${prob}"
             style="background:${bg}"
             title="Click to inspect ${home.short_name} ${hg} – ${ag} ${away.short_name} (${prob}%)">
          <div class="hm-score-lbl">${hg}–${ag}</div>
          <div class="hm-prob-lbl">${prob.toFixed(1)}%</div>
        </div>
      `;
    }
  }
  grid.innerHTML = html;

  // Bind click events on all 49 matrix cells to open the statistical pop-up
  grid.querySelectorAll(".hm-cell").forEach((cell) => {
    cell.addEventListener("click", () => {
      const hg = parseInt(cell.dataset.hg, 10);
      const ag = parseInt(cell.dataset.ag, 10);
      grid.querySelectorAll(".hm-cell.active-cell").forEach((c) => c.classList.remove("active-cell"));
      cell.classList.add("active-cell");
      openScorelinePopup(hg, ag, predictedScore, home, away, colors);
    });
  });

  document.getElementById("top-scorelines-container").innerHTML = predictedScore.top_scorelines
    .map(
      (item) => `
      <div class="top-score-pill" data-hg="${item.home_goals}" data-ag="${item.away_goals}">
        <div class="sc">${item.score.replace("-", "–")}</div>
        <div class="pr">${item.probability}%</div>
      </div>
    `
    )
    .join("");

  document.querySelectorAll("#top-scorelines-container .top-score-pill").forEach((pill) => {
    pill.addEventListener("click", () => {
      const hg = parseInt(pill.dataset.hg, 10);
      const ag = parseInt(pill.dataset.ag, 10);
      const targetCell = grid.querySelector(`.hm-cell[data-hg="${hg}"][data-ag="${ag}"]`);
      if (targetCell) targetCell.click();
    });
  });

  // Keep popup hidden until clicked (or refresh if already open)
  const popup = document.getElementById("scoreline-detail-popup");
  popup.classList.remove("open");
}

function factorial(n) {
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function poissonPmf(k, lam) {
  return (Math.pow(lam, k) * Math.exp(-lam)) / factorial(k);
}

function openScorelinePopup(hg, ag, predictedScore, home, away, colors) {
  const popup = document.getElementById("scoreline-detail-popup");
  const probPct = predictedScore.score_matrix[hg][ag];
  const lamH = predictedScore.expected_home_goals;
  const lamA = predictedScore.expected_away_goals;

  // Compute raw independent Poisson probability & implied odds
  const rawPoissPct = poissonPmf(hg, lamH) * poissonPmf(ag, lamA) * 100;
  const fairOdds = probPct > 0.05 ? (100 / probPct).toFixed(1) + "x" : ">200x";
  const simHits = Math.round((probPct / 100) * 10000).toLocaleString();
  const htHome = Math.round(hg * 0.44);
  const htAway = Math.round(ag * 0.42);

  // Rank among all 49 scorelines
  const allProbs = predictedScore.score_matrix.flat().slice().sort((a, b) => b - a);
  const rank = allProbs.indexOf(probPct) + 1;

  const outcomeTag = document.getElementById("popup-outcome-tag");
  if (hg > ag) {
    outcomeTag.textContent = `${home.short_name} Victory · Rank #${rank} of 49`;
    outcomeTag.style.background = `rgba(${colors.homeRgb.r}, ${colors.homeRgb.g}, ${colors.homeRgb.b}, 0.12)`;
    outcomeTag.style.color = colors.homeHex;
  } else if (hg === ag) {
    outcomeTag.textContent = `Draw Outcome · Rank #${rank} of 49`;
    outcomeTag.style.background = "#f4f4f5";
    outcomeTag.style.color = "#52525b";
  } else {
    outcomeTag.textContent = `${away.short_name} Victory · Rank #${rank} of 49`;
    outcomeTag.style.background = `rgba(${colors.awayRgb.r}, ${colors.awayRgb.g}, ${colors.awayRgb.b}, 0.12)`;
    outcomeTag.style.color = colors.awayHex;
  }

  document.getElementById("popup-score-title").textContent = `${home.short_name} ${hg} – ${ag} ${away.short_name}`;

  document.getElementById("popup-stats-grid").innerHTML = `
    <div class="popup-stat-box">
      <div class="popup-stat-lbl">Ensemble Prob.</div>
      <div class="popup-stat-val">${probPct.toFixed(2)}%</div>
    </div>
    <div class="popup-stat-box">
      <div class="popup-stat-lbl">Raw Poisson</div>
      <div class="popup-stat-val">${rawPoissPct.toFixed(2)}%</div>
    </div>
    <div class="popup-stat-box">
      <div class="popup-stat-lbl">Fair Odds</div>
      <div class="popup-stat-val">${fairOdds}</div>
    </div>
    <div class="popup-stat-box">
      <div class="popup-stat-lbl">Sim. Frequency</div>
      <div class="popup-stat-val">${simHits} / 10k</div>
    </div>
  `;

  const deltaH = (hg - lamH).toFixed(2);
  const deltaA = (ag - lamA).toFixed(2);
  document.getElementById("popup-stat-note").textContent =
    `Goal differential vs. expected goals: ${home.short_name} ${deltaH >= 0 ? "+" + deltaH : deltaH} (${lamH} xG), ` +
    `${away.short_name} ${deltaA >= 0 ? "+" + deltaA : deltaA} (${lamA} xG). ` +
    `Most likely half-time state en route to ${hg}–${ag}: ${htHome}–${htAway}.`;

  popup.classList.add("open");
  popup.setAttribute("aria-hidden", "false");
}

function renderModelConsensus(probabilities, markets, homeShort, awayShort, colors) {
  const models = [
    { key: "ensemble", name: "Hybrid Ensemble" },
    { key: "xgboost", name: "XGBoost Classifier" },
    { key: "random_forest", name: "Random Forest" },
    { key: "dixon_coles", name: "Dixon-Coles Poisson" },
  ];

  document.getElementById("model-consensus-container").innerHTML = models
    .map((m) => {
      const p = probabilities[m.key];
      return `
        <div class="model-row">
          <div class="model-row-top">
            <span>${m.name}</span>
            <div class="model-probs-nums">
              <span style="color:${colors.homeHex}; font-weight:600">1: ${p.home_win}%</span>
              <span>X: ${p.draw}%</span>
              <span style="color:${colors.awayHex}; font-weight:600">2: ${p.away_win}%</span>
            </div>
          </div>
          <div class="mini-bar-stack">
            <div style="width:${p.home_win}%; background:${colors.homeHex}"></div>
            <div style="width:${p.draw}%; background:var(--slate-draw)"></div>
            <div style="width:${p.away_win}%; background:${colors.awayHex}"></div>
          </div>
        </div>
      `;
    })
    .join("");

  const marketItems = [
    { label: "Over 1.5 Goals", val: `${markets.over_1_5}%` },
    { label: "Over 2.5 Goals", val: `${markets.over_2_5}%` },
    { label: "Over 3.5 Goals", val: `${markets.over_3_5}%` },
    { label: "Both Teams Score", val: `${markets.btts_yes}%` },
    { label: `${homeShort} / Draw`, val: `${markets.double_chance_1x}%` },
    { label: `${awayShort} / Draw`, val: `${markets.double_chance_x2}%` },
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

function renderSimulatedStats(sim, colors) {
  const rows = [
    { label: "Expected Goals (xG)", h: sim.home_xg, a: sim.away_xg, suffix: "" },
    { label: "Ball Possession", h: sim.home_possession, a: sim.away_possession, suffix: "%" },
    { label: "Total Shots", h: sim.home_shots, a: sim.away_shots, suffix: "" },
    { label: "Shots on Target", h: sim.home_sot, a: sim.away_sot, suffix: "" },
    { label: "Big Chances", h: sim.home_big_chances, a: sim.away_big_chances, suffix: "" },
    { label: "Corner Kicks", h: sim.home_corners, a: sim.away_corners, suffix: "" },
    { label: "Pass Accuracy", h: sim.home_pass_accuracy, a: sim.away_pass_accuracy, suffix: "%" },
    { label: "Fouls Committed", h: sim.home_fouls, a: sim.away_fouls, suffix: "" },
    { label: "Yellow Cards", h: sim.home_yellow_cards, a: sim.away_yellow_cards, suffix: "" },
  ];

  document.getElementById("simulated-stats-container").innerHTML = rows
    .map((r) => {
      const total = Math.max(0.01, r.h + r.a);
      const hPct = ((r.h / total) * 100).toFixed(1);
      const aPct = (100 - parseFloat(hPct)).toFixed(1);
      return `
        <div class="stat-comp-row">
          <div class="stat-comp-header">
            <span class="stat-num" style="color:${colors.homeHex}">${r.h}${r.suffix}</span>
            <span>${r.label}</span>
            <span class="stat-num" style="color:${colors.awayHex}">${r.a}${r.suffix}</span>
          </div>
          <div class="stat-dual-bar">
            <div class="stat-bar-h" style="width:${hPct}%; background:${colors.homeHex}"></div>
            <div class="stat-bar-a" style="width:${aPct}%; background:${colors.awayHex}"></div>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderTacticalRadar(home, away, colors) {
  document.getElementById("radar-legend-container").innerHTML = `
    <span class="radar-legend-item">
      <span class="club-swatch" style="background:${colors.homeHex}"></span>
      <span>${home.short_name}</span>
    </span>
    <span class="radar-legend-item">
      <span class="club-swatch" style="background:${colors.awayHex}"></span>
      <span>${away.short_name}</span>
    </span>
  `;

  const axes = [
    { label: "Attack", h: home.attack, a: away.attack },
    { label: "Defense", h: home.defense, a: away.defense },
    { label: "Elo", h: Math.min(98, (home.current_elo - 1400) / 6.2), a: Math.min(98, (away.current_elo - 1400) / 6.2) },
    { label: "Form", h: Math.min(98, 45 + home.ppg_last_5 * 17), a: Math.min(98, 45 + away.ppg_last_5 * 17) },
    { label: "Possession", h: home.possession_style * 130, a: away.possession_style * 130 },
    { label: "Pressing", h: home.pressing_intensity * 102, a: away.pressing_intensity * 102 },
  ];

  const cx = 140;
  const cy = 108;
  const radius = 74;
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
    ringsSvg += `<polygon points="${pts}" fill="none" stroke="#e4e4e7" stroke-width="1" />`;
  });

  let axesLines = "";
  let labelsSvg = "";
  axes.forEach((ax, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2;
    const x2 = cx + radius * Math.cos(angle);
    const y2 = cy + radius * Math.sin(angle);
    const lx = cx + (radius + 24) * Math.cos(angle);
    const ly = cy + (radius + 14) * Math.sin(angle);
    axesLines += `<line x1="${cx}" y1="${cy}" x2="${x2}" y2="${y2}" stroke="#e4e4e7" stroke-width="1" />`;
    labelsSvg += `<text x="${lx}" y="${ly + 3}" text-anchor="middle" fill="#52525b" font-size="10" font-weight="500" font-family="Inter, -apple-system, sans-serif">${ax.label}</text>`;
  });

  const homePoly = axes.map((ax, i) => getPoint(i, ax.h).join(",")).join(" ");
  const awayPoly = axes.map((ax, i) => getPoint(i, ax.a).join(",")).join(" ");

  const { homeRgb, awayRgb } = colors;

  document.getElementById("tactical-radar-container").innerHTML = `
    <svg width="280" height="216" viewBox="0 0 280 216">
      ${ringsSvg}
      ${axesLines}
      <polygon points="${homePoly}" fill="rgba(${homeRgb.r}, ${homeRgb.g}, ${homeRgb.b}, 0.14)" stroke="${colors.homeHex}" stroke-width="1.8" />
      <polygon points="${awayPoly}" fill="rgba(${awayRgb.r}, ${awayRgb.g}, ${awayRgb.b}, 0.14)" stroke="${colors.awayHex}" stroke-width="1.8" />
      ${labelsSvg}
    </svg>
  `;
}

function renderGoalTimeline(timeline, homeShort, awayShort) {
  document.getElementById("goal-timeline-container").innerHTML = timeline
    .map((item) => {
      const hHeight = Math.min(48, Math.round(item.home_goal_prob * 1.15));
      const aHeight = Math.min(48, Math.round(item.away_goal_prob * 1.15));
      return `
        <div class="tl-col" title="${item.period}: ${homeShort} ${item.home_goal_prob}% · ${awayShort} ${item.away_goal_prob}%">
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

function renderMatchDrivers(drivers, homeName, awayName, colors) {
  document.getElementById("match-drivers-container").innerHTML = drivers
    .map((d) => {
      const isHomeAdv = d.advantage === homeName;
      const badgeColor = isHomeAdv ? colors.homeHex : colors.awayHex;
      const badgeRgb = isHomeAdv ? colors.homeRgb : colors.awayRgb;
      return `
        <div class="driver-item">
          <div class="driver-top">
            <span>${d.factor}</span>
            <span class="driver-adv-pill" style="background:rgba(${badgeRgb.r}, ${badgeRgb.g}, ${badgeRgb.b}, 0.1); color:${badgeColor}">
              Edge: ${d.advantage}
            </span>
          </div>
          <div class="driver-vals">
            <span style="color:${colors.homeHex}">Home: <strong>${d.home_val}</strong></span>
            <span>Impact: ${d.impact_score}</span>
            <span style="color:${colors.awayHex}">Away: <strong>${d.away_val}</strong></span>
          </div>
        </div>
      `;
    })
    .join("");
}

function renderH2HSummary(h2h, home, away, colors) {
  const total = Math.max(1, h2h.total_meetings);
  const hPct = ((h2h.home_team_wins / total) * 100).toFixed(1);
  const dPct = ((h2h.draws / total) * 100).toFixed(1);
  const aPct = ((h2h.away_team_wins / total) * 100).toFixed(1);

  const meetingsHtml =
    h2h.recent_meetings && h2h.recent_meetings.length > 0
      ? h2h.recent_meetings
          .map(
            (m) => `
          <div class="h2h-meeting-row">
            <span style="color:var(--ink-tertiary); font-family:var(--font-mono); font-size:0.7rem">${m.date}</span>
            <span><strong>${m.home_team}</strong> vs <strong>${m.away_team}</strong></span>
            <span class="h2h-score-badge">${m.fthg} – ${m.ftag}</span>
          </div>
        `
          )
          .join("")
      : `<div style="color:var(--ink-tertiary); font-size:0.78rem;">First recent meeting — forecast weighted by Club Elo and rolling xG metrics.</div>`;

  document.getElementById("h2h-summary-container").innerHTML = `
    <div class="h2h-kpi-row">
      <div class="market-box" style="border-top: 2px solid ${colors.homeHex}">
        <div class="market-name">${home.short_name} Wins</div>
        <div class="market-val" style="color:${colors.homeHex}">${h2h.home_team_wins}</div>
      </div>
      <div class="market-box" style="border-top: 2px solid var(--slate-draw)">
        <div class="market-name">Draws</div>
        <div class="market-val">${h2h.draws}</div>
      </div>
      <div class="market-box" style="border-top: 2px solid ${colors.awayHex}">
        <div class="market-name">${away.short_name} Wins</div>
        <div class="market-val" style="color:${colors.awayHex}">${h2h.away_team_wins}</div>
      </div>
      <div class="market-box">
        <div class="market-name">Avg Goals</div>
        <div class="market-val">${h2h.avg_total_goals}</div>
      </div>
    </div>
    <div class="h2h-split-bar" title="${home.short_name} ${h2h.home_team_wins}W · ${h2h.draws}D · ${away.short_name} ${h2h.away_team_wins}W">
      <div style="width:${hPct}%; background:${colors.homeHex}"></div>
      <div style="width:${dPct}%; background:var(--slate-draw)"></div>
      <div style="width:${aPct}%; background:${colors.awayHex}"></div>
    </div>
    <div class="sub-eyebrow">Recent Meetings</div>
    <div>${meetingsHtml}</div>
  `;
}

async function loadStandings(leagueCode) {
  const res = await fetch(`/api/standings/${leagueCode}`);
  const data = await res.json();
  const { league, standings } = data;

  document.getElementById("standings-title").textContent = `${league.flag} ${league.name} Standings`;
  document.getElementById("standings-subtitle").textContent = league.description;

  const tbody = document.getElementById("standings-tbody");
  tbody.innerHTML = standings
    .map(
      (row, idx) => `
      <tr>
        <td style="font-family:var(--font-mono); font-weight:600; color:var(--ink-secondary)">${row.rank}</td>
        <td>
          <div style="display:flex; align-items:center; gap:0.5rem; font-weight:600">
            <span class="club-swatch" style="background:${row.color}"></span>
            <span>${row.team}</span>
          </div>
        </td>
        <td>${row.played}</td>
        <td>${row.won}</td>
        <td>${row.drawn}</td>
        <td>${row.lost}</td>
        <td>${row.gf}</td>
        <td>${row.ga}</td>
        <td style="font-family:var(--font-mono)">${row.gd >= 0 ? "+" + row.gd : row.gd}</td>
        <td style="font-family:var(--font-mono); color:var(--ink-secondary)">${row.xg.toFixed(1)}</td>
        <td style="font-family:var(--font-mono); color:var(--ink-secondary)">${row.xga.toFixed(1)}</td>
        <td style="font-family:var(--font-mono)">${row.elo}</td>
        <td style="font-family:var(--font-mono); font-weight:700">${row.points}</td>
        <td><div class="form-dots">${renderFormBadges(row.form)}</div></td>
        <td style="text-align:right">
          <button class="btn-table-predict" data-team="${row.team}" data-opp="${standings[(idx + 1) % standings.length].team}" data-lg="${league.code}">
            Forecast
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
      syncCustomDropdowns();
      await runPrediction();
    });
  });
}

window.addEventListener("DOMContentLoaded", initApp);
