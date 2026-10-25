"""XML providers for NF-e lookup.

The lookup runs only on the backend. Credentials or certificates required by a
real provider (e.g. SEFAZ/distribuição DF-e, or a third-party service) must be
supplied through backend environment variables and never reach the frontend.
"""

from __future__ import annotations

from pathlib import Path
from typing import Protocol

from backend.app.core.config import settings
from backend.app.services.nfe.xml_parser import MAX_XML_BYTES


class NFeNotFoundError(Exception):
    pass


class NFeProviderUnavailableError(Exception):
    pass


class NFeProviderNotConfiguredError(Exception):
    pass


class NFeProvider(Protocol):
    def fetch_xml(self, access_key: str) -> str:
        """Return the NF-e XML for an already validated 44-digit access key."""


class UnconfiguredProvider:
    def fetch_xml(self, access_key: str) -> str:
        raise NFeProviderNotConfiguredError(
            "Consulta de NF-e não configurada no servidor (C4_NFE_PROVIDER)."
        )


class XmlDirectoryProvider:
    """Reads ``<chave>.xml`` from a server-side directory (e.g. an ERP/XML export)."""

    def __init__(self, directory: str) -> None:
        self.directory = Path(directory)

    def fetch_xml(self, access_key: str) -> str:
        if not self.directory.is_dir():
            raise NFeProviderUnavailableError("Diretório de XML de NF-e indisponível.")
        # The key is validated as 44 digits upstream, so it cannot escape the directory.
        path = self.directory / f"{access_key}.xml"
        if not path.is_file():
            raise NFeNotFoundError("NF-e não encontrada para a chave informada.")
        try:
            if path.stat().st_size > MAX_XML_BYTES:
                raise NFeProviderUnavailableError("XML da NF-e excede o tamanho máximo permitido.")
            return path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            raise NFeProviderUnavailableError("Falha ao ler o XML da NF-e.") from exc


def get_nfe_provider() -> NFeProvider:
    if settings.nfe_provider == "xml_dir" and settings.nfe_xml_dir:
        return XmlDirectoryProvider(settings.nfe_xml_dir)
    return UnconfiguredProvider()
