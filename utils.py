"""
Utility module for Personal Finance Tracker.
Includes:
- Statistical Outlier Detection (Z-score & Tukey's IQR)
- Plain-English financial narrative generation
- CSV import parsing & validation
- CSV export serialization
"""

import io
from typing import Any, Dict, List, Optional, Tuple
import numpy as np
import pandas as pd


# ==========================================
# STATISTICAL OUTLIER DETECTION
# ==========================================


def detect_outliers_zscore(
    df: pd.DataFrame, threshold: float = 2.0, min_records: int = 5
) -> pd.DataFrame:
    """
    Detects unusual expenses within each category using Z-score:
    z = (x - mean) / std.
    Flags rows where z > threshold.
    """
    if df.empty or len(df) < min_records:
        empty = df.copy()
        empty["is_outlier"] = False
        empty["outlier_metric"] = 0.0
        empty["outlier_reason"] = ""
        return empty

    expenses = df[df["category_type"] == "expense"].copy()
    if expenses.empty:
        expenses["is_outlier"] = False
        expenses["outlier_metric"] = 0.0
        expenses["outlier_reason"] = ""
        return expenses

    results = []
    # Group by category to detect outliers relative to category peer spending
    for cat_name, group in expenses.groupby("category_name"):
        grp = group.copy()
        if len(grp) < 3:
            grp["is_outlier"] = False
            grp["outlier_metric"] = 0.0
            grp["outlier_reason"] = "Insufficient historical samples"
            results.append(grp)
            continue

        mean = grp["amount"].mean()
        std = grp["amount"].std(ddof=1)

        if std == 0 or np.isnan(std):
            grp["is_outlier"] = False
            grp["outlier_metric"] = 0.0
            grp["outlier_reason"] = "Uniform spending"
        else:
            z_scores = (grp["amount"] - mean) / std
            grp["outlier_metric"] = z_scores.round(2)
            grp["is_outlier"] = z_scores > threshold
            grp["outlier_reason"] = grp.apply(
                lambda row: (
                    f"Z-Score {row['outlier_metric']:.1f}σ (Mean ${mean:.2f}, Std ${std:.2f})"
                    if row["is_outlier"]
                    else ""
                ),
                axis=1,
            )
        results.append(grp)

    return pd.concat(results).sort_values("date", ascending=False)


def detect_outliers_iqr(
    df: pd.DataFrame, multiplier: float = 1.5, min_records: int = 5
) -> pd.DataFrame:
    """
    Detects unusual expenses using Tukey's Fences (IQR):
    IQR = Q3 - Q1
    Upper Fence = Q3 + (multiplier * IQR).
    More robust than Z-score against extreme skewed distributions.
    """
    if df.empty or len(df) < min_records:
        empty = df.copy()
        empty["is_outlier"] = False
        empty["outlier_metric"] = 0.0
        empty["outlier_reason"] = ""
        return empty

    expenses = df[df["category_type"] == "expense"].copy()
    if expenses.empty:
        expenses["is_outlier"] = False
        expenses["outlier_metric"] = 0.0
        expenses["outlier_reason"] = ""
        return expenses

    results = []
    for cat_name, group in expenses.groupby("category_name"):
        grp = group.copy()
        if len(grp) < 4:
            grp["is_outlier"] = False
            grp["outlier_metric"] = 0.0
            grp["outlier_reason"] = "Insufficient samples for quartiles"
            results.append(grp)
            continue

        q1 = grp["amount"].quantile(0.25)
        q3 = grp["amount"].quantile(0.75)
        iqr = q3 - q1
        upper_fence = q3 + (multiplier * iqr)

        grp["outlier_metric"] = (grp["amount"] - upper_fence).round(2)
        grp["is_outlier"] = grp["amount"] > upper_fence
        grp["outlier_reason"] = grp.apply(
            lambda row: (
                f"Exceeds Tukey upper fence ${upper_fence:.2f} (Q3: ${q3:.2f}, IQR: ${iqr:.2f})"
                if row["is_outlier"]
                else ""
            ),
            axis=1,
        )
        results.append(grp)

    return pd.concat(results).sort_values("date", ascending=False)


def generate_plain_english_summary(
    outliers_df: pd.DataFrame, method: str = "Z-Score"
) -> str:
    """Creates an easy-to-read executive summary of flagged transactions."""
    flagged = outliers_df[outliers_df["is_outlier"]]
    if flagged.empty:
        return f"✅ No unusual spending detected using the {method} method. Your expenditures are consistent with your historical baseline."

    count = len(flagged)
    total_anom = flagged["amount"].sum()
    top_item = flagged.sort_values("amount", ascending=False).iloc[0]

    lines = [
        f"⚠️ **Detected {count} unusual transaction{'s' if count > 1 else ''}** totaling **${total_anom:,.2f}** via {method} analysis.",
        f"• Largest anomaly: **${top_item['amount']:,.2f}** in *{top_item['category_name']}* on {top_item['date']} "
        f"({top_item['note'] or 'No note'}). Reason: {top_item['outlier_reason']}.",
    ]

    if count > 1:
        categories_flagged = flagged["category_name"].unique()
        lines.append(
            f"• Affected categories: {', '.join(categories_flagged)}."
        )

    return "\n\n".join(lines)


# ==========================================
# CSV IMPORT / EXPORT UTILITIES
# ==========================================


def parse_csv_transactions(
    csv_file: io.BytesIO,
) -> Tuple[List[Dict[str, Any]], List[str]]:
    """
    Parses an uploaded CSV file.
    Expected headers: date, amount, category, note (or category_name).
    Returns (valid_records, error_messages).
    """
    errors = []
    valid_records = []

    try:
        df = pd.read_csv(csv_file)
    except Exception as e:
        return [], [f"Failed to parse CSV file: {str(e)}"]

    # Normalize column names to lowercase and strip whitespace
    df.columns = df.columns.str.strip().str.lower()

    required_cols = {"date", "amount", "category"}
    if not required_cols.issubset(set(df.columns)):
        return [], [
            f"CSV missing mandatory columns. Found {list(df.columns)}, need: date, amount, category, [note]"
        ]

    for idx, row in df.iterrows():
        row_num = idx + 2  # 1-indexed header is line 1
        try:
            # Validate date format YYYY-MM-DD
            date_val = str(row["date"]).strip()
            pd.to_datetime(date_val)  # validates parseable date

            amount_val = float(row["amount"])
            if amount_val <= 0:
                errors.append(f"Row {row_num}: Amount must be positive (> 0).")
                continue

            category_val = str(row["category"]).strip()
            if not category_val:
                errors.append(f"Row {row_num}: Category cannot be empty.")
                continue

            note_val = str(row.get("note", "")).strip()
            if pd.isna(note_val) or note_val == "nan":
                note_val = ""

            valid_records.append(
                {
                    "date": date_val,
                    "amount": amount_val,
                    "category": category_val,
                    "note": note_val,
                }
            )
        except Exception as err:
            errors.append(f"Row {row_num}: Invalid data ({str(err)})")

    return valid_records, errors


def export_transactions_to_csv(df: pd.DataFrame) -> str:
    """Exports clean DataFrame to CSV string."""
    export_df = df[
        ["date", "amount", "category_name", "category_type", "note"]
    ].copy()
    export_df.columns = ["date", "amount", "category", "type", "note"]
    return export_df.to_csv(index=False)
