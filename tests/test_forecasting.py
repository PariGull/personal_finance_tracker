"""
Unit tests for forecasting models, evaluation metrics, and outlier detection.
"""

import numpy as np
import pandas as pd
import pytest
from forecasting import (
    evaluate_and_compare_models,
    forecast_arima,
    forecast_holt_winters,
    forecast_linear_regression,
    forecast_moving_average,
    prepare_monthly_series,
)
from utils import detect_outliers_iqr, detect_outliers_zscore


@pytest.fixture
def sample_monthly_series():
    """Generates 18 months of synthetic spending data with slight upward trend."""
    dates = pd.date_range("2025-01-01", periods=18, freq="MS")
    # Base 500 + 15*t + noise
    np.random.seed(42)
    values = [500 + 15 * i + np.random.normal(0, 20) for i in range(18)]
    series = pd.Series(values, index=dates)
    return series


def test_prepare_monthly_series():
    """Test monthly series preparation and missing month zero-filling."""
    df = pd.DataFrame(
        {
            "year_month": ["2026-01", "2026-03"],  # Missing 2026-02
            "amount": [250.0, 300.0],
        }
    )
    series = prepare_monthly_series(df)
    assert len(series) == 3
    assert series.iloc[1] == 0.0  # Imputed February with 0
    assert series.iloc[0] == 250.0
    assert series.iloc[2] == 300.0


def test_moving_average_forecast(sample_monthly_series):
    """Test Moving Average generates valid non-negative forecasts and intervals."""
    preds, lower, upper = forecast_moving_average(
        sample_monthly_series, horizon=3, window=3
    )
    assert len(preds) == 3
    assert len(lower) == 3
    assert len(upper) == 3
    assert all(p > 0 for p in preds)
    assert all(l <= p for l, p in zip(lower, preds))
    assert all(p <= u for p, u in zip(preds, upper))


def test_linear_regression_forecast(sample_monthly_series):
    """Test OLS Linear Regression predictions and intervals."""
    preds, lower, upper = forecast_linear_regression(
        sample_monthly_series, horizon=3
    )
    assert len(preds) == 3
    assert preds[0] < preds[2]  # Should reflect positive trend
    assert all(l <= p for l, p in zip(lower, preds))
    assert all(p <= u for p, u in zip(preds, upper))


def test_holt_winters_forecast(sample_monthly_series):
    """Test Holt-Winters exponential smoothing runs smoothly."""
    preds, lower, upper = forecast_holt_winters(
        sample_monthly_series, horizon=3
    )
    assert len(preds) == 3
    assert all(p > 0 for p in preds)
    assert all(l <= u for l, u in zip(lower, upper))


def test_arima_forecast(sample_monthly_series):
    """Test ARIMA model forecasts."""
    preds, lower, upper = forecast_arima(
        sample_monthly_series, horizon=3, order=(1, 1, 1)
    )
    assert len(preds) == 3
    assert all(p > 0 for p in preds)
    assert all(l <= u for l, u in zip(lower, upper))


def test_evaluate_and_compare_models(sample_monthly_series):
    """Test model comparison suite ranks models and outputs MAE/RMSE."""
    res = evaluate_and_compare_models(
        sample_monthly_series, horizon=3, holdout_size=3
    )
    comp_table = res["comparison_table"]
    assert len(comp_table) == 4
    assert "MAE ($)" in comp_table.columns
    assert "RMSE ($)" in comp_table.columns
    assert res["best_model_name"] in comp_table["Model"].values
    assert len(res["results"]) == 4


def test_outlier_detection_zscore_and_iqr():
    """Test outlier detection flags artificially injected extreme spike."""
    data = []
    # 10 normal transactions around $50
    for i in range(10):
        data.append(
            {
                "id": i + 1,
                "date": f"2026-09-0{i+1}",
                "amount": 50.0 + (i % 3) * 5,
                "category_name": "Groceries",
                "category_type": "expense",
                "note": "Regular",
            }
        )
    # 1 extreme outlier spike
    data.append(
        {
            "id": 11,
            "date": "2026-09-15",
            "amount": 450.0,
            "category_name": "Groceries",
            "category_type": "expense",
            "note": "Bulk Purchase Spike",
        }
    )
    df = pd.DataFrame(data)

    z_res = detect_outliers_zscore(df, threshold=2.0)
    flagged_z = z_res[z_res["is_outlier"]]
    assert len(flagged_z) == 1
    assert flagged_z.iloc[0]["id"] == 11

    iqr_res = detect_outliers_iqr(df, multiplier=1.5)
    flagged_iqr = iqr_res[iqr_res["is_outlier"]]
    assert len(flagged_iqr) == 1
    assert flagged_iqr.iloc[0]["id"] == 11
