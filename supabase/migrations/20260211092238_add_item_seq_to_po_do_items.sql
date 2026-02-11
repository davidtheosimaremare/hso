ALTER TABLE accurate_purchase_order_items ADD COLUMN IF NOT EXISTS item_seq INTEGER DEFAULT 0;
ALTER TABLE accurate_delivery_order_items ADD COLUMN IF NOT EXISTS item_seq INTEGER DEFAULT 0;
