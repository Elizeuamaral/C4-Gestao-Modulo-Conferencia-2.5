"""SQLite/SQLAlchemy connection and session configuration for C4 Gestão.

Installed builds keep the writable database in the current user's application-data
folder, not beside the executable (which may be installed under Program Files).
For development, the database stays in backend/data unless C4_DATABASE_URL is set.
An existing development database is copied once to the installed-data location.
"""

from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path
from typing import Generator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEVELOPMENT_DB_PATH = BACKEND_DIR / "data" / "c4gestao.db"


def _user_data_directory() -> Path:
    """Return a writable per-user data directory for installed application data."""
    if sys.platform == "win32":
        root = os.getenv("LOCALAPPDATA") or os.getenv("APPDATA")
        if root:
            return Path(root) / "C4Gestao"
        return Path.home() / "AppData" / "Local" / "C4Gestao"

    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "C4Gestao"

    root = os.getenv("XDG_DATA_HOME")
    return (Path(root) if root else Path.home() / ".local" / "share") / "c4gestao"


def _default_database_path() -> Path:
    """Choose a stable writable path and preserve an existing development DB."""
    # Explicit environment configuration always takes precedence.
    if os.getenv("C4_DATABASE_URL"):
        return DEVELOPMENT_DB_PATH

    # Running from source keeps the current project behavior for developers.
    if not getattr(sys, "frozen", False):
        return DEVELOPMENT_DB_PATH

    installed_path = _user_data_directory() / "data" / "c4gestao.db"
    installed_path.parent.mkdir(parents=True, exist_ok=True)

    # On first packaged launch, migrate the existing project DB if present.
    # Copy only when the target does not exist; never overwrite user data.
    if not installed_path.exists() and DEVELOPMENT_DB_PATH.exists():
        shutil.copy2(DEVELOPMENT_DB_PATH, installed_path)

    return installed_path


DEFAULT_DB_PATH = _default_database_path()
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
