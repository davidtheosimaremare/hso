-- Migration: Create purchase_cart table for team-wide procurement plan

CREATE TABLE IF NOT EXISTS public.purchase_cart (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    so_id TEXT NOT NULL,
    so_number TEXT NOT NULL,
    company_name TEXT NOT NULL,
    item_code TEXT NOT NULL,
    item_name TEXT NOT NULL,
    qty_to_order NUMERIC NOT NULL,
    notes TEXT,
    is_crosschecked BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_so_item UNIQUE (so_id, item_code)
);

-- Enable RLS
ALTER TABLE public.purchase_cart ENABLE ROW LEVEL SECURITY;

-- Allow read/write access for authenticated users
drop policy if exists "Allow read access for authenticated users" on public.purchase_cart;
CREATE POLICY "Allow read access for authenticated users" 
    ON public.purchase_cart FOR SELECT 
    USING (auth.role() = 'authenticated');

drop policy if exists "Allow write access for authenticated users" on public.purchase_cart;
CREATE POLICY "Allow write access for authenticated users" 
    ON public.purchase_cart FOR ALL 
    USING (auth.role() = 'authenticated') 
    WITH CHECK (auth.role() = 'authenticated');
