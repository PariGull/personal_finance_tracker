"""
Database management module for Personal Finance Tracker.
Uses standard Python sqlite3 with raw parameterized SQL queries.
Designed for maintainability, query clarity, and portfolio interview explanations.
"""

from datetime import datetime
import os
import sqlite3
from typing import Any, Dict, List, Optional, Tuple

DEFAULT_DB_PATH = os.path.join(os.path.dirname(__file__), "finance.db")


def get_connection(db_path: str = DEFAULT_DB_PATH) -> sqlite3.Connection:
    """
    Establish and return a connection to SQLite database with foreign keys enabled
    and row factory set for dictionary-like access.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db(db_path: str = DEFAULT_DB_PATH) -> None:
    """
    Initializes database schema.
    Creates tables: categories, budgets, and transactions.
    Safe to run repeatedly via CREATE TABLE IF NOT EXISTS.
    """
    with get_connection(db_path) as conn:
        cursor = conn.cursor()

        # 1. Categories table: defines income vs expense classifications
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
                color TEXT DEFAULT '#3B82F6'
            );
            """
        )

        # 2. Budgets table: monthly limit targets per category
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS budgets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                category_id INTEGER NOT NULL,
                monthly_limit REAL NOT NULL CHECK(monthly_limit >= 0),
                year_month TEXT NOT NULL, -- Format 'YYYY-MM'
                FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE CASCADE,
                UNIQUE (category_id, year_month)
            );
            """
        )

        # 3. Transactions table: financial ledger entries
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS transactions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT NOT NULL, -- Format 'YYYY-MM-DD'
                amount REAL NOT NULL CHECK(amount > 0),
                category_id INTEGER NOT NULL,
                note TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (category_id) REFERENCES categories (id) ON DELETE RESTRICT
            );
            """
        )

        # Helpful indexes for time-series aggregation & querying
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);"
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_budgets_year_month ON budgets(year_month);"
        )

        # Seed default categories if none exist
        cursor.execute("SELECT COUNT(*) AS cnt FROM categories;")
        if cursor.fetchone()["cnt"] == 0:
            default_categories = [
                ("Salary", "income", "#10B981"),
                ("Investments & Freelance", "income", "#059669"),
                ("Housing & Rent", "expense", "#EF4444"),
                ("Groceries", "expense", "#F59E0B"),
                ("Utilities & Bills", "expense", "#3B82F6"),
                ("Dining & Social", "expense", "#EC4899"),
                ("Transportation", "expense", "#8B5CF6"),
                ("Healthcare", "expense", "#14B8A6"),
                ("Entertainment", "expense", "#6366F1"),
                ("Miscellaneous", "expense", "#6B7280"),
            ]
            cursor.executemany(
                "INSERT INTO categories (name, type, color) VALUES (?, ?, ?);",
                default_categories,
            )
        conn.commit()


# ==========================================
# CATEGORY CRUD OPERATIONS
# ==========================================


def get_categories(
    db_path: str = DEFAULT_DB_PATH, tx_type: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Fetch categories filtered optionally by type ('income' or 'expense')."""
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        if tx_type:
            cursor.execute(
                "SELECT * FROM categories WHERE type = ? ORDER BY name ASC;",
                (tx_type,),
            )
        else:
            cursor.execute("SELECT * FROM categories ORDER BY type, name ASC;")
        return [dict(row) for row in cursor.fetchall()]


def add_category(
    name: str,
    tx_type: str,
    color: str = "#3B82F6",
    db_path: str = DEFAULT_DB_PATH,
) -> int:
    """Insert a new category and return its ID."""
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "INSERT INTO categories (name, type, color) VALUES (?, ?, ?);",
            (name.strip(), tx_type.strip().lower(), color),
        )
        conn.commit()
        return cursor.lastrowid


# ==========================================
# TRANSACTION CRUD OPERATIONS
# ==========================================


def add_transaction(
    date: str,
    amount: float,
    category_id: int,
    note: str = "",
    db_path: str = DEFAULT_DB_PATH,
) -> int:
    """Add a new transaction using a parameterized SQL query."""
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO transactions (date, amount, category_id, note)
            VALUES (?, ?, ?, ?);
            """,
            (date, float(amount), category_id, note.strip()),
        )
        conn.commit()
        return cursor.lastrowid


def update_transaction(
    tx_id: int,
    date: str,
    amount: float,
    category_id: int,
    note: str = "",
    db_path: str = DEFAULT_DB_PATH,
) -> bool:
    """Update an existing transaction."""
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            UPDATE transactions
            SET date = ?, amount = ?, category_id = ?, note = ?
            WHERE id = ?;
            """,
            (date, float(amount), category_id, note.strip(), tx_id),
        )
        conn.commit()
        return cursor.rowcount > 0


def delete_transaction(tx_id: int, db_path: str = DEFAULT_DB_PATH) -> bool:
    """Delete a transaction by ID."""
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM transactions WHERE id = ?;", (tx_id,))
        conn.commit()
        return cursor.rowcount > 0


def get_transactions_df(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    category_id: Optional[int] = None,
    tx_type: Optional[str] = None,
    db_path: str = DEFAULT_DB_PATH,
):
    """
    Fetch transactions joined with category metadata as a pandas DataFrame.
    Parameterized conditions prevent SQL injection.
    """
    import pandas as pd

    query = """
        SELECT
            t.id,
            t.date,
            t.amount,
            t.note,
            t.category_id,
            c.name AS category_name,
            c.type AS category_type,
            c.color AS category_color,
            strftime('%Y-%m', t.date) AS year_month
        FROM transactions t
        INNER JOIN categories c ON t.category_id = c.id
        WHERE 1=1
    """
    params: List[Any] = []

    if start_date:
        query += " AND t.date >= ?"
        params.append(start_date)
    if end_date:
        query += " AND t.date <= ?"
        params.append(end_date)
    if category_id:
        query += " AND t.category_id = ?"
        params.append(category_id)
    if tx_type:
        query += " AND c.type = ?"
        params.append(tx_type)

    query += " ORDER BY t.date DESC, t.id DESC;"

    with get_connection(db_path) as conn:
        df = pd.read_sql_query(query, conn, params=params)
    return df


# ==========================================
# BUDGETS OPERATIONS
# ==========================================


def set_budget(
    category_id: int,
    monthly_limit: float,
    year_month: str,
    db_path: str = DEFAULT_DB_PATH,
) -> None:
    """Set or update monthly budget for a category using upsert syntax."""
    with get_connection(db_path) as conn:
        cursor = conn.cursor()
        cursor.execute(
            """
            INSERT INTO budgets (category_id, monthly_limit, year_month)
            VALUES (?, ?, ?)
            ON CONFLICT(category_id, year_month)
            DO UPDATE SET monthly_limit = excluded.monthly_limit;
            """,
            (category_id, float(monthly_limit), year_month),
        )
        conn.commit()


def get_budget_vs_actual(
    year_month: str, db_path: str = DEFAULT_DB_PATH
):
    """
    Compare budgeted limit vs actual spending per category for a given month ('YYYY-MM').
    Returns DataFrame with [category_id, category_name, monthly_limit, actual_spent, remaining, pct_used].
    """
    import pandas as pd

    query = """
        SELECT
            c.id AS category_id,
            c.name AS category_name,
            c.color AS category_color,
            COALESCE(b.monthly_limit, 0.0) AS monthly_limit,
            COALESCE(SUM(t.amount), 0.0) AS actual_spent
        FROM categories c
        LEFT JOIN budgets b
            ON c.id = b.category_id AND b.year_month = ?
        LEFT JOIN transactions t
            ON c.id = t.category_id AND strftime('%Y-%m', t.date) = ?
        WHERE c.type = 'expense'
        GROUP BY c.id, c.name, c.color, b.monthly_limit
        ORDER BY actual_spent DESC;
    """
    with get_connection(db_path) as conn:
        df = pd.read_sql_query(query, conn, params=[year_month, year_month])

    df["remaining"] = df["monthly_limit"] - df["actual_spent"]
    df["pct_used"] = (
        (df["actual_spent"] / df["monthly_limit"] * 100)
        .fillna(0.0)
        .replace([float("inf"), float("-inf")], 0.0)
        .round(1)
    )
    return df


# ==========================================
# AGGREGATION & TIME SERIES HELPERS
# ==========================================


def get_monthly_spending_series(
    category_id: Optional[int] = None, db_path: str = DEFAULT_DB_PATH
):
    """
    Returns monthly aggregated expense amounts chronologically.
    Output columns: ['year_month', 'amount']
    """
    import pandas as pd

    query = """
        SELECT
            strftime('%Y-%m', t.date) AS year_month,
            SUM(t.amount) AS amount
        FROM transactions t
        INNER JOIN categories c ON t.category_id = c.id
        WHERE c.type = 'expense'
    """
    params: List[Any] = []
    if category_id:
        query += " AND t.category_id = ?"
        params.append(category_id)

    query += " GROUP BY year_month ORDER BY year_month ASC;"

    with get_connection(db_path) as conn:
        df = pd.read_sql_query(query, conn, params=params)

    if not df.empty:
        df["ds"] = pd.to_datetime(df["year_month"] + "-01")
        df["amount"] = df["amount"].astype(float)
    return df
