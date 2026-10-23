# ⚽ PitchOracle AI — Football Match Forecaster & Score Predictor

A full-stack Machine Learning & Statistical Match Forecasting platform covering **Europe's 6 Major Competitions**:
- 🏴󠁧󠁢󠁥󠁮󠁧󠁿 **Premier League** (`PL`)
- 🇪🇸 **La Liga** (`PD`)
- 🇩🇪 **Bundesliga** (`BL1`)
- 🇮🇹 **Serie A** (`SA`)
- 🇫🇷 **Ligue 1** (`FL1`)
- 🇪🇺 **UEFA Champions League** (`CL`)

---

## 🧠 Hybrid ML & Statistical Architecture

PitchOracle blends **Gradient Boosted Decision Trees**, **Random Forests**, and a **Dixon-Coles Adjusted Bivariate Poisson + 10,000x Monte Carlo Simulator**:

1. **Feature Engineering Engine ([`backend/ml/features.py`](backend/ml/features.py))**
   - Computes **28 strictly pre-match features** chronologically with zero data leakage:
     - Dynamic Club Elo Ratings, Elo Differentials & 5-Match Elo Momentum
     - Rolling 5-match & 10-match Points Per Game (PPG)
     - Rolling Goals Scored (`GF`), Goals Conceded (`GA`), Expected Goals (`xG`), and Expected Goals Conceded (`xGA`)
     - Venue-specific Home & Road scoring/conceding rates
     - Shots/90, Shots on Target/90, Corners/90, Possession %, Clean Sheet %, and BTTS %
     - Head-to-Head (`H2H`) historical win dominance and goal differential
2. **Tree-Based 1X2 Classifiers ([`backend/ml/predictor.py`](backend/ml/predictor.py))**
   - **XGBoost Classifier (`XGBClassifier`)** — `multi:softprob` objective capturing non-linear feature interactions
   - **Random Forest Classifier (`RandomForestClassifier`)** — 260 bagged trees reducing variance across close matchups
3. **Dixon-Coles Bivariate Poisson + 10,000x Monte Carlo Simulator**
   - Estimates club expected goals ($\lambda_{\text{home}}, \lambda_{\text{away}}$) with low-score correlation adjustment ($\rho = -0.085$)
   - Generates a **7×7 Exact Scoreline Probability Heatmap** (`0-0` to `6-6`), Top 6 most likely scorelines, Over/Under 1.5/2.5/3.5 markets, BTTS probabilities, and 90-minute **Simulated Match Statistics** (xG, Possession, Shots, SOT, Big Chances, Corners, Fouls, Cards, 15-minute Goal Timeline).

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

## 🌐 Deploying Live & Pushing to GitHub

### Push to GitHub
```bash
git init
git add .
git commit -m "feat: initial release of PitchOracle Football Match Forecaster & Score Predictor"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

### Deploy Live (Render / Railway / Fly.io / Hugging Face Spaces)
- **Render (1-Click Blueprint)**: Connect your GitHub repository to [Render.com](https://render.com) — [`render.yaml`](render.yaml) automatically configures the Python web service.
- **Docker**: Build and run anywhere using the included [`Dockerfile`](Dockerfile):
  ```bash
  docker build -t pitchoracle .
  docker run -p 8000:8000 pitchoracle
  ```
