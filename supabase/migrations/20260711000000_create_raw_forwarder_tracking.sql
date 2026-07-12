-- Migration: Create raw_forwarder_tracking table for centralized logistics tracking

CREATE TABLE IF NOT EXISTS public.raw_forwarder_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hpo_number TEXT NOT NULL,
    item_code TEXT NOT NULL,
    status TEXT,
    exwork_date DATE,
    exwork_waiting BOOLEAN DEFAULT FALSE,
    eta_date DATE,
    delivery_date DATE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Unique index to support upsert (HPO Number + Item Code)
CREATE UNIQUE INDEX IF NOT EXISTS idx_raw_forwarder_tracking_hpo_item 
    ON public.raw_forwarder_tracking(hpo_number, item_code);

-- Enable RLS
ALTER TABLE public.raw_forwarder_tracking ENABLE ROW LEVEL SECURITY;

-- Allow read/write access for authenticated users
drop policy if exists "Allow read access for authenticated users" on public.raw_forwarder_tracking;
CREATE POLICY "Allow read access for authenticated users" 
    ON public.raw_forwarder_tracking FOR SELECT 
    USING (auth.role() = 'authenticated');

drop policy if exists "Allow write access for authenticated users" on public.raw_forwarder_tracking;
CREATE POLICY "Allow write access for authenticated users" 
    ON public.raw_forwarder_tracking FOR ALL 
    USING (auth.role() = 'authenticated') 
    WITH CHECK (auth.role() = 'authenticated');
