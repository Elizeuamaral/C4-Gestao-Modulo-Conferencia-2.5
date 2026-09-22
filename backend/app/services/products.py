"""Product business service for the C4 Gestão API."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api.schemas.products import ProductCreate, ProductUpdate
from backend.app.db.models import Product


class ProductConflictError(Exception):
    """Raised when a product violates a uniqueness rule."""


def _normalize_product_data(data: ProductCreate | ProductUpdate) -> dict[str, object]:
    """Return validated product data ready for persistence."""
    values = data.model_dump(exclude_unset=True)

    for field in ("code", "name", "category"):
        if field in values and isinstance(values[field], str):
            values[field] = values[field].strip()

    return values


def _ensure_required_text(value: object, field_name: str) -> None:
    """Reject blank required text after normalization."""
    if isinstance(value, str) and not value:
        raise ValueError(f"{field_name} cannot be blank.")


def create_product(db: Session, payload: ProductCreate) -> Product:
    """Create and persist a product."""
    values = _normalize_product_data(payload)
    _ensure_required_text(values.get("code"), "code")
    _ensure_required_text(values.get("name"), "name")

    product = Product(**values)
    db.add(product)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProductConflictError("Product code already exists.") from exc

    db.refresh(product)
    return product


def list_products(
    db: Session,
    *,
    active: bool | None,
    search: str | None,
    limit: int,
    offset: int,
) -> tuple[list[Product], int]:
    """Return products using optional active/search filters and pagination."""
    filters = []

    if active is not None:
        filters.append(Product.active.is_(active))

    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            (Product.code.ilike(pattern)) | (Product.name.ilike(pattern))
        )

    total = db.scalar(
        select(func.count(Product.id)).where(*filters)
    ) or 0

    products = list(
        db.scalars(
            select(Product)
            .where(*filters)
            .order_by(Product.name.asc(), Product.code.asc())
            .offset(offset)
            .limit(limit)
        )
    )

    return products, total


def get_product(db: Session, product_id: str) -> Product | None:
    """Return a product by ID."""
    return db.get(Product, product_id)


def update_product(
    db: Session,
    product: Product,
    payload: ProductUpdate,
) -> Product:
    """Update and persist an existing product."""
    values = _normalize_product_data(payload)

    if "code" in values:
        _ensure_required_text(values["code"], "code")

    if "name" in values:
        _ensure_required_text(values["name"], "name")

    for field, value in values.items():
        setattr(product, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise ProductConflictError("Product code already exists.") from exc

    db.refresh(product)
    return product


def deactivate_product(db: Session, product: Product) -> Product:
    """Deactivate a product without physically deleting its record."""
    product.active = False

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise

    db.refresh(product)
    return product
