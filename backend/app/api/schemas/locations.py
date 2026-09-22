"""Pydantic schemas for the C4 Gestão location API."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


LocationCode = Annotated[str, Field(min_length=1, max_length=100)]
LocationName = Annotated[str, Field(min_length=1, max_length=255)]


class LocationCreate(BaseModel):
    """Payload used to create a storage location."""

    model_config = ConfigDict(extra="forbid")

    code: LocationCode
    name: LocationName
    active: bool = True

    @field_validator("code", "name", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> object:
        """Trim text fields before validation."""
        if value is None:
            return value
        if not isinstance(value, str):
            return value
        return value.strip()


class LocationUpdate(BaseModel):
    """Payload used to update a storage location."""

    model_config = ConfigDict(extra="forbid")

    code: LocationCode | None = None
    name: LocationName | None = None
    active: bool | None = None

    @field_validator("code", "name", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> object:
        """Trim text fields before validation."""
        if value is None:
            return value
        if not isinstance(value, str):
            return value
        return value.strip()


class LocationResponse(BaseModel):
    """Public representation of a storage location."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str
    active: bool
    created_at: str
    updated_at: str


class LocationListResponse(BaseModel):
    """Paginated storage location list response."""

    items: list[LocationResponse]
    total: int
    limit: int
    offset: int
