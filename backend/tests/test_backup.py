from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import unittest
from contextlib import closing
from datetime import datetime, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.db.database import get_db
from backend.app.db.models import Base
from backend.app.main import create_app
from backend.app.services.backup import (
    BackupError,
    create_backup,
    export_data,
    list_backups,
    restore_backup,
    verify_database,
    write_export,
)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def counts(path: Path) -> dict[str, int]:
    with closing(sqlite3.connect(path)) as conn:
        names = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
        return {n: conn.execute(f'SELECT COUNT(*) FROM "{n}"').fetchone()[0] for n in names}


class BackupTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp = TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.db = self.root / "data" / "c4gestao.db"
        self.db.parent.mkdir()
        self.backups = self.root / "backups"

        self.engine = create_engine(f"sqlite:///{self.db.as_posix()}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        factory = sessionmaker(bind=self.engine, autoflush=False, autocommit=False, expire_on_commit=False)

        def get_test_db():
            session = factory()
            try:
                yield session
            finally:
                session.close()

        self.app = create_app()
        self.app.dependency_overrides[get_db] = get_test_db
        self.client = TestClient(self.app, client=("127.0.0.1", 50000))
        self.populate()

    def tearDown(self) -> None:
        self.client.close()
        self.app.dependency_overrides.clear()
        self.engine.dispose()
        self.temp.cleanup()

    def populate(self) -> None:
        setup = self.client.post(
            "/auth/setup-admin",
            json={"full_name": "Admin Teste", "username": "admin", "password": "admin-password-123"},
        )
        self.assertEqual(setup.status_code, 201, setup.text)
        self.admin = {"Authorization": "Bearer " + setup.json()["access_token"]}
        self.client.post("/products", json={"code": "A001", "name": "Produto A"}, headers=self.admin)
        location = self.client.post("/locations", json={"code": "EST", "name": "Estoque"}, headers=self.admin).json()
        invoice = self.client.post(
            "/invoices",
            headers=self.admin,
            json={
                "number": "1001",
                "supplier": "Fornecedor",
                "items": [{"product_code": "A001", "unit": "UN", "invoice_quantity": 10}],
            },
        ).json()
        confer = self.client.post(
            f"/invoices/{invoice['id']}/items/{invoice['items'][0]['id']}/confer",
            headers=self.admin,
            json={"conferred_quantity": 8, "location_id": location["id"], "lot": "L1", "expiration_date": "2027-01-01"},
        )
        self.assertEqual(confer.status_code, 201, confer.text)

    def test_backup_is_verified_consistent_and_leaves_source_untouched(self) -> None:
        before = sha256(self.db)
        backup = create_backup(self.db, self.backups)
        self.assertEqual(sha256(self.db), before)
        self.assertEqual(verify_database(backup), [])
        self.assertEqual(counts(backup), counts(self.db))
        self.assertEqual(counts(backup)["movements"], 1)
        self.assertEqual(counts(backup)["invoice_items"], 1)
        self.assertEqual([p.name for p in self.backups.iterdir() if p.name.endswith(".partial")], [])

    def test_same_second_backups_do_not_overwrite_each_other(self) -> None:
        moment = datetime(2026, 1, 1, 12, 0, 0, tzinfo=timezone.utc)
        first = create_backup(self.db, self.backups, now=moment)
        second = create_backup(self.db, self.backups, now=moment)
        self.assertNotEqual(first, second)
        self.assertEqual(len(list_backups(self.backups)), 2)

    def test_rotation_keeps_newest_and_never_touches_other_files(self) -> None:
        self.backups.mkdir()
        unrelated = self.backups / "notas-importantes.db"
        unrelated.write_text("nao apagar")
        for day in range(1, 6):
            create_backup(self.db, self.backups, keep=3, now=datetime(2026, 1, day, tzinfo=timezone.utc))
        names = [p.name for p in list_backups(self.backups)]
        self.assertEqual(names, ["c4gestao-20260103-000000.db", "c4gestao-20260104-000000.db", "c4gestao-20260105-000000.db"])
        self.assertTrue(unrelated.exists())

    def test_backup_of_missing_source_fails_without_creating_files(self) -> None:
        with self.assertRaises(BackupError):
            create_backup(self.root / "nao-existe.db", self.backups)
        self.assertEqual(list_backups(self.backups), [])

    def test_restore_round_trip_recovers_data_and_keeps_safety_copy(self) -> None:
        backup = create_backup(self.db, self.backups)
        backup_hash = sha256(backup)
        original = counts(self.db)

        # Simulate data loss after the backup.
        with closing(sqlite3.connect(self.db)) as conn:
            conn.execute("PRAGMA foreign_keys = OFF")
            conn.execute("DELETE FROM movements")
            conn.execute("DELETE FROM invoice_items")
            conn.execute("DELETE FROM stock_items")
            conn.commit()
        self.assertNotEqual(counts(self.db), original)
        damaged_hash = sha256(self.db)

        self.engine.dispose()
        safety_dir = self.root / "safety"
        safety = restore_backup(backup, self.db, safety_dir)

        self.assertEqual(counts(self.db), original)
        self.assertEqual(verify_database(self.db), [])
        self.assertIsNotNone(safety)
        self.assertEqual(counts(safety)["movements"], 0)  # state that was replaced is preserved
        self.assertTrue(safety.parent == safety_dir)
        self.assertEqual(sha256(backup), backup_hash)  # restoring never alters the backup
        self.assertEqual(verify_database(backup), [])
        self.assertNotEqual(sha256(self.db), damaged_hash)
        self.assertEqual([p.name for p in self.db.parent.iterdir() if p.name.endswith(".restoring")], [])

    def test_restore_into_new_location_has_no_safety_copy(self) -> None:
        backup = create_backup(self.db, self.backups)
        target = self.root / "novo" / "c4gestao.db"
        self.assertIsNone(restore_backup(backup, target))
        self.assertEqual(counts(target), counts(self.db))

    def test_invalid_backups_are_rejected_and_target_is_untouched(self) -> None:
        before = sha256(self.db)
        garbage = self.root / "lixo.db"
        garbage.write_bytes(b"isto nao e um banco sqlite" * 50)
        empty = self.root / "vazio.db"
        sqlite3.connect(empty).close()
        for bad in (garbage, empty, self.root / "inexistente.db"):
            with self.subTest(bad=bad.name), self.assertRaises(BackupError):
                restore_backup(bad, self.db)
        with self.assertRaises(BackupError):
            restore_backup(self.db, self.db)
        self.assertEqual(sha256(self.db), before)

    def test_restore_is_refused_while_database_is_in_use(self) -> None:
        backup = create_backup(self.db, self.backups)
        before = sha256(self.db)
        holder = sqlite3.connect(self.db, isolation_level=None)
        try:
            holder.execute("BEGIN IMMEDIATE")
            with self.assertRaises(BackupError) as ctx:
                restore_backup(backup, self.db)
            self.assertIn("em uso", str(ctx.exception))
        finally:
            holder.execute("ROLLBACK")
            holder.close()
        self.assertEqual(sha256(self.db), before)

    @unittest.skipUnless(os.name == "nt", "Windows bloqueia a substituição de arquivos abertos")
    def test_restore_with_idle_open_connection_gives_controlled_error(self) -> None:
        backup = create_backup(self.db, self.backups)
        before = sha256(self.db)
        idle = sqlite3.connect(self.db)
        try:
            idle.execute("SELECT COUNT(*) FROM products").fetchall()
            with self.assertRaises(BackupError) as ctx:
                restore_backup(backup, self.db, self.root / "safety")
            self.assertIn("Feche a API", str(ctx.exception))
        finally:
            idle.close()
        self.assertEqual(sha256(self.db), before)
        self.assertEqual(verify_database(self.db), [])
        self.assertEqual([p.name for p in self.db.parent.iterdir() if p.name.endswith(".restoring")], [])

    def test_restore_over_corrupted_target_preserves_original_bytes(self) -> None:
        backup = create_backup(self.db, self.backups)
        original = counts(self.db)
        self.engine.dispose()
        corrupted = b"corrompido" * 300
        self.db.write_bytes(corrupted)

        safety = restore_backup(backup, self.db, self.root / "safety")

        self.assertEqual(safety.read_bytes(), corrupted)
        self.assertEqual(verify_database(self.db), [])
        self.assertEqual(counts(self.db), original)

    def test_failure_during_replace_keeps_original_and_auxiliary_files(self) -> None:
        backup = create_backup(self.db, self.backups)
        self.engine.dispose()
        before = sha256(self.db)
        journal = self.db.with_name(self.db.name + "-journal")
        journal.write_bytes(b"")
        real_replace = os.replace

        with mock.patch("backend.app.services.backup.os.replace") as replace:
            def fail_final(src, dst):
                if Path(dst) == self.db:
                    raise OSError("falha simulada")
                return real_replace(src, dst)

            replace.side_effect = fail_final
            with self.assertRaises(OSError):
                restore_backup(backup, self.db, self.root / "safety")

        self.assertEqual(sha256(self.db), before)
        self.assertTrue(journal.exists())
        self.assertEqual(verify_database(self.db), [])
        self.assertEqual([p.name for p in self.db.parent.iterdir() if p.name.endswith((".restoring", ".replaced"))], [])

    def test_backup_is_identical_before_and_after_restore_cycle(self) -> None:
        backup = create_backup(self.db, self.backups)
        backup_hash = sha256(backup)
        expected = counts(backup)
        self.engine.dispose()
        restore_backup(backup, self.db, self.root / "safety")
        self.assertEqual(sha256(backup), backup_hash)
        self.assertEqual(verify_database(backup), [])
        self.assertEqual(counts(self.db), expected)

    def test_export_contains_history_and_excludes_credentials(self) -> None:
        data = export_data(self.db)
        self.assertEqual(data["format_version"], 1)
        tables = data["tables"]
        self.assertNotIn("admin_credentials", tables)
        self.assertNotIn("auth_sessions", tables)
        for user in tables["users"]:
            self.assertNotIn("password_hash", user)
        self.assertEqual(data["counts"]["products"], 1)
        self.assertEqual(data["counts"]["movements"], 1)
        self.assertEqual(tables["invoice_items"][0]["invoice_quantity"], 10)
        self.assertEqual(tables["invoice_items"][0]["conferred_quantity"], 8)
        self.assertEqual(tables["stock_items"][0]["lot"], "L1")
        self.assertNotIn("admin-password-123", json.dumps(data))

    def test_write_export_creates_valid_json_and_leaves_source_untouched(self) -> None:
        before = sha256(self.db)
        out = write_export(self.db, self.root / "exports" / "dados.json")
        self.assertEqual(sha256(self.db), before)
        loaded = json.loads(out.read_text(encoding="utf-8"))
        self.assertEqual(loaded["counts"]["invoices"], 1)
        self.assertEqual([p.name for p in out.parent.iterdir()], ["dados.json"])


if __name__ == "__main__":
    unittest.main()
