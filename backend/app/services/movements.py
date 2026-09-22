"""Movement business service for the C4 Gestão API."""

from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api.schemas.movements import MovementCreate
from backend.app.db.models import Checker, Location, Movement, Product, StockItem


class MovementConflictError(Exception):
    """Raised when a movement conflicts with current stock or idempotency."""


class MovementValidationError(Exception):
    """Raised when a movement violates a business rule."""


def _validate_checker(db: Session, checker_id: str | None) -> Checker | None:
    if checker_id is None:
        return None
    checker = db.get(Checker, checker_id)
    if checker is None:
        raise MovementValidationError("Checker not found.")
    if not checker.active:
        raise MovementValidationError("Checker is inactive.")
    return checker


def _get_stock_item(db: Session, stock_item_id: str | None, field_name: str) -> StockItem:
    if not stock_item_id:
        raise MovementValidationError(f"{field_name} is required.")
    item = db.get(StockItem, stock_item_id)
    if item is None:
        raise MovementValidationError(f"{field_name} references a stock item that does not exist.")
    return item


def _validate_stock_item(
    item: StockItem,
    *,
    product_id: str,
    unit: str,
    expected_location_id: str | None = None,
    field_name: str,
) -> None:
    if item.product_id != product_id:
        raise MovementValidationError(
            f"{field_name} belongs to a different product."
        )
    if item.unit != unit:
        raise MovementValidationError(
            f"{field_name} uses a different unit from the movement."
        )
    if expected_location_id is not None and item.location_id != expected_location_id:
        raise MovementValidationError(
            f"{field_name} is not associated with the expected location."
        )


def _snapshot(item: StockItem, product: Product) -> dict[str, object]:
    return {
        "product_code_snapshot": product.code,
        "product_name_snapshot": product.name,
        "lot_snapshot": item.lot,
        "manufacturing_date": item.manufacturing_date,
        "expiration_date": item.expiration_date,
        "no_expiration_date": item.no_expiration_date,
        "supplier": item.supplier,
        "invoice_number": item.invoice_number,
        "received_date": item.received_date,
    }


def _validate_quantity(item: StockItem, quantity: float) -> None:
    if item.quantity < quantity:
        raise MovementConflictError(
            f"Insufficient stock. Available: {item.quantity:g} {item.unit}."
        )


def _apply_delta(item: StockItem, delta: float) -> None:
    new_quantity = item.quantity + delta
    if new_quantity < 0:
        raise MovementConflictError("Stock quantity cannot become negative.")
    item.quantity = new_quantity


def create_movement(
    db: Session,
    payload: MovementCreate,
) -> tuple[Movement, bool]:
    """Record an ENTRADA, SAIDA or TRANSFERENCIA atomically.

    Returns the movement and whether it was already present because of
    idempotency replay.
    """
    values = payload.model_dump()
    if values.get("idempotency_key"):
        existing = db.scalar(
            select(Movement).where(
                Movement.idempotency_key == values["idempotency_key"]
            )
        )
        if existing is not None:
            return existing, True

    product = db.get(Product, values["product_id"])
    if product is None:
        raise MovementValidationError("Product not found.")
    if not product.active:
        raise MovementValidationError("Product is inactive.")

    _validate_checker(db, values.get("checker_id"))

    movement_type = values["type"]
    source = None
    destination = None

    if movement_type == "ENTRADA":
        destination = _get_stock_item(
            db,
            values.get("destination_stock_item_id"),
            "destination_stock_item_id",
        )
        _validate_stock_item(
            destination,
            product_id=product.id,
            unit=values["unit"],
            field_name="destination_stock_item_id",
        )
        if values.get("source_stock_item_id") is not None:
            raise MovementValidationError(
                "source_stock_item_id must be null for ENTRADA."
            )
        if destination.quantity < 0:
            raise MovementValidationError("Destination stock has an invalid quantity.")
        _apply_delta(destination, values["quantity"])
        source_location_id = None
        destination_location_id = destination.location_id
        snapshot_item = destination

    elif movement_type == "SAIDA":
        source = _get_stock_item(
            db,
            values.get("source_stock_item_id"),
            "source_stock_item_id",
        )
        _validate_stock_item(
            source,
            product_id=product.id,
            unit=values["unit"],
            field_name="source_stock_item_id",
        )
        if values.get("destination_stock_item_id") is not None:
            raise MovementValidationError(
                "destination_stock_item_id must be null for SAIDA."
            )
        _validate_quantity(source, values["quantity"])
        _apply_delta(source, -values["quantity"])
        source_location_id = source.location_id
        destination_location_id = None
        snapshot_item = source

    else:
        source = _get_stock_item(
            db,
            values.get("source_stock_item_id"),
            "source_stock_item_id",
        )
        destination = _get_stock_item(
            db,
            values.get("destination_stock_item_id"),
            "destination_stock_item_id",
        )
        _validate_stock_item(
            source,
            product_id=product.id,
            unit=values["unit"],
            field_name="source_stock_item_id",
        )
        _validate_stock_item(
            destination,
            product_id=product.id,
            unit=values["unit"],
            field_name="destination_stock_item_id",
        )
        if source.id == destination.id:
            raise MovementValidationError(
                "Source and destination stock items must be different."
            )
        if source.location_id == destination.location_id:
            raise MovementValidationError(
                "Source and destination locations must be different."
            )
        _validate_quantity(source, values["quantity"])
        _apply_delta(source, -values["quantity"])
        _apply_delta(destination, values["quantity"])
        source_location_id = source.location_id
        destination_location_id = destination.location_id
        snapshot_item = source

    snapshot = _snapshot(snapshot_item, product)
    movement = Movement(
        product_id=product.id,
        type=movement_type,
        quantity=values["quantity"],
        unit=values["unit"],
        source_stock_item_id=source.id if source else None,
        destination_stock_item_id=destination.id if destination else None,
        source_location_id=source_location_id,
        destination_location_id=destination_location_id,
        **snapshot,
        checker_id=values.get("checker_id"),
        timestamp=datetime.now(timezone.utc).isoformat(),
        entry_method=values.get("entry_method"),
        update_reason=values.get("update_reason"),
        notes=values.get("notes"),
        idempotency_key=values.get("idempotency_key"),
    )
    db.add(movement)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if values.get("idempotency_key"):
            existing = db.scalar(
                select(Movement).where(
                    Movement.idempotency_key == values["idempotency_key"]
                )
            )
            if existing is not None:
                return existing, True
        raise MovementConflictError("Movement could not be recorded.") from exc

    db.refresh(movement)
    return movement, False


def list_movements(
    db: Session,
    *,
    product_id: str | None,
    movement_type: str | None,
    location_id: str | None,
    limit: int,
    offset: int,
) -> tuple[list[Movement], int]:
    filters = []
    if product_id:
        filters.append(Movement.product_id == product_id)
    if movement_type:
        filters.append(Movement.type == movement_type)
    if location_id:
        filters.append(
            (Movement.source_location_id == location_id)
            | (Movement.destination_location_id == location_id)
        )

    total = db.scalar(select(func.count(Movement.id)).where(*filters)) or 0
    items = list(
        db.scalars(
            select(Movement)
            .where(*filters)
            .order_by(Movement.timestamp.desc())
            .offset(offset)
            .limit(limit)
        )
    )
    return items, total


def get_movement(db: Session, movement_id: str) -> Movement | None:
    """Return a movement by ID."""
    return db.get(Movement, movement_id)
