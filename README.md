# ⚽ PitchOracle — Football Match Forecaster & Score Predictor

An Apple-inspired Machine Learning & Statistical Match Forecasting platform covering **Europe's 6 Major Competitions**:
- 🏴󠁧󠁢󠁥󠁮󠁧󠁿 **Premier League** (`PL`)
- 🇪🇸 **La Liga** (`PD`)
- 🇩🇪 **Bundesliga** (`BL1`)
- 🇮🇹 **Serie A** (`SA`)
- 🇫🇷 **Ligue 1** (`FL1`)
- 🇪🇺 **UEFA Champions League** (`CL`)

Built with **Apple-inspired minimalism** (Slate, Zinc & White palette), **Newsreader Serif + Inter Sans** typography, team-specific primary kit accents, interactive 7×7 exact scoreline popups, and real-time live data syncing from official European league records.

---

## 🧠 Hybrid ML & Statistical Architecture

PitchOracle blends **Gradient Boosted Decision Trees**, **Random Forests**, and a **Dixon-Coles Bivariate Poisson + Monte Carlo Simulator**:

1. **Feature Engineering Engine ([`backend/ml/features.py`](backend/ml/features.py))**
   - Computes **28 strictly pre-match rolling features** chronologically with zero lookahead data leakage:
     - Dynamic Club Elo Ratings, Elo Differentials & 5-Match Elo Momentum
     - Rolling 5-match & 10-match Points Per Game (PPG)
     - Rolling Goals Scored (`GF`), Goals Conceded (`GA`), Expected Goals (`xG`), and Expected Goals Conceded (`xGA`)
     - Venue-specific Home & Road scoring/conceding rates
     - Shots/90, Shots on Target/90, Corners/90, Possession %, Clean Sheet %, and BTTS %
     - Head-to-Head (`H2H`) historical win dominance and average goal margin
2. **Tree-Based 1X2 Classifiers ([`backend/ml/predictor.py`](backend/ml/predictor.py))**
   - **XGBoost Classifier (`XGBClassifier`)** — `multi:softprob` objective capturing non-linear feature interactions
   - **Random Forest Classifier (`RandomForestClassifier`)** — 260 bagged trees reducing prediction variance
3. **Dixon-Coles Bivariate Poisson + Monte Carlo Simulator**
   - Estimates club expected goals ($\lambda_{\text{home}}, \lambda_{\text{away}}$) with low-score correlation adjustment ($\rho = -0.085$)
   - Generates a **7×7 Exact Scoreline Probability Heatmap** (`0-0` to `6-6`), Top 6 most likely scorelines, Over/Under 1.5/2.5/3.5 markets, BTTS probabilities, and 90-minute **Simulated Match Statistics** (xG, Possession, Shots, SOT, Big Chances, Corners, Fouls, Cards, 15-minute Goal Timeline).
4. **Live Data Sync Engine ([`backend/data_loader.py`](backend/data_loader.py))**
   - Auto-syncs live data from `football-data.co.uk` on boot and on demand via the **Sync Data** button.
   - Updates completed current season fixtures and merges them into `backend/data/historical_matches.csv` (over 6,000 real matches indexed).

---

## 🚀 Quickstart (Local Development)

### 1. Activate Environment & Install Dependencies
```bash
conda activate machinelearning
pip install -r requirements.txt
```

### 2. Run the Application Server
```bash
uvicorn backend.main:app --reload --port 8000
```
Open **[http://localhost:8000](http://localhost:8000)** in your browser. Interactive Swagger API docs are available at **[http://localhost:8000/docs](http://localhost:8000/docs)**.

---

## 🐳 Docker Setup

### Option 1: Docker Compose (Recommended)
```bash
docker compose up --build
```
Access the application at **[http://localhost:8000](http://localhost:8000)**.

### Option 2: Docker CLI
```bash
# Build the container image
docker build -t pitchoracle:latest .

# Run container (maps host port 8000 to container port 8000)
docker run -d -p 8000:8000 --name pitchoracle_app pitchoracle:latest
```

---

## 🌐 Deploy Live

### Deploy to Render (Blueprint)
1. Fork or push this repository to your GitHub account.
2. Sign in to [Render.com](https://render.com) and click **New +** -> **Blueprint**.
3. Select your repository. Render automatically reads [`render.yaml`](render.yaml) and deploys the web service.

### Deploy to Railway
```bash
railway init
railway up
```

### Deploy to Fly.io
```bash
fly launch
fly deploy
```

---

## 📦 Pushing to GitHub

To push this repository to your own GitHub account:

```bash
# 1. Add your GitHub repository as the remote origin
git remote add origin https://github.com/<your-username>/<your-repo-name>.git

# 2. Rename branch to main (if not already main)
git branch -M main

# 3. Push all commits and branches
git push -u origin main
```
