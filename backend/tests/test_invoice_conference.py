from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from backend.app.db.database import get_db
from backend.app.db.migrations import apply_schema_upgrades
from backend.app.db.models import Base, Invoice, Movement, StockItem
from backend.app.main import create_app


class InvoiceConferenceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        path = Path(self.temp_dir.name) / "invoice-tests.sqlite"
        self.engine = create_engine(
            f"sqlite:///{path.as_posix()}", connect_args={"check_same_thread": False}
        )
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(
            bind=self.engine, autoflush=False, autocommit=False, expire_on_commit=False
        )

        def get_test_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.app = create_app()
        self.app.dependency_overrides[get_db] = get_test_db
        self.client = TestClient(self.app, client=("127.0.0.1", 50000))

        setup = self.client.post(
            "/auth/setup-admin",
            json={"full_name": "Admin Teste", "username": "admin", "password": "admin-password-123"},
        )
        self.assertEqual(setup.status_code, 201, setup.text)
        self.admin = {"Authorization": "Bearer " + setup.json()["access_token"]}
        self.admin_id = setup.json()["user"]["id"]
        self.second = self.make_user("maria", "Maria Conferente")

        self.product_a = self.post("/products", {"code": "A001", "name": "Produto A"}).json()
        self.product_b = self.post("/products", {"code": "B002", "name": "Produto B"}).json()
        self.location = self.post("/locations", {"code": "EST", "name": "Estoque"}).json()

    def tearDown(self) -> None:
        self.client.close()
        self.app.dependency_overrides.clear()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def make_user(self, username: str, full_name: str) -> dict[str, object]:
        created = self.client.post(
            "/auth/users",
            headers=self.admin,
            json={"full_name": full_name, "username": username, "password": "user-password-123", "role": "CONFERENTE"},
        )
        self.assertEqual(created.status_code, 201, created.text)
        login = self.client.post("/auth/login", json={"username": username, "password": "user-password-123"})
        self.assertEqual(login.status_code, 200, login.text)
        return {
            "headers": {"Authorization": "Bearer " + login.json()["access_token"]},
            "id": created.json()["id"],
        }

    def post(self, path: str, body: dict, headers: dict | None = None):
        response = self.client.post(path, json=body, headers=headers or self.admin)
        return response

    def new_invoice(self, number: str = "1001", qtys=(10, 5), **extra) -> dict:
        items = [
            {"product_code": "A001", "unit": "UN", "invoice_quantity": qtys[0], "product_description": "Produto A"},
            {"product_code": "B002", "unit": "CX", "invoice_quantity": qtys[1]},
        ]
        response = self.post(
            "/invoices",
            {"number": number, "series": "1", "supplier": "Fornecedor X", "received_date": "2026-01-10", "items": items, **extra},
        )
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()

    def confer(self, invoice: dict, index: int, qty: float, headers=None, **extra):
        body = {
            "conferred_quantity": qty,
            "location_id": self.location["id"],
            "lot": "L1",
            "expiration_date": "2027-01-01",
            **extra,
        }
        item = invoice["items"][index]
        return self.post(f"/invoices/{invoice['id']}/items/{item['id']}/confer", body, headers)

    def db_stock(self, stock_item_id: str) -> float:
        with self.session_factory() as db:
            return db.get(StockItem, stock_item_id).quantity

    # 1
    def test_invoice_with_multiple_items_and_optional_fields(self) -> None:
        invoice = self.new_invoice()
        self.assertEqual(invoice["status"], "PENDENTE")
        self.assertEqual([i["line_number"] for i in invoice["items"]], [1, 2])
        self.assertEqual(invoice["items"][0]["product_id"], self.product_a["id"])
        self.assertIsNone(invoice["access_key"])
        minimal = self.post(
            "/invoices", {"number": "1002", "items": [{"product_code": "ZZZ", "unit": "UN", "invoice_quantity": 1}]}
        )
        self.assertEqual(minimal.status_code, 201, minimal.text)
        self.assertIsNone(minimal.json()["items"][0]["product_id"])
        listing = self.client.get("/invoices", headers=self.admin).json()
        self.assertEqual(listing["total"], 2)

    # 2, 3, 7 (NF / CONF / EST stored separately, history survives exits)
    def test_nf_conf_est_are_separate_and_history_survives_exit(self) -> None:
        invoice = self.new_invoice()
        ok = self.confer(invoice, 0, 10)
        self.assertEqual(ok.status_code, 201, ok.text)
        body = ok.json()
        self.assertEqual(body["status"], "CONFERIDO")
        self.assertEqual((body["invoice_quantity"], body["conferred_quantity"], body["current_stock_quantity"]), (10, 10, 10))
        self.assertEqual(body["divergence_quantity"], 0)

        short = self.confer(invoice, 1, 3, lot="L9")
        self.assertEqual(short.status_code, 201, short.text)
        short_body = short.json()
        self.assertEqual(short_body["status"], "DIVERGENTE")
        self.assertEqual(short_body["divergence_quantity"], -2)
        self.assertEqual((short_body["invoice_quantity"], short_body["conferred_quantity"]), (5, 3))

        refreshed = self.client.get(f"/invoices/{invoice['id']}", headers=self.admin).json()
        self.assertEqual(refreshed["status"], "CONFERIDA_COM_DIVERGENCIA")
        self.assertEqual(refreshed["conferred_by_user_id"], self.admin_id)

        # 6: partial exit through the existing movement API
        exit_response = self.post(
            "/movements",
            {
                "product_id": self.product_a["id"],
                "type": "SAIDA",
                "quantity": 4,
                "unit": "UN",
                "source_stock_item_id": body["stock_item_id"],
            },
        )
        self.assertEqual(exit_response.status_code, 201, exit_response.text)
        saida = exit_response.json()
        self.assertEqual((saida["quantity_before"], saida["quantity_after"]), (10, 6))
        self.assertEqual(saida["user_id"], self.admin_id)

        after = self.client.get(f"/invoices/{invoice['id']}", headers=self.admin).json()["items"][0]
        self.assertEqual(after["current_stock_quantity"], 6)
        self.assertEqual(after["invoice_quantity"], 10)
        self.assertEqual(after["conferred_quantity"], 10)
        self.assertEqual(self.db_stock(body["stock_item_id"]), 6)

    # entry movement audit
    def test_entry_movement_audit_fields(self) -> None:
        invoice = self.new_invoice()
        item = self.confer(invoice, 0, 8, headers=self.second["headers"]).json()
        with self.session_factory() as db:
            movement = db.get(Movement, item["entry_movement_id"])
            self.assertEqual(movement.type, "ENTRADA")
            self.assertEqual(movement.user_id, self.second["id"])
            self.assertEqual(movement.invoice_id, invoice["id"])
            self.assertEqual(movement.invoice_item_id, item["id"])
            self.assertEqual((movement.quantity_before, movement.quantity_after), (0, 8))
            self.assertEqual(movement.invoice_number, "1001")
            self.assertEqual(movement.lot_snapshot, "L1")
            self.assertEqual(movement.expiration_date, "2027-01-01")
        self.assertEqual(item["conferred_by_user_id"], self.second["id"])

    # 5
    def test_same_product_with_different_lots_and_expirations(self) -> None:
        first = self.new_invoice("2001")
        second = self.new_invoice("2002")
        a = self.confer(first, 0, 10).json()
        b = self.confer(second, 0, 7, lot="L2", expiration_date="2027-06-01").json()
        same = self.confer(self.new_invoice("2003"), 0, 5).json()  # same lot/expiration as `a`
        self.assertNotEqual(a["stock_item_id"], b["stock_item_id"])
        self.assertEqual(same["stock_item_id"], a["stock_item_id"])
        self.assertEqual(self.db_stock(a["stock_item_id"]), 15)
        self.assertEqual(self.db_stock(b["stock_item_id"]), 7)
        with self.session_factory() as db:
            stock = db.get(StockItem, a["stock_item_id"])
            self.assertEqual(stock.received_quantity, 15)
        no_expiry = self.confer(self.new_invoice("2004"), 0, 2, lot="L3", expiration_date=None, no_expiration_date=True)
        self.assertEqual(no_expiry.status_code, 201, no_expiry.text)

    def test_expiration_rules_and_zero_conferred(self) -> None:
        invoice = self.new_invoice("3001")
        missing = self.confer(invoice, 0, 5, expiration_date=None)
        self.assertEqual(missing.status_code, 422)
        zero = self.confer(invoice, 0, 0)
        self.assertEqual(zero.status_code, 201, zero.text)
        self.assertEqual(zero.json()["status"], "DIVERGENTE")
        self.assertIsNone(zero.json()["entry_movement_id"])
        with self.session_factory() as db:
            self.assertEqual(db.query(Movement).count(), 0)

    # 8
    def test_duplicate_protection(self) -> None:
        invoice = self.new_invoice("4001")
        first = self.confer(invoice, 0, 10)
        replay = self.confer(invoice, 0, 10)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(replay.status_code, 200, replay.text)
        self.assertEqual(replay.json()["entry_movement_id"], first.json()["entry_movement_id"])
        self.assertEqual(self.db_stock(first.json()["stock_item_id"]), 10)
        with self.session_factory() as db:
            self.assertEqual(db.query(Movement).filter(Movement.type == "ENTRADA").count(), 1)

        different = self.confer(invoice, 0, 99)
        self.assertEqual(different.status_code, 409)
        self.assertEqual(self.db_stock(first.json()["stock_item_id"]), 10)

        duplicate = self.post(
            "/invoices",
            {"number": "4001", "series": "1", "supplier": "Fornecedor X", "items": [{"product_code": "A001", "unit": "UN", "invoice_quantity": 1}]},
        )
        self.assertEqual(duplicate.status_code, 409)
        key = "1" * 44
        self.assertEqual(self.new_invoice("4002", access_key=key)["access_key"], key)
        same_key = self.post(
            "/invoices", {"number": "4003", "access_key": key, "items": [{"product_code": "A001", "unit": "UN", "invoice_quantity": 1}]}
        )
        self.assertEqual(same_key.status_code, 409)

    def test_database_blocks_second_entry_for_same_item(self) -> None:
        invoice = self.new_invoice("4101")
        item = self.confer(invoice, 0, 10).json()
        with self.session_factory() as db:
            original = db.get(Movement, item["entry_movement_id"])
            db.add(
                Movement(
                    product_id=original.product_id, type="ENTRADA", quantity=1, unit="UN",
                    destination_location_id=original.destination_location_id,
                    product_code_snapshot="A001", product_name_snapshot="Produto A",
                    idempotency_key=original.idempotency_key,
                )
            )
            with self.assertRaises(IntegrityError):
                db.commit()

    # 9
    def test_authentication_required_and_user_identity_recorded(self) -> None:
        invoice = self.new_invoice("5001")
        item_id = invoice["items"][0]["id"]
        body = {"conferred_quantity": 1, "location_id": self.location["id"], "lot": "L", "expiration_date": "2027-01-01"}
        for method, path, payload in (
            ("get", "/invoices", None),
            ("get", f"/invoices/{invoice['id']}", None),
            ("post", "/invoices", {"number": "x", "items": []}),
            ("post", f"/invoices/{invoice['id']}/items/{item_id}/confer", body),
        ):
            response = getattr(self.client, method)(path, **({"json": payload} if payload is not None else {}))
            self.assertEqual(response.status_code, 401, path)
            bad = getattr(self.client, method)(
                path, headers={"Authorization": "Bearer invalid"}, **({"json": payload} if payload is not None else {})
            )
            self.assertEqual(bad.status_code, 401, path)
        created = self.post(
            "/invoices",
            {"number": "5002", "items": [{"product_code": "A001", "unit": "UN", "invoice_quantity": 1}]},
            self.second["headers"],
        )
        self.assertEqual(created.json()["created_by_user_id"], self.second["id"])

    def test_inactive_location_and_unknown_product_rejected(self) -> None:
        invoice = self.post(
            "/invoices", {"number": "6001", "items": [{"product_code": "NOPE", "unit": "UN", "invoice_quantity": 1}]}
        ).json()
        response = self.confer(invoice, 0, 1)
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.confer(invoice, 0, 1, location_id="missing").status_code, 422)
        self.assertEqual(
            self.client.get("/invoices/does-not-exist", headers=self.admin).status_code, 404
        )

    # 10
    def test_legacy_database_is_upgraded_without_losing_rows(self) -> None:
        legacy_path = Path(self.temp_dir.name) / "legacy.sqlite"
        legacy = create_engine(f"sqlite:///{legacy_path.as_posix()}")
        with legacy.begin() as connection:
            connection.execute(text("CREATE TABLE movements (id VARCHAR(36) PRIMARY KEY, type VARCHAR(20) NOT NULL, quantity FLOAT NOT NULL)"))
            connection.execute(text("INSERT INTO movements VALUES ('old-1', 'ENTRADA', 3)"))
        added = apply_schema_upgrades(legacy)
        self.assertEqual(
            sorted(added),
            sorted(f"movements.{c}" for c in ("user_id", "invoice_id", "invoice_item_id", "quantity_before", "quantity_after")),
        )
        self.assertEqual(apply_schema_upgrades(legacy), [])
        columns = {c["name"] for c in inspect(legacy).get_columns("movements")}
        self.assertTrue({"user_id", "invoice_id", "invoice_item_id", "quantity_before", "quantity_after"} <= columns)
        with legacy.connect() as connection:
            row = connection.execute(text("SELECT id, type, quantity, user_id, quantity_before FROM movements")).one()
        self.assertEqual(tuple(row), ("old-1", "ENTRADA", 3, None, None))
        legacy.dispose()

    def test_existing_movement_endpoints_still_work(self) -> None:
        invoice = self.new_invoice("7001")
        item = self.confer(invoice, 0, 10).json()
        move = self.post(
            "/movements",
            {"product_id": self.product_a["id"], "type": "ENTRADA", "quantity": 2, "unit": "UN", "destination_stock_item_id": item["stock_item_id"]},
        )
        self.assertEqual(move.status_code, 201, move.text)
        self.assertEqual((move.json()["quantity_before"], move.json()["quantity_after"]), (10, 12))
        reverse = self.post(f"/movements/{move.json()['id']}/reverse", {"reason": "teste"})
        self.assertEqual(reverse.status_code, 201, reverse.text)
        self.assertEqual(reverse.json()["user_id"], self.admin_id)
        self.assertEqual((reverse.json()["quantity_before"], reverse.json()["quantity_after"]), (12, 10))
        self.assertEqual(self.db_stock(item["stock_item_id"]), 10)
        for path in ("/products", "/locations", "/checkers", "/stock", "/movements"):
            self.assertEqual(self.client.get(path, headers=self.admin).status_code, 200, path)
        self.assertEqual(self.client.get("/products").status_code, 401)


if __name__ == "__main__":
    unittest.main()
