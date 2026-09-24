"""Movement endpoints for the C4 Gestão API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from backend.app.api.schemas.movement_adjustments import (
    CorrectMovementRequest,
    ReverseMovementRequest,
)
from backend.app.api.schemas.movements import (
    MovementCreate,
    MovementListResponse,
    MovementResponse,
)
from backend.app.db.database import get_db
from backend.app.services.movements import (
    MovementConflictError,
    MovementValidationError,
    correct_movement,
    create_movement,
    get_movement,
    list_movements,
    reverse_movement,
)

router = APIRouter(prefix="/movements", tags=["movements"])


@router.post("", response_model=MovementResponse, status_code=status.HTTP_201_CREATED)
def create_movement_endpoint(
    payload: MovementCreate,
    response: Response,
    db: Session = Depends(get_db),
) -> MovementResponse:
    """Record one stock movement or return an idempotent replay."""
    try:
        movement, replayed = create_movement(db, payload)
    except MovementConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except MovementValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    if replayed:
        response.status_code = status.HTTP_200_OK
    return movement


@router.get("", response_model=MovementListResponse)
def list_movements_endpoint(
    product_id: str | None = Query(default=None, max_length=36),
    type: str | None = Query(
        default=None,
        pattern=r"^(ENTRADA|SAIDA|TRANSFERENCIA)$",
    ),
    location_id: str | None = Query(default=None, max_length=36),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> MovementListResponse:
    """List recorded movements with operational filters."""
    items, total = list_movements(
        db,
        product_id=product_id,
        movement_type=type,
        location_id=location_id,
        limit=limit,
        offset=offset,
    )
    return MovementListResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{movement_id}", response_model=MovementResponse)
def get_movement_endpoint(
    movement_id: str,
    db: Session = Depends(get_db),
) -> MovementResponse:
    """Return one recorded movement."""
    movement = get_movement(db, movement_id)
    if movement is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Movement not found.",
        )
    return movement


@router.post(
    "/{movement_id}/reverse",
    response_model=MovementResponse,
    status_code=status.HTTP_201_CREATED,
)
def reverse_movement_endpoint(
    movement_id: str,
    payload: ReverseMovementRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> MovementResponse:
    """Reverse one supported movement without modifying its original record."""
    try:
        movement, replayed = reverse_movement(db, movement_id, payload)
    except MovementConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except MovementValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    if replayed:
        response.status_code = status.HTTP_200_OK
    return movement


@router.post(
    "/{movement_id}/correct",
    response_model=MovementResponse,
    status_code=status.HTTP_201_CREATED,
)
def correct_movement_endpoint(
    movement_id: str,
    payload: CorrectMovementRequest,
    response: Response,
    db: Session = Depends(get_db),
) -> MovementResponse:
    """Correct one supported movement without modifying its original record."""
    try:
        movement, replayed = correct_movement(db, movement_id, payload)
    except MovementConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except MovementValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc

    if replayed:
        response.status_code = status.HTTP_200_OK
    return movement
