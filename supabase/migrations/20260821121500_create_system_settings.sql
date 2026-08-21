-- Create system_settings table to persist system & AI configurations
create table if not exists system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default now()
);

alter table system_settings enable row level security;

create policy "Allow all users to read system_settings"
  on system_settings for select
  to authenticated, anon
  using (true);

create policy "Allow all users to insert/update system_settings"
  on system_settings for all
  to authenticated, anon
  using (true)
  with check (true);
