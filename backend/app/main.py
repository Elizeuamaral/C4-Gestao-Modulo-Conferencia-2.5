"""FastAPI application entry point for C4 Gestão.

The packaged desktop build can serve the compiled frontend from the same local
process. Development continues to use the Vite development server as before.
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

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
    """Initialize schema and apply safe schema upgrades on startup."""
    Base.metadata.create_all(bind=engine)
    apply_schema_upgrades(engine)
    yield


def _frontend_dist_directory() -> Path | None:
    """Resolve a built frontend directory when desktop packaging enables it."""
    configured = os.getenv("C4_FRONTEND_DIST")
    if configured:
        candidate = Path(configured).expanduser().resolve()
        return candidate if (candidate / "index.html").is_file() else None

    # PyInstaller one-folder/one-file bundles expose bundled data under _MEIPASS.
    bundle_root = Path(getattr(__import__("sys"), "_MEIPASS", Path(__file__).resolve().parents[2]))
    candidates = [
        bundle_root / "frontend" / "dist",
        Path(__file__).resolve().parents[2] / "dist",
    ]
    return next((path for path in candidates if (path / "index.html").is_file()), None)


def create_app() -> FastAPI:
    """Create and configure the C4 Gestão application."""
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
    def root():
        """Serve the app home when packaged, or API metadata during development."""
        frontend = _frontend_dist_directory()
        if frontend:
            return FileResponse(frontend / "index.html")
        return {
            "name": settings.app_name,
            "version": settings.app_version,
            "status": "running",
        }

    app.include_router(health_router)
    app.include_router(auth_router)
    protected = [Depends(get_current_user)]
    app.include_router(products_router, dependencies=protected)
    app.include_router(locations_router, dependencies=protected)
    app.include_router(checkers_router, dependencies=protected)
    app.include_router(stock_router, dependencies=protected)
    app.include_router(movements_router, dependencies=protected)
    app.include_router(invoices_router, dependencies=protected)

    frontend = _frontend_dist_directory()
    if frontend:
        # API routes are registered first; remaining paths are frontend assets.
        app.mount("/assets", StaticFiles(directory=frontend / "assets"), name="frontend-assets")

        @app.get("/{frontend_path:path}", include_in_schema=False)
        def frontend_route(frontend_path: str):
            """Return built assets or index.html for client-side navigation."""
            candidate = (frontend / frontend_path).resolve()
            if candidate.is_relative_to(frontend.resolve()) and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(frontend / "index.html")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.app.main:app",
        host="127.0.0.1" if _frontend_dist_directory() else settings.api_host,
        port=settings.api_port,
        reload=False,
    )
