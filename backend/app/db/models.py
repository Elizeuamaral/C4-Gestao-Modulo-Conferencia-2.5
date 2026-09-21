"""SQLAlchemy models for the C4 Gestão SQLite schema.

The model mirrors the C4-DB-001 reference schema. Table creation is deliberately
kept outside this module and will be performed by C4-DB-003.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def new_uuid() -> str:
    return str(uuid4())


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Base(DeclarativeBase):
    """Base registry for all C4 Gestão ORM models."""


class Product(Base):
    __tablename__ = "products"
    __table_args__ = (
        Index("idx_products_active", "active"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    code: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    min_stock: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False, default=utc_now_iso)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False, default=utc_now_iso, onupdate=utc_now_iso)

    stock_items: Mapped[list["StockItem"]] = relationship(back_populates="product")
    movements: Mapped[list["Movement"]] = relationship(back_populates="product")

    __table_args__ = (
        CheckConstraint("min_stock >= 0", name="ck_products_min_stock_nonnegative"),
        Index("idx_products_active", "active"),
    )


class Location(Base):
    __tablename__ = "locations"
    __table_args__ = (
        CheckConstraint("active IN (0, 1)", name="ck_locations_active"),
        Index("idx_locations_active", "active"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    code: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False, default=utc_now_iso)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False, default=utc_now_iso, onupdate=utc_now_iso)

    stock_items: Mapped[list["StockItem"]] = relationship(back_populates="location")
    source_movements: Mapped[list["Movement"]] = relationship(
        back_populates="source_location",
        foreign_keys="Movement.source_location_id",
    )
    destination_movements: Mapped[list["Movement"]] = relationship(
        back_populates="destination_location",
        foreign_keys="Movement.destination_location_id",
    )


class Checker(Base):
    __tablename__ = "checkers"
    __table_args__ = (
        CheckConstraint("active IN (0, 1)", name="ck_checkers_active"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False, default=utc_now_iso)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False, default=utc_now_iso, onupdate=utc_now_iso)

    stock_items: Mapped[list["StockItem"]] = relationship(back_populates="checker")
    movements: Mapped[list["Movement"]] = relationship(
        back_populates="checker",
        foreign_keys="Movement.checker_id",
    )
    updated_movements: Mapped[list["Movement"]] = relationship(
        back_populates="updated_by_checker",
        foreign_keys="Movement.updated_by_checker_id",
    )


class StockItem(Base):
    __tablename__ = "stock_items"
    __table_args__ = (
        CheckConstraint("quantity >= 0", name="ck_stock_items_quantity_nonnegative"),
        CheckConstraint("received_quantity >= 0", name="ck_stock_items_received_quantity_nonnegative"),
        CheckConstraint(
            "unit IN ('FD', 'UN', 'CX', 'PCT')",
            name="ck_stock_items_unit",
        ),
        CheckConstraint(
            "no_expiration_date IN (0, 1)",
            name="ck_stock_items_no_expiration_date",
        ),
        CheckConstraint(
            "no_expiration_date = 1 OR expiration_date IS NOT NULL",
            name="ck_stock_items_expiration_required",
        ),
        Index("idx_stock_items_product", "product_id"),
        Index("idx_stock_items_location", "location_id"),
        Index("idx_stock_items_expiration", "expiration_date"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    product_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
    )
    location_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("locations.id", ondelete="RESTRICT"),
        nullable=False,
    )
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    received_quantity: Mapped[float] = mapped_column(Float, nullable=False, default=0)
    unit: Mapped[str] = mapped_column(String(10), nullable=False)
    lot: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    manufacturing_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    expiration_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    no_expiration_date: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    supplier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    invoice_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    checker_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("checkers.id", ondelete="SET NULL"),
        nullable=True,
    )
    received_date: Mapped[str] = mapped_column(String(10), nullable=False)
    entry_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False, default=utc_now_iso)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False, default=utc_now_iso, onupdate=utc_now_iso)

    product: Mapped["Product"] = relationship(back_populates="stock_items")
    location: Mapped["Location"] = relationship(back_populates="stock_items")
    checker: Mapped[Optional["Checker"]] = relationship(back_populates="stock_items")


class Movement(Base):
    __tablename__ = "movements"
    __table_args__ = (
        CheckConstraint(
            "type IN ('ENTRADA', 'SAIDA', 'TRANSFERENCIA', 'BAIXA', 'CORRECAO', 'ESTORNO')",
            name="ck_movements_type",
        ),
        CheckConstraint("quantity > 0", name="ck_movements_quantity_positive"),
        CheckConstraint(
            "unit IN ('FD', 'UN', 'CX', 'PCT')",
            name="ck_movements_unit",
        ),
        CheckConstraint(
            "no_expiration_date IN (0, 1)",
            name="ck_movements_no_expiration_date",
        ),
        CheckConstraint(
            "type != 'ENTRADA' OR destination_location_id IS NOT NULL",
            name="ck_movements_entry_destination",
        ),
        CheckConstraint(
            "type != 'SAIDA' OR source_location_id IS NOT NULL",
            name="ck_movements_exit_source",
        ),
        CheckConstraint(
            "type != 'TRANSFERENCIA' OR "
            "(source_location_id IS NOT NULL AND "
            "destination_location_id IS NOT NULL AND "
            "source_location_id <> destination_location_id)",
            name="ck_movements_transfer_locations",
        ),
        Index("idx_movements_product", "product_id"),
        Index("idx_movements_timestamp", "timestamp"),
        Index("idx_movements_type", "type"),
        Index("idx_movements_source_location", "source_location_id"),
        Index("idx_movements_destination_location", "destination_location_id"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_uuid)
    product_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[str] = mapped_column(String(10), nullable=False)

    source_stock_item_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("stock_items.id", ondelete="RESTRICT"),
        nullable=True,
    )
    destination_stock_item_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("stock_items.id", ondelete="RESTRICT"),
        nullable=True,
    )
    source_location_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("locations.id", ondelete="RESTRICT"),
        nullable=True,
    )
    destination_location_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("locations.id", ondelete="RESTRICT"),
        nullable=True,
    )

    product_code_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    product_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    lot_snapshot: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    manufacturing_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    expiration_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    no_expiration_date: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    supplier: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    invoice_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    checker_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("checkers.id", ondelete="SET NULL"),
        nullable=True,
    )
    received_date: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    timestamp: Mapped[str] = mapped_column(String(40), nullable=False, default=utc_now_iso)

    entry_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    updated_by_checker_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("checkers.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, onupdate=utc_now_iso)
    update_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    reversal_of_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("movements.id", ondelete="RESTRICT"),
        nullable=True,
    )
    correction_of_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("movements.id", ondelete="RESTRICT"),
        nullable=True,
    )
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)

    product: Mapped["Product"] = relationship(back_populates="movements")

    source_stock_item: Mapped[Optional["StockItem"]] = relationship(
        foreign_keys=[source_stock_item_id],
    )
    destination_stock_item: Mapped[Optional["StockItem"]] = relationship(
        foreign_keys=[destination_stock_item_id],
    )
    source_location: Mapped[Optional["Location"]] = relationship(
        back_populates="source_movements",
        foreign_keys=[source_location_id],
    )
    destination_location: Mapped[Optional["Location"]] = relationship(
        back_populates="destination_movements",
        foreign_keys=[destination_location_id],
    )
    checker: Mapped[Optional["Checker"]] = relationship(
        back_populates="movements",
        foreign_keys=[checker_id],
    )
    updated_by_checker: Mapped[Optional["Checker"]] = relationship(
        back_populates="updated_movements",
        foreign_keys=[updated_by_checker_id],
    )
    reversal_of: Mapped[Optional["Movement"]] = relationship(
        remote_side=[id],
        foreign_keys=[reversal_of_id],
        uselist=False,
    )
    correction_of: Mapped[Optional["Movement"]] = relationship(
        remote_side=[id],
        foreign_keys=[correction_of_id],
        uselist=False,
    )


class AppSetting(Base):
    __tablename__ = "app_settings"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_app_settings_singleton"),
        CheckConstraint("sound_beep_enabled IN (0, 1)", name="ck_app_settings_beep"),
        CheckConstraint("sound_alert_enabled IN (0, 1)", name="ck_app_settings_alert"),
        CheckConstraint("critical_expiry_days >= 0", name="ck_app_settings_critical_days"),
        CheckConstraint("warning_expiry_days >= 0", name="ck_app_settings_warning_days"),
        CheckConstraint("safe_expiry_days >= 0", name="ck_app_settings_safe_days"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    company_name: Mapped[str] = mapped_column(String(255), nullable=False, default="C4 Gestão")
    default_location_id: Mapped[Optional[str]] = mapped_column(
        String(36),
        ForeignKey("locations.id", ondelete="SET NULL"),
        nullable=True,
    )
    sound_beep_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sound_alert_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    critical_expiry_days: Mapped[int] = mapped_column(Integer, nullable=False, default=20)
    warning_expiry_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    safe_expiry_days: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False, default=utc_now_iso)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False, default=utc_now_iso, onupdate=utc_now_iso)

    default_location: Mapped[Optional["Location"]] = relationship()


class AdminCredential(Base):
    __tablename__ = "admin_credentials"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_admin_credentials_singleton"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[str] = mapped_column(String(40), nullable=False, default=utc_now_iso)
    updated_at: Mapped[str] = mapped_column(String(40), nullable=False, default=utc_now_iso, onupdate=utc_now_iso)
