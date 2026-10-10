# 📈 Personal Finance Tracker with Time-Series Forecasting

A full-stack financial analytics and forecasting dashboard built with **Python 3.11+**, **Streamlit**, **SQLite (sqlite3)**, **pandas**, **statsmodels**, **scikit-learn**, and **Plotly**.

Designed as a **BS Mathematics** capstone portfolio project demonstrating practical applications of time-series stochastic modeling, parametric & non-parametric outlier detection, and relational SQL schema design.

---

## 🌟 Key Features

1. **Transaction Ledger & CRUD**:
   - Create, Read, Update, and Delete income and expense transactions.
   - Parameterized SQL queries preventing SQL injection.
   - Categorized tagging, transaction dates, and custom notes.
2. **Category Budgets & Threshold Warnings**:
   - Dynamic monthly target limits per category.
   - Visual progress indicators with multi-tiered status alerts:
     - 🟢 On Track (< 80% used)
     - 🟡 Near Budget Warning (80% - 100% used)
     - 🔴 Over Budget Alert (> 100% used)
3. **Interactive Macro Dashboard**:
   - Monthly Key Performance Indicators: Total Income, Total Expenses, Net Savings, and Savings Rate (%).
   - Interactive Plotly visualizations: Category Donut chart and Multi-month Income vs. Expense trend lines.
4. **CSV Import & Export**:
   - Two-way data migration with data validation and error diagnostics.
5. **Multi-Model Forecasting Engine**:
   - 1 to 3 months forward projections for total expenses or category-specific spending.
   - Implements 4 distinct mathematical models:
     - **Simple Moving Average (SMA)**
     - **Ordinary Least Squares (OLS) Linear Trend**
     - **Holt-Winters Triple Exponential Smoothing**
     - **ARIMA (AutoRegressive Integrated Moving Average)**
   - Hold-out validation on past test months computing **Mean Absolute Error (MAE)** and **Root Mean Squared Error (RMSE)**.
   - Automated model selection picking the champion model with the lowest test error.
   - 95% Confidence Interval ribbons on interactive charts.
   - Expandable "How It Works" math documentation featuring formatted formulas.
6. **Statistical Anomaly & Outlier Detection**:
   - **Parametric**: Z-Score test ($z = \frac{x - \mu}{\sigma} > 2.0\sigma$).
   - **Non-Parametric**: Tukey's Interquartile Range Fences ($\text{Upper Fence} = Q_3 + 1.5 \times \text{IQR}$).
   - Automated plain-English executive summary diagnosing spending spikes.

---

## 📁 Project Architecture

```
finance-tracker/
├── app.py                # Main Streamlit web application & UI tabs
├── db.py                 # SQLite database schema, connections, and parameterized SQL queries
├── forecasting.py        # Time-series models (SMA, OLS, Holt-Winters, ARIMA), MAE/RMSE evaluation
├── utils.py              # Statistical outlier detection (Z-score & IQR), narrative generator, CSV parser
├── generate_data.py      # Synthetic generator for 18 months of realistic transactional history
├── requirements.txt      # Python dependencies
├── README.md             # Project documentation, mathematical formulas, and interview notes
└── tests/
    ├── test_db.py          # Unit tests for SQLite CRUD and constraints
    └── test_forecasting.py # Unit tests for forecasting algorithms and anomaly detection
```

---

## 🗄️ Relational Database Schema (SQLite)

```sql
-- 1. Categories Table
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    color TEXT DEFAULT '#3B82F6'
);

-- 2. Budgets Table
CREATE TABLE budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    monthly_limit REAL NOT NULL CHECK(monthly_limit >= 0),
    year_month TEXT NOT NULL, -- Format 'YYYY-MM'
    FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE,
    UNIQUE (category_id, year_month)
);

-- 3. Transactions Table
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, -- Format 'YYYY-MM-DD'
    amount REAL NOT NULL CHECK(amount > 0),
    category_id INTEGER NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT
);

-- Performance Indexes
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_transactions_category ON transactions(category_id);
CREATE INDEX idx_budgets_year_month ON budgets(year_month);
```

---

## 📐 Mathematical Formulations

### 1. Simple Moving Average (SMA)
$$\hat{y}_{T+h} = \frac{1}{k} \sum_{i=0}^{k-1} y_{T-i}$$
- **Prediction Interval (95%)**: $\hat{y} \pm 1.96 \cdot s_e \sqrt{1 + \frac{1}{k}}$

### 2. Ordinary Least Squares (OLS) Linear Trend
$$y_t = \beta_0 + \beta_1 t + \epsilon_t$$
$$\hat{\beta}_1 = \frac{\sum (t - \bar{t})(y_t - \bar{y})}{\sum (t - \bar{t})^2}, \quad \hat{\beta}_0 = \bar{y} - \hat{\beta}_1 \bar{t}$$
- **Forecast Standard Error**: $s_e \sqrt{1 + \frac{1}{n} + \frac{(t_h - \bar{t})^2}{\sum (t - \bar{t})^2}}$

### 3. Holt-Winters Triple Exponential Smoothing (Additive)
- **Level**: $\ell_t = \alpha(y_t - s_{t-m}) + (1-\alpha)(\ell_{t-1} + b_{t-1})$
- **Trend**: $b_t = \beta(\ell_t - \ell_{t-1}) + (1-\beta)b_{t-1}$
- **Seasonal**: $s_t = \gamma(y_t - \ell_t) + (1-\gamma)s_{t-m}$
- **Point Forecast**: $\hat{y}_{t+h} = \ell_t + h b_t + s_{t-m + (h \bmod m)}$

### 4. ARIMA$(p, d, q)$ Stochastic Model
$$\phi(B)(1 - B)^d y_t = c + \theta(B)\epsilon_t$$
- Differenced stationary process where $\phi(B)$ models autoregression, $(1-B)^d$ differences non-stationary drift, and $\theta(B)$ smooths moving average shocks.

### 5. Holdout Evaluation Metrics
$$\text{MAE} = \frac{1}{n}\sum_{i=1}^n |y_i - \hat{y}_i|$$
$$\text{RMSE} = \sqrt{\frac{1}{n}\sum_{i=1}^n (y_i - \hat{y}_i)^2}$$

---

## 🚀 Quickstart & Setup Guide

### 1. Prerequisites
- Python 3.11+
- Virtual environment tool (`venv` or `conda`)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/your-username/personal-finance-forecasting.git
cd personal-finance-forecasting

# Create and activate virtual environment
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt
```

### 3. Populate 18-Month Realistic Sample Data
```bash
python generate_data.py
```

### 4. Run the Streamlit Application
```bash
streamlit run app.py
```
Open your browser at `http://localhost:8501`.

### 5. Run Unit Tests
```bash
pytest tests/ -v
```

---

## 📸 Screenshots (Placeholders)

| Dashboard Overview | Forecasting Engine | Outlier Detection |
| :---: | :---: | :---: |
| *[Screenshot: Macro KPI cards & Plotly trends]* | *[Screenshot: ARIMA vs Holt-Winters with 95% CI]* | *[Screenshot: Z-score & Tukey's IQR Anomaly flags]* |

---

## 🔮 5 Recommended Future Extensions

1. **User Authentication & Multi-Tenancy**:
   - Add bcrypt password hashing and session tokens in SQLite / PostgreSQL so multiple family members or users can manage separate accounts.
2. **Recurring Transactions & Scheduled Cron Engine**:
   - Support automated recurring bills (rent, Spotify, subscriptions) with automated monthly insertion triggers.
3. **Automated Bank Sync (Plaid API Integration)**:
   - Connect live bank feeds using Plaid Link to ingest real-time credit card and checking account transactions.
4. **Cloud Deployment on Streamlit Community Cloud / Docker**:
   - Add a `Dockerfile` and one-click deployment configuration for Streamlit Cloud or Google Cloud Run.
5. **Monte Carlo Financial Independence / FIRE Simulation**:
   - Project wealth accumulation, net worth trajectories, and retirement horizons under geometric Brownian motion stochastic market returns.
