"""
Unit tests for database schema and CRUD operations in db.py.
Uses an in-memory or temporary SQLite database.
"""

import os
import tempfile
import pytest
from db import (
    add_category,
    add_transaction,
    delete_transaction,
    get_budget_vs_actual,
    get_categories,
    get_connection,
    get_transactions_df,
    init_db,
    set_budget,
    update_transaction,
)


@pytest.fixture
def temp_db():
    """Create a clean isolated temporary SQLite database for each test."""
    fd, path = tempfile.mkstemp(suffix=".db")
    os.close(fd)
    init_db(path)
    yield path
    if os.path.exists(path):
        os.remove(path)


def test_init_db_creates_tables_and_seeds(temp_db):
    """Verify tables exist and default categories are seeded."""
    with get_connection(temp_db) as conn:
        cursor = conn.cursor()
        cursor.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
        )
        tables = [row["name"] for row in cursor.fetchall()]
        assert "categories" in tables
        assert "budgets" in tables
        assert "transactions" in tables

    categories = get_categories(temp_db)
    assert len(categories) >= 10
    names = [c["name"] for c in categories]
    assert "Salary" in names
    assert "Groceries" in names


def test_transaction_crud_flow(temp_db):
    """Test full create, read, update, delete lifecycle of transactions."""
    categories = get_categories(temp_db, tx_type="expense")
    cat_id = categories[0]["id"]

    # 1. Add transaction
    tx_id = add_transaction(
        date="2026-10-01",
        amount=125.50,
        category_id=cat_id,
        note="Farmers Market",
        db_path=temp_db,
    )
    assert tx_id > 0

    # 2. Read DataFrame
    df = get_transactions_df(db_path=temp_db)
    assert len(df) == 1
    assert df.iloc[0]["id"] == tx_id
    assert df.iloc[0]["amount"] == 125.50
    assert df.iloc[0]["note"] == "Farmers Market"

    # 3. Update transaction
    updated = update_transaction(
        tx_id=tx_id,
        date="2026-10-02",
        amount=140.00,
        category_id=cat_id,
        note="Organic Grocery Store",
        db_path=temp_db,
    )
    assert updated is True

    df_up = get_transactions_df(db_path=temp_db)
    assert df_up.iloc[0]["amount"] == 140.00
    assert df_up.iloc[0]["date"] == "2026-10-02"

    # 4. Delete transaction
    deleted = delete_transaction(tx_id, db_path=temp_db)
    assert deleted is True
    assert len(get_transactions_df(db_path=temp_db)) == 0


def test_budget_upsert_and_comparison(temp_db):
    """Test setting budget limits and comparing with actual expenditures."""
    categories = get_categories(temp_db, tx_type="expense")
    cat_id = categories[0]["id"]

    # Set initial budget
    set_budget(cat_id, 300.0, "2026-10", db_path=temp_db)

    # Upsert (update existing budget)
    set_budget(cat_id, 350.0, "2026-10", db_path=temp_db)

    # Add transaction in that month
    add_transaction("2026-10-05", 100.0, cat_id, "Expense 1", db_path=temp_db)
    add_transaction("2026-10-15", 50.0, cat_id, "Expense 2", db_path=temp_db)

    # Check comparison
    b_df = get_budget_vs_actual("2026-10", db_path=temp_db)
    row = b_df[b_df["category_id"] == cat_id].iloc[0]

    assert row["monthly_limit"] == 350.0
    assert row["actual_spent"] == 150.0
    assert row["remaining"] == 200.0
    assert pytest.approx(row["pct_used"], 0.1) == 42.9
