"""Central resolution of local data and backup directories.

Pure functions: nothing is created or opened here. The application keeps using
``legacy_db_path`` (backend/data/c4gestao.db) until a migration is authorized;
``default_db_path`` only describes the future location.
"""

from __future__ import annotations

import os
from collections.abc import Mapping
from pathlib import Path
from urllib.parse import unquote

APP_DIR_NAME = "C4Gestao"
DB_FILE_NAME = "c4gestao.db"
_BACKEND_DIR = Path(__file__).resolve().parents[2]


class PathConfigError(Exception):
    pass


def _env(env: Mapping[str, str] | None) -> Mapping[str, str]:
    return os.environ if env is None else env


def app_root(env: Mapping[str, str] | None = None) -> Path:
    local = _env(env).get("LOCALAPPDATA", "").strip()
    if not local:
        raise PathConfigError(
            "LOCALAPPDATA não está definida. Defina C4_DATA_DIR e C4_BACKUP_DIR explicitamente."
        )
    return Path(local) / APP_DIR_NAME


def _explicit_dir(name: str, env: Mapping[str, str]) -> Path | None:
    value = env.get(name, "").strip()
    if not value:
        return None
    path = Path(value)
    if not path.is_absolute():
        raise PathConfigError(f"{name} deve ser um caminho absoluto: {value!r}")
    return path


def data_dir(env: Mapping[str, str] | None = None) -> Path:
    values = _env(env)
    return _explicit_dir("C4_DATA_DIR", values) or app_root(values) / "data"


def backup_dir(env: Mapping[str, str] | None = None) -> Path:
    values = _env(env)
    return _explicit_dir("C4_BACKUP_DIR", values) or app_root(values) / "backups"


def default_db_path(env: Mapping[str, str] | None = None) -> Path:
    """Future database location (not used by the application yet)."""
    return data_dir(env) / DB_FILE_NAME


def legacy_db_path() -> Path:
    return _BACKEND_DIR / "data" / DB_FILE_NAME


def current_db_path(env: Mapping[str, str] | None = None) -> Path:
    """Database file the application uses today, resolved like ``database.py``."""
    url = _env(env).get("C4_DATABASE_URL")
    if not url:
        return legacy_db_path()
    if not url.startswith("sqlite:///"):
        raise PathConfigError("C4_DATABASE_URL não aponta para um arquivo SQLite local.")
    raw = unquote(url[len("sqlite:///"):].split("?", 1)[0])
    if raw in ("", ":memory:"):
        raise PathConfigError("Banco em memória não pode ser usado pela manutenção.")
    return Path(raw).resolve()
