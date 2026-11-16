-- Migration: Create table for tracking HSB to HSO conversions
CREATE TABLE IF NOT EXISTS hsb_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hsb_id TEXT,
    hsb_number TEXT NOT NULL,
    hso_id TEXT,
    hso_number TEXT NOT NULL,
    po_number TEXT NOT NULL,
    conversion_type TEXT NOT NULL DEFAULT 'PARTIAL', -- 'FULL' or 'PARTIAL'
    selected_items JSONB DEFAULT '[]'::jsonb,
    remaining_items JSONB DEFAULT '[]'::jsonb,
    converted_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_hsb_conversions_hsb_number ON hsb_conversions(hsb_number);
CREATE INDEX IF NOT EXISTS idx_hsb_conversions_hso_number ON hsb_conversions(hso_number);
CREATE INDEX IF NOT EXISTS idx_hsb_conversions_created_at ON hsb_conversions(created_at DESC);

-- Enable RLS
ALTER TABLE hsb_conversions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to view and insert conversions
CREATE POLICY "Allow authenticated read hsb_conversions"
    ON hsb_conversions FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Allow authenticated insert hsb_conversions"
    ON hsb_conversions FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Allow service role full access
CREATE POLICY "Allow service_role all hsb_conversions"
    ON hsb_conversions FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

