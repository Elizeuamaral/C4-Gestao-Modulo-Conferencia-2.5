"""Initialize and validate the C4 Gestão SQLite database.

C4-DB-003 creates the physical SQLite schema from the SQLAlchemy models.
It does not create business/master data and is safe to run repeatedly.
"""

from __future__ import annotations

from backend.app.db.database import engine
from backend.app.db.diagnostics import EXPECTED_TABLES, check_database
from backend.app.db.models import Base


def initialize_database() -> None:
    """Create all missing tables and validate the resulting schema."""
    Base.metadata.create_all(bind=engine)

    diagnostics = check_database()
    missing_tables = set(diagnostics["missing_tables"])

    if missing_tables:
        missing = ", ".join(sorted(missing_tables))
        raise RuntimeError(
            f"SQLite initialization failed; missing tables: {missing}"
        )

    if not diagnostics["foreign_keys_enabled"]:
        raise RuntimeError("SQLite foreign-key enforcement is disabled.")

    print("C4 Gestão SQLite initialized successfully.")
    print(f"Database: {engine.url}")
    print(f"Tables: {', '.join(sorted(EXPECTED_TABLES))}")


if __name__ == "__main__":
    initialize_database()
