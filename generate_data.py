"""
Sample data generation script for Personal Finance Tracker.
Generates 18 months of realistic financial transactions and budgets.
Includes realistic income schedules, fixed expenses, variable expenses with seasonality,
and intentional realistic outliers to validate forecasting and anomaly detection algorithms.
"""

from datetime import date, datetime, timedelta
import random
import sys
from db import add_transaction, get_categories, get_connection, init_db, set_budget


def generate_sample_data(months_back: int = 18, db_path: str = "finance.db"):
    print(f"Initializing database at {db_path}...")
    init_db(db_path)

    # Fetch seeded categories
    categories = get_categories(db_path)
    cat_by_name = {c["name"]: c["id"] for c in categories}

    print(f"Generating {months_back} months of realistic financial data...")

    # Set deterministic seed for reproducible portfolio demos
    random.seed(42)

    today = date(2026, 10, 1)
    # Start date 18 months ago
    start_date = date(2025, 4, 1)

    # Set up realistic monthly budget targets for common expense categories
    standard_budgets = {
        "Housing & Rent": 1500.0,
        "Groceries": 550.0,
        "Utilities & Bills": 220.0,
        "Dining & Social": 350.0,
        "Transportation": 180.0,
        "Healthcare": 150.0,
        "Entertainment": 200.0,
        "Miscellaneous": 150.0,
    }

    # Populate budgets for every month in range
    curr_month = date(start_date.year, start_date.month, 1)
    while curr_month <= today:
        ym_str = curr_month.strftime("%Y-%m")
        for cat_name, limit in standard_budgets.items():
            if cat_name in cat_by_name:
                set_budget(cat_by_name[cat_name], limit, ym_str, db_path)

        # Advance one month
        if curr_month.month == 12:
            curr_month = date(curr_month.year + 1, 1, 1)
        else:
            curr_month = date(curr_month.year, curr_month.month + 1, 1)

    # Clear existing transactions to avoid duplicate multiplication if re-run
    with get_connection(db_path) as conn:
        conn.execute("DELETE FROM transactions;")
        conn.commit()

    total_records = 0
    curr_date = start_date

    while curr_date <= today:
        year = curr_date.year
        month = curr_date.month
        day = curr_date.day
        day_of_week = curr_date.weekday()  # 0=Monday, 6=Sunday

        # 1. Income: Bi-monthly Salary on 1st and 15th
        if day in [1, 15] and "Salary" in cat_by_name:
            salary_amount = 3150.0 + random.choice([0, 50, 100])
            add_transaction(
                curr_date.strftime("%Y-%m-%d"),
                salary_amount,
                cat_by_name["Salary"],
                "Bi-weekly Corporate Salary",
                db_path,
            )
            total_records += 1

        # Occasional freelance / dividend income on the 22nd
        if day == 22 and random.random() < 0.45 and "Investments & Freelance" in cat_by_name:
            freelance_amt = round(random.uniform(250.0, 750.0), 2)
            add_transaction(
                curr_date.strftime("%Y-%m-%d"),
                freelance_amt,
                cat_by_name["Investments & Freelance"],
                "Freelance Math Tutoring & Dividends",
                db_path,
            )
            total_records += 1

        # 2. Housing & Rent on the 1st
        if day == 1 and "Housing & Rent" in cat_by_name:
            rent_amt = 1450.0
            add_transaction(
                curr_date.strftime("%Y-%m-%d"),
                rent_amt,
                cat_by_name["Housing & Rent"],
                "Apartment Monthly Rent",
                db_path,
            )
            total_records += 1

        # 3. Utilities on the 10th (with seasonal heating in winter and AC in summer)
        if day == 10 and "Utilities & Bills" in cat_by_name:
            # Seasonality: higher in Jan/Feb (heating) and Jul/Aug (AC)
            seasonal_factor = 1.3 if month in [1, 2, 7, 8] else 0.95
            util_amt = round(random.uniform(130.0, 180.0) * seasonal_factor, 2)
            add_transaction(
                curr_date.strftime("%Y-%m-%d"),
                util_amt,
                cat_by_name["Utilities & Bills"],
                "Electricity, Gas & High-Speed Internet",
                db_path,
            )
            total_records += 1

        # 4. Groceries: roughly once a week (Sundays)
        if day_of_week == 6 and "Groceries" in cat_by_name:
            groc_amt = round(random.uniform(95.0, 145.0), 2)
            add_transaction(
                curr_date.strftime("%Y-%m-%d"),
                groc_amt,
                cat_by_name["Groceries"],
                "Weekly Supermarket Restock",
                db_path,
            )
            total_records += 1

        # 5. Dining & Social: 2 to 3 times a week (higher on Fridays and Saturdays)
        if day_of_week in [4, 5] and random.random() < 0.85 and "Dining & Social" in cat_by_name:
            dining_amt = round(random.uniform(28.0, 68.0), 2)
            add_transaction(
                curr_date.strftime("%Y-%m-%d"),
                dining_amt,
                cat_by_name["Dining & Social"],
                random.choice(["Dinner with friends", "Bistro takeout", "Weekend brunch", "Coffee & pastry"]),
                db_path,
            )
            total_records += 1
        elif random.random() < 0.20 and "Dining & Social" in cat_by_name:
            coffee_amt = round(random.uniform(8.0, 18.0), 2)
            add_transaction(
                curr_date.strftime("%Y-%m-%d"),
                coffee_amt,
                cat_by_name["Dining & Social"],
                "Midweek coffee / lunch",
                db_path,
            )
            total_records += 1

        # 6. Transportation: gas or transit every 10-12 days
        if day in [5, 18, 28] and "Transportation" in cat_by_name:
            transit_amt = round(random.uniform(35.0, 60.0), 2)
            add_transaction(
                curr_date.strftime("%Y-%m-%d"),
                transit_amt,
                cat_by_name["Transportation"],
                "Metro transit pass & Gas refill",
                db_path,
            )
            total_records += 1

        # 7. Entertainment: once or twice a month
        if day in [12, 26] and random.random() < 0.70 and "Entertainment" in cat_by_name:
            ent_amt = round(random.uniform(30.0, 85.0), 2)
            add_transaction(
                curr_date.strftime("%Y-%m-%d"),
                ent_amt,
                cat_by_name["Entertainment"],
                random.choice(["Streaming subscriptions", "Concert tickets", "Movie theatre", "Bookstore purchase"]),
                db_path,
            )
            total_records += 1

        # 8. Healthcare: infrequent, once every couple months
        if day == 14 and random.random() < 0.25 and "Healthcare" in cat_by_name:
            health_amt = round(random.uniform(45.0, 110.0), 2)
            add_transaction(
                curr_date.strftime("%Y-%m-%d"),
                health_amt,
                cat_by_name["Healthcare"],
                "Pharmacy prescription & dental co-pay",
                db_path,
            )
            total_records += 1

        curr_date += timedelta(days=1)

    # 9. Inject specific realistic OUTLIERS to showcase anomaly detection
    print("Injecting intentional anomaly outliers for IQR and Z-score validation...")
    anomalies = [
        ("2025-08-16", 620.0, "Transportation", "Emergency transmission & brake repairs"),
        ("2025-12-18", 480.0, "Dining & Social", "Annual holiday banquet with university department"),
        ("2026-03-24", 510.0, "Healthcare", "Emergency dental crown procedure"),
        ("2026-07-11", 690.0, "Entertainment", "Roundtrip flight tickets to Math Conference"),
        ("2026-09-08", 380.0, "Groceries", "Costco annual bulk pantry restocking"),
    ]

    for dt, amt, cat_name, note in anomalies:
        if cat_name in cat_by_name:
            add_transaction(dt, amt, cat_by_name[cat_name], note, db_path)
            total_records += 1

    print(f"Successfully generated {total_records} transactions across 18 months into '{db_path}'!")


if __name__ == "__main__":
    db_file = sys.argv[1] if len(sys.argv) > 1 else "finance.db"
    generate_sample_data(months_back=18, db_path=db_file)
