"""Stock business service for the C4 Gestão API."""

from __future__ import annotations

from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api.schemas.stock import StockCreate, StockUpdate
from backend.app.db.models import Checker, Location, Product, StockItem


class StockConflictError(Exception):
    """Raised when a stock item violates a business rule."""


class StockValidationError(Exception):
    """Raised when a stock item references invalid business data."""


def _normalize_values(data: StockCreate | StockUpdate) -> dict[str, object]:
    values = data.model_dump(exclude_unset=True)
    for field, value in values.items():
        if isinstance(value, str):
            values[field] = value.strip()
    return values


def _stock_identity_values(values: dict[str, object]) -> tuple[object, ...]:
    return (
        values.get("product_id"),
        values.get("location_id"),
        values.get("unit"),
        values.get("lot", ""),
        values.get("manufacturing_date"),
        values.get("expiration_date"),
        bool(values.get("no_expiration_date", False)),
        values.get("supplier"),
        values.get("invoice_number"),
        values.get("received_date"),
        values.get("notes"),
    )


def _stock_identity_from_item(item: StockItem) -> tuple[object, ...]:
    return (
        item.product_id,
        item.location_id,
        item.unit,
        item.lot,
        item.manufacturing_date,
        item.expiration_date,
        bool(item.no_expiration_date),
        item.supplier,
        item.invoice_number,
        item.received_date,
        item.notes,
    )


def _validate_references(
    db: Session,
    *,
    product_id: str,
    location_id: str,
    checker_id: str | None,
) -> None:
    product = db.get(Product, product_id)
    if product is None:
        raise StockValidationError("Product not found.")
    if not product.active:
        raise StockValidationError("Product is inactive.")

    location = db.get(Location, location_id)
    if location is None:
        raise StockValidationError("Location not found.")
    if not location.active:
        raise StockValidationError("Location is inactive.")

    if checker_id is not None:
        checker = db.get(Checker, checker_id)
        if checker is None:
            raise StockValidationError("Checker not found.")
        if not checker.active:
            raise StockValidationError("Checker is inactive.")


def _validate_expiration(
    *,
    no_expiration_date: bool,
    expiration_date: str | None,
) -> None:
    if not no_expiration_date and not expiration_date:
        raise StockValidationError(
            "expiration_date is required when no_expiration_date is false."
        )
    if no_expiration_date and expiration_date:
        raise StockValidationError(
            "expiration_date must be null when no_expiration_date is true."
        )


def _find_duplicate(
    db: Session,
    identity: tuple[object, ...],
    *,
    exclude_id: str | None = None,
) -> StockItem | None:
    items = db.scalars(select(StockItem)).all()
    for item in items:
        if exclude_id is not None and item.id == exclude_id:
            continue
        if _stock_identity_from_item(item) == identity:
            return item
    return None


def create_stock_item(db: Session, payload: StockCreate) -> StockItem:
    """Create one current stock balance without recording a movement."""
    values = _normalize_values(payload)

    _validate_references(
        db,
        product_id=str(values["product_id"]),
        location_id=str(values["location_id"]),
        checker_id=values.get("checker_id") or None,
    )

    _validate_expiration(
        no_expiration_date=bool(values.get("no_expiration_date", False)),
        expiration_date=values.get("expiration_date") or None,
    )

    if values.get("received_quantity", 0) == 0:
        values["received_quantity"] = values["quantity"]

    identity = _stock_identity_values(values)
    if _find_duplicate(db, identity) is not None:
        raise StockConflictError(
            "A stock item with the same operational identity already exists."
        )

    item = StockItem(**values)
    db.add(item)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise StockConflictError("Stock item could not be created.") from exc

    db.refresh(item)
    return item


def list_stock_items(
    db: Session,
    *,
    product_id: str | None,
    location_id: str | None,
    unit: str | None,
    lot: str | None,
    limit: int,
    offset: int,
) -> tuple[list[StockItem], int]:
    filters = []

    if product_id:
        filters.append(StockItem.product_id == product_id)
    if location_id:
        filters.append(StockItem.location_id == location_id)
    if unit:
        filters.append(StockItem.unit == unit)
    if lot:
        filters.append(StockItem.lot.ilike(f"%{lot.strip()}%"))

    total = db.scalar(select(func.count(StockItem.id)).where(*filters)) or 0

    items = list(
        db.scalars(
            select(StockItem)
            .where(*filters)
            .order_by(StockItem.expiration_date.asc(), StockItem.created_at.asc())
            .offset(offset)
            .limit(limit)
        )
    )
    return items, total


def get_stock_item(db: Session, stock_item_id: str) -> StockItem | None:
    """Return one stock item by ID."""
    return db.get(StockItem, stock_item_id)


def update_stock_item(
    db: Session,
    item: StockItem,
    payload: StockUpdate,
) -> StockItem:
    """Update stock metadata without directly changing the balance quantity."""
    values = _normalize_values(payload)

    product_id = item.product_id
    location_id = item.location_id
    checker_id = values.get("checker_id", item.checker_id)

    _validate_references(
        db,
        product_id=product_id,
        location_id=location_id,
        checker_id=checker_id or None,
    )

    no_expiration_date = values.get(
        "no_expiration_date",
        item.no_expiration_date,
    )
    expiration_date = values.get(
        "expiration_date",
        item.expiration_date,
    )

    _validate_expiration(
        no_expiration_date=bool(no_expiration_date),
        expiration_date=expiration_date or None,
    )

    candidate = StockItem(
        product_id=product_id,
        location_id=location_id,
        quantity=item.quantity,
        received_quantity=item.received_quantity,
        unit=item.unit,
        lot=values.get("lot", item.lot),
        manufacturing_date=values.get(
            "manufacturing_date",
            item.manufacturing_date,
        ),
        expiration_date=expiration_date,
        no_expiration_date=bool(no_expiration_date),
        supplier=values.get("supplier", item.supplier),
        invoice_number=values.get("invoice_number", item.invoice_number),
        checker_id=checker_id,
        received_date=values.get("received_date", item.received_date),
        entry_method=values.get("entry_method", item.entry_method),
        notes=values.get("notes", item.notes),
    )

    if _find_duplicate(db, _stock_identity_from_item(candidate), exclude_id=item.id):
        raise StockConflictError(
            "The updated stock identity already exists."
        )

    for field, value in values.items():
        setattr(item, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise StockConflictError("Stock item could not be updated.") from exc

    db.refresh(item)
    return item
