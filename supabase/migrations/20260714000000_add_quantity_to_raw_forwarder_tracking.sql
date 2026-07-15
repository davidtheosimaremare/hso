-- Add quantity column to raw_forwarder_tracking
alter table raw_forwarder_tracking
add column if not exists quantity numeric default 0;

-- Add comment
comment on column raw_forwarder_tracking.quantity is 'Total quantity ordered for this HPO + item_code combination';
