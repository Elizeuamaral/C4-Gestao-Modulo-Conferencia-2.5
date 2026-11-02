"""SQLite/SQLAlchemy connection and session configuration for C4 Gestão."""

from __future__ import annotations

import os
import shutil
import sys
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from backend.app.core import paths


DEFAULT_DB_PATH = paths.current_db_path()
DEFAULT_DB_PATH.parent.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.getenv("C4_DATABASE_URL") or f"sqlite:///{DEFAULT_DB_PATH.as_posix()}"

# Preserve the existing one-time source-database copy for packaged installs.
# Explicit database or data-directory configuration must never trigger it.
if (
    getattr(sys, "frozen", False)
    and not os.getenv("C4_DATABASE_URL")
    and not os.getenv("C4_DATA_DIR")
    and not DEFAULT_DB_PATH.exists()
):
    legacy_path = paths.legacy_db_path()
    if legacy_path.is_file():
        shutil.copy2(legacy_path, DEFAULT_DB_PATH)

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
