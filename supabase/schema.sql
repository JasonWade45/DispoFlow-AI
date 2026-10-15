-- DispoFlow cloud state table.
-- Run this ONCE in the Supabase SQL editor (Dashboard → SQL → New query → Run).
-- After this, the app saves/loads the whole CRM state here so data survives
-- cache clears and syncs across devices.

create table if not exists public.app_state (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- The server accesses this with the service_role key, which bypasses RLS.
-- Lock the table down so the public/anon key can never read or write it.
alter table public.app_state enable row level security;

drop policy if exists "service role only" on public.app_state;
create policy "service role only"
  on public.app_state
  for all
  using (false)
  with check (false);
