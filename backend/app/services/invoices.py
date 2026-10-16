"""Invoice (nota fiscal) conference service.

QTD. NF (``invoice_quantity``) and QTD. CONF. (``conferred_quantity``) are stored
on the invoice item and never change after the conference. The live balance
(QTD. EST.) lives in ``stock_items.quantity`` and only changes through
movements, so later exits never rewrite the invoice history.
"""

from __future__ import annotations

from datetime import date, datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.app.api.schemas.invoices import ConferItemRequest, InvoiceCreate
from backend.app.db.models import (
    Invoice,
    InvoiceItem,
    Location,
    Movement,
    Product,
    StockItem,
)

_EPSILON = 1e-9


class InvoiceNotFoundError(Exception):
    pass


class InvoiceConflictError(Exception):
    pass


class InvoiceValidationError(Exception):
    pass


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_invoice(db: Session, payload: InvoiceCreate, user_id: str | None) -> Invoice:
    values = payload.model_dump(exclude={"items"})
    invoice = Invoice(**values, status="PENDENTE", created_by_user_id=user_id)

    for index, item_payload in enumerate(payload.items, start=1):
        data = item_payload.model_dump()
        if data["product_id"]:
            if db.get(Product, data["product_id"]) is None:
                raise InvoiceValidationError(f"Item {index}: product_id does not exist.")
        else:
            product = db.scalar(select(Product).where(Product.code == data["product_code"]))
            data["product_id"] = product.id if product else None
        invoice.items.append(InvoiceItem(line_number=index, **data))

    db.add(invoice)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise InvoiceConflictError("Invoice already registered (same number, series and supplier, or access key).") from exc
    return get_invoice(db, invoice.id)  # type: ignore[return-value]


def get_invoice(db: Session, invoice_id: str) -> Invoice | None:
    return db.scalar(
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .options(selectinload(Invoice.items).selectinload(InvoiceItem.stock_item))
    )


def list_invoices(
    db: Session, *, status: str | None, limit: int, offset: int
) -> tuple[list[Invoice], int]:
    filters = [Invoice.status == status] if status else []
    total = db.scalar(select(func.count(Invoice.id)).where(*filters)) or 0
    items = list(
        db.scalars(
            select(Invoice)
            .where(*filters)
            .order_by(Invoice.created_at.desc())
            .offset(offset)
            .limit(limit)
            .options(selectinload(Invoice.items).selectinload(InvoiceItem.stock_item))
        )
    )
    return items, total


def _same_conference(item: InvoiceItem, payload: ConferItemRequest) -> bool:
    stock = item.stock_item
    if abs((item.conferred_quantity or 0) - payload.conferred_quantity) > _EPSILON:
        return False
    if stock is None:
        return payload.conferred_quantity == 0
    return (
        stock.location_id == payload.location_id
        and stock.lot == (payload.lot or "")
        and stock.expiration_date == payload.expiration_date
        and stock.no_expiration_date == payload.no_expiration_date
    )


def _refresh_invoice_status(invoice: Invoice, user_id: str | None) -> None:
    done = [item for item in invoice.items if item.status != "PENDENTE"]
    if not done:
        invoice.status = "PENDENTE"
    elif len(done) < len(invoice.items):
        invoice.status = "EM_CONFERENCIA"
    else:
        diverged = any(item.status == "DIVERGENTE" for item in invoice.items)
        invoice.status = "CONFERIDA_COM_DIVERGENCIA" if diverged else "CONFERIDA"
        invoice.conferred_by_user_id = user_id
        invoice.conferred_at = _now()


def confer_item(
    db: Session,
    invoice_id: str,
    item_id: str,
    payload: ConferItemRequest,
    user_id: str,
) -> tuple[InvoiceItem, bool]:
    """Record the conference of one invoice item and the resulting stock entry.

    Returns the item and whether this was a replay of an already recorded
    identical conference (no new entry is created in that case).
    """
    item = db.get(InvoiceItem, item_id)
    if item is None or item.invoice_id != invoice_id:
        raise InvoiceNotFoundError("Invoice item not found.")

    if item.status != "PENDENTE":
        if _same_conference(item, payload):
            return item, True
        raise InvoiceConflictError("Item already conferred with different data.")

    if item.product_id is None:
        product = db.scalar(select(Product).where(Product.code == item.product_code))
        if product is None:
            raise InvoiceValidationError("Product is not registered; register it before the conference.")
        item.product_id = product.id
    product = db.get(Product, item.product_id)
    if product is None or not product.active:
        raise InvoiceValidationError("Product not found or inactive.")

    quantity = payload.conferred_quantity
    invoice = item.invoice
    now = _now()
    movement: Movement | None = None
    stock: StockItem | None = None

    if quantity > 0:
        location = db.get(Location, payload.location_id)
        if location is None or not location.active:
            raise InvoiceValidationError("Location not found or inactive.")
        if not payload.no_expiration_date and not payload.expiration_date:
            raise InvoiceValidationError("expiration_date is required unless no_expiration_date is true.")
        if payload.no_expiration_date and payload.expiration_date:
            raise InvoiceValidationError("expiration_date must be empty when no_expiration_date is true.")

        lot = payload.lot or ""
        stock = db.scalar(
            select(StockItem).where(
                StockItem.product_id == product.id,
                StockItem.location_id == location.id,
                StockItem.unit == item.unit,
                StockItem.lot == lot,
                StockItem.no_expiration_date == payload.no_expiration_date,
                StockItem.expiration_date.is_(None)
                if payload.no_expiration_date
                else StockItem.expiration_date == payload.expiration_date,
            )
        )
        if stock is None:
            stock = StockItem(
                product_id=product.id,
                location_id=location.id,
                quantity=0,
                received_quantity=0,
                unit=item.unit,
                lot=lot,
                manufacturing_date=payload.manufacturing_date,
                expiration_date=None if payload.no_expiration_date else payload.expiration_date,
                no_expiration_date=payload.no_expiration_date,
                supplier=invoice.supplier,
                invoice_number=invoice.number,
                received_date=invoice.received_date or date.today().isoformat(),
                entry_method="NOTA_FISCAL",
            )
            db.add(stock)
            db.flush()

        before = stock.quantity
        stock.quantity = before + quantity
        stock.received_quantity = (stock.received_quantity or 0) + quantity

        movement = Movement(
            product_id=product.id,
            type="ENTRADA",
            quantity=quantity,
            unit=item.unit,
            destination_stock_item_id=stock.id,
            destination_location_id=stock.location_id,
            product_code_snapshot=product.code,
            product_name_snapshot=product.name,
            lot_snapshot=stock.lot,
            manufacturing_date=stock.manufacturing_date,
            expiration_date=stock.expiration_date,
            no_expiration_date=stock.no_expiration_date,
            supplier=invoice.supplier,
            invoice_number=invoice.number,
            received_date=invoice.received_date,
            timestamp=now,
            entry_method="NOTA_FISCAL",
            notes=payload.notes,
            idempotency_key=f"invoice-item-entry:{item.id}",
            user_id=user_id,
            invoice_id=invoice.id,
            invoice_item_id=item.id,
            quantity_before=before,
            quantity_after=stock.quantity,
        )
        db.add(movement)
        db.flush()

    divergence = quantity - item.invoice_quantity
    item.conferred_quantity = quantity
    item.divergence_quantity = divergence
    item.status = "DIVERGENTE" if abs(divergence) > _EPSILON else "CONFERIDO"
    item.conferred_by_user_id = user_id
    item.conferred_at = now
    item.stock_item_id = stock.id if stock else None
    item.entry_movement_id = movement.id if movement else None
    if payload.notes:
        item.notes = payload.notes
    _refresh_invoice_status(invoice, user_id)

    try:
        db.commit()
    except IntegrityError as exc:
        # A concurrent identical request already recorded this entry.
        db.rollback()
        db.expire_all()
        refreshed = db.get(InvoiceItem, item_id)
        if refreshed is not None and refreshed.status != "PENDENTE" and _same_conference(refreshed, payload):
            return refreshed, True
        raise InvoiceConflictError("Conference could not be recorded.") from exc

    db.refresh(item)
    return item, False
