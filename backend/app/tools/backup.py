"""Maintenance CLI: python -m backend.app.tools.backup <backup|verify|restore|export>.

Paths are always printed before a sensitive operation. Backups and exports never
overwrite existing files; a restore needs an explicit confirmation and refuses to
run while the local API answers on its port.
"""

from __future__ import annotations

import argparse
import socket
import sys
from collections.abc import Callable, Mapping, Sequence
from datetime import datetime, timezone
from pathlib import Path

from backend.app.core import paths
from backend.app.services import backup as service

RESTORE_CONFIRMATION = "RESTAURAR"
DEFAULT_API_PORT = 8000


def api_is_listening(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.5)
        return probe.connect_ex((host, port)) == 0


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="python -m backend.app.tools.backup")
    sub = parser.add_subparsers(dest="action", required=True)

    def common(p: argparse.ArgumentParser) -> None:
        p.add_argument("--db", type=Path, help="Banco SQLite (padrão: o banco usado hoje pela aplicação).")

    p_backup = sub.add_parser("backup", help="Cria um backup consistente e verificado.")
    common(p_backup)
    p_backup.add_argument("--backup-dir", type=Path)
    p_backup.add_argument("--keep", type=int, default=14)

    p_verify = sub.add_parser("verify", help="Verifica um banco ou backup (somente leitura).")
    p_verify.add_argument("file", type=Path, nargs="?", help="Arquivo a verificar (padrão: o banco atual).")

    p_restore = sub.add_parser("restore", help="Restaura um backup sobre o banco de destino.")
    common(p_restore)
    p_restore.add_argument("--backup-file", type=Path, required=True)
    p_restore.add_argument("--backup-dir", type=Path, help="Onde guardar a cópia de segurança do destino.")
    p_restore.add_argument("--confirm", default="", help=f"Digite {RESTORE_CONFIRMATION} para confirmar.")
    p_restore.add_argument("--api-port", type=int)

    p_export = sub.add_parser("export", help="Exporta dados operacionais em JSON (não é backup completo).")
    common(p_export)
    p_export.add_argument("--output", type=Path)
    return parser


def main(
    argv: Sequence[str] | None = None,
    env: Mapping[str, str] | None = None,
    out: Callable[[str], None] = print,
    api_probe: Callable[[int], bool] = api_is_listening,
) -> int:
    try:
        args = _parser().parse_args(argv)
    except SystemExit as exc:
        return int(exc.code or 0)
    try:
        return _run(args, env, out, api_probe)
    except (service.BackupError, paths.PathConfigError) as exc:
        out(f"ERRO: {exc}")
        return 1


def _run(args: argparse.Namespace, env, out, api_probe) -> int:
    db = (args.db or paths.current_db_path(env)) if args.action != "verify" else None

    if args.action == "backup":
        destination = args.backup_dir or paths.backup_dir(env)
        out(f"Origem : {db}")
        out(f"Destino: {destination}")
        created = service.create_backup(db, destination, keep=args.keep)
        out(f"Backup criado e verificado: {created}")
        return 0

    if args.action == "verify":
        target = args.file or paths.current_db_path(env)
        out(f"Verificando (somente leitura): {target}")
        problems = service.verify_database(target)
        for problem in problems:
            out(f"PROBLEMA: {problem}")
        out("OK: arquivo válido." if not problems else "FALHOU.")
        return 0 if not problems else 1

    if args.action == "export":
        output = args.output or paths.backup_dir(env) / "exports" / (
            "c4gestao-export-" + datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S") + ".json"
        )
        out(f"Origem : {db}")
        out(f"Destino: {output}")
        out("Exportação parcial de dados: sem credenciais, sessões, schema ou índices. NÃO substitui o backup.")
        if output.exists():
            raise service.BackupError("O arquivo de exportação já existe; nada foi sobrescrito.")
        service.write_export(db, output)
        out(f"Exportação criada: {output}")
        return 0

    safety_dir = (args.backup_dir or paths.backup_dir(env)) / "pre-restore"
    out(f"Backup a restaurar : {args.backup_file}")
    out(f"Banco de destino   : {db}")
    out(f"Cópia de segurança : {safety_dir}")
    if args.confirm != RESTORE_CONFIRMATION:
        out(f"Restauração NÃO executada. Repita com --confirm {RESTORE_CONFIRMATION} para confirmar.")
        return 2
    port = args.api_port or DEFAULT_API_PORT
    if api_probe(port):
        out(f"ERRO: a API responde na porta {port}. Feche o C4 Gestão e tente novamente.")
        return 1
    restored_from = service.restore_backup(args.backup_file, db, safety_dir)
    out(f"Restauração concluída. Cópia do banco anterior: {restored_from}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
