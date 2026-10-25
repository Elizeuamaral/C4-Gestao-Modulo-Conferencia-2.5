from __future__ import annotations

import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import sessionmaker

from backend.app.db.database import get_db
from backend.app.db.models import Base, Invoice, Movement, StockItem
from backend.app.main import create_app
from backend.app.services.nfe.key import InvalidAccessKeyError, parse_access_key
from backend.app.services.nfe.providers import (
    NFeNotFoundError,
    NFeProviderUnavailableError,
    XmlDirectoryProvider,
    get_nfe_provider,
)
from backend.app.services.nfe.xml_parser import NFeParseError, parse_nfe_xml


def make_key(number: int = 1234, uf: str = "35", model: str = "55") -> str:
    base = f"{uf}2601" + "12345678000195" + model + "001" + f"{number:09d}" + "1" + "12345678"
    total, weight = 0, 2
    for digit in reversed(base):
        total += int(digit) * weight
        weight = 2 if weight == 9 else weight + 1
    remainder = total % 11
    return base + str(0 if remainder < 2 else 11 - remainder)


KEY = make_key()


def make_xml(key: str = KEY, items: str | None = None, wrapper: bool = True, number: str = "1234") -> str:
    items = items if items is not None else _item(1, "7891000100103", "P-1", "Produto A", "UN", "10.0000")
    nfe = (
        '<NFe xmlns="http://www.portalfiscal.inf.br/nfe">'
        f'<infNFe Id="NFe{key}" versao="4.00">'
        f"<ide><nNF>{number}</nNF><serie>1</serie><dhEmi>2026-01-10T08:00:00-03:00</dhEmi></ide>"
        "<emit><CNPJ>12345678000195</CNPJ><xNome>Fornecedor Teste Ltda</xNome></emit>"
        f"{items}</infNFe></NFe>"
    )
    if not wrapper:
        return '<?xml version="1.0" encoding="UTF-8"?>' + nfe
    return (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">' + nfe + "</nfeProc>"
    )


def _item(n: int, ean: str, code: str, name: str, unit: str, qty: str, rastros: tuple = ()) -> str:
    lots = "".join(
        f"<rastro><nLote>{lot}</nLote><qLote>{q}</qLote><dFab>2026-01-01</dFab><dVal>{val}</dVal></rastro>"
        for lot, q, val in rastros
    )
    return (
        f'<det nItem="{n}"><prod><cProd>{code}</cProd><cEAN>{ean}</cEAN><xProd>{name}</xProd>'
        f"<uCom>{unit}</uCom><qCom>{qty}</qCom>{lots}</prod></det>"
    )


class AccessKeyTests(unittest.TestCase):
    def test_valid_key_and_separators(self) -> None:
        parsed = parse_access_key(" ".join([KEY[i : i + 4] for i in range(0, 44, 4)]))
        self.assertEqual(parsed.value, KEY)
        self.assertEqual((parsed.uf_code, parsed.series, parsed.number), ("35", "1", "1234"))

    def test_invalid_keys(self) -> None:
        wrong_dv = KEY[:-1] + str((int(KEY[-1]) + 1) % 10)
        for bad in ("", "123", KEY[:-1], KEY + "0", "A" * 44, wrong_dv, make_key(uf="99"), make_key(model="65")):
            with self.subTest(bad=bad[:12]), self.assertRaises(InvalidAccessKeyError):
                parse_access_key(bad)


class XmlParserTests(unittest.TestCase):
    def test_parses_header_and_item_with_and_without_wrapper(self) -> None:
        for wrapper in (True, False):
            parsed = parse_nfe_xml(make_xml(wrapper=wrapper))
            self.assertEqual(parsed.access_key, KEY)
            self.assertEqual((parsed.number, parsed.series, parsed.issue_date), ("1234", "1", "2026-01-10"))
            self.assertEqual(parsed.supplier, "Fornecedor Teste Ltda")
            self.assertEqual(parsed.items[0].ean, "7891000100103")
            self.assertEqual(parsed.items[0].quantity, 10.0)

    def test_lots_split_into_lines_only_when_they_match_the_quantity(self) -> None:
        split = _item(1, "SEM GTIN", "P-1", "A", "CX", "10", (("L1", "6", "2027-01-01"), ("L2", "4", "2027-06-01")))
        parsed = parse_nfe_xml(make_xml(items=split))
        self.assertEqual([(i.lot, i.quantity, i.expiration_date) for i in parsed.items],
                         [("L1", 6.0, "2027-01-01"), ("L2", 4.0, "2027-06-01")])
        self.assertIsNone(parsed.items[0].ean)

        partial = _item(1, "SEM GTIN", "P-1", "A", "CX", "10", (("L1", "6", "2027-01-01"),))
        items = parse_nfe_xml(make_xml(items=partial)).items
        self.assertEqual([(i.lot, i.quantity) for i in items], [(None, 10.0)])

    def test_rejects_unsupported_or_malformed_content(self) -> None:
        cases = {
            "unit": make_xml(items=_item(1, "SEM GTIN", "P", "A", "KG", "1")),
            "quantity": make_xml(items=_item(1, "SEM GTIN", "P", "A", "UN", "abc")),
            "no items": make_xml(items=" "),
            "not xml": "<nfeProc><oops",
            "no infNFe": "<root/>",
            "doctype": '<!DOCTYPE x [<!ENTITY a "b">]>' + make_xml(),
            "bad id": make_xml(key="123"),
        }
        for name, xml in cases.items():
            with self.subTest(name), self.assertRaises(NFeParseError):
                parse_nfe_xml(xml)


class XmlDirectoryProviderTests(unittest.TestCase):
    def test_reads_by_key_and_reports_missing(self) -> None:
        with TemporaryDirectory() as directory:
            (Path(directory) / f"{KEY}.xml").write_text(make_xml(), encoding="utf-8")
            provider = XmlDirectoryProvider(directory)
            self.assertIn(KEY, provider.fetch_xml(KEY))
            with self.assertRaises(NFeNotFoundError):
                provider.fetch_xml(make_key(99))
        with self.assertRaises(NFeProviderUnavailableError):
            XmlDirectoryProvider(str(Path(directory) / "missing")).fetch_xml(KEY)


class FakeProvider:
    def __init__(self) -> None:
        self.xml_by_key: dict[str, str] = {}
        self.error: Exception | None = None
        self.calls = 0

    def fetch_xml(self, access_key: str) -> str:
        self.calls += 1
        if self.error:
            raise self.error
        if access_key not in self.xml_by_key:
            raise NFeNotFoundError("NF-e não encontrada para a chave informada.")
        return self.xml_by_key[access_key]


class NFeLookupApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = TemporaryDirectory()
        path = Path(self.temp_dir.name) / "nfe-tests.sqlite"
        self.engine = create_engine(f"sqlite:///{path.as_posix()}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(bind=self.engine)
        self.session_factory = sessionmaker(bind=self.engine, autoflush=False, autocommit=False, expire_on_commit=False)

        def get_test_db():
            db = self.session_factory()
            try:
                yield db
            finally:
                db.close()

        self.provider = FakeProvider()
        self.app = create_app()
        self.app.dependency_overrides[get_db] = get_test_db
        self.client = TestClient(self.app, client=("127.0.0.1", 50000))

        setup = self.client.post(
            "/auth/setup-admin",
            json={"full_name": "Admin Teste", "username": "admin", "password": "admin-password-123"},
        )
        self.assertEqual(setup.status_code, 201, setup.text)
        self.admin = {"Authorization": "Bearer " + setup.json()["access_token"]}
        self.client.post(
            "/auth/users", headers=self.admin,
            json={"full_name": "Maria", "username": "maria", "password": "user-password-123", "role": "CONFERENTE"},
        )
        login = self.client.post("/auth/login", json={"username": "maria", "password": "user-password-123"})
        self.checker = {"Authorization": "Bearer " + login.json()["access_token"]}

        self.product = self.client.post("/products", json={"code": "7891000100103", "name": "Produto A"}, headers=self.admin).json()
        self.location = self.client.post("/locations", json={"code": "EST", "name": "Estoque"}, headers=self.admin).json()

    def use_provider(self) -> None:
        self.app.dependency_overrides[get_nfe_provider] = lambda: self.provider

    def tearDown(self) -> None:
        self.client.close()
        self.app.dependency_overrides.clear()
        self.engine.dispose()
        self.temp_dir.cleanup()

    def lookup(self, key: str = KEY, headers=None):
        return self.client.post("/invoices/lookup", json={"access_key": key}, headers=headers or self.checker)

    def count(self, model) -> int:
        with self.session_factory() as db:
            return db.scalar(select(func.count()).select_from(model))

    def test_lookup_registers_invoice_and_matches_products_exactly(self) -> None:
        items = _item(1, "7891000100103", "P-1", "Produto A", "UN", "10") + _item(
            2, "7899999999999", "P-2", "Produto Novo", "CX", "3"
        )
        self.provider.xml_by_key[KEY] = make_xml(items=items)
        self.use_provider()

        response = self.lookup()
        self.assertEqual(response.status_code, 201, response.text)
        body = response.json()
        self.assertEqual((body["number"], body["access_key"], body["status"]), ("1234", KEY, "PENDENTE"))
        self.assertEqual(body["supplier"], "Fornecedor Teste Ltda")
        matched, unmatched = body["items"]
        self.assertEqual(matched["product_id"], self.product["id"])
        self.assertEqual((matched["invoice_quantity"], matched["status"], matched["conferred_quantity"]), (10, "PENDENTE", None))
        self.assertIsNone(unmatched["product_id"])
        self.assertEqual(unmatched["product_code"], "7899999999999")
        self.assertEqual(self.count(StockItem), 0)
        self.assertEqual(self.count(Movement), 0)

    def test_repeated_lookup_does_not_duplicate_or_reimport(self) -> None:
        self.provider.xml_by_key[KEY] = make_xml()
        self.use_provider()
        first = self.lookup()
        second = self.lookup(" ".join([KEY[i : i + 4] for i in range(0, 44, 4)]))
        self.assertEqual((first.status_code, second.status_code), (201, 200))
        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertEqual(self.count(Invoice), 1)
        self.assertEqual(self.provider.calls, 1)

    def test_error_responses(self) -> None:
        self.use_provider()
        self.assertEqual(self.lookup("123").status_code, 422)
        self.assertEqual(self.lookup(KEY[:-1] + str((int(KEY[-1]) + 1) % 10)).status_code, 422)
        self.assertEqual(self.lookup().status_code, 404)

        self.provider.error = NFeProviderUnavailableError("Falha ao consultar.")
        self.assertEqual(self.lookup().status_code, 502)
        self.provider.error = None

        self.provider.xml_by_key[KEY] = "<nfeProc><oops"
        bad_xml = self.lookup()
        self.assertEqual(bad_xml.status_code, 502)

        self.provider.xml_by_key[KEY] = make_xml(key=make_key(777))
        mismatch = self.lookup()
        self.assertEqual(mismatch.status_code, 422)
        self.assertEqual(self.count(Invoice), 0)

    def test_provider_not_configured_by_default(self) -> None:
        response = self.lookup()
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("Traceback", response.text)

    def test_authentication_and_roles(self) -> None:
        self.provider.xml_by_key[KEY] = make_xml()
        self.use_provider()
        self.assertEqual(self.client.post("/invoices/lookup", json={"access_key": KEY}).status_code, 401)
        self.assertEqual(self.lookup(headers=self.checker).status_code, 201)
        self.assertEqual(self.lookup(headers=self.admin).status_code, 200)
        with self.session_factory() as db:
            self.assertIsNotNone(db.scalar(select(Invoice.created_by_user_id)))

    def test_manual_conference_with_divergence_and_multiple_lots(self) -> None:
        items = _item(1, "7891000100103", "P-1", "Produto A", "UN", "10", (("L1", "6", "2027-01-01"), ("L2", "4", "2027-06-01")))
        self.provider.xml_by_key[KEY] = make_xml(items=items)
        self.use_provider()
        invoice = self.lookup().json()
        self.assertEqual([(i["invoice_lot"], i["invoice_quantity"]) for i in invoice["items"]], [("L1", 6), ("L2", 4)])

        def confer(item, qty, lot, expires):
            return self.client.post(
                f"/invoices/{invoice['id']}/items/{item['id']}/confer",
                json={"conferred_quantity": qty, "location_id": self.location["id"], "lot": lot, "expiration_date": expires},
                headers=self.checker,
            )

        first = confer(invoice["items"][0], 5, "L1", "2027-01-01")
        self.assertEqual((first.status_code, first.json()["status"], first.json()["divergence_quantity"]), (201, "DIVERGENTE", -1))
        self.assertEqual(self.client.get(f"/invoices/{invoice['id']}", headers=self.checker).json()["status"], "EM_CONFERENCIA")
        second = confer(invoice["items"][1], 4, "L2", "2027-06-01")
        self.assertEqual(second.json()["status"], "CONFERIDO")
        final = self.client.get(f"/invoices/{invoice['id']}", headers=self.checker).json()
        self.assertEqual(final["status"], "CONFERIDA_COM_DIVERGENCIA")
        self.assertEqual(self.count(StockItem), 2)
        self.assertEqual(self.count(Movement), 2)

    def test_unmatched_product_cannot_be_conferred(self) -> None:
        self.provider.xml_by_key[KEY] = make_xml(items=_item(1, "7899999999999", "P-2", "Novo", "UN", "3"))
        self.use_provider()
        invoice = self.lookup().json()
        response = self.client.post(
            f"/invoices/{invoice['id']}/items/{invoice['items'][0]['id']}/confer",
            json={"conferred_quantity": 3, "location_id": self.location["id"], "lot": "L", "expiration_date": "2027-01-01"},
            headers=self.checker,
        )
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.count(StockItem), 0)


if __name__ == "__main__":
    unittest.main()
