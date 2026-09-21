"""Initialize and validate the C4 Gestão SQLite database.

C4-DB-003 creates the physical SQLite schema from the SQLAlchemy models.
It does not create business/master data and is safe to run repeatedly.
"""

from __future__ import annotations

from sqlalchemy import inspect, text

from backend.app.db.database import engine
from backend.app.db.models import Base

EXPECTED_TABLES = {
    "products",
    "locations",
    "checkers",
    "stock_items",
    "movements",
    "app_settings",
    "admin_credentials",
}


def initialize_database() -> None:
    """Create all missing tables and validate the resulting schema."""
    Base.metadata.create_all(bind=engine)

    inspector = inspect(engine)
    actual_tables = set(inspector.get_table_names())
    missing_tables = EXPECTED_TABLES - actual_tables

    if missing_tables:
        missing = ", ".join(sorted(missing_tables))
        raise RuntimeError(f"SQLite initialization failed; missing tables: {missing}")

    with engine.connect() as connection:
        if engine.dialect.name == "sqlite":
            foreign_keys = connection.execute(text("PRAGMA foreign_keys")).scalar_one()
            if foreign_keys != 1:
                raise RuntimeError("SQLite foreign-key enforcement is disabled.")

    print("C4 Gestão SQLite initialized successfully.")
    print(f"Database: {engine.url}")
    print(f"Tables: {', '.join(sorted(actual_tables & EXPECTED_TABLES))}")


if __name__ == "__main__":
    initialize_database()
