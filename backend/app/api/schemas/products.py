"""Pydantic schemas for the C4 Gestão product API."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


ProductCode = Annotated[str, Field(min_length=1, max_length=255)]
ProductName = Annotated[str, Field(min_length=1, max_length=255)]
ProductCategory = Annotated[str, Field(max_length=255)]
MinStock = Annotated[float, Field(ge=0)]


class ProductCreate(BaseModel):
    """Payload used to create a product."""

    model_config = ConfigDict(extra="forbid")

    code: ProductCode
    name: ProductName
    category: ProductCategory | None = None
    min_stock: MinStock = 0
    active: bool = True

    @field_validator("code", "name", "category", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> object:
        """Trim text fields and reject empty required values."""
        if value is None:
            return value
        if not isinstance(value, str):
            return value
        return value.strip()


class ProductUpdate(BaseModel):
    """Payload used to update a product."""

    model_config = ConfigDict(extra="forbid")

    code: ProductCode | None = None
    name: ProductName | None = None
    category: ProductCategory | None = None
    min_stock: MinStock | None = None
    active: bool | None = None

    @field_validator("code", "name", "category", mode="before")
    @classmethod
    def normalize_text(cls, value: object) -> object:
        """Trim text fields and reject empty values after trimming."""
        if value is None:
            return value
        if not isinstance(value, str):
            return value
        return value.strip()


class ProductResponse(BaseModel):
    """Public representation of a product."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    code: str
    name: str
    category: str | None
    min_stock: float
    active: bool
    created_at: datetime
    updated_at: datetime


class ProductListResponse(BaseModel):
    """Paginated product list response."""

    items: list[ProductResponse]
    total: int
    limit: int
    offset: int
