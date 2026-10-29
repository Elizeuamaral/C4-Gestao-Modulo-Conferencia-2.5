"""Additive, idempotent schema upgrades for existing SQLite databases.

``Base.metadata.create_all()`` creates missing tables but never alters tables
that already exist. C4-DB-001 adds audit columns to ``movements``; this module
adds them with ``ALTER TABLE ... ADD COLUMN`` (nullable, no default rewrite), so
existing rows are preserved untouched. Running it repeatedly is safe.
"""

from __future__ import annotations

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

# table -> [(column, SQL type + optional REFERENCES clause)]
_ADDED_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "movements": [
        ("user_id", "VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL"),
        ("invoice_id", "VARCHAR(36) REFERENCES invoices(id) ON DELETE RESTRICT"),
        ("invoice_item_id", "VARCHAR(36) REFERENCES invoice_items(id) ON DELETE RESTRICT"),
        ("quantity_before", "FLOAT"),
        ("quantity_after", "FLOAT"),
    ],
}

_INDEXES = [
    "CREATE INDEX IF NOT EXISTS idx_movements_user ON movements (user_id)",
    "CREATE INDEX IF NOT EXISTS idx_movements_invoice ON movements (invoice_id)",
    "CREATE INDEX IF NOT EXISTS idx_movements_invoice_item ON movements (invoice_item_id)",
]


def apply_schema_upgrades(engine: Engine) -> list[str]:
    """Add missing columns/indexes and return the columns that were added."""
    added: list[str] = []
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())

    with engine.begin() as connection:
        for table, columns in _ADDED_COLUMNS.items():
            if table not in tables:
                continue
            existing = {column["name"] for column in inspector.get_columns(table)}
            for name, ddl in columns:
                if name not in existing:
                    connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                    added.append(f"{table}.{name}")
        for statement in _INDEXES:
            connection.execute(text(statement))
    return added
