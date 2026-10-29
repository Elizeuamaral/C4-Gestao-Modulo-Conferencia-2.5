"""NF-e access key (chave de acesso) validation."""

from __future__ import annotations

import re
from dataclasses import dataclass

_UF_CODES = {
    "11", "12", "13", "14", "15", "16", "17", "21", "22", "23", "24", "25", "26",
    "27", "28", "29", "31", "32", "33", "35", "41", "42", "43", "50", "51", "52",
    "53",
}


class InvalidAccessKeyError(ValueError):
    pass


@dataclass(frozen=True)
class AccessKey:
    value: str
    uf_code: str
    year_month: str
    cnpj: str
    model: str
    series: str
    number: str


def normalize_access_key(raw: str) -> str:
    """Remove whitespace/separators that scanners or copy-paste may add."""
    return re.sub(r"[\s.\-]", "", raw or "")


def _check_digit(base: str) -> int:
    total = 0
    weight = 2
    for digit in reversed(base):
        total += int(digit) * weight
        weight = 2 if weight == 9 else weight + 1
    remainder = total % 11
    return 0 if remainder in (0, 1) else 11 - remainder


def parse_access_key(raw: str) -> AccessKey:
    """Validate a 44-digit NF-e (model 55) access key and return its parts."""
    key = normalize_access_key(raw)
    if not key.isascii() or not key.isdigit() or len(key) != 44:
        raise InvalidAccessKeyError("A chave de acesso deve conter exatamente 44 dígitos.")
    if key[:2] not in _UF_CODES:
        raise InvalidAccessKeyError("Chave de acesso inválida: código de UF desconhecido.")
    if key[20:22] != "55":
        raise InvalidAccessKeyError("Somente NF-e modelo 55 é suportada.")
    if _check_digit(key[:43]) != int(key[43]):
        raise InvalidAccessKeyError("Chave de acesso inválida: dígito verificador incorreto.")
    return AccessKey(
        value=key,
        uf_code=key[:2],
        year_month=key[2:6],
        cnpj=key[6:20],
        model=key[20:22],
        series=str(int(key[22:25])),
        number=str(int(key[25:34])),
    )
