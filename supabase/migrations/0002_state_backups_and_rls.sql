-- 0002: app_state history (crash-safe backups) + Phase 3 workspace-scoped RLS.
-- Run in the Supabase SQL editor, exactly like 0001.
--
-- Why: on 2026-10-20 a writer in blob mode replaced app_state wholesale and
-- offers went 399 -> 0 in the blob. Every UPDATE now snapshots the previous
-- JSON into app_state_history, so any such incident is restorable.

-- ---------------------------------------------------------------------------
-- 1) History / backup of every app_state update
-- ---------------------------------------------------------------------------

create table if not exists public.app_state_history (
  history_id  bigint generated always as identity primary key,
  key         text not null,
  prev_data   jsonb not null,
  recorded_at timestamptz not null default now()
);

create index if not exists app_state_history_key_idx
  on public.app_state_history (key, history_id desc);

create or replace function public.app_state_history_snapshot()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' then
    insert into public.app_state_history (key, prev_data)
    values (old.key, old.data);

    -- keep only the latest 25 snapshots per key
    delete from public.app_state_history h
    using (
      select history_id,
             row_number() over (order by history_id desc) as rn
      from public.app_state_history
      where key = old.key
    ) x
    where h.history_id = x.history_id
      and x.rn > 25;
  end if;
  return new;
end $$;

drop trigger if exists trg_app_state_history on public.app_state;
create trigger trg_app_state_history
  before update on public.app_state
  for each row
  execute function public.app_state_history_snapshot();

-- History itself is service-role only (no policies => RLS denies everyone
-- else; service_role bypasses RLS).
alter table public.app_state_history enable row level security;

-- Restore the newest snapshot by hand when needed, e.g.:
--   update public.app_state
--   set data = (
--     select prev_data
--     from public.app_state_history
--     where key = 'main'
--     order by history_id desc
--     limit 1
--   )
--   where key = 'main';

-- ---------------------------------------------------------------------------
-- 2) Phase 3: workspace-scoped RLS on the 7 core tables
--
-- service_role keeps full access (BYPASSRLS) — the app is unaffected.
-- anon: no policy => fully denied.
-- authenticated (for when Supabase Auth is adopted): rows are only visible
-- and writable when the 'workspace_id' JWT claim matches the row's
-- workspace_id. Until then these policies are inert.
-- ---------------------------------------------------------------------------

do $$
declare t text;
begin
  foreach t in array array[
    'properties', 'buyers', 'buyer_properties', 'interactions',
    'tasks', 'offers', 'access_info'
  ] loop
    execute format('alter table public.%I enable row level security', t);

    -- drop the Phase 1 deny-all policy
    execute format('drop policy if exists "service role only" on public.%I', t);

    execute format('drop policy if exists "workspace read" on public.%I', t);
    execute format('drop policy if exists "workspace write" on public.%I', t);

    execute format(
      'create policy "workspace read" on public.%I
         for select to authenticated
         using (workspace_id = (auth.jwt() ->> ''workspace_id''))',
      t
    );
    execute format(
      'create policy "workspace write" on public.%I
         for all to authenticated
         using (workspace_id = (auth.jwt() ->> ''workspace_id''))
         with check (workspace_id = (auth.jwt() ->> ''workspace_id''))',
      t
    );
  end loop;
end $$;
