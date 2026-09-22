"""Pydantic schemas for the C4 Gestão checker API."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


CheckerName = Annotated[str, Field(min_length=1, max_length=255)]


class CheckerCreate(BaseModel):
    """Payload used to create a checker."""

    model_config = ConfigDict(extra="forbid")

    name: CheckerName
    active: bool = True

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object:
        """Trim the checker name before validation."""
        if value is None:
            return value
        if not isinstance(value, str):
            return value
        return value.strip()


class CheckerUpdate(BaseModel):
    """Payload used to update a checker."""

    model_config = ConfigDict(extra="forbid")

    name: CheckerName | None = None
    active: bool | None = None

    @field_validator("name", mode="before")
    @classmethod
    def normalize_name(cls, value: object) -> object:
        """Trim the checker name before validation."""
        if value is None:
            return value
        if not isinstance(value, str):
            return value
        return value.strip()


class CheckerResponse(BaseModel):
    """Public representation of a checker."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    active: bool
    created_at: str
    updated_at: str


class CheckerListResponse(BaseModel):
    """Paginated checker list response."""

    items: list[CheckerResponse]
    total: int
    limit: int
    offset: int
