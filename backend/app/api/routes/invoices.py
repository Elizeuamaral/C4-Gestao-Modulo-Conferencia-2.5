"""Invoice (nota fiscal) endpoints. All routes require an authenticated user."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from backend.app.api.dependencies import get_current_user
from backend.app.api.schemas.invoices import (
    ConferItemRequest,
    InvoiceCreate,
    InvoiceItemResponse,
    InvoiceListResponse,
    InvoiceResponse,
    NFeLookupRequest,
)
from backend.app.db.database import get_db
from backend.app.db.models import User
from backend.app.services.invoices import (
    InvoiceConflictError,
    InvoiceNotFoundError,
    InvoiceValidationError,
    confer_item,
    create_invoice,
    get_invoice,
    list_invoices,
)
from backend.app.services.nfe.key import InvalidAccessKeyError
from backend.app.services.nfe.lookup import lookup_invoice_by_key
from backend.app.services.nfe.providers import (
    NFeNotFoundError,
    NFeProvider,
    NFeProviderNotConfiguredError,
    NFeProviderUnavailableError,
    get_nfe_provider,
)
from backend.app.services.nfe.xml_parser import NFeParseError

router = APIRouter(prefix="/invoices", tags=["invoices"])


def _raise(exc: Exception) -> None:
    if isinstance(exc, InvoiceNotFoundError):
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    if isinstance(exc, InvoiceConflictError):
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc


@router.post("", response_model=InvoiceResponse, status_code=status.HTTP_201_CREATED)
def create_invoice_endpoint(
    payload: InvoiceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InvoiceResponse:
    try:
        return create_invoice(db, payload, current_user.id)
    except (InvoiceConflictError, InvoiceValidationError) as exc:
        _raise(exc)


@router.post("/lookup", response_model=InvoiceResponse)
def lookup_invoice_endpoint(
    payload: NFeLookupRequest,
    response: Response,
    db: Session = Depends(get_db),
    provider: NFeProvider = Depends(get_nfe_provider),
    current_user: User = Depends(get_current_user),
) -> InvoiceResponse:
    """Load an NF-e by access key: 201 when newly registered, 200 when already registered."""
    try:
        invoice, created = lookup_invoice_by_key(db, payload.access_key, provider, current_user.id)
    except InvalidAccessKeyError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except NFeNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, str(exc)) from exc
    except NFeProviderNotConfiguredError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    except NFeProviderUnavailableError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(exc)) from exc
    except NFeParseError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"XML da NF-e não pôde ser processado: {exc}") from exc
    except (InvoiceConflictError, InvoiceValidationError) as exc:
        _raise(exc)
    response.status_code = status.HTTP_201_CREATED if created else status.HTTP_200_OK
    return invoice


@router.get("", response_model=InvoiceListResponse)
def list_invoices_endpoint(
    status_filter: str | None = Query(
        default=None,
        alias="status",
        pattern=r"^(PENDENTE|EM_CONFERENCIA|CONFERIDA|CONFERIDA_COM_DIVERGENCIA)$",
    ),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
) -> InvoiceListResponse:
    items, total = list_invoices(db, status=status_filter, limit=limit, offset=offset)
    return InvoiceListResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{invoice_id}", response_model=InvoiceResponse)
def get_invoice_endpoint(invoice_id: str, db: Session = Depends(get_db)) -> InvoiceResponse:
    invoice = get_invoice(db, invoice_id)
    if invoice is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invoice not found.")
    return invoice


@router.post(
    "/{invoice_id}/items/{item_id}/confer",
    response_model=InvoiceItemResponse,
    status_code=status.HTTP_201_CREATED,
)
def confer_item_endpoint(
    invoice_id: str,
    item_id: str,
    payload: ConferItemRequest,
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InvoiceItemResponse:
    """Record QTD. CONF. and the stock entry; identical replays return 200."""
    try:
        item, replayed = confer_item(db, invoice_id, item_id, payload, current_user.id)
    except (InvoiceNotFoundError, InvoiceConflictError, InvoiceValidationError) as exc:
        _raise(exc)
    if replayed:
        response.status_code = status.HTTP_200_OK
    return item
