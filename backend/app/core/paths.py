"""Central resolution of the application's SQLite database and maintenance paths."""

from __future__ import annotations

import os
import sys
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
    """Packaged application database path, including C4_DATA_DIR overrides."""
    return data_dir(env) / DB_FILE_NAME


def legacy_db_path() -> Path:
    return _BACKEND_DIR / "data" / DB_FILE_NAME


def current_db_path(env: Mapping[str, str] | None = None) -> Path:
    """Resolve the SQLite file used by the application.

    An explicit database URL wins. Otherwise C4_DATA_DIR wins, followed by the
    packaged per-user path or the legacy source-tree path in development.
    """
    values = _env(env)
    url = values.get("C4_DATABASE_URL", "").strip()
    if not url:
        if values.get("C4_DATA_DIR", "").strip():
            return default_db_path(values).resolve()
        if getattr(sys, "frozen", False):
            return default_db_path(values).resolve()
        return legacy_db_path().resolve()
    if not url.startswith("sqlite:///"):
        raise PathConfigError("C4_DATABASE_URL não aponta para um arquivo SQLite local.")
    raw = unquote(url[len("sqlite:///"):].split("?", 1)[0])
    if raw in ("", ":memory:"):
        raise PathConfigError("Banco em memória não pode ser usado pela manutenção.")
    return Path(raw).resolve()
