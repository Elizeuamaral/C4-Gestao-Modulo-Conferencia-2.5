"""Parser for NF-e XML (layout 4.00, with or without the nfeProc wrapper)."""

from __future__ import annotations

import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

MAX_XML_BYTES = 5 * 1024 * 1024
_EPSILON = 1e-6

# Units accepted by the stock model (FD, UN, CX, PCT). Anything else is rejected
# instead of being silently converted.
_UNIT_MAP = {
    "UN": "UN", "UND": "UN", "UNID": "UN", "UNIDADE": "UN",
    "CX": "CX", "CXA": "CX", "CAIXA": "CX",
    "FD": "FD", "FARDO": "FD",
    "PCT": "PCT", "PC": "PCT", "PACOTE": "PCT",
}


class NFeParseError(ValueError):
    pass


@dataclass
class ParsedItem:
    code: str
    ean: str | None
    description: str
    unit: str
    quantity: float
    lot: str | None = None
    manufacturing_date: str | None = None
    expiration_date: str | None = None


@dataclass
class ParsedInvoice:
    access_key: str
    number: str
    series: str | None
    supplier: str | None
    issue_date: str | None
    items: list[ParsedItem] = field(default_factory=list)


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def _child(node: ET.Element | None, name: str) -> ET.Element | None:
    if node is None:
        return None
    for child in node:
        if _local(child.tag) == name:
            return child
    return None


def _children(node: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in node if _local(child.tag) == name]


def _text(node: ET.Element | None, name: str) -> str | None:
    child = _child(node, name)
    value = (child.text or "").strip() if child is not None else ""
    return value or None


def _number(value: str | None, label: str) -> float:
    try:
        number = float((value or "").replace(",", "."))
    except ValueError as exc:
        raise NFeParseError(f"Quantidade inválida no XML ({label}).") from exc
    if not (0 <= number < float("inf")):
        raise NFeParseError(f"Quantidade inválida no XML ({label}).")
    return number


def _valid_gtin(value: str | None) -> str | None:
    if value and re.fullmatch(r"\d{8}|\d{12,14}", value) and set(value) != {"0"}:
        return value
    return None


def _date(value: str | None) -> str | None:
    if value and re.fullmatch(r"\d{4}-\d{2}-\d{2}", value[:10]):
        return value[:10]
    return None


def parse_nfe_xml(xml_text: str) -> ParsedInvoice:
    if len(xml_text.encode("utf-8")) > MAX_XML_BYTES:
        raise NFeParseError("XML da NF-e excede o tamanho máximo permitido.")
    # Entity declarations are never present in a legitimate NF-e; rejecting them
    # prevents entity-expansion attacks without an extra dependency.
    if re.search(r"<!(DOCTYPE|ENTITY)", xml_text, re.IGNORECASE):
        raise NFeParseError("XML da NF-e contém declarações não permitidas.")
    try:
        root = ET.fromstring(xml_text.strip().encode("utf-8"))
    except ET.ParseError as exc:
        raise NFeParseError("XML da NF-e inválido.") from exc

    inf = next((node for node in root.iter() if _local(node.tag) == "infNFe"), None)
    if inf is None:
        raise NFeParseError("XML não contém uma NF-e (infNFe ausente).")

    access_key = (inf.get("Id") or "").removeprefix("NFe")
    if not re.fullmatch(r"\d{44}", access_key):
        raise NFeParseError("XML da NF-e sem chave de acesso válida.")

    ide = _child(inf, "ide")
    number = _text(ide, "nNF")
    if not number:
        raise NFeParseError("XML da NF-e sem número da nota.")

    invoice = ParsedInvoice(
        access_key=access_key,
        number=number,
        series=_text(ide, "serie"),
        supplier=_text(_child(inf, "emit"), "xNome"),
        issue_date=_date(_text(ide, "dhEmi") or _text(ide, "dEmi")),
    )

    for det in _children(inf, "det"):
        prod = _child(det, "prod")
        if prod is None:
            raise NFeParseError("Item da NF-e sem dados de produto.")
        code = _text(prod, "cProd")
        if not code:
            raise NFeParseError("Item da NF-e sem código de produto.")
        raw_unit = (_text(prod, "uCom") or "").upper()
        unit = _UNIT_MAP.get(raw_unit)
        if unit is None:
            raise NFeParseError(
                f"Unidade '{raw_unit or '?'}' do item {code} não é suportada (use FD, UN, CX ou PCT)."
            )
        quantity = _number(_text(prod, "qCom"), code)
        base = dict(
            code=code,
            ean=_valid_gtin(_text(prod, "cEAN")),
            description=_text(prod, "xProd") or code,
            unit=unit,
        )

        lots = []
        for rastro in _children(prod, "rastro"):
            lot = _text(rastro, "nLote")
            if lot:
                lots.append(
                    (lot, _number(_text(rastro, "qLote"), code), _date(_text(rastro, "dFab")), _date(_text(rastro, "dVal")))
                )

        # Traceability is split into one line per lot only when it accounts for
        # the whole quantity; otherwise the NF quantity stays on a single line.
        if lots and abs(sum(qty for _, qty, _, _ in lots) - quantity) <= _EPSILON:
            for lot, qty, made, expires in lots:
                invoice.items.append(
                    ParsedItem(**base, quantity=qty, lot=lot, manufacturing_date=made, expiration_date=expires)
                )
        else:
            invoice.items.append(ParsedItem(**base, quantity=quantity))

    if not invoice.items:
        raise NFeParseError("XML da NF-e sem itens.")
    return invoice
