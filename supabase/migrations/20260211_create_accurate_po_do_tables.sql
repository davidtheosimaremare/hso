-- Create table for Purchase Orders
create table if not exists accurate_purchase_orders (
  id bigint primary key, -- Accurate ID
  number text not null,
  vendor_id bigint,
  vendor_name text,
  trans_date date,
  status_name text,
  total_amount numeric,
  currency_code text,
  branch_id bigint,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Index for searching by number
create index if not exists idx_accurate_po_number on accurate_purchase_orders (number);
-- Index for filtering by date
create index if not exists idx_accurate_po_date on accurate_purchase_orders (trans_date);

-- Create table for Purchase Order Items
create table if not exists accurate_purchase_order_items (
  id bigint primary key, -- Accurate Detail ID
  po_id bigint references accurate_purchase_orders(id) on delete cascade,
  item_code text,
  item_name text,
  quantity numeric,
  unit_name text,
  unit_price numeric,
  item_disc_percent numeric,
  detail_notes text, -- Important for HSO search
  created_at timestamp with time zone default now()
);

-- Index for searching items by PO ID
create index if not exists idx_accurate_po_items_po_id on accurate_purchase_order_items (po_id);
-- Index for text search on notes (for HSO finding)
create index if not exists idx_accurate_po_items_notes on accurate_purchase_order_items using gin(to_tsvector('english', coalesce(detail_notes, '') || ' ' || coalesce(item_code, '') || ' ' || coalesce(item_name, '')));


-- Create table for Delivery Orders
create table if not exists accurate_delivery_orders (
  id bigint primary key, -- Accurate ID
  number text not null,
  customer_id bigint,
  customer_name text,
  trans_date date,
  status_name text,
  ship_to text,
  driver_name text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

-- Index for searching by number
create index if not exists idx_accurate_do_number on accurate_delivery_orders (number);
-- Index for filtering by date
create index if not exists idx_accurate_do_date on accurate_delivery_orders (trans_date);

-- Create table for Delivery Order Items
create table if not exists accurate_delivery_order_items (
  id bigint primary key, -- Accurate Detail ID
  do_id bigint references accurate_delivery_orders(id) on delete cascade,
  item_code text,
  item_name text,
  quantity numeric,
  unit_name text,
  detail_notes text,
  created_at timestamp with time zone default now()
);

-- Index for searching items by DO ID
create index if not exists idx_accurate_do_items_do_id on accurate_delivery_order_items (do_id);
-- Index for text search on notes (for HSO/Ref finding)
create index if not exists idx_accurate_do_items_notes on accurate_delivery_order_items using gin(to_tsvector('english', coalesce(detail_notes, '') || ' ' || coalesce(item_code, '') || ' ' || coalesce(item_name, '')));


-- Enable RLS (optional, depending on project policy, but good practice)
alter table accurate_purchase_orders enable row level security;
alter table accurate_purchase_order_items enable row level security;
alter table accurate_delivery_orders enable row level security;
alter table accurate_delivery_order_items enable row level security;

-- Policy to allow read access to authenticated users (adjust as needed)
create policy "Allow read access for authenticated users" on accurate_purchase_orders for select using (auth.role() = 'authenticated');
create policy "Allow read access for authenticated users" on accurate_purchase_order_items for select using (auth.role() = 'authenticated');
create policy "Allow read access for authenticated users" on accurate_delivery_orders for select using (auth.role() = 'authenticated');
create policy "Allow read access for authenticated users" on accurate_delivery_order_items for select using (auth.role() = 'authenticated');

-- Function to update updated_at timestamp
create or replace function update_updated_at_column()
returns trigger as $$
begin
    new.updated_at = now();
    return new;
end;
$$ language plpgsql;

create trigger update_accurate_po_modtime
    before update on accurate_purchase_orders
    for each row
    execute function update_updated_at_column();

create trigger update_accurate_do_modtime
    before update on accurate_delivery_orders
    for each row
    execute function update_updated_at_column();
