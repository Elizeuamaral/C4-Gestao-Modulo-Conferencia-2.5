"""Pydantic schemas for the C4 Gestão movement API."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


Unit = Annotated[str, Field(pattern=r"^(FD|UN|CX|PCT)$")]
PositiveQuantity = Annotated[float, Field(gt=0)]
MovementType = Literal["ENTRADA", "SAIDA", "TRANSFERENCIA"]
ShortText = Annotated[str, Field(min_length=1, max_length=255)]


class MovementCreate(BaseModel):
    """Payload for stock movements supported by C4-API-006."""

    model_config = ConfigDict(extra="forbid")

    product_id: ShortText
    type: MovementType
    quantity: PositiveQuantity
    unit: Unit
    source_stock_item_id: str | None = Field(default=None, max_length=36)
    destination_stock_item_id: str | None = Field(default=None, max_length=36)
    checker_id: str | None = Field(default=None, max_length=36)
    entry_method: str | None = Field(default=None, max_length=50)
    update_reason: str | None = Field(default=None, max_length=1000)
    notes: str | None = None
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=255)

    @field_validator(
        "product_id",
        "source_stock_item_id",
        "destination_stock_item_id",
        "checker_id",
        "entry_method",
        "update_reason",
        "idempotency_key",
        mode="before",
    )
    @classmethod
    def normalize_text(cls, value: object) -> object:
        if isinstance(value, str):
            return value.strip()
        return value


class MovementResponse(BaseModel):
    """Public representation of a recorded stock movement."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    product_id: str
    type: str
    quantity: float
    unit: str
    source_stock_item_id: str | None
    destination_stock_item_id: str | None
    source_location_id: str | None
    destination_location_id: str | None
    product_code_snapshot: str
    product_name_snapshot: str
    lot_snapshot: str
    manufacturing_date: str | None
    expiration_date: str | None
    no_expiration_date: bool
    supplier: str | None
    invoice_number: str | None
    checker_id: str | None
    received_date: str | None
    timestamp: str
    entry_method: str | None
    updated_by_checker_id: str | None
    updated_at: str | None
    update_reason: str | None
    notes: str | None
    reversal_of_id: str | None
    correction_of_id: str | None
    idempotency_key: str | None


class MovementListResponse(BaseModel):
    """Paginated movement list response."""

    items: list[MovementResponse]
    total: int
    limit: int
    offset: int
