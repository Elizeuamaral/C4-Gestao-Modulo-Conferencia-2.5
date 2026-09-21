"""SQLite/SQLAlchemy connection and session configuration for C4 Gestão.

C4-DB-002 intentionally does not create tables. Database initialization is
handled by the next step, C4-DB-003.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = BACKEND_DIR / "data" / "c4gestao.db"
DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.getenv(
    "C4_DATABASE_URL",
    f"sqlite:///{DEFAULT_DB_PATH.as_posix()}",
)

connect_args: dict[str, object] = {
    "check_same_thread": False,
}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

if DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _enable_sqlite_integrity(dbapi_connection, _connection_record) -> None:
        """Enable SQLite foreign-key enforcement for every connection."""
        cursor = dbapi_connection.cursor()
        try:
            cursor.execute("PRAGMA foreign_keys = ON")
            cursor.execute("PRAGMA busy_timeout = 5000")
        finally:
            cursor.close()


SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    """FastAPI-compatible database session dependency."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
