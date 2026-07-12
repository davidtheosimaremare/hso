-- Migration: Add hso_number and item_seq columns to accurate_purchase_order_items
-- These columns were being written by the sync function but not defined in the original schema.

ALTER TABLE accurate_purchase_order_items
  ADD COLUMN IF NOT EXISTS item_seq integer,
  ADD COLUMN IF NOT EXISTS hso_number text;

-- Index for fast lookup of PO items by HSO number reference
CREATE INDEX IF NOT EXISTS idx_po_items_hso_number
  ON accurate_purchase_order_items (hso_number)
  WHERE hso_number IS NOT NULL;

-- Index for ordering items by sequence within a PO
CREATE INDEX IF NOT EXISTS idx_po_items_seq
  ON accurate_purchase_order_items (po_id, item_seq);

-- Also add total_price column if not present (used in DetailView)
ALTER TABLE accurate_purchase_order_items
  ADD COLUMN IF NOT EXISTS total_price numeric
    GENERATED ALWAYS AS (
      ROUND(quantity * unit_price * (1 - COALESCE(item_disc_percent, 0) / 100), 2)
    ) STORED;
