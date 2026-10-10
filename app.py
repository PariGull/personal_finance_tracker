"""
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

# Page configuration
st.set_page_config(
    page_title="Personal Finance Tracker & Forecasting",
    page_icon="📈",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Ensure database is initialized
init_db(DEFAULT_DB_PATH)


# ==========================================
# SIDEBAR NAVIGATION & QUICK ACTIONS
# ==========================================

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

st.sidebar.markdown("---")
st.sidebar.subheader("⚙️ Database Controls")

if st.sidebar.button("🎲 Generate 18-Mo Sample Data", use_container_width=True):
    with st.spinner("Populating 18 months of realistic transactional data..."):
        generate_sample_data(months_back=18, db_path=DEFAULT_DB_PATH)
        st.sidebar.success("Database populated with 18 months of history!")
        st.rerun()

st.sidebar.caption("Powered by SQLite, pandas, scikit-learn & statsmodels.")


# ==========================================
# PAGE 1: DASHBOARD & TRENDS
# ==========================================

if nav_page == "📊 Dashboard & Trends":
    st.title("📊 Financial Health & Performance Dashboard")
    st.markdown(
        "Macro financial overview tracking income, expense burns, savings rate, and category distributions."
    )

    all_tx = get_transactions_df(db_path=DEFAULT_DB_PATH)

    if all_tx.empty:
        st.info(
            "Your database is currently empty. Click 'Generate 18-Mo Sample Data' in the sidebar to populate realistic data!"
        )
    else:
        # Month selector
        available_months = sorted(all_tx["year_month"].unique(), reverse=True)
        selected_month = st.selectbox(
            "Select Evaluation Month",
            available_months,
            index=0,
            help="Filter KPIs and category breakdown for a specific billing month.",
        )

        month_tx = all_tx[all_tx["year_month"] == selected_month]
        total_income = month_tx[month_tx["category_type"] == "income"]["amount"].sum()
        total_expense = month_tx[month_tx["category_type"] == "expense"]["amount"].sum()
        net_savings = total_income - total_expense
        savings_rate = (
            (net_savings / total_income * 100) if total_income > 0 else 0.0
        )

        # KPI Metrics Cards
        col1, col2, col3, col4 = st.columns(4)
        col1.metric("Total Income", f"${total_income:,.2f}")
        col2.metric("Total Expenses", f"${total_expense:,.2f}")
        col3.metric(
            "Net Savings",
            f"${net_savings:,.2f}",
            delta=f"${net_savings:,.2f}",
            delta_color="normal" if net_savings >= 0 else "inverse",
        )
        col4.metric(
            "Savings Rate",
            f"{savings_rate:.1f}%",
            delta=f"{savings_rate - 20.0:.1f}% vs 20% target",
        )

        st.markdown("---")

        # Visualizations row
        viz_col1, viz_col2 = st.columns([1, 1])

        with viz_col1:
            st.subheader(f"Spending Breakdown ({selected_month})")
            exp_tx = month_tx[month_tx["category_type"] == "expense"]
            if not exp_tx.empty:
                cat_summary = (
                    exp_tx.groupby(["category_name", "category_color"])["amount"]
                    .sum()
                    .reset_index()
                )
                fig_pie = px.pie(
                    cat_summary,
                    values="amount",
                    names="category_name",
                    hole=0.45,
                    color="category_name",
                    color_discrete_sequence=cat_summary["category_color"].tolist(),
                )
                fig_pie.update_traces(
                    textposition="inside", textinfo="percent+label"
                )
                fig_pie.update_layout(margin=dict(t=20, b=20, l=10, r=10))
                st.plotly_chart(fig_pie, use_container_width=True)
            else:
                st.info("No expense transactions recorded in this month.")

        with viz_col2:
            st.subheader("Monthly Historical Trends (Income vs Expenses)")
            monthly_agg = (
                all_tx.groupby(["year_month", "category_type"])["amount"]
                .sum()
                .reset_index()
            )
            pivot_df = monthly_agg.pivot(
                index="year_month", columns="category_type", values="amount"
            ).fillna(0.0)

            fig_trend = go.Figure()
            if "income" in pivot_df.columns:
                fig_trend.add_trace(
                    go.Scatter(
                        x=pivot_df.index,
                        y=pivot_df["income"],
                        name="Income",
                        mode="lines+markers",
                        line=dict(color="#10B981", width=3),
                    )
                )
            if "expense" in pivot_df.columns:
                fig_trend.add_trace(
                    go.Scatter(
                        x=pivot_df.index,
                        y=pivot_df["expense"],
                        name="Expenses",
                        mode="lines+markers",
                        line=dict(color="#EF4444", width=3),
                    )
                )

            fig_trend.update_layout(
                xaxis_title="Month",
                yaxis_title="Amount ($)",
                legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
                margin=dict(t=30, b=20, l=10, r=10),
            )
            st.plotly_chart(fig_trend, use_container_width=True)


# ==========================================
# PAGE 2: TRANSACTIONS LEDGER
# ==========================================

elif nav_page == "💳 Transactions Ledger":
    st.title("💳 Transactions Ledger & Data Management")
    st.markdown("Record, edit, filter, and import/export your income and expense transactions.")

    categories = get_categories(db_path=DEFAULT_DB_PATH)
    cat_map = {c["name"]: c["id"] for c in categories}

    tab_view, tab_add, tab_io = st.tabs(["📋 View & Filter", "➕ Add Transaction", "📁 CSV Import / Export"])

    with tab_view:
        st.subheader("Transaction History")

        f_col1, f_col2, f_col3 = st.columns(3)
        with f_col1:
            type_filter = st.selectbox(
                "Filter by Type", ["All", "expense", "income"]
            )
        with f_col2:
            cat_filter = st.selectbox(
                "Filter by Category", ["All"] + list(cat_map.keys())
            )
        with f_col3:
            search_note = st.text_input("Search notes/description", "")

        tx_type_param = None if type_filter == "All" else type_filter
        cat_id_param = None if cat_filter == "All" else cat_map[cat_filter]

        df_tx = get_transactions_df(
            category_id=cat_id_param,
            tx_type=tx_type_param,
            db_path=DEFAULT_DB_PATH,
        )

        if search_note:
            df_tx = df_tx[
                df_tx["note"].str.contains(search_note, case=False, na=False)
            ]

        st.caption(f"Showing {len(df_tx)} transaction records.")

        if not df_tx.empty:
            display_cols = ["id", "date", "amount", "category_name", "category_type", "note"]
            st.dataframe(
                df_tx[display_cols].rename(
                    columns={
                        "category_name": "Category",
                        "category_type": "Type",
                        "amount": "Amount ($)",
                        "date": "Date",
                        "note": "Notes",
                    }
                ),
                use_container_width=True,
                height=350,
            )

            # Delete transaction tool
            st.markdown("#### 🗑️ Remove a Transaction")
            del_id = st.number_input(
                "Enter Transaction ID to delete",
                min_value=1,
                step=1,
                key="del_tx_id",
            )
            if st.button("Delete Transaction", type="secondary"):
                if delete_transaction(int(del_id), db_path=DEFAULT_DB_PATH):
                    st.success(f"Transaction #{del_id} deleted successfully.")
                    st.rerun()
                else:
                    st.error(f"Transaction #{del_id} not found.")

    with tab_add:
        st.subheader("➕ Record New Transaction")
        with st.form("add_tx_form", clear_on_submit=True):
            f_date = st.date_input("Transaction Date", date.today())
            f_amt = st.number_input("Amount ($)", min_value=0.01, step=5.0, format="%.2f")
            f_cat = st.selectbox("Category", list(cat_map.keys()))
            f_note = st.text_input("Note / Memo", placeholder="e.g. Trader Joe's groceries")

            submitted = st.form_submit_button("Save Transaction", use_container_width=True)
            if submitted:
                new_id = add_transaction(
                    date=f_date.strftime("%Y-%m-%d"),
                    amount=f_amt,
                    category_id=cat_map[f_cat],
                    note=f_note,
                    db_path=DEFAULT_DB_PATH,
                )
                st.success(f"Transaction recorded with ID #{new_id}!")
                st.rerun()

    with tab_io:
        st.subheader("📁 CSV Export and Import")

        c_exp, c_imp = st.columns(2)
        with c_exp:
            st.markdown("##### 📥 Export to CSV")
            full_df = get_transactions_df(db_path=DEFAULT_DB_PATH)
            if not full_df.empty:
                csv_data = export_transactions_to_csv(full_df)
                st.download_button(
                    label="Download Transactions (.csv)",
                    data=csv_data,
                    file_name="personal_finance_transactions.csv",
                    mime="text/csv",
                    use_container_width=True,
                )
            else:
                st.info("No data available to export.")

        with c_imp:
            st.markdown("##### 📤 Import from CSV")
            st.caption("Requires columns: date, amount, category, [note]")
            uploaded_file = st.file_uploader("Upload CSV File", type=["csv"])
            if uploaded_file is not None:
                records, errors = parse_csv_transactions(uploaded_file)
                if errors:
                    st.error("Validation Errors Encountered:")
                    for err in errors[:5]:
                        st.write(f"- {err}")
                    if len(errors) > 5:
                        st.caption(f"... and {len(errors) - 5} more errors.")
                elif records:
                    st.success(f"Parsed {len(records)} valid transactions.")
                    if st.button("Commit Import to Database", use_container_width=True):
                        imported_cnt = 0
                        for r in records:
                            cat_name = r["category"]
                            if cat_name not in cat_map:
                                new_c_id = add_category(
                                    cat_name, "expense", db_path=DEFAULT_DB_PATH
                                )
                                cat_map[cat_name] = new_c_id
                            add_transaction(
                                r["date"],
                                r["amount"],
                                cat_map[cat_name],
                                r["note"],
                                db_path=DEFAULT_DB_PATH,
                            )
                            imported_cnt += 1
                        st.success(f"Imported {imported_cnt} records successfully!")
                        st.rerun()


# ==========================================
# PAGE 3: BUDGETS & ALERTS
# ==========================================

elif nav_page == "🎯 Budgets & Alerts":
    st.title("🎯 Category Budgets & Spending Limits")
    st.markdown(
        "Establish monthly target budgets per category. Track utilization rates and receive visual threshold warnings."
    )

    all_tx = get_transactions_df(db_path=DEFAULT_DB_PATH)
    available_months = (
        sorted(all_tx["year_month"].unique(), reverse=True)
        if not all_tx.empty
        else [datetime.now().strftime("%Y-%m")]
    )

    selected_month = st.selectbox("Target Budget Month", available_months, index=0)
    budget_df = get_budget_vs_actual(selected_month, db_path=DEFAULT_DB_PATH)

    st.subheader(f"Budget Health for {selected_month}")

    if budget_df.empty:
        st.info("No expense categories found.")
    else:
        for _, row in budget_df.iterrows():
            cat_name = row["category_name"]
            spent = row["actual_spent"]
            limit = row["monthly_limit"]
            pct = row["pct_used"]

            # Progress bar calculation
            norm_pct = min(1.0, spent / limit) if limit > 0 else 0.0

            # Warning status
            if limit == 0:
                badge = "⚪ Unset Budget"
                color_css = "gray"
            elif pct > 100:
                badge = f"🚨 Over Budget by ${spent - limit:,.2f} ({pct}%)"
                color_css = "red"
            elif pct >= 80:
                badge = f"⚠️ Warning: {pct}% Used (${limit - spent:,.2f} remaining)"
                color_css = "orange"
            else:
                badge = f"✅ On Track: {pct}% Used (${limit - spent:,.2f} remaining)"
                color_css = "green"

            with st.container():
                c_lbl, c_stat = st.columns([2, 1])
                c_lbl.markdown(f"**{cat_name}** — Spent: **${spent:,.2f}** / Limit: **${limit:,.2f}**")
                c_stat.markdown(f"**{badge}**")
                st.progress(norm_pct)
                st.write("")

    st.markdown("---")
    st.subheader("⚙️ Set / Modify Monthly Budget Limit")

    expense_cats = get_categories(db_path=DEFAULT_DB_PATH, tx_type="expense")
    exp_map = {c["name"]: c["id"] for c in expense_cats}

    if exp_map:
        with st.form("set_budget_form"):
            b_cat = st.selectbox("Category", list(exp_map.keys()))
            b_limit = st.number_input(
                "Monthly Budget Limit ($)", min_value=10.0, step=50.0, value=300.0
            )
            b_submit = st.form_submit_button("Update Budget", use_container_width=True)

            if b_submit:
                set_budget(
                    exp_map[b_cat],
                    b_limit,
                    selected_month,
                    db_path=DEFAULT_DB_PATH,
                )
                st.success(f"Budget for {b_cat} updated to ${b_limit:,.2f} for {selected_month}!")
                st.rerun()


# ==========================================
# PAGE 4: TIME-SERIES FORECASTING
# ==========================================

elif nav_page == "🔮 Time-Series Forecasting":
    st.title("🔮 Predictive Expense Forecasting")
    st.markdown(
        "Leverage mathematical time-series modeling to project future spending requirements over the next 1 to 3 months."
    )

    categories = get_categories(db_path=DEFAULT_DB_PATH, tx_type="expense")
    cat_options = {"All Expense Categories": None}
    for c in categories:
        cat_options[c["name"]] = c["id"]

    c_cfg1, c_cfg2, c_cfg3 = st.columns(3)
    with c_cfg1:
        target_cat = st.selectbox("Forecasting Target", list(cat_options.keys()))
    with c_cfg2:
        horizon_months = st.slider("Prediction Horizon (Months)", min_value=1, max_value=3, value=3)
    with c_cfg3:
        holdout_k = st.slider("Holdout Validation Months", min_value=1, max_value=4, value=3)

    target_cat_id = cat_options[target_cat]
    raw_series_df = get_monthly_spending_series(
        category_id=target_cat_id, db_path=DEFAULT_DB_PATH
    )

    if len(raw_series_df) < 5:
        st.warning(
            f"Insufficient historical data ({len(raw_series_df)} months found). "
            "Please generate the 18-month sample dataset from the sidebar to test statistical forecasting."
        )
    else:
        series = prepare_monthly_series(raw_series_df)

        try:
            eval_output = evaluate_and_compare_models(
                series, horizon=horizon_months, holdout_size=holdout_k
            )
        except Exception as e:
            st.error(f"Forecasting engine error: {str(e)}")
            st.stop()

        comp_table = eval_output["comparison_table"]
        best_model = eval_output["best_model_name"]
        results_dict = eval_output["results"]
        future_dates = eval_output["future_dates"]

        st.subheader("🏆 Model Tournament & Error Metrics")
        st.caption(
            f"Evaluated on a {holdout_k}-month holdout test set. Ranked by Root Mean Squared Error (RMSE)."
        )

        st.dataframe(comp_table, use_container_width=True)

        st.success(
            f"🌟 **Automated Selection:** `{best_model}` achieved the lowest prediction error on test holdouts!"
        )

        # Model Selector for Chart Display
        model_to_plot = st.radio(
            "Select Model for Chart Inspection",
            list(results_dict.keys()),
            index=list(results_dict.keys()).index(best_model),
            horizontal=True,
        )

        chosen_res = results_dict[model_to_plot]

        # Forecast Visualization Chart
        fig = go.Figure()

        # 1. Historical Actuals
        fig.add_trace(
            go.Scatter(
                x=[d.strftime("%Y-%m") for d in series.index],
                y=series.values,
                name="Historical Actual",
                mode="lines+markers",
                line=dict(color="#1F2937", width=2.5),
            )
        )

        # 2. Future Forecast Line (connecting from last actual point)
        conn_x = [series.index[-1].strftime("%Y-%m")] + chosen_res.future_dates
        conn_y = [series.values[-1]] + chosen_res.predictions

        fig.add_trace(
            go.Scatter(
                x=conn_x,
                y=conn_y,
                name=f"{model_to_plot} Forecast",
                mode="lines+markers",
                line=dict(color="#3B82F6", width=3, dash="dash"),
            )
        )

        # 3. 95% Confidence Interval Band
        fig.add_trace(
            go.Scatter(
                x=chosen_res.future_dates + chosen_res.future_dates[::-1],
                y=chosen_res.upper_bound + chosen_res.lower_bound[::-1],
                fill="toself",
                fillcolor="rgba(59, 130, 246, 0.15)",
                line=dict(color="rgba(255,255,255,0)"),
                hoverinfo="skip",
                name="95% Confidence Interval",
            )
        )

        fig.update_layout(
            title=f"Expenditure Trajectory & Forecast ({target_cat})",
            xaxis_title="Month",
            yaxis_title="Monthly Spending ($)",
            hovermode="x unified",
            legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="right", x=1),
        )
        st.plotly_chart(fig, use_container_width=True)

        # Forecast Projections Table
        st.subheader("📅 Projected Monthly Expenditures")
        proj_df = pd.DataFrame(
            {
                "Projected Month": chosen_res.future_dates,
                "Point Forecast ($)": [f"${p:,.2f}" for p in chosen_res.predictions],
                "Lower 95% Bound ($)": [f"${l:,.2f}" for l in chosen_res.lower_bound],
                "Upper 95% Bound ($)": [f"${u:,.2f}" for u in chosen_res.upper_bound],
            }
        )
        st.dataframe(proj_df, use_container_width=True)

        # Mathematical Deep Dive Expander
        st.markdown("---")
        with st.expander("📖 Mathematical Derivation & How this Model Operates", expanded=True):
            key_lookup = {
                "Moving Average (k=3)": "moving_average",
                "Linear Regression (OLS)": "linear_regression",
                "Holt-Winters": "holt_winters",
                "ARIMA (1,1,1)": "arima",
            }
            spec = MATH_EXPLANATIONS.get(key_lookup.get(model_to_plot, "moving_average"))
            if spec:
                st.markdown(f"#### {spec['title']}")
                st.latex(spec["formula"])
                st.markdown(f"**Mathematical Formulation:** {spec['concept']}")
                st.markdown(f"• **Strengths:** {spec['pros']}")
                st.markdown(f"• **Trade-offs:** {spec['cons']}")


# ==========================================
# PAGE 5: OUTLIER & ANOMALY INSIGHTS
# ==========================================

elif nav_page == "🔍 Outlier & Anomaly Insights":
    st.title("🔍 Spending Anomaly & Outlier Detection")
    st.markdown(
        "Automatically identifies suspicious or non-standard spending behaviors across categories "
        "using rigorous statistical tests (Z-score standard deviation and Tukey's Interquartile Range)."
    )

    all_tx = get_transactions_df(db_path=DEFAULT_DB_PATH)

    if all_tx.empty:
        st.info("No transactions available. Please generate sample data or upload a CSV.")
    else:
        c_m1, c_m2 = st.columns(2)
        with c_m1:
            method = st.radio("Detection Methodology", ["Z-Score (Normal Distribution)", "Tukey's IQR (Non-Parametric)"])
        with c_m2:
            if "Z-Score" in method:
                threshold = st.slider(
                    "Z-Score Sensitivity Threshold (σ)",
                    min_value=1.5,
                    max_value=3.5,
                    value=2.0,
                    step=0.1,
                    help="Flags expenses that deviate by more than k standard deviations from category mean.",
                )
                flagged_df = detect_outliers_zscore(all_tx, threshold=threshold)
            else:
                multiplier = st.slider(
                    "Tukey IQR Multiplier (k)",
                    min_value=1.0,
                    max_value=3.0,
                    value=1.5,
                    step=0.1,
                    help="Flags expenses exceeding Q3 + k * IQR.",
                )
                flagged_df = detect_outliers_iqr(all_tx, multiplier=multiplier)

        st.markdown("### 📝 Plain-English Executive Summary")
        narrative = generate_plain_english_summary(
            flagged_df, method="Z-Score" if "Z-Score" in method else "Tukey's IQR"
        )
        st.info(narrative)

        st.markdown("### 📋 Flagged Anomaly Transactions")
        anomalies_only = flagged_df[flagged_df["is_outlier"]]

        if not anomalies_only.empty:
            st.dataframe(
                anomalies_only[
                    ["date", "amount", "category_name", "note", "outlier_metric", "outlier_reason"]
                ].rename(
                    columns={
                        "date": "Date",
                        "amount": "Amount ($)",
                        "category_name": "Category",
                        "note": "Memo",
                        "outlier_metric": "Metric Deviation",
                        "outlier_reason": "Statistical Trigger",
                    }
                ),
                use_container_width=True,
            )
        else:
            st.write("No transactions breached the selected statistical threshold.")


# ==========================================
# PAGE 6: MATHEMATICAL FOUNDATIONS
# ==========================================

elif nav_page == "📐 Mathematical Foundations":
    st.title("📐 Mathematical Foundations & Portfolio Interview Reference")
    st.markdown(
        "A rigorous mathematical companion designed for BS Mathematics students "
        "defending time-series, statistical modeling, and database design choices in interviews."
    )

    t1, t2, t3, t4 = st.tabs(
        ["Time-Series Models", "Evaluation Metrics", "Outlier Formulations", "SQL Schema Design"]
    )

    with t1:
        st.subheader("1. Simple Moving Average (SMA)")
        st.latex(r"\hat{y}_{T+h} = \frac{1}{k} \sum_{i=0}^{k-1} y_{T-i}")
        st.write(
            "Assumes a locally stationary mean. Smooths white noise components with finite impulse response."
        )

        st.subheader("2. Ordinary Least Squares (OLS) Linear Trend")
        st.latex(
            r"\min_{\beta_0, \beta_1} \sum_{t=1}^n \left( y_t - (\beta_0 + \beta_1 t) \right)^2"
        )
        st.latex(
            r"\hat{\beta}_1 = \frac{\sum_{t=1}^n (t - \bar{t})(y_t - \bar{y})}{\sum_{t=1}^n (t - \bar{t})^2}, \quad \hat{\beta}_0 = \bar{y} - \hat{\beta}_1 \bar{t}"
        )
        st.write(
            "Analytical closed-form regression using the Gauss-Markov theorem. Best linear unbiased estimator (BLUE)."
        )

        st.subheader("3. Holt-Winters Triple Exponential Smoothing")
        st.latex(r"\ell_t = \alpha(y_t - s_{t-m}) + (1-\alpha)(\ell_{t-1} + b_{t-1})")
        st.latex(r"b_t = \beta(\ell_t - \ell_{t-1}) + (1-\beta)b_{t-1}")
        st.latex(r"s_t = \gamma(y_t - \ell_t) + (1-\gamma)s_{t-m}")
        st.write(
            "State-space recursive formulation capturing level, linear velocity (trend), and periodicity with geometrically decaying memory."
        )

        st.subheader("4. ARIMA(p, d, q) Stochastic Process")
        st.latex(r"\left(1 - \sum_{i=1}^p \phi_i B^i\right) (1 - B)^d y_t = c + \left(1 + \sum_{j=1}^q \theta_j B^j\right) \epsilon_t")
        st.write(
            "Where B is the backshift lag operator: B^k y_t = y_{t-k}, and ε_t ~ WN(0, σ^2)."
        )

    with t2:
        st.subheader("Holdout Validation Metrics")
        st.latex(r"\text{MAE} = \frac{1}{n} \sum_{i=1}^n |y_i - \hat{y}_i|")
        st.write(
            "**Mean Absolute Error (MAE):** Linear penalty scale; measures expected median absolute deviation. Robust to solitary large shocks."
        )

        st.latex(r"\text{RMSE} = \sqrt{\frac{1}{n} \sum_{i=1}^n (y_i - \hat{y}_i)^2}")
        st.write(
            "**Root Mean Squared Error (RMSE):** Quadratic penalty scale; severely penalizes large forecasting errors. Preserves original dollar units."
        )

    with t3:
        st.subheader("Outlier Detection Formulations")
        st.latex(r"z_i = \frac{x_i - \mu}{\sigma}, \quad \text{Flag if } z_i > 2.0")
        st.write(
            "Z-Score relies on the central limit theorem assumption of normality."
        )
        st.latex(r"\text{IQR} = Q_3 - Q_1, \quad \text{Upper Fence} = Q_3 + 1.5 \times \text{IQR}")
        st.write(
            "Tukey's Fences are non-parametric and resistant to breakdown even when up to 25% of data contains extreme anomalies."
        )

    with t4:
        st.subheader("Relational Database Schema (SQLite)")
        st.code(
            """
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    color TEXT DEFAULT '#3B82F6'
);

CREATE TABLE budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    monthly_limit REAL NOT NULL CHECK(monthly_limit >= 0),
    year_month TEXT NOT NULL, -- Format 'YYYY-MM'
    FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE,
    UNIQUE (category_id, year_month)
);

CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL, -- Format 'YYYY-MM-DD'
    amount REAL NOT NULL CHECK(amount > 0),
    category_id INTEGER NOT NULL,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT
);
            """,
            language="sql",
        )
