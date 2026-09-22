"""Application configuration for the C4 Gestão FastAPI backend."""

from __future__ import annotations

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration loaded from environment variables."""

    app_name: str = Field(
        default="C4 Gestão API",
        validation_alias="C4_API_NAME",
    )
    app_version: str = Field(
        default="2.5.0",
        validation_alias="C4_API_VERSION",
    )
    api_host: str = Field(
        default="127.0.0.1",
        validation_alias="C4_API_HOST",
    )
    api_port: int = Field(
        default=8000,
        validation_alias="C4_API_PORT",
    )
    cors_origins: str = Field(
        default="http://localhost:5173,http://127.0.0.1:5173",
        validation_alias="C4_CORS_ORIGINS",
    )

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origins_list(self) -> list[str]:
        """Return configured CORS origins as a normalized list."""
        return [
            origin.strip()
            for origin in self.cors_origins.split(",")
            if origin.strip()
        ]


settings = Settings()
