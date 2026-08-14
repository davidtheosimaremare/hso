-- Migration: Create sales_leads table
CREATE TABLE IF NOT EXISTS public.sales_leads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lead_code TEXT UNIQUE,
    company_name TEXT NOT NULL,
    contact_person TEXT,
    phone TEXT,
    email TEXT,
    industry_type TEXT DEFAULT 'Panel Maker',
    address TEXT,
    city TEXT,
    status TEXT DEFAULT 'NEW',
    priority TEXT DEFAULT 'WARM',
    estimated_value NUMERIC(15, 2) DEFAULT 0,
    source TEXT DEFAULT 'Manual Input',
    activities JSONB DEFAULT '[]'::jsonb,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sales_leads_company_name ON public.sales_leads(company_name);
CREATE INDEX IF NOT EXISTS idx_sales_leads_status ON public.sales_leads(status);

-- Enable RLS
ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;

-- Allow read/write policy
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'sales_leads' AND policyname = 'Allow public read/write access on sales_leads'
    ) THEN
        CREATE POLICY "Allow public read/write access on sales_leads"
        ON public.sales_leads
        FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

-- Enable Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.sales_leads;
