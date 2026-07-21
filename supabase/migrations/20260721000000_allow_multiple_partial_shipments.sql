-- Migration: Allow multiple partial shipments per HPO & Item SKU in raw_forwarder_tracking
-- Date: 2026-07-21

-- 1. Drop unique index if exists
DROP INDEX IF EXISTS public.idx_raw_forwarder_tracking_hpo_item;

-- 2. Create non-unique index on (hpo_number, item_code) for fast queries
CREATE INDEX IF NOT EXISTS idx_raw_forwarder_tracking_hpo_item 
    ON public.raw_forwarder_tracking(hpo_number, item_code);
