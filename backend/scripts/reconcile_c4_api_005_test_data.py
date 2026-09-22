"""One-time controlled reconciliation for the C4-API-005 test stock data.

This script keeps the original test stock item and removes only the second
duplicate created before the operational identity rule was corrected.

It is intentionally strict: it verifies both records, verifies that they have
the same operational identity excluding notes, and refuses to delete the
duplicate if any movement already references it.
"""

from __future__ import annotations

from sqlalchemy import select

from backend.app.db.database import SessionLocal
from backend.app.db.models import Movement, StockItem


CANONICAL_ID = "0e45d1a6-b560-4698-bf16-df30bfb1b074"
DUPLICATE_ID = "300fe742-9b0a-4e21-9621-156e0bd7de67"


def operational_identity(item: StockItem) -> tuple[object, ...]:
    return (
        item.product_id,
        item.location_id,
        item.unit,
        item.lot,
        item.manufacturing_date,
        item.expiration_date,
        bool(item.no_expiration_date),
        item.supplier,
        item.invoice_number,
        item.received_date,
    )


def movement_references_stock_item(db, stock_item_id: str) -> bool:
    statement = select(Movement.id).where(
        (Movement.source_stock_item_id == stock_item_id)
        | (Movement.destination_stock_item_id == stock_item_id)
    )
    return db.scalar(statement) is not None


def main() -> None:
    with SessionLocal() as db:
        canonical = db.get(StockItem, CANONICAL_ID)
        duplicate = db.get(StockItem, DUPLICATE_ID)

        if canonical is None:
            raise RuntimeError(f"Canonical test stock item not found: {CANONICAL_ID}")
        if duplicate is None:
            raise RuntimeError(f"Duplicate test stock item not found: {DUPLICATE_ID}")

        if operational_identity(canonical) != operational_identity(duplicate):
            raise RuntimeError(
                "Refusing reconciliation: the two records do not share the same "
                "operational identity."
            )

        if movement_references_stock_item(db, CANONICAL_ID):
            raise RuntimeError(
                "Refusing reconciliation: the canonical stock item is referenced "
                "by a movement."
            )

        if movement_references_stock_item(db, DUPLICATE_ID):
            raise RuntimeError(
                "Refusing reconciliation: the duplicate stock item is referenced "
                "by a movement."
            )

        print("C4-API-005 controlled reconciliation")
        print(f"Keeping canonical item: {CANONICAL_ID}")
        print(f"Removing duplicate item: {DUPLICATE_ID}")
        print(f"Canonical quantity: {canonical.quantity} {canonical.unit}")
        print(f"Duplicate quantity: {duplicate.quantity} {duplicate.unit}")
        print("Operational identity: MATCH")

        db.delete(duplicate)
        db.commit()

        if db.get(StockItem, DUPLICATE_ID) is not None:
            raise RuntimeError("Reconciliation failed: duplicate still exists.")

        if db.get(StockItem, CANONICAL_ID) is None:
            raise RuntimeError("Reconciliation failed: canonical item disappeared.")

        print("Reconciliation completed successfully.")


if __name__ == "__main__":
    main()
