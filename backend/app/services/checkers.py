"""Checker business service for the C4 Gestão API."""

from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.api.schemas.checkers import CheckerCreate, CheckerUpdate
from backend.app.db.models import Checker


class CheckerConflictError(Exception):
    """Raised when a checker violates a uniqueness rule."""


def _normalize_checker_data(data: CheckerCreate | CheckerUpdate) -> dict[str, object]:
    """Return validated checker data ready for persistence."""
    values = data.model_dump(exclude_unset=True)

    if "name" in values and isinstance(values["name"], str):
        values["name"] = values["name"].strip()

    return values


def _ensure_required_name(value: object) -> None:
    """Reject blank checker names after normalization."""
    if isinstance(value, str) and not value:
        raise ValueError("name cannot be blank.")


def create_checker(db: Session, payload: CheckerCreate) -> Checker:
    """Create and persist a checker."""
    values = _normalize_checker_data(payload)
    _ensure_required_name(values.get("name"))

    checker = Checker(**values)
    db.add(checker)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise CheckerConflictError("Checker name already exists.") from exc

    db.refresh(checker)
    return checker


def list_checkers(
    db: Session,
    *,
    active: bool | None,
    search: str | None,
    limit: int,
    offset: int,
) -> tuple[list[Checker], int]:
    """Return checkers using optional active/search filters and pagination."""
    filters = []

    if active is not None:
        filters.append(Checker.active.is_(active))

    if search:
        pattern = f"%{search.strip()}%"
        filters.append(Checker.name.ilike(pattern))

    total = db.scalar(select(func.count(Checker.id)).where(*filters)) or 0

    checkers = list(
        db.scalars(
            select(Checker)
            .where(*filters)
            .order_by(Checker.name.asc())
            .offset(offset)
            .limit(limit)
        )
    )

    return checkers, total


def get_checker(db: Session, checker_id: str) -> Checker | None:
    """Return a checker by ID."""
    return db.get(Checker, checker_id)


def update_checker(
    db: Session,
    checker: Checker,
    payload: CheckerUpdate,
) -> Checker:
    """Update and persist an existing checker."""
    values = _normalize_checker_data(payload)

    if "name" in values:
        _ensure_required_name(values["name"])

    for field, value in values.items():
        setattr(checker, field, value)

    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise CheckerConflictError("Checker name already exists.") from exc

    db.refresh(checker)
    return checker


def deactivate_checker(db: Session, checker: Checker) -> Checker:
    """Deactivate a checker without physically deleting its record."""
    checker.active = False

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise

    db.refresh(checker)
    return checker
