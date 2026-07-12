-- Add exwork_waiting flag to handle "Waiting for confirmation" status
-- This avoids storing text in a DATE column
ALTER TABLE shipments
ADD COLUMN IF NOT EXISTS exwork_waiting BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN shipments.exwork_waiting IS 'True when ex-works status is Waiting for confirmation (date not yet confirmed)';
