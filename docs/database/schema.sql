-- C4-DB-001 — Modelagem SQLite
-- Este arquivo documenta o DDL de referência.
-- Não é executado automaticamente neste commit.
-- A implementação oficial posterior será feita com SQLAlchemy.

PRAGMA foreign_keys = ON;

CREATE TABLE products (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT,
    min_stock REAL NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE locations (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE checkers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE stock_items (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    location_id TEXT NOT NULL,
    quantity REAL NOT NULL CHECK (quantity >= 0),
    received_quantity REAL NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
    unit TEXT NOT NULL CHECK (unit IN ('FD', 'UN', 'CX', 'PCT')),
    lot TEXT NOT NULL DEFAULT '',
    manufacturing_date TEXT,
    expiration_date TEXT,
    no_expiration_date INTEGER NOT NULL DEFAULT 0 CHECK (no_expiration_date IN (0, 1)),
    supplier TEXT,
    invoice_number TEXT,
    checker_id TEXT,
    received_date TEXT NOT NULL,
    entry_method TEXT,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    FOREIGN KEY (checker_id) REFERENCES checkers(id) ON DELETE SET NULL,

    CHECK (
        no_expiration_date = 1
        OR expiration_date IS NOT NULL
    )
);

CREATE TABLE movements (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK (
        type IN (
            'ENTRADA',
            'SAIDA',
            'TRANSFERENCIA',
            'BAIXA',
            'CORRECAO',
            'ESTORNO'
        )
    ),
    quantity REAL NOT NULL CHECK (quantity > 0),
    unit TEXT NOT NULL CHECK (unit IN ('FD', 'UN', 'CX', 'PCT')),

    source_stock_item_id TEXT,
    destination_stock_item_id TEXT,

    source_location_id TEXT,
    destination_location_id TEXT,

    product_code_snapshot TEXT NOT NULL,
    product_name_snapshot TEXT NOT NULL,
    lot_snapshot TEXT NOT NULL DEFAULT '',
    manufacturing_date TEXT,
    expiration_date TEXT,
    no_expiration_date INTEGER NOT NULL DEFAULT 0 CHECK (no_expiration_date IN (0, 1)),
    supplier TEXT,
    invoice_number TEXT,

    checker_id TEXT,
    received_date TEXT,
    timestamp TEXT NOT NULL,

    entry_method TEXT,
    updated_by_checker_id TEXT,
    updated_at TEXT,
    update_reason TEXT,
    notes TEXT,

    reversal_of_id TEXT,
    correction_of_id TEXT,
    idempotency_key TEXT UNIQUE,

    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
    FOREIGN KEY (source_stock_item_id) REFERENCES stock_items(id) ON DELETE RESTRICT,
    FOREIGN KEY (destination_stock_item_id) REFERENCES stock_items(id) ON DELETE RESTRICT,
    FOREIGN KEY (source_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    FOREIGN KEY (destination_location_id) REFERENCES locations(id) ON DELETE RESTRICT,
    FOREIGN KEY (checker_id) REFERENCES checkers(id) ON DELETE SET NULL,
    FOREIGN KEY (updated_by_checker_id) REFERENCES checkers(id) ON DELETE SET NULL,
    FOREIGN KEY (reversal_of_id) REFERENCES movements(id) ON DELETE RESTRICT,
    FOREIGN KEY (correction_of_id) REFERENCES movements(id) ON DELETE RESTRICT,

    CHECK (
        type != 'ENTRADA'
        OR destination_location_id IS NOT NULL
    ),
    CHECK (
        type != 'SAIDA'
        OR source_location_id IS NOT NULL
    ),
    CHECK (
        type != 'TRANSFERENCIA'
        OR (
            source_location_id IS NOT NULL
            AND destination_location_id IS NOT NULL
            AND source_location_id <> destination_location_id
        )
    )
);

CREATE TABLE app_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    company_name TEXT NOT NULL DEFAULT 'C4 Gestão',
    default_location_id TEXT,
    sound_beep_enabled INTEGER NOT NULL DEFAULT 1 CHECK (sound_beep_enabled IN (0, 1)),
    sound_alert_enabled INTEGER NOT NULL DEFAULT 1 CHECK (sound_alert_enabled IN (0, 1)),
    critical_expiry_days INTEGER NOT NULL DEFAULT 20 CHECK (critical_expiry_days >= 0),
    warning_expiry_days INTEGER NOT NULL DEFAULT 30 CHECK (warning_expiry_days >= 0),
    safe_expiry_days INTEGER NOT NULL DEFAULT 60 CHECK (safe_expiry_days >= 0),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,

    FOREIGN KEY (default_location_id) REFERENCES locations(id) ON DELETE SET NULL
);

CREATE TABLE admin_credentials (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX idx_products_active
    ON products(active);

CREATE INDEX idx_stock_items_product
    ON stock_items(product_id);

CREATE INDEX idx_stock_items_location
    ON stock_items(location_id);

CREATE INDEX idx_stock_items_expiration
    ON stock_items(expiration_date);

CREATE INDEX idx_movements_product
    ON movements(product_id);

CREATE INDEX idx_movements_timestamp
    ON movements(timestamp);

CREATE INDEX idx_movements_type
    ON movements(type);

CREATE INDEX idx_movements_source_location
    ON movements(source_location_id);

CREATE INDEX idx_movements_destination_location
    ON movements(destination_location_id);
