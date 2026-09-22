"""Location business service for the C4 Gestão API."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api.schemas.locations import LocationCreate, LocationUpdate
from backend.app.db.models import Location


class LocationConflictError(Exception):
    """Raised when a location violates a uniqueness rule."""


def _normalize_location_data(data: LocationCreate | LocationUpdate) -> dict[str, object]:
    """Return validated location data ready for persistence."""
    values = data.model_dump(exclude_unset=True)

    for field in ("code", "name"):
        if field in values and isinstance(values[field], str):
            values[field] = values[field].strip()

    return values


def _ensure_required_text(value: object, field_name: str) -> None:
    """Reject blank required text after normalization."""
    if isinstance(value, str) and not value:
        raise ValueError(f"{field_name} cannot be blank.")


def create_location(db: Session, payload: LocationCreate) -> Location:
    """Create and persist a storage location."""
    values = _normalize_location_data(payload)
    _ensure_required_text(values.get("code"), "code")
    _ensure_required_text(values.get("name"), "name")

    location = Location(**values)
    db.add(location)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise LocationConflictError("Location code already exists.") from exc

    db.refresh(location)
    return location


def list_locations(
    db: Session,
    *,
    active: bool | None,
    search: str | None,
    limit: int,
    offset: int,
) -> tuple[list[Location], int]:
    """Return locations using optional active/search filters and pagination."""
    filters = []

    if active is not None:
        filters.append(Location.active.is_(active))

    if search:
        pattern = f"%{search.strip()}%"
        filters.append(
            (Location.code.ilike(pattern)) | (Location.name.ilike(pattern))
        )

    total = db.scalar(select(func.count(Location.id)).where(*filters)) or 0

    locations = list(
        db.scalars(
            select(Location)
            .where(*filters)
            .order_by(Location.name.asc(), Location.code.asc())
            .offset(offset)
            .limit(limit)
        )
    )

    return locations, total


def get_location(db: Session, location_id: str) -> Location | None:
    """Return a location by ID."""
    return db.get(Location, location_id)


def update_location(
    db: Session,
    location: Location,
    payload: LocationUpdate,
) -> Location:
    """Update and persist an existing location."""
    values = _normalize_location_data(payload)

    if "code" in values:
        _ensure_required_text(values["code"], "code")

    if "name" in values:
        _ensure_required_text(values["name"], "name")

    for field, value in values.items():
        setattr(location, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise LocationConflictError("Location code already exists.") from exc

    db.refresh(location)
    return location


def deactivate_location(db: Session, location: Location) -> Location:
    """Deactivate a location without physically deleting its record."""
    location.active = False

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise

    db.refresh(location)
    return location
