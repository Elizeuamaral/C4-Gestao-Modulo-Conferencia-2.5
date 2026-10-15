"""Pydantic schemas for authentication and user administration."""
from __future__ import annotations
from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator
Role = Literal["ADMIN", "CONFERENTE"]

class UserCredentials(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=8, max_length=128)
    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str: return value.strip().lower()

class InitialAdminSetup(UserCredentials):
    full_name: str = Field(min_length=2, max_length=150)
    @field_validator("full_name")
    @classmethod
    def normalize_full_name(cls, value: str) -> str: return value.strip()

class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    username: str = Field(min_length=3, max_length=80)
    password: str = Field(min_length=8, max_length=128)
    role: Role = "CONFERENTE"
    @field_validator("username")
    @classmethod
    def normalize_username(cls, value: str) -> str: return value.strip().lower()
    @field_validator("full_name")
    @classmethod
    def normalize_full_name(cls, value: str) -> str: return value.strip()

class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    role: Role | None = None
    @field_validator("full_name")
    @classmethod
    def normalize_full_name(cls, value: str | None) -> str | None: return value.strip() if value is not None else value

class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)

class PasswordReset(BaseModel):
    new_password: str = Field(min_length=8, max_length=128)

class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    full_name: str
    username: str
    role: Role
    active: bool
    created_at: str
    updated_at: str

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

class SetupStatus(BaseModel):
    setup_required: bool
