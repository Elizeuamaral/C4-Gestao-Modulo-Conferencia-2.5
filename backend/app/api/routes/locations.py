"""Storage location CRUD endpoints for the C4 Gestão API."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api.schemas.locations import (
    LocationCreate,
    LocationListResponse,
    LocationResponse,
    LocationUpdate,
)
from backend.app.db.database import get_db
from backend.app.services.locations import (
    LocationConflictError,
    create_location,
    deactivate_location,
    get_location,
    list_locations,
    update_location,
)

router = APIRouter(prefix="/locations", tags=["locations"])


@router.post("", response_model=LocationResponse, status_code=status.HTTP_201_CREATED)
def create_location_endpoint(
    payload: LocationCreate,
    db: Session = Depends(get_db),
) -> LocationResponse:
    """Create a new storage location."""
    try:
        return create_location(db, payload)
    except LocationConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.get("", response_model=LocationListResponse)
def list_locations_endpoint(
    active: bool | None = Query(
        default=True,
        description="Filter by active status. Default is true.",
    ),
    search: str | None = Query(
        default=None,
        min_length=1,
        max_length=255,
        description="Search by location code or name.",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> LocationListResponse:
    """List storage locations with optional filters and pagination."""
    locations, total = list_locations(
        db,
        active=active,
        search=search.strip() if search else None,
        limit=limit,
        offset=offset,
    )
    return LocationListResponse(
        items=locations,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{location_id}", response_model=LocationResponse)
def get_location_endpoint(
    location_id: str,
    db: Session = Depends(get_db),
) -> LocationResponse:
    """Return one storage location by ID."""
    location = get_location(db, location_id)
    if location is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found.",
        )
    return location


@router.put("/{location_id}", response_model=LocationResponse)
def update_location_endpoint(
    location_id: str,
    payload: LocationUpdate,
    db: Session = Depends(get_db),
) -> LocationResponse:
    """Update an existing storage location."""
    location = get_location(db, location_id)
    if location is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found.",
        )

    try:
        return update_location(db, location, payload)
    except LocationConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc


@router.delete("/{location_id}", response_model=LocationResponse)
def deactivate_location_endpoint(
    location_id: str,
    db: Session = Depends(get_db),
) -> LocationResponse:
    """Deactivate a storage location without deleting its record."""
    location = get_location(db, location_id)
    if location is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Location not found.",
        )

    try:
        return deactivate_location(db, location)
    except IntegrityError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Location could not be deactivated.",
        ) from exc
