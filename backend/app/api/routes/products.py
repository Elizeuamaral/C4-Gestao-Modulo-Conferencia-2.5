"""Product CRUD endpoints for the C4 Gestão API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api.schemas.products import (
    ProductCreate,
    ProductListResponse,
    ProductResponse,
    ProductUpdate,
)
from backend.app.db.database import get_db
from backend.app.services.products import (
    ProductConflictError,
    create_product,
    deactivate_product,
    get_product,
    list_products,
    update_product,
)

router = APIRouter(prefix="/products", tags=["products"])


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product_endpoint(
    payload: ProductCreate,
    db: Session = Depends(get_db),
) -> ProductResponse:
    """Create a new product."""
    try:
        return create_product(db, payload)
    except ProductConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("", response_model=ProductListResponse)
def list_products_endpoint(
    active: bool | None = Query(
        default=True,
        description="Filter by active status. Use null to return both statuses.",
    ),
    search: str | None = Query(
        default=None,
        min_length=1,
        max_length=255,
        description="Search by product code or name.",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> ProductListResponse:
    """List products with active/search filters and pagination."""
    products, total = list_products(
        db,
        active=active,
        search=search.strip() if search else None,
        limit=limit,
        offset=offset,
    )
    return ProductListResponse(
        items=products,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{product_id}", response_model=ProductResponse)
def get_product_endpoint(
    product_id: str,
    db: Session = Depends(get_db),
) -> ProductResponse:
    """Return one product by ID."""
    product = get_product(db, product_id)
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )
    return product


@router.put("/{product_id}", response_model=ProductResponse)
def update_product_endpoint(
    product_id: str,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
) -> ProductResponse:
    """Update an existing product."""
    product = get_product(db, product_id)
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    try:
        return update_product(db, product, payload)
    except ProductConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.delete("/{product_id}", response_model=ProductResponse)
def deactivate_product_endpoint(
    product_id: str,
    db: Session = Depends(get_db),
) -> ProductResponse:
    """Deactivate a product without deleting its database record."""
    product = get_product(db, product_id)
    if product is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found.",
        )

    try:
        return deactivate_product(db, product)
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Product could not be deactivated.",
        ) from exc
