"""Local SQLite backup, verification, restoration and data export.

All functions take explicit paths so tests never touch the production database.
The source database is opened read-only; a restore never overwrites a database
that is in use and always keeps a safety copy of what it replaces.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path

BACKUP_PREFIX = "c4gestao-"
_BACKUP_NAME = re.compile(r"^c4gestao-\d{8}-\d{6}(-\d+)?\.db$")
REQUIRED_TABLES = frozenset(
    {"users", "products", "locations", "stock_items", "movements", "invoices", "invoice_items"}
)
# Secrets never leave the database through an export.
_EXCLUDED_TABLES = frozenset({"admin_credentials", "auth_sessions"})
_EXCLUDED_COLUMNS = {"users": frozenset({"password_hash"})}
EXPORT_FORMAT_VERSION = 1


class BackupError(Exception):
    pass


def _open_readonly(path: Path) -> sqlite3.Connection:
    return sqlite3.connect(f"file:{path.resolve().as_posix()}?mode=ro", uri=True)


def verify_database(path: Path) -> list[str]:
    """Return a list of problems found; an empty list means the file is usable."""
    if not path.is_file():
        return [f"Arquivo não encontrado: {path.name}"]
    try:
        with closing(_open_readonly(path)) as conn:
            problems: list[str] = []
            result = conn.execute("PRAGMA integrity_check").fetchall()
            if result != [("ok",)]:
                problems.append("integrity_check falhou: " + "; ".join(str(r[0]) for r in result[:5]))
            if conn.execute("PRAGMA foreign_key_check").fetchall():
                problems.append("foreign_key_check encontrou violações.")
            tables = {row[0] for row in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            missing = REQUIRED_TABLES - tables
            if missing:
                problems.append("Tabelas ausentes: " + ", ".join(sorted(missing)))
            return problems
    except sqlite3.DatabaseError as exc:
        return [f"Arquivo não é um banco SQLite válido: {exc}"]


def _copy_database(source: Path, destination: Path) -> None:
    src = _open_readonly(source)
    try:
        dst = sqlite3.connect(destination)
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()


def create_backup(source_db: Path, backup_dir: Path, keep: int = 14, now: datetime | None = None) -> Path:
    """Create a consistent, verified copy of ``source_db`` and rotate old backups."""
    if not source_db.is_file():
        raise BackupError("Banco de dados de origem não encontrado.")
    if keep < 1:
        raise BackupError("O número de backups mantidos deve ser pelo menos 1.")
    backup_dir.mkdir(parents=True, exist_ok=True)

    stamp = (now or datetime.now(timezone.utc)).strftime("%Y%m%d-%H%M%S")
    final = backup_dir / f"{BACKUP_PREFIX}{stamp}.db"
    counter = 1
    while final.exists():
        final = backup_dir / f"{BACKUP_PREFIX}{stamp}-{counter}.db"
        counter += 1

    partial = backup_dir / (final.name + ".partial")
    try:
        _copy_database(source_db, partial)
        problems = verify_database(partial)
        if problems:
            raise BackupError("Backup gerado é inválido: " + " | ".join(problems))
        os.replace(partial, final)
    except sqlite3.DatabaseError as exc:
        raise BackupError(f"Falha ao copiar o banco: {exc}") from exc
    finally:
        partial.unlink(missing_ok=True)

    _rotate(backup_dir, keep)
    return final


def list_backups(backup_dir: Path) -> list[Path]:
    if not backup_dir.is_dir():
        return []
    return sorted(p for p in backup_dir.iterdir() if p.is_file() and _BACKUP_NAME.match(p.name))


def _rotate(backup_dir: Path, keep: int) -> None:
    # Only files that match the backup naming pattern are ever deleted.
    for old in list_backups(backup_dir)[:-keep]:
        old.unlink(missing_ok=True)


def restore_backup(backup_file: Path, target_db: Path, safety_dir: Path | None = None) -> Path | None:
    """Replace ``target_db`` with a verified backup.

    Returns the path of the safety copy of the replaced database (``None`` if the
    target did not exist). Refuses to run while another process uses the target.
    """
    problems = verify_database(backup_file)
    if problems:
        raise BackupError("Backup inválido, restauração cancelada: " + " | ".join(problems))
    if backup_file.resolve() == target_db.resolve():
        raise BackupError("O backup e o destino são o mesmo arquivo.")

    target_db.parent.mkdir(parents=True, exist_ok=True)
    staging = target_db.with_name(target_db.name + ".restoring")
    parked: list[tuple[Path, Path]] = []
    safety_copy: Path | None = None
    try:
        # 1. Prepare and verify the replacement before touching the target.
        try:
            _copy_database(backup_file, staging)
        except sqlite3.DatabaseError as exc:
            raise BackupError(f"Falha ao preparar a restauração: {exc}") from exc
        problems = verify_database(staging)
        if problems:
            raise BackupError("Cópia restaurada é inválida: " + " | ".join(problems))

        if target_db.exists():
            # 2. Refuse to run while a transaction is active on a readable target.
            _ensure_not_locked(target_db)
            # 3. Byte-for-byte safety copy; works even if the target is corrupted.
            safety_copy = _safety_copy(target_db, safety_dir or target_db.parent)

        # 4. Park auxiliary files (reversible) so a stale WAL never meets the new file.
        for suffix in ("-wal", "-shm", "-journal"):
            aux = target_db.with_name(target_db.name + suffix)
            if aux.exists():
                held = aux.with_name(aux.name + ".replaced")
                os.replace(aux, held)
                parked.append((aux, held))

        # 5. Atomic replacement; on failure the original stays in place.
        os.replace(staging, target_db)
    except PermissionError as exc:
        _unpark(parked)
        raise BackupError(_IN_USE_MESSAGE) from exc
    except BaseException:
        _unpark(parked)
        raise
    finally:
        staging.unlink(missing_ok=True)
    for _, held in parked:
        held.unlink(missing_ok=True)
    return safety_copy


_IN_USE_MESSAGE = (
    "O banco está em uso ou bloqueado. Feche a API do C4 Gestão e tente novamente."
)


def _unpark(parked: list[tuple[Path, Path]]) -> None:
    for original, held in parked:
        if held.exists():
            os.replace(held, original)


def _ensure_not_locked(target_db: Path) -> None:
    try:
        lock = sqlite3.connect(target_db, timeout=0.5, isolation_level=None)
        try:
            lock.execute("BEGIN EXCLUSIVE")
            lock.execute("ROLLBACK")
        finally:
            lock.close()
    except sqlite3.OperationalError as exc:
        if "not a database" in str(exc) or "malformed" in str(exc):
            return
        raise BackupError(_IN_USE_MESSAGE) from exc
    except sqlite3.DatabaseError:
        # Corrupted target: nothing to lock; the byte copy below preserves it.
        return


def _safety_copy(target_db: Path, directory: Path) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    copy = directory / f"pre-restore-{stamp}-{target_db.name}"
    counter = 1
    while copy.exists():
        copy = directory / f"pre-restore-{stamp}-{counter}-{target_db.name}"
        counter += 1
    try:
        shutil.copy2(target_db, copy)
        for suffix in ("-wal", "-journal"):
            aux = target_db.with_name(target_db.name + suffix)
            if aux.exists():
                shutil.copy2(aux, copy.with_name(copy.name + suffix))
    except PermissionError as exc:
        copy.unlink(missing_ok=True)
        raise BackupError(_IN_USE_MESSAGE) from exc
    return copy


def export_data(source_db: Path) -> dict[str, object]:
    """Read-only JSON-serializable dump of all business data (no credentials)."""
    if not source_db.is_file():
        raise BackupError("Banco de dados de origem não encontrado.")
    with closing(_open_readonly(source_db)) as conn:
        conn.row_factory = sqlite3.Row
        names = [
            row[0]
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
            )
        ]
        tables: dict[str, list[dict[str, object]]] = {}
        counts: dict[str, int] = {}
        for name in names:
            if name in _EXCLUDED_TABLES:
                continue
            hidden = _EXCLUDED_COLUMNS.get(name, frozenset())
            rows = [
                {key: row[key] for key in row.keys() if key not in hidden}
                for row in conn.execute(f'SELECT * FROM "{name}"')
            ]
            tables[name] = rows
            counts[name] = len(rows)
    return {
        "format_version": EXPORT_FORMAT_VERSION,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "counts": counts,
        "tables": tables,
    }


def write_export(source_db: Path, destination: Path) -> Path:
    data = export_data(source_db)
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + ".partial")
    try:
        partial.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(partial, destination)
    finally:
        partial.unlink(missing_ok=True)
    return destination
