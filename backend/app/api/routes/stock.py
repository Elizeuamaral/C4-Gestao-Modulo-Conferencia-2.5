"""Stock balance endpoints for the C4 Gestão API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from backend.app.api.schemas.stock import (
    StockCreate,
    StockListResponse,
    StockResponse,
    StockUpdate,
)
from backend.app.db.database import get_db
from backend.app.services.stock import (
    StockConflictError,
    StockValidationError,
    create_stock_item,
    get_stock_item,
    list_stock_items,
    update_stock_item,
)

router = APIRouter(prefix="/stock", tags=["stock"])


@router.post("", response_model=StockResponse, status_code=status.HTTP_201_CREATED)
def create_stock_endpoint(
    payload: StockCreate,
    db: Session = Depends(get_db),
) -> StockResponse:
    """Create a current stock balance without creating a movement."""
    try:
        return create_stock_item(db, payload)
    except StockConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except StockValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("", response_model=StockListResponse)
def list_stock_endpoint(
    product_id: str | None = Query(default=None, max_length=36),
    location_id: str | None = Query(default=None, max_length=36),
    unit: str | None = Query(default=None, pattern=r"^(FD|UN|CX|PCT)$"),
    lot: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> StockListResponse:
    """List current stock balances with operational filters."""
    items, total = list_stock_items(
        db,
        product_id=product_id,
        location_id=location_id,
        unit=unit,
        lot=lot.strip() if lot else None,
        limit=limit,
        offset=offset,
    )
    return StockListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{stock_item_id}", response_model=StockResponse)
def get_stock_endpoint(
    stock_item_id: str,
    db: Session = Depends(get_db),
) -> StockResponse:
    """Return one current stock balance."""
    item = get_stock_item(db, stock_item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stock item not found.",
        )
    return item


@router.put("/{stock_item_id}", response_model=StockResponse)
def update_stock_endpoint(
    stock_item_id: str,
    payload: StockUpdate,
    db: Session = Depends(get_db),
) -> StockResponse:
    """Update stock metadata without changing its quantity."""
    item = get_stock_item(db, stock_item_id)
    if item is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Stock item not found.",
        )

    try:
        return update_stock_item(db, item, payload)
    except StockConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except StockValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
