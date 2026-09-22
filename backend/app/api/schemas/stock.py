"""Pydantic schemas for the C4 Gestão stock API."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator


Unit = Annotated[str, Field(pattern=r"^(FD|UN|CX|PCT)$")]
PositiveQuantity = Annotated[float, Field(gt=0)]
NonNegativeQuantity = Annotated[float, Field(ge=0)]
ShortText = Annotated[str, Field(min_length=1, max_length=255)]


class StockCreate(BaseModel):
    """Payload used to create an initial/current stock balance."""

    model_config = ConfigDict(extra="forbid")

    product_id: ShortText
    location_id: ShortText
    quantity: PositiveQuantity
    received_quantity: NonNegativeQuantity = 0
    unit: Unit
    lot: str = ""
    manufacturing_date: str | None = Field(default=None, max_length=10)
    expiration_date: str | None = Field(default=None, max_length=10)
    no_expiration_date: bool = False
    supplier: str | None = Field(default=None, max_length=255)
    invoice_number: str | None = Field(default=None, max_length=100)
    checker_id: str | None = Field(default=None, max_length=36)
    received_date: ShortText
    entry_method: str | None = Field(default=None, max_length=50)
    notes: str | None = None

    @field_validator(
        "product_id",
        "location_id",
        "lot",
        "manufacturing_date",
        "expiration_date",
        "supplier",
        "invoice_number",
        "checker_id",
        "received_date",
        "entry_method",
        mode="before",
    )
    @classmethod
    def normalize_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value


class StockUpdate(BaseModel):
    """Payload used to update stock metadata without changing its quantity."""

    model_config = ConfigDict(extra="forbid")

    lot: str | None = Field(default=None, max_length=255)
    manufacturing_date: str | None = Field(default=None, max_length=10)
    expiration_date: str | None = Field(default=None, max_length=10)
    no_expiration_date: bool | None = None
    supplier: str | None = Field(default=None, max_length=255)
    invoice_number: str | None = Field(default=None, max_length=100)
    checker_id: str | None = Field(default=None, max_length=36)
    received_date: str | None = Field(default=None, min_length=1, max_length=10)
    entry_method: str | None = Field(default=None, max_length=50)
    notes: str | None = None

    @field_validator(
        "lot",
        "manufacturing_date",
        "expiration_date",
        "supplier",
        "invoice_number",
        "checker_id",
        "received_date",
        "entry_method",
        mode="before",
    )
    @classmethod
    def normalize_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value


class StockResponse(BaseModel):
    """Public representation of a stock balance."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    location_id: str
    quantity: float
    received_quantity: float
    unit: str
    lot: str
    manufacturing_date: str | None
    expiration_date: str | None
    no_expiration_date: bool
    supplier: str | None
    invoice_number: str | None
    checker_id: str | None
    received_date: str
    entry_method: str | None
    notes: str | None
    created_at: str
    updated_at: str


class StockListResponse(BaseModel):
    """Paginated stock list response."""

    items: list[StockResponse]
    total: int
    limit: int
    offset: int
