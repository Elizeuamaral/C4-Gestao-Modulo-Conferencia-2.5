"""Shared database diagnostics for the C4 Gestão backend.

C4-API-002 centralizes the checks used to validate the SQLite database at
runtime without creating or modifying business data.
"""

from __future__ import annotations

from sqlalchemy import inspect, text

from backend.app.db.database import engine


EXPECTED_TABLES = {
    "products",
    "locations",
    "checkers",
    "stock_items",
    "movements",
    "app_settings",
    "admin_credentials",
}


def check_database() -> dict[str, object]:
    """Return a non-mutating diagnostic snapshot of the configured database."""
    inspector = inspect(engine)
    actual_tables = set(inspector.get_table_names())
    missing_tables = EXPECTED_TABLES - actual_tables

    foreign_keys_enabled = False

    with engine.connect() as connection:
        if engine.dialect.name == "sqlite":
            foreign_keys_enabled = (
                connection.execute(text("PRAGMA foreign_keys")).scalar_one() == 1
            )

    return {
        "status": "ok" if not missing_tables and foreign_keys_enabled else "error",
        "engine": engine.dialect.name,
        "table_count": len(actual_tables),
        "expected_table_count": len(EXPECTED_TABLES),
        "tables": sorted(actual_tables & EXPECTED_TABLES),
        "missing_tables": sorted(missing_tables),
        "foreign_keys_enabled": foreign_keys_enabled,
    }
