-- Migration: Create Receive Items tables

-- accurate_receive_items table
CREATE TABLE IF NOT EXISTS public.accurate_receive_items (
    id BIGINT PRIMARY KEY,
    number TEXT NOT NULL,
    vendor_id BIGINT,
    vendor_name TEXT,
    trans_date DATE,
    status_name TEXT,
    branch_id BIGINT,
    po_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- accurate_receive_item_items table
CREATE TABLE IF NOT EXISTS public.accurate_receive_item_items (
    id BIGINT PRIMARY KEY,
    receive_item_id BIGINT REFERENCES public.accurate_receive_items(id) ON DELETE CASCADE,
    item_code TEXT,
    item_name TEXT,
    quantity NUMERIC,
    unit_name TEXT,
    detail_notes TEXT,
    item_seq INTEGER,
    hso_number TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_receive_items_number ON public.accurate_receive_items(number);
CREATE INDEX IF NOT EXISTS idx_receive_items_trans_date ON public.accurate_receive_items(trans_date);
CREATE INDEX IF NOT EXISTS idx_receive_item_items_receive_item_id ON public.accurate_receive_item_items(receive_item_id);
CREATE INDEX IF NOT EXISTS idx_receive_item_items_item_code ON public.accurate_receive_item_items(item_code);

-- Enable RLS
ALTER TABLE public.accurate_receive_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accurate_receive_item_items ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
drop policy if exists "Allow read access for authenticated users" ON public.accurate_receive_items;
CREATE POLICY "Allow read access for authenticated users" ON public.accurate_receive_items FOR SELECT USING (auth.role() = 'authenticated');

drop policy if exists "Allow read access for authenticated users" ON public.accurate_receive_item_items;
CREATE POLICY "Allow read access for authenticated users" ON public.accurate_receive_item_items FOR SELECT USING (auth.role() = 'authenticated');
