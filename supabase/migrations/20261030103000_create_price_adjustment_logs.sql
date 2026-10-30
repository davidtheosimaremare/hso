-- Migration: Create price_adjustment_logs table & enhance accurate_items price columns
-- Allows audit trail and history for price adjustments between iMall and Accurate Online

-- 1. Ensure accurate_items has base_price and adjusted_price columns
alter table accurate_items
  add column if not exists base_price numeric default 0,
  add column if not exists adjusted_price numeric default null,
  add column if not exists adjustment_source text default null,
  add column if not exists adjusted_at timestamp with time zone default null;

-- 2. Create price_adjustment_logs table
create table if not exists price_adjustment_logs (
  id uuid primary key default gen_random_uuid(),
  batch_id text,
  sku text not null,
  item_name text,
  old_price numeric default 0,
  new_price numeric default 0,
  diff_amount numeric default 0,
  diff_percent numeric default 0,
  status text default 'SUBMITTED', -- 'SUBMITTED' | 'FAILED'
  adjusted_by text,
  notes text,
  created_at timestamp with time zone default now()
);

create index if not exists idx_price_adjustment_logs_sku on price_adjustment_logs (sku);
create index if not exists idx_price_adjustment_logs_batch on price_adjustment_logs (batch_id);
create index if not exists idx_price_adjustment_logs_created on price_adjustment_logs (created_at desc);

-- Enable RLS
alter table price_adjustment_logs enable row level security;

-- Policies for public / authenticated read and write access
do $$ 
begin
    if not exists (
        select 1 from pg_policies where tablename = 'price_adjustment_logs' and policyname = 'Allow public read/write access on price_adjustment_logs'
    ) then
        create policy "Allow public read/write access on price_adjustment_logs"
        on public.price_adjustment_logs
        for all
        using (true)
        with check (true);
    end if;
end $$;
