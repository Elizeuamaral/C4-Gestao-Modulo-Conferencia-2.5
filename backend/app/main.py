"""FastAPI application entry point for C4 Gestão.

C4-API-002 adds the health/diagnostic route used to validate the API and
SQLite runtime before domain endpoints are introduced.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.routes.health import router as health_router
from backend.app.core.config import settings


def create_app() -> FastAPI:
    """Create and configure the C4 Gestão FastAPI application."""
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="Backend API do C4 Gestão — Módulo Conferência 2.5.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/", tags=["system"])
    def root() -> dict[str, str]:
        """Return basic API metadata."""
        return {
            "name": settings.app_name,
            "version": settings.app_version,
            "status": "running",
        }

    app.include_router(health_router)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.app.main:app",
        host=settings.api_host,
        port=settings.api_port,
        reload=False,
    )
