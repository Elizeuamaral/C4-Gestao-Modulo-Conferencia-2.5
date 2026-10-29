"""Pydantic schemas for invoice (nota fiscal) conference."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

Unit = Annotated[str, Field(pattern=r"^(FD|UN|CX|PCT)$")]
IsoDate = Annotated[str, Field(pattern=r"^\d{4}-\d{2}-\d{2}$")]


class _Strip(BaseModel):
    @field_validator("*", mode="before")
    @classmethod
    def _strip_blank(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            return value or None
        return value


class InvoiceItemCreate(_Strip):
    model_config = ConfigDict(extra="forbid")

    product_code: str = Field(min_length=1, max_length=255)
    product_description: str | None = Field(default=None, max_length=255)
    product_id: str | None = Field(default=None, max_length=36)
    unit: Unit
    invoice_quantity: float = Field(ge=0)
    invoice_lot: str | None = Field(default=None, max_length=255)
    invoice_expiration_date: IsoDate | None = None
    notes: str | None = None


class InvoiceCreate(_Strip):
    model_config = ConfigDict(extra="forbid")

    number: str = Field(min_length=1, max_length=100)
    series: str | None = Field(default=None, max_length=20)
    access_key: str | None = Field(default=None, pattern=r"^\d{44}$")
    supplier: str | None = Field(default=None, max_length=255)
    received_date: IsoDate | None = None
    notes: str | None = None
    items: list[InvoiceItemCreate] = Field(min_length=1)


class NFeLookupRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    access_key: str = Field(min_length=1, max_length=100)


class ConferItemRequest(_Strip):
    model_config = ConfigDict(extra="forbid")

    conferred_quantity: float = Field(ge=0)
    location_id: str = Field(min_length=1, max_length=36)
    lot: str | None = Field(default=None, max_length=255)
    manufacturing_date: IsoDate | None = None
    expiration_date: IsoDate | None = None
    no_expiration_date: bool = False
    notes: str | None = None


class InvoiceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    invoice_id: str
    line_number: int
    product_id: str | None
    product_code: str
    product_description: str | None
    unit: str
    invoice_quantity: float
    invoice_lot: str | None
    invoice_expiration_date: str | None
    status: str
    conferred_quantity: float | None
    divergence_quantity: float | None
    conferred_by_user_id: str | None
    conferred_at: str | None
    stock_item_id: str | None
    entry_movement_id: str | None
    current_stock_quantity: float | None
    notes: str | None


class InvoiceResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    number: str
    series: str | None
    access_key: str | None
    supplier: str | None
    received_date: str | None
    status: str
    notes: str | None
    created_by_user_id: str | None
    conferred_by_user_id: str | None
    conferred_at: str | None
    created_at: str
    updated_at: str
    items: list[InvoiceItemResponse]


class InvoiceListResponse(BaseModel):
    items: list[InvoiceResponse]
    total: int
    limit: int
    offset: int
