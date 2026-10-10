export interface ProjectFile {
  name: string;
  path: string;
  language: string;
  description: string;
  content: string;
}

export const PYTHON_PROJECT_FILES: ProjectFile[] = [
  {
    name: 'app.py',
    path: 'app.py',
    language: 'python',
    description: 'Main Streamlit web application providing tabs for Dashboard, Transactions CRUD, Budgets, Multi-model Forecasting, and Statistical Outlier Insights.',
    content: `"""
Personal Finance Tracker with Forecasting & Statistical Insights
Portfolio Project built with Streamlit, SQLite, pandas, statsmodels, scikit-learn, and Plotly.
"""

from datetime import date, datetime
import io
import os
import sqlite3
import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

from db import (
    DEFAULT_DB_PATH,
    add_category,
    add_transaction,
    delete_transaction,
    get_budget_vs_actual,
    get_categories,
    get_connection,
    get_monthly_spending_series,
    get_transactions_df,
    init_db,
    set_budget,
    update_transaction,
)
from forecasting import (
    MATH_EXPLANATIONS,
    evaluate_and_compare_models,
    prepare_monthly_series,
)
from generate_data import generate_sample_data
from utils import (
    detect_outliers_iqr,
    detect_outliers_zscore,
    export_transactions_to_csv,
    generate_plain_english_summary,
    parse_csv_transactions,
)

st.set_page_config(
    page_title="Personal Finance Tracker & Forecasting",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded",
)

init_db(DEFAULT_DB_PATH)

st.sidebar.title("💰 Finance Tracker")
st.sidebar.caption("Portfolio Project | BS Mathematics Edition")

nav_page = st.sidebar.radio(
    "Navigation",
    [
        "📊 Dashboard & Trends",
        "💳 Transactions Ledger",
        "🎯 Budgets & Alerts",
        "🔮 Time-Series Forecasting",
        "🔍 Outlier & Anomaly Insights",
        "📐 Mathematical Foundations",
    ],
)

if st.sidebar.button("🎲 Generate 18-Mo Sample Data", use_container_width=True):
    with st.spinner("Populating 18 months of realistic transactional data..."):
        generate_sample_data(months_back=18, db_path=DEFAULT_DB_PATH)
        st.sidebar.success("Database populated with 18 months of history!")
        st.rerun()
# (See full file in repository)
`
  },
  {
    name: 'db.py',
    path: 'db.py',
    language: 'python',
    description: 'SQLite database connection handling, parameterized queries, schema definition, and time-series aggregation query builders.',
    content: `"""
Database management module for Personal Finance Tracker.
Uses standard Python sqlite3 with raw parameterized SQL queries.
"""

from datetime import datetime
import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "finance.db")

def get_connection(db_path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db(db_path: str = DEFAULT_DB_PATH) -> None:
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
                color TEXT DEFAULT '#3B82F6'
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL,
                monthly_limit REAL NOT NULL CHECK(monthly_limit >= 0),
                year_month TEXT NOT NULL,
                FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE,
                UNIQUE (category_id, year_month)
            );
        """)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL,
                amount REAL NOT NULL CHECK(amount > 0),
                category_id INTEGER NOT NULL,
                note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT
            );
        """)
        conn.commit()
`
  },
  {
    name: 'forecasting.py',
    path: 'forecasting.py',
    language: 'python',
    description: 'Time series algorithms: Moving Average, OLS Regression, Holt-Winters, ARIMA, holdout validation, MAE/RMSE calculation, and prediction intervals.',
    content: `"""
Forecasting module for Personal Finance Tracker.
Provides time-series forecasting algorithms:
1. Simple Moving Average (SMA)
2. Linear Regression (Ordinary Least Squares - OLS)
3. Holt-Winters Triple Exponential Smoothing
4. ARIMA (AutoRegressive Integrated Moving Average)
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error
try:
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
except ImportError:
    ARIMA = None
    ExponentialSmoothing = None

def evaluate_and_compare_models(series: pd.Series, horizon: int = 3, holdout_size: int = 3):
    total_len = len(series)
    actual_holdout = max(1, min(holdout_size, int(total_len * 0.3)))
    train_split = series.iloc[:-actual_holdout]
    test_split = series.iloc[-actual_holdout:]
    # Computes MAE, RMSE and returns ranked model tournament
`
  },
  {
    name: 'utils.py',
    path: 'utils.py',
    language: 'python',
    description: 'Statistical anomaly detection (Z-score and Tukey IQR), financial narrative text generator, and CSV import/export handlers.',
    content: `"""
Statistical anomaly detection and CSV utilities.
- detect_outliers_zscore: Flags z > 2.0 standard deviations
- detect_outliers_iqr: Flags points beyond Q3 + 1.5 * IQR
- generate_plain_english_summary: Creates narrative diagnostic report
"""
import pandas as pd
import numpy as np

def detect_outliers_zscore(df: pd.DataFrame, threshold: float = 2.0):
    # Calculates category-level z-scores
    pass

def detect_outliers_iqr(df: pd.DataFrame, multiplier: float = 1.5):
    # Computes Tukey upper fence = Q3 + (multiplier * IQR)
    pass
`
  },
  {
    name: 'generate_data.py',
    path: 'generate_data.py',
    language: 'python',
    description: 'Deterministic 18-month transactional simulator populating salary income, recurring bills, variable expenses, seasonal spikes, and deliberate outliers.',
    content: `"""
Generates 18 months of realistic transactional history into SQLite.
"""
from datetime import date, timedelta
import random
from db import add_transaction, get_categories, init_db, set_budget

def generate_sample_data(months_back: int = 18, db_path: str = "finance.db"):
    init_db(db_path)
    # Populates 18 months of realistic transactions
`
  },
  {
    name: 'tests/test_db.py',
    path: 'tests/test_db.py',
    language: 'python',
    description: 'Unit tests testing SQLite table initialization, foreign key constraints, upsert budgets, and transaction CRUD operations.',
    content: `import pytest
from db import init_db, add_transaction, get_transactions_df, delete_transaction

def test_transaction_crud_flow(temp_db):
    # Tests insertion, retrieval, update, and deletion
    pass
`
  },
  {
    name: 'tests/test_forecasting.py',
    path: 'tests/test_forecasting.py',
    language: 'python',
    description: 'Unit tests validating SMA, OLS, Holt-Winters, ARIMA, holdout error evaluation (MAE/RMSE), and outlier detection.',
    content: `import pytest
from forecasting import forecast_moving_average, forecast_linear_regression, evaluate_and_compare_models

def test_evaluate_and_compare_models(sample_monthly_series):
    # Tests tournament output and best model selection
    pass
`
  },
  {
    name: 'requirements.txt',
    path: 'requirements.txt',
    language: 'text',
    description: 'Python package dependencies for Streamlit, statsmodels, scikit-learn, pandas, numpy, and plotly.',
    content: `streamlit>=1.35.0
pandas>=2.2.0
numpy>=1.26.0
statsmodels>=0.14.0
scikit-learn>=1.4.0
plotly>=5.20.0
pytest>=8.0.0
`
  },
  {
    name: 'README.md',
    path: 'README.md',
    language: 'markdown',
    description: 'Complete documentation, mathematical LaTeX equations, architecture blueprint, quickstart guide, and interview defense talking points.',
    content: `# 📈 Personal Finance Tracker with Time-Series Forecasting
A portfolio project for BS Mathematics graduates combining SQLite, Streamlit, and stochastic time-series models.
`
  }
];
