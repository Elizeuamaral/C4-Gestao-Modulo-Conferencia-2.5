"""Health and runtime diagnostics endpoints for C4 Gestão."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

from backend.app.core.config import settings
from backend.app.db.diagnostics import check_database


router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
def health() -> JSONResponse:
    """Check API availability and the SQLite database integrity state."""
    try:
        database = check_database()
    except SQLAlchemyError as exc:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "api": {
                    "status": "ok",
                    "name": settings.app_name,
                    "version": settings.app_version,
                },
                "database": {
                    "status": "error",
                    "engine": "unknown",
                    "message": f"Database check failed: {exc.__class__.__name__}",
                },
            },
        )

    overall_status = "ok" if database["status"] == "ok" else "error"
    status_code = 200 if overall_status == "ok" else 503

    return JSONResponse(
        status_code=status_code,
        content={
            "status": overall_status,
            "api": {
                "status": "ok",
                "name": settings.app_name,
                "version": settings.app_version,
            },
            "database": database,
        },
    )
