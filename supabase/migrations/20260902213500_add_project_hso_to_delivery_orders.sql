ALTER TABLE accurate_delivery_orders ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE accurate_delivery_orders ADD COLUMN IF NOT EXISTS project_name TEXT;
ALTER TABLE accurate_delivery_orders ADD COLUMN IF NOT EXISTS po_number TEXT;
ALTER TABLE accurate_delivery_orders ADD COLUMN IF NOT EXISTS hso_numbers TEXT;

ALTER TABLE accurate_delivery_order_items ADD COLUMN IF NOT EXISTS hso_number TEXT;
ALTER TABLE accurate_delivery_order_items ADD COLUMN IF NOT EXISTS hsq_number TEXT;

-- Index for searching DOs by project or HSO
CREATE INDEX IF NOT EXISTS idx_accurate_do_project ON accurate_delivery_orders (project_name);
CREATE INDEX IF NOT EXISTS idx_accurate_do_hso_numbers ON accurate_delivery_orders (hso_numbers);
