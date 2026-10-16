"""FastAPI application entry point for C4 Gestão.

C4-API-004 adds location and checker domain routes while preserving the
validated C4-API-002 health and C4-API-003 product routes.
"""

from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.dependencies import get_current_user
from backend.app.api.routes.auth import router as auth_router
from backend.app.api.routes.checkers import router as checkers_router
from backend.app.api.routes.health import router as health_router
from backend.app.api.routes.invoices import router as invoices_router
from backend.app.api.routes.locations import router as locations_router
from backend.app.api.routes.movements import router as movements_router
from backend.app.api.routes.products import router as products_router
from backend.app.api.routes.stock import router as stock_router
from backend.app.core.config import settings
from backend.app.db.database import engine
from backend.app.db.migrations import apply_schema_upgrades
from backend.app.db.models import Base


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Create newly introduced tables without altering existing tables."""
    Base.metadata.create_all(bind=engine)
    apply_schema_upgrades(engine)
    yield


def create_app() -> FastAPI:
    """Create and configure the C4 Gestão FastAPI application."""
    app = FastAPI(
        lifespan=lifespan,
        title=settings.app_name,
        version=settings.app_version,
        description="Backend API do C4 Gestão — Módulo Conferência 2.5.",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_origin_regex=settings.cors_origin_regex,
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
    app.include_router(auth_router)
    # Operational APIs require an active login. The health endpoint remains public.
    protected = [Depends(get_current_user)]
    app.include_router(products_router, dependencies=protected)
    app.include_router(locations_router, dependencies=protected)
    app.include_router(checkers_router, dependencies=protected)
    app.include_router(stock_router, dependencies=protected)
    app.include_router(movements_router, dependencies=protected)
    app.include_router(invoices_router, dependencies=protected)

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
