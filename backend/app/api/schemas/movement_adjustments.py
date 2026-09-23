from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ReverseMovementRequest(BaseModel):
    """Dados necessários para estornar uma movimentação existente."""

    model_config = ConfigDict(extra="forbid")

    checker_id: UUID | None = None
    reason: str = Field(min_length=1, max_length=500)
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=255)


class CorrectMovementRequest(BaseModel):
    """Dados necessários para corrigir a quantidade de uma movimentação existente."""

    model_config = ConfigDict(extra="forbid")

    correct_quantity: int = Field(gt=0)
    checker_id: UUID | None = None
    reason: str = Field(min_length=1, max_length=500)
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=255)
