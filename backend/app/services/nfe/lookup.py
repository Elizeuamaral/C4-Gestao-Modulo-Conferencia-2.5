"""Lookup of an NF-e by access key and registration as a pending invoice."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.api.schemas.invoices import InvoiceCreate, InvoiceItemCreate
from backend.app.db.models import Invoice, Product
from backend.app.services.invoices import (
    InvoiceConflictError,
    InvoiceValidationError,
    create_invoice,
    get_invoice,
)
from backend.app.services.nfe.key import parse_access_key
from backend.app.services.nfe.providers import NFeProvider
from backend.app.services.nfe.xml_parser import ParsedInvoice, parse_nfe_xml


def _find_by_access_key(db: Session, access_key: str) -> Invoice | None:
    invoice_id = db.scalar(select(Invoice.id).where(Invoice.access_key == access_key))
    return get_invoice(db, invoice_id) if invoice_id else None


def _match_product(db: Session, ean: str | None, code: str) -> Product | None:
    # Exact matches only (barcode first, then supplier code); never fuzzy.
    for candidate in (ean, code):
        if candidate:
            product = db.scalar(select(Product).where(Product.code == candidate))
            if product is not None:
                return product
    return None


def _to_payload(db: Session, parsed: ParsedInvoice) -> InvoiceCreate:
    items = []
    for item in parsed.items:
        product = _match_product(db, item.ean, item.code)
        items.append(
            InvoiceItemCreate(
                product_code=product.code if product else (item.ean or item.code),
                product_id=product.id if product else None,
                product_description=item.description[:255],
                unit=item.unit,
                invoice_quantity=item.quantity,
                invoice_lot=item.lot,
                invoice_expiration_date=item.expiration_date,
            )
        )
    return InvoiceCreate(
        number=parsed.number,
        series=parsed.series,
        access_key=parsed.access_key,
        supplier=parsed.supplier,
        received_date=None,
        items=items,
    )


def lookup_invoice_by_key(
    db: Session, raw_key: str, provider: NFeProvider, user_id: str | None
) -> tuple[Invoice, bool]:
    """Return ``(invoice, created)``. A key already registered is never re-imported."""
    key = parse_access_key(raw_key).value

    existing = _find_by_access_key(db, key)
    if existing is not None:
        return existing, False

    parsed = parse_nfe_xml(provider.fetch_xml(key))
    if parsed.access_key != key:
        raise InvoiceValidationError("O XML retornado não corresponde à chave de acesso informada.")

    try:
        return create_invoice(db, _to_payload(db, parsed), user_id), True
    except InvoiceConflictError:
        # A concurrent lookup of the same key registered it first.
        existing = _find_by_access_key(db, key)
        if existing is not None:
            return existing, False
        raise
