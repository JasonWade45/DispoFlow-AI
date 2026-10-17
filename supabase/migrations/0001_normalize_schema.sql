-- Phase 2: normalized workspace tables.
-- Run ONCE in the Supabase SQL editor (Dashboard -> SQL -> New query -> Run),
-- AFTER schema.sql, THEN run 0001_normalize_backfill.sql.
--
-- Design:
--   * workspace_id  = single-team tenancy column (Phase 3 adds workspace-scoped RLS).
--   * meta jsonb     = the ORIGINAL entity JSON, kept verbatim as an audit/future-field
--                      copy so no field can ever be lost by column mapping.
--   * timestamps    = stored as text (exact ISO-8601 round-trip; the app compares
--                      ISO strings lexicographically, so pg formatting must not alter them).
--   * RLS           = enabled with deny-all policies from day one (no anon-key gap
--                      until Phase 3). service_role bypasses RLS, so the app works.
--   * app_state     = untouched; it stays the source of truth until DATA_SOURCE=tables.

create table if not exists public.properties (
  id                   text primary key,
  workspace_id         text not null default 'default',
  address              text not null default '',
  city                 text not null default '',
  state                text not null default '',
  zip                  text not null default '',
  access_info          text not null default '',
  status               text not null default '',
  access_type          text not null default '',
  asking_price         numeric null,
  arv                  numeric null,
  estimated_repairs    numeric null,
  assignment_price     numeric null,
  marketing_started_at text null,
  expected_closing_date text null,
  notes                text not null default '',
  created_at           text not null default '',
  created_by           text not null default '',
  updated_at           text not null default '',
  property_type        text not null default '',
  bedrooms             text not null default '',
  bathrooms            text not null default '',
  sqft                 text not null default '',
  lot_size             text not null default '',
  year_built           text not null default '',
  listing_url          text not null default '',
  photos_url           text not null default '',
  photos               text[] not null default '{}',
  source_website       text not null default '',
  source_property_id   text not null default '',
  source_row_id        text not null default '',
  first_imported_at    text null,
  last_synced_at       text null,
  sync_status          text not null default 'never',
  meta                 jsonb not null default '{}'::jsonb,
  row_updated_at       timestamptz not null default now()
);

create table if not exists public.buyers (
  id                       text primary key,
  workspace_id             text not null default 'default',
  full_name                text not null default '',
  company_name             text not null default '',
  phone                    text not null default '',
  email                    text not null default '',
  preferred_contact_method text not null default '',
  preferred_markets        text[] not null default '{}',
  property_types           text[] not null default '{}',
  budget_min               numeric null,
  budget_max               numeric null,
  status                   text not null default '',
  notes                    text not null default '',
  source                   text not null default '',
  created_at               text not null default '',
  updated_at               text not null default '',
  created_by               text not null default '',
  meta                     jsonb not null default '{}'::jsonb,
  row_updated_at           timestamptz not null default now()
);

create table if not exists public.buyer_properties (
  id                    text primary key,
  workspace_id          text not null default 'default',
  buyer_id              text not null default '',
  property_id           text not null default '',
  interest_status       text not null default '',
  interest_notes        text not null default '',
  first_contact_date    text null,
  last_interaction_date text null,
  next_follow_up_date   text null,
  next_action           text not null default '',
  assigned_user_id      text null,
  relationship_status   text not null default '',
  created_at            text not null default '',
  updated_at            text not null default '',
  last_contacted_at     text null,
  last_message_sent_at  text null,
  last_call_at          text null,
  sync_status           text not null default '',
  source_row_id         text not null default '',
  meta                  jsonb not null default '{}'::jsonb,
  row_updated_at        timestamptz not null default now()
);

create table if not exists public.interactions (
  id                       text primary key,
  workspace_id             text not null default 'default',
  buyer_id                 text null,
  property_id              text null,
  event_type               text not null default '',
  direction                text not null default '',
  occurred_at              text not null default '',
  recorded_at              text not null default '',
  original_content         text not null default '',
  enhanced_notes           text not null default '',
  outcome                  text not null default '',
  potential_offer_amount   numeric null,
  potential_offer_confirmed boolean not null default false,
  next_action              text not null default '',
  missing_info             text[] not null default '{}',
  is_ai_suggestion         boolean not null default false,
  created_by               text not null default '',
  created_at               text not null default '',
  updated_at               text not null default '',
  meta                     jsonb not null default '{}'::jsonb,
  row_updated_at           timestamptz not null default now()
);

create table if not exists public.tasks (
  id                     text primary key,
  workspace_id           text not null default 'default',
  buyer_id               text null,
  property_id            text null,
  related_interaction_id text null,
  task_type              text not null default '',
  description            text not null default '',
  due_date               text null,
  due_time               text null,
  assigned_user_id       text not null default '',
  priority               text not null default '',
  status                 text not null default '',
  completion_notes       text not null default '',
  draft_message          text not null default '',
  created_at             text not null default '',
  completed_at           text null,
  completion_via         text null,
  sent_at                text null,
  meta                   jsonb not null default '{}'::jsonb,
  row_updated_at         timestamptz not null default now()
);

create table if not exists public.offers (
  id                 text primary key,
  workspace_id       text not null default 'default',
  buyer_id           text not null default '',
  property_id        text not null default '',
  amount             numeric not null default 0,
  offer_date         text not null default '',
  terms              text not null default '',
  expires_at         text null,
  status             text not null default '',
  negotiation_notes  text not null default '',
  next_action        text not null default '',
  created_by         text not null default '',
  created_at         text not null default '',
  updated_at         text not null default '',
  meta               jsonb not null default '{}'::jsonb,
  row_updated_at     timestamptz not null default now()
);

create table if not exists public.access_info (
  id            text primary key,
  workspace_id  text not null default 'default',
  property_id   text not null default '',
  access_code   text not null default '',
  created_at    text not null default '',
  updated_at    text not null default '',
  meta          jsonb not null default '{}'::jsonb,
  row_updated_at timestamptz not null default now()
);

create index if not exists idx_properties_workspace  on public.properties (workspace_id);
create index if not exists idx_buyers_workspace      on public.buyers (workspace_id);
create index if not exists idx_buyer_props_workspace on public.buyer_properties (workspace_id);
create index if not exists idx_interactions_workspace on public.interactions (workspace_id);
create index if not exists idx_tasks_workspace       on public.tasks (workspace_id);
create index if not exists idx_offers_workspace      on public.offers (workspace_id);
create index if not exists idx_access_info_workspace on public.access_info (workspace_id);

create index if not exists idx_buyers_phone    on public.buyers (phone);
create index if not exists idx_buyers_name     on public.buyers (full_name);
create index if not exists idx_buyer_props_buyer    on public.buyer_properties (buyer_id);
create index if not exists idx_buyer_props_property on public.buyer_properties (property_id);
create index if not exists idx_interactions_buyer    on public.interactions (buyer_id, occurred_at);
create index if not exists idx_interactions_property on public.interactions (property_id);
create index if not exists idx_tasks_buyer    on public.tasks (buyer_id);
create index if not exists idx_tasks_property on public.tasks (property_id);
create index if not exists idx_offers_buyer    on public.offers (buyer_id);
create index if not exists idx_offers_property on public.offers (property_id);
create index if not exists idx_access_info_property on public.access_info (property_id);

-- Deny-all RLS until Phase 3 defines workspace-scoped rules.
do $$
declare t text;
begin
  foreach t in array array[
    'properties', 'buyers', 'buyer_properties', 'interactions',
    'tasks', 'offers', 'access_info'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "service role only" on public.%I', t);
    execute format(
      'create policy "service role only" on public.%I for all using (false) with check (false)',
      t
    );
  end loop;
end $$;
