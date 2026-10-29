<div align="center">

# ⚽ PitchOracle
### Quantitative Football Match Forecaster & Predictive Simulation Engine

An enterprise-grade sports analytics and machine learning system for forecasting match outcomes, exact scoreline probability distributions, in-game performance metrics, and secondary betting markets across Europe's top five domestic flights and the UEFA Champions League.

[![Python](https://img.shields.io/badge/Python-3.11-3776AB?style=flat&logo=python&logoColor=white)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![XGBoost](https://img.shields.io/badge/XGBoost-2.0+-EB5424?style=flat&logo=xgboost&logoColor=white)](https://xgboost.readthedocs.io/)
[![Scikit-Learn](https://img.shields.io/badge/Scikit--Learn-1.4+-F7931E?style=flat&logo=scikit-learn&logoColor=white)](https://scikit-learn.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat)](LICENSE)

</div>

---

## 📌 Executive Overview

Predicting football match outcomes presents unique statistical challenges: matches are characterized by low scoring frequencies, heavy Poisson overdispersion, structural draw dependencies, and non-stationary form dynamics. Standard predictive models often suffer from lookahead data leakage, unrealistic independence assumptions between competing sides, or brittle rule-based heuristics.

**PitchOracle** addresses these challenges through a hybrid computational architecture:
1. **Dynamic Pre-Match Feature Engineering** executed strictly in chronological sequence with zero lookahead bias.
2. **Dual-Model Supervised Ensemble** uniting **Gradient Boosted Decision Trees (XGBoost)** and **Random Forest Classifiers** for robust three-way outcome ($1\text{X}2$) probabilities.
3. **Dixon-Coles Bivariate Poisson Modeling** coupled with a **10,000-iteration Monte Carlo Simulator** to resolve joint goal dependencies and generate granular score distributions.
4. **Autonomous Ingestion & Historical Persistence Engine** synchronizing live completed fixture data from verified European data feeds without synthetic fabrication.
5. **Apple-Inspired Interface** emphasizing functional minimalism, generous whitespace, tactile typography, and team-specific matte colorways.

---

## 🏆 Competitions Covered

The platform monitors, indexes, and predicts fixtures across Europe's premier competitions:

| Competition | Federation | Code | Division Tier | Active Clubs |
| :--- | :--- | :---: | :---: | :---: |
| **Premier League** | England (FA) | `PL` | Tier 1 | 20 |
| **La Liga** | Spain (RFEF) | `PD` | Tier 1 | 20 |
| **Bundesliga** | Germany (DFB) | `BL1` | Tier 1 | 18 |
| **Serie A** | Italy (FIGC) | `SA` | Tier 1 | 20 |
| **Ligue 1** | France (LFP) | `FL1` | Tier 1 | 18 |
| **UEFA Champions League** | Europe (UEFA) | `CL` | Continental Elite | 36 |

---

## ✨ Application Features

### 1. Match Center & Interactive Clash Forecaster
- **Dynamic Club Selection**: Fast, searchable dropdown menus designed with minimalist aesthetics, isolating club identities from statistical noise prior to selection.
- **Marquee Fixtures Unveiler**: Expandable drawer surfacing top-tier upcoming matchday fixtures with calculated kickoff venues, dates, and stage metadata.
- **Ensemble 1X2 Probabilities & Fair Odds**: Real-time calibrated probability distributions for Home Win, Draw, and Away Win with calculated decimal fair odds.
- **Expected Scoreline & Goals**: Projected primary scoreline with independent Expected Goals ($\text{xG}_{\text{home}}, \text{xG}_{\text{away}}$) decomposed down to second-decimal precision.

### 2. 7×7 Exact Scoreline Probability Matrix
- **Joint Probability Heatmap**: $7 \times 7$ probability grid modeling all score combinations from `0-0` through `6-6`.
- **Interactive Scoreline Modals**: Clicking any matrix cell summons an analytical popover displaying:
  - Exact joint probability percentage
  - Fair implied decimal and American betting odds
  - Cumulative probability comparison against the broader distribution
  - Goal margin and differential context

### 3. In-Game Simulated Match Dynamics (Monte Carlo Derived)
- **Simulated Match Statistics**: Aggregated across 10,000 in-memory stochastic simulations:
  - Expected Possession Percentage
  - Total Shots & Shots on Target (SOT)
  - Big Chances Created & Corner Kicks
  - Fouls Committed & Disciplinary Cards (Yellow/Red)
- **15-Minute Goal Arrival Timeline**: Temporal scoring density curve mapping the probability of goals across 15-minute match intervals (0–15', 16–30', 31–45', 46–60', 61–75', 76–90+').

### 4. Secondary & Derivative Betting Markets
- **Over / Under Thresholds**: Implied probabilities and fair odds for Over/Under 1.5, 2.5, and 3.5 total match goals.
- **Both Teams To Score (BTTS)**: Calculated likelihood of BTTS (Yes / No) derived from joint distribution tails.

### 5. Tactical Radar & Club Attribute Profiling
- **Pentagonal Tactical Profiling**: Comparative visualization scoring clubs across:
  - Attacking Output
  - Defensive Resilience
  - Possession Dominance
  - Pressing & Turnover Intensity
  - Current Elo Momentum Trend

### 6. Head-to-Head (H2H) Historical Index
- **Chronological Clash Ledger**: Complete log of previous direct meetings between chosen sides.
- **Dominance Metrics**: Historical win/draw ratios, aggregate goal margins, clean sheet frequencies, and BTTS rates.

### 7. Interactive "What-If" Scenario Sandbox
- **Tactical Tempo Modifier**: Adjust match pace from defensive low-block chess matches to open end-to-end transitional shootouts.
- **Momentum & Form Bias**: Simulate late injuries, tactical bounces, or psychological swings by boosting or dampening side-specific momentum.
- **Neutral Venue Simulation**: Instantly neutralize home-ground advantage to simulate continental finals (e.g. UCL Final at neutral venues).

### 8. Real-Time Dynamic League Standings & Form Matrix
- **Comprehensive Division Tables**: Live tracking of Matches Played (`P`), Won (`W`), Drawn (`D`), Lost (`L`), Goals For (`GF`), Goals Against (`GA`), Goal Difference (`GD`), Points (`Pts`), Expected Goals (`xG`), Expected Goals Against (`xGA`), and Club Elo.
- **Chronological Form Badges**: 5-match rolling sequence indicators (`W`, `D`, `L`) computed from verified historical match sequences.
- **Dynamic Division Rosters**: Automatic roster reconciliation identifying newly promoted or relegated clubs each season without manual code modification.

### 9. Live Data Synchronization Engine
- **Automated Boot Sync**: The engine performs an automated integrity check and delta sync upon application startup.
- **On-Demand Standings Refresh**: One-click **Sync Data** action querying live feeds, indexing newly completed matches into the historical CSV database, and triggering background model retraining.

### 10. Apple-Inspired Minimalist Interface
- **Palette**: Curated Slate, Zinc, and White foundation with authentic team kit colorway accents.
- **Typography Pairing**: Newsreader Modern Serif headers combined with Inter Sans UI elements for high legibility and refined editorial hierarchy.
- **Micro-Interactions**: Subtle easing transitions, backdrop blur filters, and accessible SVG iconography.

---

## 🧠 Machine Learning & Statistical Methodology

```
                                  ┌───────────────────────────────┐
                                  │   Verified Match Feeds (CSV)  │
                                  │   (football-data.co.uk feeds) │
                                  └───────────────┬───────────────┘
                                                  │
                                                  ▼
                                  ┌───────────────────────────────┐
                                  │    Historical Database (CSV)  │
                                  │   >6,000 Completed Matches    │
                                  └───────────────┬───────────────┘
                                                  │
                                                  ▼
                                  ┌───────────────────────────────┐
                                  │ Chronological Feature Store   │
                                  │    (28 Leakage-Free Metrics)  │
                                  └───────┬───────────────┬───────┘
                                          │               │
                     ┌────────────────────┘               └────────────────────┐
                     ▼                                                         ▼
     ┌──────────────────────────────┐                          ┌──────────────────────────────┐
     │   Tree-Based ML Ensemble     │                          │  Dixon-Coles Poisson Model   │
     │  - XGBoost (Extreme Gradient)│                          │ - Bivariate Goal Rate λH, λA │
     │  - Random Forest (260 Trees) │                          │ - Low-Score Dep. Adjustment  │
     └───────────────┬──────────────┘                          └───────────────┬──────────────┘
                     │                                                         │
                     ▼                                                         ▼
     ┌──────────────────────────────┐                          ┌──────────────────────────────┐
     │ 1X2 Probabilities & Odds     │                          │ 10,000x Monte Carlo Engine   │
     │  (Home Win / Draw / Away)    │                          │ - 7x7 Scoreline Heatmap      │
     └───────────────┬──────────────┘                          │ - Match Stats & Timelines    │
                     │                                         └───────────────┬──────────────┘
                     │                                                         │
                     └────────────────────┬────────────────────────────────────┘
                                          │
                                          ▼
                         ┌─────────────────────────────────┐
                         │   FastAPI High-Performance API  │
                         └────────────────┬────────────────┘
                                          │
                                          ▼
                         ┌─────────────────────────────────┐
                         │   Apple-Inspired Web Interface  │
                         └─────────────────────────────────┘
```

### 1. Chronological Feature Engineering Pipeline
To ensure mathematical validity, all features are extracted chronologically. When processing match $k$, the feature store only accesses data from matches $1, \dots, k-1$:

- **Dynamic Elo Rating System**: Evaluates side quality dynamically using:
  $$\Delta R = K \cdot \ln(|GF - GA| + 1) \cdot (S - E)$$
  where $K=20.0$, $S$ is the match result ($1.0, 0.5, 0.0$), and $E$ is the logistic expectation adjusted for home advantage (+55 Elo points).
- **Rolling Form Indices**: 5-match and 10-match moving averages of Points Per Game (PPG), goal scoring volume, goals conceded, and Expected Goals differential ($\text{xG} - \text{xGA}$).
- **Venue-Specific Performance**: Home-specific scoring efficiency versus road-specific defensive resilience.
- **Disciplinary & Aggression Indicators**: Rolling cards, shot counts, shots on target (SOT), and possession shares.
- **Head-to-Head Dominance Factor**: Normalized historical points share and goal differential across previous direct encounters.

### 2. Dual-Model Supervised Ensemble
The $1\text{X}2$ outcome classification problem is evaluated using two diverse tree-based architectures:
- **XGBoost Classifier (`XGBClassifier`)**: Optimized with `multi:softprob` objective, capturing high-order non-linear feature interactions and tactical mismatches.
- **Random Forest Classifier (`RandomForestClassifier`)**: 260 balanced decision trees operating with bootstrap aggregation to constrain prediction variance in volatile, evenly-matched derbies.
- **Probability Calibration**: Outputs are blended via weighted ensemble soft-voting to produce well-calibrated posterior probabilities.

### 3. Dixon-Coles Bivariate Poisson Formulation
Standard Poisson models assume independent goal generation between sides, systematically underestimating low-scoring draws ($0\text{--}0, 1\text{--}1$) and low-margin home victories ($1\text{--}0$).

PitchOracle applies the **Dixon and Coles (1997)** parameterization:
$$P(X=x, Y=y) = \tau_{\lambda_x, \lambda_y}(x, y) \cdot \frac{\lambda_x^x e^{-\lambda_x}}{x!} \cdot \frac{\lambda_y^y e^{-\lambda_y}}{y!}$$

Where the adjustment factor $\tau(x, y)$ applies low-score correlation parameter $\rho \approx -0.085$:
$$\tau(x, y) = \begin{cases}
1 - \lambda_x \lambda_y \rho & x=0, y=0 \\
1 + \lambda_x \rho & x=0, y=1 \\
1 + \lambda_y \rho & x=1, y=0 \\
1 - \rho & x=1, y=1 \\
1 & \text{otherwise}
\end{cases}$$

### 4. 10,000-Iteration Monte Carlo Simulation
Using the calibrated expected goal rates ($\lambda_x, \lambda_y$), the engine simulates 10,000 full 90-minute matches to derive empirical probability distributions for:
- Exact score frequencies
- Over/Under totals (1.5, 2.5, 3.5)
- Both Teams to Score (BTTS)
- In-game statistical distributions (Possession, Shots, Corners, Cards)

---

## 🏗️ Architecture & Technology Stack

| Layer | Technologies | Key Responsibilities |
| :--- | :--- | :--- |
| **Machine Learning** | `scikit-learn`, `xgboost`, `scipy`, `numpy` | Gradient boosting, random forests, bivariate Poisson distribution, Monte Carlo simulation |
| **Data & Pipeline** | `pandas`, `requests` | Chronological feature store, Elo tracking, live feed ingestion, CSV database management |
| **Backend API** | `FastAPI`, `Uvicorn`, `Pydantic v2` | Asynchronous REST endpoints, strict schema validation, CORS middleware |
| **Frontend UI** | HTML5, Modern CSS, Vanilla ES6+ | Apple-inspired design system, SVG rendering, custom dropdowns, interactive modal popups |
| **Containerization** | `Docker`, `Docker Compose` | Multi-platform production deployment with dynamic port binding and automated health checks |

---

## 📡 REST API Specification

The FastAPI backend exposes fully typed, OpenAPI-compliant endpoints:

| Method | Endpoint | Description |
| :---: | :--- | :--- |
| `GET` | `/api/health` | Service health status, total historical matches indexed, and latest sync timestamp |
| `GET` | `/api/leagues` | Competitions metadata, country flags, and active team counts |
| `GET` | `/api/teams?league={code}` | Active clubs list with Elo, rolling form, and venue scoring stats |
| `GET` | `/api/fixtures?league={code}` | Upcoming matchday fixtures enriched with model predictions |
| `GET` | `/api/standings/{league_code}` | Current season table with Points, GD, GF, GA, xG, xGA, and rolling form |
| `POST` | `/api/predict` | Full prediction payload: $1\text{X}2$, 7×7 matrix, simulated match stats, H2H, and radar |
| `GET` | `/api/predict` | Idempotent GET variant supporting direct URL querying |
| `GET` | `/api/model-metrics` | XGBoost & Random Forest accuracy, log loss, ranked probability scores (RPS), and feature importances |
| `POST` | `/api/sync-data?league={code}` | Pulls latest matchday results from verified feeds, updates CSV database, and triggers retraining |

---

## 📂 Project Repository Structure

```
.
├── backend/
│   ├── __init__.py
│   ├── main.py                     # FastAPI server, REST routers, and static file mount
│   ├── data_loader.py              # Live data ingestion, dynamic season resolver, and club registry
│   ├── build_real_dataset.py       # Multi-season historical dataset builder from football-data feeds
│   ├── verify_sync_and_standings.py# End-to-end mathematical and standings verification suite
│   ├── data/
│   │   └── historical_matches.csv  # Chronological database (>6,000 completed real matches)
│   ├── ml/
│   │   ├── __init__.py
│   │   ├── features.py             # 28-feature chronological feature store and Elo engine
│   │   └── predictor.py            # XGBoost + RF ensemble, Dixon-Coles model, and Monte Carlo simulator
│   └── models/                     # Serialized model artifacts
├── frontend/
│   ├── index.html                  # Apple-inspired minimalist single-page application
│   ├── styles.css                  # Modern CSS design system, typography, and responsive layouts
│   └── app.js                      # Client state management, chart renderers, and interactive modals
├── web-next/                       # Complementary Next.js TypeScript implementation
├── Dockerfile                      # Production container image with OpenMP support
├── docker-compose.yml              # Local & production service orchestration with healthchecks
├── .dockerignore                   # Build context optimization exclusions
├── render.yaml                     # Infrastructure-as-Code blueprint for cloud deployment
├── requirements.txt                # Pinned production Python dependencies
└── README.md                       # Architectural documentation
```

---

## ⚖️ License & Attribution

Distributed under the **MIT License**. Match historical feeds provided via [football-data.co.uk](https://www.football-data.co.uk/). Statistical methodologies grounded in Dixon & Coles (1997) *Modelling Association Football Scores and Inefficiencies in the Football Betting Market*.
