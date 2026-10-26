from __future__ import annotations

import hashlib
import json
import sqlite3
import subprocess
import sys
import unittest
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory

from backend.app.core import paths
from backend.app.services.backup import REQUIRED_TABLES
from backend.app.tools import backup as cli

REPO_ROOT = Path(__file__).resolve().parents[2]


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_db(path: Path, marker: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with closing(sqlite3.connect(path)) as conn:
        for table in sorted(REQUIRED_TABLES):
            conn.execute(f"CREATE TABLE {table} (id INTEGER PRIMARY KEY, v TEXT)")
        conn.execute("INSERT INTO products (v) VALUES (?)", (marker,))
        conn.commit()


def marker(path: Path) -> str:
    with closing(sqlite3.connect(path)) as conn:
        return conn.execute("SELECT v FROM products").fetchone()[0]


class PathResolverTests(unittest.TestCase):
    def test_defaults_use_localappdata(self) -> None:
        env = {"LOCALAPPDATA": r"C:\Users\x\AppData\Local"}
        self.assertEqual(paths.data_dir(env), Path(r"C:\Users\x\AppData\Local") / "C4Gestao" / "data")
        self.assertEqual(paths.backup_dir(env), Path(r"C:\Users\x\AppData\Local") / "C4Gestao" / "backups")
        self.assertEqual(paths.default_db_path(env).name, "c4gestao.db")

    def test_environment_overrides_win(self) -> None:
        with TemporaryDirectory() as tmp:
            env = {"C4_DATA_DIR": tmp + "/d", "C4_BACKUP_DIR": tmp + "/b"}
            self.assertEqual(paths.data_dir(env), Path(tmp + "/d"))
            self.assertEqual(paths.backup_dir(env), Path(tmp + "/b"))

    def test_relative_override_and_missing_localappdata_are_rejected(self) -> None:
        with self.assertRaises(paths.PathConfigError):
            paths.data_dir({"C4_DATA_DIR": "relativo"})
        with self.assertRaises(paths.PathConfigError):
            paths.backup_dir({})

    def test_resolver_creates_nothing(self) -> None:
        with TemporaryDirectory() as tmp:
            paths.data_dir({"LOCALAPPDATA": tmp})
            paths.backup_dir({"LOCALAPPDATA": tmp})
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_current_db_is_still_the_legacy_path_and_matches_database_module(self) -> None:
        from backend.app.db.database import DEFAULT_DB_PATH

        self.assertEqual(paths.current_db_path({"LOCALAPPDATA": "C:/x"}), DEFAULT_DB_PATH)
        self.assertEqual(paths.legacy_db_path(), DEFAULT_DB_PATH)
        self.assertNotEqual(paths.current_db_path({"LOCALAPPDATA": "C:/x"}), paths.default_db_path({"LOCALAPPDATA": "C:/x"}))

    def test_database_url_override_is_honored(self) -> None:
        with TemporaryDirectory() as tmp:
            target = Path(tmp) / "t.db"
            self.assertEqual(paths.current_db_path({"C4_DATABASE_URL": f"sqlite:///{target.as_posix()}"}), target.resolve())
        with self.assertRaises(paths.PathConfigError):
            paths.current_db_path({"C4_DATABASE_URL": "sqlite:///:memory:"})
        with self.assertRaises(paths.PathConfigError):
            paths.current_db_path({"C4_DATABASE_URL": "postgresql://x/y"})


class CliTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.db = self.root / "app" / "c4gestao.db"
        make_db(self.db, "atual")
        self.backups = self.root / "backups"
        self.env = {
            "C4_DATABASE_URL": f"sqlite:///{self.db.as_posix()}",
            "C4_BACKUP_DIR": str(self.backups),
        }
        self.lines: list[str] = []

    def tearDown(self) -> None:
        self.temp.cleanup()

    def run_cli(self, *argv: str, api_up: bool = False) -> int:
        return cli.main(list(argv), env=self.env, out=self.lines.append, api_probe=lambda _port: api_up)

    def text(self) -> str:
        return "\n".join(self.lines)

    def test_backup_prints_paths_and_never_overwrites(self) -> None:
        before = sha256(self.db)
        self.assertEqual(self.run_cli("backup"), 0)
        self.assertEqual(self.run_cli("backup"), 0)
        files = sorted(p.name for p in self.backups.iterdir())
        self.assertEqual(len(files), 2)
        self.assertIn(str(self.db), self.text())
        self.assertIn(str(self.backups), self.text())
        self.assertEqual(sha256(self.db), before)

    def test_verify_good_and_bad_files(self) -> None:
        self.assertEqual(self.run_cli("verify"), 0)
        bad = self.root / "lixo.db"
        bad.write_bytes(b"x" * 500)
        self.assertEqual(self.run_cli("verify", str(bad)), 1)

    def test_export_is_labeled_partial_and_refuses_existing_file(self) -> None:
        out = self.root / "dados.json"
        self.assertEqual(self.run_cli("export", "--output", str(out)), 0)
        self.assertIn("NÃO substitui o backup", self.text())
        self.assertEqual(json.loads(out.read_text(encoding="utf-8"))["counts"]["products"], 1)
        before = out.read_bytes()
        self.assertEqual(self.run_cli("export", "--output", str(out)), 1)
        self.assertEqual(out.read_bytes(), before)

    def test_restore_without_confirmation_changes_nothing(self) -> None:
        self.run_cli("backup")
        backup = next(self.backups.iterdir())
        before = sha256(self.db)
        self.assertEqual(self.run_cli("restore", "--backup-file", str(backup)), 2)
        self.assertEqual(self.run_cli("restore", "--backup-file", str(backup), "--confirm", "sim"), 2)
        self.assertEqual(sha256(self.db), before)
        self.assertIn(str(self.db), self.text())
        self.assertFalse((self.backups / "pre-restore").exists())

    def test_restore_is_refused_while_api_is_listening(self) -> None:
        self.run_cli("backup")
        backup = next(self.backups.iterdir())
        before = sha256(self.db)
        code = self.run_cli("restore", "--backup-file", str(backup), "--confirm", "RESTAURAR", api_up=True)
        self.assertEqual(code, 1)
        self.assertIn("API responde", self.text())
        self.assertEqual(sha256(self.db), before)

    def test_confirmed_restore_recovers_data_and_keeps_safety_copy(self) -> None:
        self.run_cli("backup")
        backup = next(self.backups.iterdir())
        with closing(sqlite3.connect(self.db)) as conn:
            conn.execute("UPDATE products SET v='alterado'")
            conn.commit()
        code = self.run_cli("restore", "--backup-file", str(backup), "--confirm", "RESTAURAR")
        self.assertEqual(code, 0, self.text())
        self.assertEqual(marker(self.db), "atual")
        safety = list((self.backups / "pre-restore").iterdir())
        self.assertEqual(len(safety), 1)
        self.assertEqual(marker(safety[0]), "alterado")

    def test_restore_of_invalid_backup_is_rejected_and_target_untouched(self) -> None:
        bad = self.root / "lixo.db"
        bad.write_bytes(b"x" * 500)
        before = sha256(self.db)
        code = self.run_cli("restore", "--backup-file", str(bad), "--confirm", "RESTAURAR")
        self.assertEqual(code, 1)
        self.assertEqual(sha256(self.db), before)

    def test_unknown_action_is_a_usage_error(self) -> None:
        self.assertNotEqual(self.run_cli("apagar"), 0)

    def test_module_entry_point_runs_in_a_subprocess(self) -> None:
        import os

        env = {**os.environ, **self.env, "PYTHONDONTWRITEBYTECODE": "1"}
        result = subprocess.run(
            [sys.executable, "-B", "-m", "backend.app.tools.backup", "verify"],
            cwd=REPO_ROOT, env=env, capture_output=True, text=True, timeout=60,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("OK", result.stdout)


if __name__ == "__main__":
    unittest.main()
