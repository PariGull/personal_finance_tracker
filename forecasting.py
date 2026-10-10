"""
Forecasting module for Personal Finance Tracker.
Provides time-series forecasting algorithms:
1. Moving Average (SMA)
2. Linear Regression (Ordinary Least Squares - OLS)
3. Holt-Winters Exponential Smoothing (Trend & Seasonality)
4. ARIMA (AutoRegressive Integrated Moving Average)

Includes:
- Train/Test Holdout Evaluation
- MAE and RMSE metrics computation
- Automatic model ranking & best model selection
- Prediction intervals (Confidence intervals)
- Mathematical equations & explanations for interview prep
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error

try:
    from statsmodels.tsa.arima.model import ARIMA
    from statsmodels.tsa.holtwinters import ExponentialSmoothing
except ImportError:
    ARIMA = None  # type: ignore
    ExponentialSmoothing = None  # type: ignore


@dataclass
class ForecastResult:
    model_name: str
    future_dates: List[str]  # e.g. ['2026-10', '2026-11', '2026-12']
    predictions: List[float]
    lower_bound: List[float]
    upper_bound: List[float]
    mae: Optional[float] = None
    rmse: Optional[float] = None
    notes: str = ""


# ==========================================
# MATHEMATICAL EXPLANATIONS REPOSITORY
# ==========================================

MATH_EXPLANATIONS = {
    "moving_average": {
        "title": "Simple Moving Average (SMA)",
        "formula": r"\hat{y}_{T+h} = \frac{1}{k} \sum_{i=0}^{k-1} y_{T-i}",
        "concept": (
            "Projects future values as the unweighted arithmetic mean of the most recent k observations. "
            "It smooths out high-frequency noise and short-term volatility. "
            "Residual variance s_e^2 is computed on historical fits, producing a 95% confidence interval of "
            r"\hat{y} \pm 1.96 \cdot s_e \sqrt{1 + \frac{1}{k}}."
        ),
        "pros": "Simple, robust against single-point overfitting, requires zero training iterations.",
        "cons": "Lags behind strong trends; assigns equal weight to old and recent observations within the window.",
    },
    "linear_regression": {
        "title": "Ordinary Least Squares (OLS) Linear Trend",
        "formula": r"y_t = \beta_0 + \beta_1 t + \epsilon_t, \quad \hat{\beta}_1 = \frac{\sum (t - \bar{t})(y_t - \bar{y})}{\sum (t - \bar{t})^2}",
        "concept": (
            "Models spending as a deterministic linear function of elapsed time t. "
            "Minimizes the sum of squared residuals: SSR = \sum (y_t - \hat{y}_t)^2. "
            "The prediction interval accounts for both parameter estimation variance and future shock variance: "
            r"\hat{y}_h \pm t_{crit} \cdot s_e \sqrt{1 + \frac{1}{n} + \frac{(t_h - \bar{t})^2}{\sum (t_i - \bar{t})^2}}."
        ),
        "pros": "Captures sustained spending increases or decreases over time; closed-form analytic solution.",
        "cons": "Assumes constant slope forever; vulnerable to outlier lever points.",
    },
    "holt_winters": {
        "title": "Holt-Winters Triple Exponential Smoothing",
        "formula": (
            r"\ell_t = \alpha(y_t - s_{t-m}) + (1-\alpha)(\ell_{t-1} + b_{t-1})"
            "\n"
            r"b_t = \beta(\ell_t - \ell_{t-1}) + (1-\beta)b_{t-1}"
            "\n"
            r"s_t = \gamma(y_t - \ell_t) + (1-\gamma)s_{t-m}"
        ),
        "concept": (
            "Decomposes time series into three components: baseline level (ℓ_t), linear trend (b_t), and periodic seasonality (s_t). "
            "Parameters α, β, and γ ∈ [0, 1] control exponential decay weighting, where recent observations carry exponentially higher weights. "
            r"Forecast equation: \hat{y}_{t+h} = \ell_t + h b_t + s_{t - m + (h \bmod m)}."
        ),
        "pros": "Adaptively models both trending behavior and recurring annual or cyclical monthly spending spikes (e.g. holidays).",
        "cons": "Requires at least 2 full seasonal cycles (≥24 months for monthly seasonality), otherwise collapses gracefully to Holt's Linear (α, β).",
    },
    "arima": {
        "title": "ARIMA(p, d, q) Model",
        "formula": r"\phi(B)(1 - B)^d y_t = c + \theta(B)\epsilon_t",
        "concept": (
            "Stands for AutoRegressive (p) Integrated (d) Moving Average (q). "
            "First renders non-stationary series stationary via d-th order differencing (1 - B)^d. "
            "The AR(p) term models current values as a linear combination of p past lags. "
            "The MA(q) term models shocks as linear combinations of q past white noise errors ε_t. "
            "Fitted via Maximum Likelihood Estimation (MLE) with analytical prediction error variance."
        ),
        "pros": "Gold standard mathematical framework for stationary and difference-stationary stochastic processes.",
        "cons": "Sensitive to sample size; small monthly series (<12 points) may experience convergence issues or overfitting.",
    },
}


# ==========================================
# TIME-SERIES PREPROCESSING
# ==========================================


def prepare_monthly_series(df: pd.DataFrame) -> pd.Series:
    """
    Ensures a continuous monthly index with missing months imputed with 0.
    Input df requires columns: ['year_month', 'amount'].
    Returns a pandas Series with monthly DatetimeIndex.
    """
    if df.empty:
        return pd.Series(dtype=float)

    temp = df.copy()
    temp["ds"] = pd.to_datetime(temp["year_month"] + "-01")
    temp = temp.sort_values("ds").set_index("ds")

    # Generate complete monthly date range
    full_idx = pd.date_range(
        start=temp.index.min(), end=temp.index.max(), freq="MS"
    )
    series = temp["amount"].reindex(full_idx, fill_value=0.0)
    series.name = "amount"
    return series


def generate_future_month_labels(
    last_date: pd.Timestamp, horizon: int
) -> List[str]:
    """Generates future month strings ['YYYY-MM', ...] for h steps."""
    future_dates = []
    current = last_date
    for _ in range(horizon):
        # Move forward one month
        if current.month == 12:
            current = pd.Timestamp(year=current.year + 1, month=1, day=1)
        else:
            current = pd.Timestamp(
                year=current.year, month=current.month + 1, day=1
            )
        future_dates.append(current.strftime("%Y-%m"))
    return future_dates


# ==========================================
# FORECAST IMPLEMENTATIONS
# ==========================================


def forecast_moving_average(
    train: pd.Series, horizon: int = 3, window: int = 3
) -> Tuple[List[float], List[float], List[float]]:
    """Simple Moving Average with residual standard error prediction intervals."""
    k = min(window, len(train))
    if k <= 0:
        return [0.0] * horizon, [0.0] * horizon, [0.0] * horizon

    val = float(train.iloc[-k:].mean())
    preds = [max(0.0, val)] * horizon

    # Calculate empirical residual variance on train
    rolling = train.rolling(window=k).mean().shift(1)
    residuals = train - rolling
    clean_res = residuals.dropna()
    std_err = float(clean_res.std()) if len(clean_res) > 1 else (val * 0.15)
    std_err = max(std_err, 5.0)

    # 95% Confidence bounds (z = 1.96)
    lower = [max(0.0, round(p - 1.96 * std_err, 2)) for p in preds]
    upper = [round(p + 1.96 * std_err, 2) for p in preds]
    return [round(p, 2) for p in preds], lower, upper


def forecast_linear_regression(
    train: pd.Series, horizon: int = 3
) -> Tuple[List[float], List[float], List[float]]:
    """Ordinary Least Squares Linear Regression over time index."""
    n = len(train)
    if n < 2:
        return forecast_moving_average(train, horizon, window=1)

    X = np.arange(n).reshape(-1, 1)
    y = train.values

    model = LinearRegression()
    model.fit(X, y)

    X_future = np.arange(n, n + horizon).reshape(-1, 1)
    raw_preds = model.predict(X_future)
    preds = [max(0.0, float(p)) for p in raw_preds]

    # Residual standard error calculation
    y_fitted = model.predict(X)
    residuals = y - y_fitted
    deg_freedom = max(1, n - 2)
    s_err = np.sqrt(np.sum(residuals**2) / deg_freedom)

    # Standard error of forecast at step h
    x_mean = np.mean(X)
    denom = np.sum((X - x_mean) ** 2) if np.sum((X - x_mean) ** 2) > 0 else 1.0

    lower = []
    upper = []
    for x_h, p in zip(X_future.flatten(), preds):
        se_h = s_err * np.sqrt(1 + (1 / n) + ((x_h - x_mean) ** 2 / denom))
        lower.append(max(0.0, round(p - 1.96 * se_h, 2)))
        upper.append(round(p + 1.96 * se_h, 2))

    return [round(p, 2) for p in preds], lower, upper


def forecast_holt_winters(
    train: pd.Series, horizon: int = 3
) -> Tuple[List[float], List[float], List[float]]:
    """Holt-Winters / Exponential Smoothing with automatic fallback."""
    n = len(train)
    if n < 4 or ExponentialSmoothing is None:
        return forecast_linear_regression(train, horizon)

    try:
        # If we have 24+ months, can use monthly seasonal (m=12)
        if n >= 24:
            model = ExponentialSmoothing(
                train,
                trend="add",
                seasonal="add",
                seasonal_periods=12,
                initialization_method="estimated",
            ).fit()
        elif n >= 6:
            # Holt's linear trend without seasonal cycle
            model = ExponentialSmoothing(
                train,
                trend="add",
                seasonal=None,
                initialization_method="estimated",
            ).fit()
        else:
            model = ExponentialSmoothing(
                train,
                trend=None,
                seasonal=None,
                initialization_method="estimated",
            ).fit()

        raw_preds = model.forecast(horizon)
        preds = [max(0.0, float(p)) for p in raw_preds]

        # Residual spread
        fitted = model.fittedvalues
        residuals = train - fitted
        std_err = float(residuals.std()) if len(residuals) > 1 else 25.0

        lower = [max(0.0, round(p - 1.96 * std_err, 2)) for p in preds]
        upper = [round(p + 1.96 * std_err, 2) for p in preds]
        return [round(p, 2) for p in preds], lower, upper
    except Exception:
        # Fallback cleanly to linear regression if optimization diverges
        return forecast_linear_regression(train, horizon)


def forecast_arima(
    train: pd.Series, horizon: int = 3, order: Tuple[int, int, int] = (1, 1, 1)
) -> Tuple[List[float], List[float], List[float]]:
    """ARIMA model with analytical confidence intervals."""
    n = len(train)
    if n < 5 or ARIMA is None:
        return forecast_moving_average(train, horizon)

    try:
        model = ARIMA(train, order=order)
        fitted = model.fit()
        forecast_res = fitted.get_forecast(steps=horizon)

        preds = [max(0.0, float(p)) for p in forecast_res.predicted_mean]
        conf_int = forecast_res.conf_int(alpha=0.05)

        lower = [
            max(0.0, round(float(row[0]), 2))
            for _, row in conf_int.iterrows()
        ]
        upper = [round(float(row[1]), 2) for _, row in conf_int.iterrows()]
        return [round(p, 2) for p in preds], lower, upper
    except Exception:
        # If ARIMA fails to invert matrix or converge on small samples, fallback to Holt-Winters
        return forecast_holt_winters(train, horizon)


# ==========================================
# MODEL EVALUATION & COMPARISON SUITE
# ==========================================


def evaluate_and_compare_models(
    series: pd.Series,
    horizon: int = 3,
    holdout_size: int = 3,
) -> Dict[str, Any]:
    """
    Splits series into train & test sets (hold-out validation),
    evaluates Moving Average, Linear Regression, Holt-Winters, and ARIMA,
    computes MAE and RMSE, and automatically selects the champion model.

    Also fits each model on the full dataset to generate true future forecasts.
    """
    total_len = len(series)
    if total_len < 4:
        raise ValueError("Need at least 4 monthly data points for time-series forecasting.")

    # Bound holdout size to at most 30% of data or min 1
    actual_holdout = max(1, min(holdout_size, int(total_len * 0.3)))
    train_split = series.iloc[:-actual_holdout]
    test_split = series.iloc[-actual_holdout:]

    models = {
        "Moving Average (k=3)": (
            lambda tr, h: forecast_moving_average(tr, h, window=3)
        ),
        "Linear Regression (OLS)": forecast_linear_regression,
        "Holt-Winters": forecast_holt_winters,
        "ARIMA (1,1,1)": forecast_arima,
    }

    comparison_records: List[Dict[str, Any]] = []
    future_results: Dict[str, ForecastResult] = {}
    future_dates = generate_future_month_labels(series.index[-1], horizon)

    for name, forecast_fn in models.items():
        # 1. Validation phase on holdout
        val_preds, _, _ = forecast_fn(train_split, actual_holdout)
        val_preds_arr = np.array(val_preds[:actual_holdout])
        actual_arr = test_split.values

        mae = float(mean_absolute_error(actual_arr, val_preds_arr))
        rmse = float(np.sqrt(mean_squared_error(actual_arr, val_preds_arr)))

        # 2. Production forecast on full series
        fut_preds, lower_b, upper_b = forecast_fn(series, horizon)

        res = ForecastResult(
            model_name=name,
            future_dates=future_dates,
            predictions=fut_preds,
            lower_bound=lower_b,
            upper_bound=upper_b,
            mae=round(mae, 2),
            rmse=round(rmse, 2),
        )
        future_results[name] = res

        comparison_records.append(
            {
                "Model": name,
                "MAE ($)": round(mae, 2),
                "RMSE ($)": round(rmse, 2),
                "Holdout Months Tested": actual_holdout,
            }
        )

    # Sort by RMSE ascending to identify best model
    comp_df = pd.DataFrame(comparison_records).sort_values("RMSE ($)")
    best_model_name = comp_df.iloc[0]["Model"]

    return {
        "comparison_table": comp_df,
        "best_model_name": best_model_name,
        "results": future_results,
        "holdout_actuals": test_split.tolist(),
        "holdout_dates": [d.strftime("%Y-%m") for d in test_split.index],
        "future_dates": future_dates,
    }
