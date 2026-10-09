-- DispoFlow AI: candidate tenant-scoped core schema for a future Supabase backend.
-- Deployment-specific review and authorization testing are required before production use.
-- The current demo UI does not connect to this migration.

create type public.workspace_role as enum ('owner', 'admin', 'team_member');
create type public.property_status as enum ('available', 'marketing', 'offer_received', 'under_contract', 'pending', 'sold', 'on_hold', 'cancelled');
create type public.buyer_status as enum ('active', 'inactive', 'do_not_contact');
create type public.buyer_interest_status as enum ('new', 'interested', 'undecided', 'needs_information', 'price_concern', 'offer_submitted', 'counteroffer', 'accepted', 'not_interested', 'no_response', 'closed_won', 'closed_lost');
create type public.offer_status as enum ('draft', 'submitted', 'under_review', 'countered', 'accepted', 'rejected', 'withdrawn', 'expired');
create type public.follow_up_status as enum ('needs_scheduling', 'scheduled', 'completed', 'cancelled');
create type public.follow_up_priority as enum ('low', 'normal', 'high');
create type public.interaction_type as enum ('incoming_sms', 'outgoing_sms', 'incoming_email', 'outgoing_email', 'phone_call', 'voicemail', 'internal_note', 'follow_up_completed', 'offer_created', 'offer_updated', 'status_changed', 'other_interaction');
create type public.communication_direction as enum ('incoming', 'outgoing', 'internal');
create type public.contact_method as enum ('text', 'email', 'call');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 120),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null default 'team_member',
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

-- Membership helpers live outside the default PostgREST-exposed public schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- Security-definer membership checks are used by RLS policies to avoid recursive RLS.
create or replace function private.is_org_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.is_active
  );
$$;

create or replace function private.is_org_owner(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.is_active
      and membership.role = 'owner'
  );
$$;

create or replace function public.create_workspace(workspace_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_organization_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to create a workspace';
  end if;

  if workspace_name is null or length(trim(workspace_name)) not between 1 and 120 then
    raise exception 'Workspace name must be between 1 and 120 characters';
  end if;

  insert into public.organizations (name, created_by)
  values (trim(workspace_name), auth.uid())
  returning id into new_organization_id;

  insert into public.organization_members (organization_id, user_id, role)
  values (new_organization_id, auth.uid(), 'owner');

  return new_organization_id;
end;
$$;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  address text not null check (length(trim(address)) between 1 and 300),
  normalized_address text generated always as (regexp_replace(lower(trim(address)), '[^a-z0-9]+', '', 'g')) stored,
  city text not null check (length(trim(city)) between 1 and 100 and city = trim(city)),
  state char(2) not null check (state ~ '^[A-Z]{2}$'),
  zip_code text check (zip_code is null or (length(trim(zip_code)) between 1 and 10 and zip_code = trim(zip_code))),
  status public.property_status not null default 'available',
  asking_price numeric(14, 2) not null default 0 check (asking_price >= 0),
  arv numeric(14, 2) not null default 0 check (arv >= 0),
  estimated_repairs numeric(14, 2) not null default 0 check (estimated_repairs >= 0),
  assignment_price numeric(14, 2) check (assignment_price is null or assignment_price >= 0),
  expected_closing_at timestamptz,
  notes text not null default '' check (length(notes) <= 10000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create unique index properties_org_normalized_address_idx
  on public.properties (organization_id, normalized_address, lower(city), upper(state), coalesce(zip_code, ''));
create index properties_org_status_idx on public.properties (organization_id, status);

create table public.buyers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  company_name text check (company_name is null or length(company_name) <= 200),
  phone text check (phone is null or (length(trim(phone)) between 1 and 40 and phone = trim(phone))),
  email text check (email is null or (email = trim(email) and length(email) between 3 and 320 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')),
  preferred_contact_method public.contact_method,
  preferred_markets text[] not null default '{}' check (cardinality(preferred_markets) <= 50 and array_position(preferred_markets, null) is null and octet_length(array_to_string(preferred_markets, '|')) <= 5000),
  property_types text[] not null default '{}' check (cardinality(property_types) <= 50 and array_position(property_types, null) is null and octet_length(array_to_string(property_types, '|')) <= 5000),
  budget_min numeric(14, 2) check (budget_min is null or budget_min >= 0),
  budget_max numeric(14, 2) check (budget_max is null or budget_max >= 0),
  general_notes text not null default '' check (length(general_notes) <= 10000),
  status public.buyer_status not null default 'active',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check (budget_min is null or budget_max is null or budget_max >= budget_min)
);
create index buyers_org_name_idx on public.buyers (organization_id, lower(full_name));
create index buyers_org_status_idx on public.buyers (organization_id, status);

create table public.buyer_property_interests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  buyer_id uuid not null,
  property_id uuid not null,
  interest_status public.buyer_interest_status not null default 'new',
  interest_notes text not null default '' check (length(interest_notes) <= 10000),
  first_contact_at timestamptz,
  last_interaction_at timestamptz,
  next_follow_up_at timestamptz,
  next_action text not null default '' check (length(next_action) <= 1000),
  assigned_user_id uuid,
  relationship_status text not null default 'active' check (relationship_status in ('active', 'closed_won', 'closed_lost', 'archived')),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, buyer_id, property_id),
  foreign key (organization_id, buyer_id) references public.buyers (organization_id, id) on delete cascade,
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete cascade,
  foreign key (organization_id, assigned_user_id) references public.organization_members (organization_id, user_id) on delete set null (assigned_user_id)
);
create index buyer_property_interests_org_buyer_idx on public.buyer_property_interests (organization_id, buyer_id);
create index buyer_property_interests_org_property_idx on public.buyer_property_interests (organization_id, property_id);
create index buyer_property_interests_next_follow_up_idx on public.buyer_property_interests (organization_id, next_follow_up_at) where next_follow_up_at is not null;

create table public.interactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  buyer_id uuid,
  property_id uuid,
  interaction_type public.interaction_type not null,
  direction public.communication_direction not null,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  original_content text not null default '' check (length(original_content) <= 20000),
  enhanced_notes text check (enhanced_notes is null or length(enhanced_notes) <= 20000),
  interaction_outcome text check (interaction_outcome is null or length(interaction_outcome) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, buyer_id) references public.buyers (organization_id, id) on delete set null (buyer_id),
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete set null (property_id)
);
create index interactions_org_occurred_idx on public.interactions (organization_id, occurred_at desc);
create index interactions_org_buyer_occurred_idx on public.interactions (organization_id, buyer_id, occurred_at desc);
create index interactions_org_property_occurred_idx on public.interactions (organization_id, property_id, occurred_at desc);

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  buyer_id uuid not null,
  property_id uuid not null,
  amount numeric(14, 2) not null check (amount > 0),
  offer_date timestamptz not null default now(),
  expiration_date timestamptz,
  terms text not null default '' check (length(terms) <= 5000),
  status public.offer_status not null default 'draft',
  negotiation_notes text not null default '' check (length(negotiation_notes) <= 10000),
  next_action text not null default '' check (length(next_action) <= 1000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, buyer_id) references public.buyers (organization_id, id) on delete restrict,
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete restrict
);
create index offers_org_status_idx on public.offers (organization_id, status);
create index offers_org_property_idx on public.offers (organization_id, property_id, offer_date desc);
create index offers_org_buyer_idx on public.offers (organization_id, buyer_id, offer_date desc);

create table public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  buyer_id uuid not null,
  property_id uuid,
  related_interaction_id uuid,
  task_description text not null check (length(trim(task_description)) between 1 and 500),
  task_type text not null default 'buyer_follow_up' check (length(task_type) <= 100),
  due_at timestamptz,
  assigned_user_id uuid,
  priority public.follow_up_priority not null default 'normal',
  status public.follow_up_status not null default 'needs_scheduling',
  completion_notes text check (completion_notes is null or length(completion_notes) <= 5000),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, buyer_id) references public.buyers (organization_id, id) on delete restrict,
  foreign key (organization_id, property_id) references public.properties (organization_id, id) on delete set null (property_id),
  foreign key (organization_id, related_interaction_id) references public.interactions (organization_id, id) on delete set null (related_interaction_id),
  foreign key (organization_id, assigned_user_id) references public.organization_members (organization_id, user_id) on delete set null (assigned_user_id),
  check (status <> 'scheduled' or due_at is not null),
  check (status <> 'needs_scheduling' or due_at is null),
  check (status <> 'completed' or completed_at is not null)
);
create index follow_up_tasks_org_status_due_idx on public.follow_up_tasks (organization_id, status, due_at);
create index follow_up_tasks_org_assignee_due_idx on public.follow_up_tasks (organization_id, assigned_user_id, due_at);

create table public.buyer_property_interest_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  buyer_property_interest_id uuid,
  buyer_id uuid not null,
  property_id uuid not null,
  previous_status public.buyer_interest_status,
  new_status public.buyer_interest_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, buyer_property_interest_id) references public.buyer_property_interests (organization_id, id) on delete set null (buyer_property_interest_id)
);
create index buyer_property_interest_history_org_time_idx on public.buyer_property_interest_history (organization_id, changed_at desc);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (organization_id, id)
);
create index audit_events_org_time_idx on public.audit_events (organization_id, occurred_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.prevent_organization_reassignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'Records cannot be reassigned to another organization';
  end if;
  return new;
end;
$$;

-- Prevent a workspace from being left without an active owner and keep membership identity stable.
create or replace function public.protect_organization_membership()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  another_active_owner_exists boolean;
begin
  if tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.organization_id::text, 0));
    new.joined_at := now();
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(old.organization_id::text, 0));

  if tg_op = 'UPDATE' then
    if new.organization_id is distinct from old.organization_id or new.user_id is distinct from old.user_id then
      raise exception 'Membership identity cannot be reassigned; remove and re-invite the member instead';
    end if;

    new.joined_at := old.joined_at;
    if old.role = 'owner' and old.is_active and (new.role <> 'owner' or not new.is_active) then
      select exists (
        select 1 from public.organization_members as membership
        where membership.organization_id = old.organization_id
          and membership.user_id <> old.user_id
          and membership.role = 'owner'
          and membership.is_active
      ) into another_active_owner_exists;
      if not another_active_owner_exists then
        raise exception 'A workspace must retain at least one active owner';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' and old.role = 'owner' and old.is_active then
    select exists (
      select 1 from public.organization_members as membership
      where membership.organization_id = old.organization_id
        and membership.user_id <> old.user_id
        and membership.role = 'owner'
        and membership.is_active
    ) into another_active_owner_exists;
    if not another_active_owner_exists then
      raise exception 'A workspace must retain at least one active owner';
    end if;
  end if;
  return old;
end;
$$;

-- Members may mark a buyer Do Not Contact; clearing that stop requires a workspace admin/owner.
create or replace function public.protect_buyer_dnc_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'do_not_contact'
    and new.status is distinct from old.status
    and not private.is_org_admin(old.organization_id) then
    raise exception 'Only a workspace owner or admin may clear Do Not Contact status';
  end if;
  return new;
end;
$$;

-- Actor IDs and recording timestamps come from the authenticated database session, not request fields.
create or replace function public.stamp_record_metadata()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.updated_by := auth.uid();
    end if;
    if tg_table_name = 'interactions' then
      new.recorded_at := now();
    end if;
    if tg_table_name = 'follow_up_tasks' then
      if new.status = 'completed' then
        new.completed_at := now();
      else
        new.completed_at := null;
      end if;
    end if;
    return new;
  end if;

  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  else
    new.updated_by := old.updated_by;
  end if;

  if tg_table_name = 'interactions' then
    new.recorded_at := old.recorded_at;
  end if;
  if tg_table_name = 'follow_up_tasks' then
    if new.status = 'completed' and old.status is distinct from 'completed' then
      new.completed_at := now();
    elsif new.status = 'completed' then
      new.completed_at := old.completed_at;
    else
      new.completed_at := null;
    end if;
  end if;
  return new;
end;
$$;

-- Client-write-protected audit records; details contain changed field names, not buyer PII or message bodies.
create or replace function public.capture_audit_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_row jsonb;
  old_row jsonb;
  target_organization_id uuid;
  target_entity_id uuid;
  changed_fields jsonb;
  audit_details jsonb;
begin
  if tg_op = 'DELETE' then
    old_row := to_jsonb(old);
  else
    new_row := to_jsonb(new);
    if tg_op = 'UPDATE' then
      old_row := to_jsonb(old);
    end if;
  end if;

  target_organization_id := coalesce(
    (coalesce(new_row, old_row) ->> 'organization_id')::uuid,
    (coalesce(new_row, old_row) ->> 'id')::uuid
  );
  target_entity_id := coalesce(
    (coalesce(new_row, old_row) ->> 'id')::uuid,
    (coalesce(new_row, old_row) ->> 'user_id')::uuid
  );

  if tg_op = 'UPDATE' then
    select coalesce(jsonb_agg(changed_key.key order by changed_key.key), '[]'::jsonb)
      into changed_fields
    from (
      select new_fields.key
      from jsonb_each(new_row) as new_fields(key, value)
      join jsonb_each(old_row) as old_fields(key, value) using (key)
      where new_fields.value is distinct from old_fields.value
        and new_fields.key not in ('updated_at', 'updated_by')
    ) as changed_key;
    audit_details := jsonb_build_object('changed_fields', changed_fields);
    if tg_table_name = 'buyers' and old_row ->> 'status' is distinct from new_row ->> 'status' then
      audit_details := audit_details || jsonb_build_object(
        'status_change', jsonb_build_object('from', old_row ->> 'status', 'to', new_row ->> 'status')
      );
    end if;
  else
    audit_details := jsonb_build_object('record', case when tg_op = 'INSERT' then 'created' else 'deleted' end);
  end if;

  insert into public.audit_events (organization_id, actor_user_id, entity_type, entity_id, action, details, occurred_at)
  values (target_organization_id, auth.uid(), tg_table_name, target_entity_id, lower(tg_op), audit_details, now());

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.capture_buyer_interest_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.interest_status is distinct from old.interest_status then
    insert into public.buyer_property_interest_history (
      organization_id,
      buyer_property_interest_id,
      buyer_id,
      property_id,
      previous_status,
      new_status,
      changed_by
    ) values (
      new.organization_id,
      new.id,
      new.buyer_id,
      new.property_id,
      old.interest_status,
      new.interest_status,
      coalesce(auth.uid(), new.updated_by, new.created_by)
    );
  end if;
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();

create trigger organization_members_protect before insert or update or delete on public.organization_members
  for each row execute function public.protect_organization_membership();
create trigger organization_members_audit after insert or update or delete on public.organization_members
  for each row execute function public.capture_audit_event();

create trigger properties_metadata before insert or update on public.properties
  for each row execute function public.stamp_record_metadata();
create trigger properties_tenant_immutable before update on public.properties
  for each row execute function public.prevent_organization_reassignment();
create trigger properties_audit after insert or update or delete on public.properties
  for each row execute function public.capture_audit_event();

create trigger buyers_dnc_protect before update on public.buyers
  for each row execute function public.protect_buyer_dnc_status();
create trigger buyers_metadata before insert or update on public.buyers
  for each row execute function public.stamp_record_metadata();
create trigger buyers_tenant_immutable before update on public.buyers
  for each row execute function public.prevent_organization_reassignment();
create trigger buyers_audit after insert or update or delete on public.buyers
  for each row execute function public.capture_audit_event();

create trigger interests_metadata before insert or update on public.buyer_property_interests
  for each row execute function public.stamp_record_metadata();
create trigger interests_tenant_immutable before update on public.buyer_property_interests
  for each row execute function public.prevent_organization_reassignment();
create trigger interests_status_history after update on public.buyer_property_interests
  for each row execute function public.capture_buyer_interest_status_change();
create trigger interests_audit after insert or update or delete on public.buyer_property_interests
  for each row execute function public.capture_audit_event();

create trigger interactions_metadata before insert or update on public.interactions
  for each row execute function public.stamp_record_metadata();
create trigger interactions_tenant_immutable before update on public.interactions
  for each row execute function public.prevent_organization_reassignment();
create trigger interactions_audit after insert or update or delete on public.interactions
  for each row execute function public.capture_audit_event();

create trigger offers_metadata before insert or update on public.offers
  for each row execute function public.stamp_record_metadata();
create trigger offers_tenant_immutable before update on public.offers
  for each row execute function public.prevent_organization_reassignment();
create trigger offers_audit after insert or update or delete on public.offers
  for each row execute function public.capture_audit_event();

create trigger follow_up_tasks_metadata before insert or update on public.follow_up_tasks
  for each row execute function public.stamp_record_metadata();
create trigger follow_up_tasks_tenant_immutable before update on public.follow_up_tasks
  for each row execute function public.prevent_organization_reassignment();
create trigger follow_up_tasks_audit after insert or update or delete on public.follow_up_tasks
  for each row execute function public.capture_audit_event();

create trigger organizations_audit after insert or update on public.organizations
  for each row execute function public.capture_audit_event();

create or replace function private.is_org_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null and exists (
    select 1
    from public.organization_members as membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.is_active
      and membership.role in ('owner', 'admin')
  );
$$;

-- RLS protects ordinary authenticated requests; elevated/table-owner roles can bypass this boundary.
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.properties enable row level security;
alter table public.buyers enable row level security;
alter table public.buyer_property_interests enable row level security;
alter table public.interactions enable row level security;
alter table public.offers enable row level security;
alter table public.follow_up_tasks enable row level security;
alter table public.buyer_property_interest_history enable row level security;
alter table public.audit_events enable row level security;

create policy organizations_member_read on public.organizations
  for select to authenticated using (private.is_org_member(id));
create policy organizations_admin_update on public.organizations
  for update to authenticated using (private.is_org_admin(id)) with check (private.is_org_admin(id));

create policy organization_members_member_read on public.organization_members
  for select to authenticated using (private.is_org_member(organization_id));
create policy organization_members_admin_manage on public.organization_members
  for all to authenticated
  using (private.is_org_admin(organization_id) and (role <> 'owner' or private.is_org_owner(organization_id)))
  with check (private.is_org_admin(organization_id) and (role <> 'owner' or private.is_org_owner(organization_id)));

create policy properties_member_read on public.properties
  for select to authenticated using (private.is_org_member(organization_id));
create policy properties_member_insert on public.properties
  for insert to authenticated with check (private.is_org_member(organization_id));
create policy properties_member_update on public.properties
  for update to authenticated using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));
create policy properties_admin_delete on public.properties
  for delete to authenticated using (private.is_org_admin(organization_id));

create policy buyers_member_read on public.buyers
  for select to authenticated using (private.is_org_member(organization_id));
create policy buyers_member_insert on public.buyers
  for insert to authenticated with check (private.is_org_member(organization_id));
create policy buyers_member_update on public.buyers
  for update to authenticated using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));
create policy buyers_admin_delete on public.buyers
  for delete to authenticated using (private.is_org_admin(organization_id));

create policy buyer_property_interests_member_read on public.buyer_property_interests
  for select to authenticated using (private.is_org_member(organization_id));
create policy buyer_property_interests_member_insert on public.buyer_property_interests
  for insert to authenticated with check (private.is_org_member(organization_id));
create policy buyer_property_interests_member_update on public.buyer_property_interests
  for update to authenticated using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));
create policy buyer_property_interests_admin_delete on public.buyer_property_interests
  for delete to authenticated using (private.is_org_admin(organization_id));

-- Communication records are append-only for client roles. Corrections should be logged as new events.
create policy interactions_member_read on public.interactions
  for select to authenticated using (private.is_org_member(organization_id));
create policy interactions_member_insert on public.interactions
  for insert to authenticated with check (private.is_org_member(organization_id));

create policy offers_member_read on public.offers
  for select to authenticated using (private.is_org_member(organization_id));
create policy offers_member_insert on public.offers
  for insert to authenticated with check (private.is_org_member(organization_id));
create policy offers_member_update on public.offers
  for update to authenticated using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));
create policy offers_admin_delete on public.offers
  for delete to authenticated using (private.is_org_admin(organization_id));

create policy follow_up_tasks_member_read on public.follow_up_tasks
  for select to authenticated using (private.is_org_member(organization_id));
create policy follow_up_tasks_member_insert on public.follow_up_tasks
  for insert to authenticated with check (private.is_org_member(organization_id));
create policy follow_up_tasks_member_update on public.follow_up_tasks
  for update to authenticated using (private.is_org_member(organization_id)) with check (private.is_org_member(organization_id));
create policy follow_up_tasks_admin_delete on public.follow_up_tasks
  for delete to authenticated using (private.is_org_admin(organization_id));

create policy buyer_property_interest_history_member_read on public.buyer_property_interest_history
  for select to authenticated using (private.is_org_member(organization_id));
create policy audit_events_member_read on public.audit_events
  for select to authenticated using (private.is_org_member(organization_id));

-- Remove any default/direct table grants (including Supabase defaults) before granting the minimum needed.
revoke all on table public.organizations, public.organization_members, public.properties, public.buyers,
  public.buyer_property_interests, public.interactions, public.offers, public.follow_up_tasks,
  public.buyer_property_interest_history, public.audit_events
from public, anon, authenticated;

revoke all on function private.is_org_member(uuid) from public, anon, authenticated;
revoke all on function private.is_org_owner(uuid) from public, anon, authenticated;
revoke all on function private.is_org_admin(uuid) from public, anon, authenticated;
revoke all on function public.create_workspace(text) from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.prevent_organization_reassignment() from public, anon, authenticated;
revoke all on function public.protect_organization_membership() from public, anon, authenticated;
revoke all on function public.protect_buyer_dnc_status() from public, anon, authenticated;
revoke all on function public.stamp_record_metadata() from public, anon, authenticated;
revoke all on function public.capture_audit_event() from public, anon, authenticated;
revoke all on function public.capture_buyer_interest_status_change() from public, anon, authenticated;

grant execute on function private.is_org_member(uuid) to authenticated;
grant execute on function private.is_org_owner(uuid) to authenticated;
grant execute on function private.is_org_admin(uuid) to authenticated;
grant execute on function public.create_workspace(text) to authenticated;
grant usage on schema private to authenticated;

grant select on public.organizations to authenticated;
grant update (name) on public.organizations to authenticated;

grant select, delete on public.organization_members to authenticated;
grant insert (organization_id, user_id, role, is_active) on public.organization_members to authenticated;
grant update (role, is_active) on public.organization_members to authenticated;

grant select, delete on public.properties to authenticated;
grant insert (organization_id, address, city, state, zip_code, status, asking_price, arv, estimated_repairs, assignment_price, expected_closing_at, notes) on public.properties to authenticated;
grant update (address, city, state, zip_code, status, asking_price, arv, estimated_repairs, assignment_price, expected_closing_at, notes) on public.properties to authenticated;

grant select, delete on public.buyers to authenticated;
grant insert (organization_id, full_name, company_name, phone, email, preferred_contact_method, preferred_markets, property_types, budget_min, budget_max, general_notes, status) on public.buyers to authenticated;
grant update (full_name, company_name, phone, email, preferred_contact_method, preferred_markets, property_types, budget_min, budget_max, general_notes, status) on public.buyers to authenticated;

grant select, delete on public.buyer_property_interests to authenticated;
grant insert (organization_id, buyer_id, property_id, interest_status, interest_notes, first_contact_at, last_interaction_at, next_follow_up_at, next_action, assigned_user_id, relationship_status) on public.buyer_property_interests to authenticated;
grant update (interest_status, interest_notes, first_contact_at, last_interaction_at, next_follow_up_at, next_action, assigned_user_id, relationship_status) on public.buyer_property_interests to authenticated;

-- Interactions are immutable through client credentials; corrections are new entries.
grant select on public.interactions to authenticated;
grant insert (organization_id, buyer_id, property_id, interaction_type, direction, occurred_at, original_content, enhanced_notes, interaction_outcome) on public.interactions to authenticated;

grant select, delete on public.offers to authenticated;
grant insert (organization_id, buyer_id, property_id, amount, offer_date, expiration_date, terms, status, negotiation_notes, next_action) on public.offers to authenticated;
grant update (amount, offer_date, expiration_date, terms, status, negotiation_notes, next_action) on public.offers to authenticated;

grant select, delete on public.follow_up_tasks to authenticated;
grant insert (organization_id, buyer_id, property_id, related_interaction_id, task_description, task_type, due_at, assigned_user_id, priority, status, completion_notes) on public.follow_up_tasks to authenticated;
grant update (task_description, task_type, due_at, assigned_user_id, priority, status, completion_notes) on public.follow_up_tasks to authenticated;

grant select on public.buyer_property_interest_history to authenticated;
-- No client-side INSERT/UPDATE/DELETE grant: only trusted database triggers append audit events.
grant select on public.audit_events to authenticated;
