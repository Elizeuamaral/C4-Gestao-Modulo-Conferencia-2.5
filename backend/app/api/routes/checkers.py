"""Checker CRUD endpoints for the C4 Gestão API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api.schemas.checkers import (
    CheckerCreate,
    CheckerListResponse,
    CheckerResponse,
    CheckerUpdate,
)
from backend.app.db.database import get_db
from backend.app.services.checkers import (
    CheckerConflictError,
    create_checker,
    deactivate_checker,
    get_checker,
    list_checkers,
    update_checker,
)

router = APIRouter(prefix="/checkers", tags=["checkers"])


@router.post("", response_model=CheckerResponse, status_code=status.HTTP_201_CREATED)
def create_checker_endpoint(
    payload: CheckerCreate,
    db: Session = Depends(get_db),
) -> CheckerResponse:
    """Create a new checker."""
    try:
        return create_checker(db, payload)
    except CheckerConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("", response_model=CheckerListResponse)
def list_checkers_endpoint(
    active: bool | None = Query(
        default=True,
        description="Filter by active status. Default is true.",
    ),
    search: str | None = Query(
        default=None,
        min_length=1,
        max_length=255,
        description="Search by checker name.",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> CheckerListResponse:
    """List checkers with optional filters and pagination."""
    checkers, total = list_checkers(
        db,
        active=active,
        search=search.strip() if search else None,
        limit=limit,
        offset=offset,
    )
    return CheckerListResponse(
        items=checkers,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{checker_id}", response_model=CheckerResponse)
def get_checker_endpoint(
    checker_id: str,
    db: Session = Depends(get_db),
) -> CheckerResponse:
    """Return one checker by ID."""
    checker = get_checker(db, checker_id)
    if checker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Checker not found.",
        )
    return checker


@router.put("/{checker_id}", response_model=CheckerResponse)
def update_checker_endpoint(
    checker_id: str,
    payload: CheckerUpdate,
    db: Session = Depends(get_db),
) -> CheckerResponse:
    """Update an existing checker."""
    checker = get_checker(db, checker_id)
    if checker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Checker not found.",
        )

    try:
        return update_checker(db, checker, payload)
    except CheckerConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.delete("/{checker_id}", response_model=CheckerResponse)
def deactivate_checker_endpoint(
    checker_id: str,
    db: Session = Depends(get_db),
) -> CheckerResponse:
    """Deactivate a checker without deleting its record."""
    checker = get_checker(db, checker_id)
    if checker is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Checker not found.",
        )

    try:
        return deactivate_checker(db, checker)
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Checker could not be deactivated.",
        ) from exc
