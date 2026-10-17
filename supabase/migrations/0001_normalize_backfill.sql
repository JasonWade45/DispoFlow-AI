-- Phase 2 backfill: copy the 7 core collections out of the app_state blob into
-- the normalized tables. Run ONCE after 0001_normalize_schema.sql.
-- Safe to re-run (idempotent): every insert refreshes existing rows via
-- ON CONFLICT (id) DO UPDATE, so re-running re-syncs tables from the blob.
--
-- Mapping rules:
--   * id             -> id                     (skip rows without an id)
--   * orgId          -> workspace_id           (default 'default')
--   * required text  -> coalesce(..., '')       (missing/JSON-null -> '')
--   * nullable text  -> e->>'field'             (JSON null -> SQL NULL)
--   * number|null    -> nullif(e->>'f','')::numeric
--   * required number-> coalesce(nullif(e->>'f','')::numeric, 0)
--   * string[]       -> array(select jsonb_array_elements_text(...))
--   * boolean        -> coalesce((e->>'f')::boolean, false)
--   * meta           -> e   (verbatim original entity, audit/future-field copy)
--
-- NOT included: the 7 non-core collections (settings, sheetConnections,
-- trelloConnections, users, organization, importHistory, syncJobs) stay in
-- app_state permanently. blob is preserved untouched as fallback.

-- =========================================================================
-- properties
-- =========================================================================
insert into public.properties (
  id, workspace_id, address, city, state, zip, access_info, status, access_type,
  asking_price, arv, estimated_repairs, assignment_price,
  marketing_started_at, expected_closing_date,
  notes, created_at, created_by, updated_at,
  property_type, bedrooms, bathrooms, sqft, lot_size, year_built,
  listing_url, photos_url, photos,
  source_website, source_property_id, source_row_id,
  first_imported_at, last_synced_at, sync_status, meta
)
select
  e->>'id',
  coalesce(e->>'orgId', 'default'),
  coalesce(e->>'address', ''),
  coalesce(e->>'city', ''),
  coalesce(e->>'state', ''),
  coalesce(e->>'zip', ''),
  coalesce(e->>'accessInfo', ''),
  coalesce(e->>'status', ''),
  coalesce(e->>'accessType', ''),
  nullif(e->>'askingPrice', '')::numeric,
  nullif(e->>'arv', '')::numeric,
  nullif(e->>'estimatedRepairs', '')::numeric,
  nullif(e->>'assignmentPrice', '')::numeric,
  e->>'marketingStartedAt',
  e->>'expectedClosingDate',
  coalesce(e->>'notes', ''),
  coalesce(e->>'createdAt', ''),
  coalesce(e->>'createdBy', ''),
  coalesce(e->>'updatedAt', ''),
  coalesce(e->>'propertyType', ''),
  coalesce(e->>'bedrooms', ''),
  coalesce(e->>'bathrooms', ''),
  coalesce(e->>'sqft', ''),
  coalesce(e->>'lotSize', ''),
  coalesce(e->>'yearBuilt', ''),
  coalesce(e->>'listingUrl', ''),
  coalesce(e->>'photosUrl', ''),
  array(select jsonb_array_elements_text(coalesce(e->'photos', '[]'::jsonb))),
  coalesce(e->>'sourceWebsite', ''),
  coalesce(e->>'sourcePropertyId', ''),
  coalesce(e->>'sourceRowId', ''),
  e->>'firstImportedAt',
  e->>'lastSyncedAt',
  coalesce(e->>'syncStatus', 'never'),
  e
from jsonb_array_elements(
  coalesce(
    (select data from public.app_state where key = 'main')->'properties',
    '[]'::jsonb
  )
) as e
where e->>'id' is not null
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  address = excluded.address,
  city = excluded.city,
  state = excluded.state,
  zip = excluded.zip,
  access_info = excluded.access_info,
  status = excluded.status,
  access_type = excluded.access_type,
  asking_price = excluded.asking_price,
  arv = excluded.arv,
  estimated_repairs = excluded.estimated_repairs,
  assignment_price = excluded.assignment_price,
  marketing_started_at = excluded.marketing_started_at,
  expected_closing_date = excluded.expected_closing_date,
  notes = excluded.notes,
  created_at = excluded.created_at,
  created_by = excluded.created_by,
  updated_at = excluded.updated_at,
  property_type = excluded.property_type,
  bedrooms = excluded.bedrooms,
  bathrooms = excluded.bathrooms,
  sqft = excluded.sqft,
  lot_size = excluded.lot_size,
  year_built = excluded.year_built,
  listing_url = excluded.listing_url,
  photos_url = excluded.photos_url,
  photos = excluded.photos,
  source_website = excluded.source_website,
  source_property_id = excluded.source_property_id,
  source_row_id = excluded.source_row_id,
  first_imported_at = excluded.first_imported_at,
  last_synced_at = excluded.last_synced_at,
  sync_status = excluded.sync_status,
  meta = excluded.meta,
  row_updated_at = now();

-- =========================================================================
-- buyers
-- =========================================================================
insert into public.buyers (
  id, workspace_id, full_name, company_name, phone, email,
  preferred_contact_method, preferred_markets, property_types,
  budget_min, budget_max, status, notes, source,
  created_at, updated_at, created_by, meta
)
select
  e->>'id',
  coalesce(e->>'orgId', 'default'),
  coalesce(e->>'fullName', ''),
  coalesce(e->>'companyName', ''),
  coalesce(e->>'phone', ''),
  coalesce(e->>'email', ''),
  coalesce(e->>'preferredContactMethod', ''),
  array(select jsonb_array_elements_text(coalesce(e->'preferredMarkets', '[]'::jsonb))),
  array(select jsonb_array_elements_text(coalesce(e->'propertyTypes', '[]'::jsonb))),
  nullif(e->>'budgetMin', '')::numeric,
  nullif(e->>'budgetMax', '')::numeric,
  coalesce(e->>'status', ''),
  coalesce(e->>'notes', ''),
  coalesce(e->>'source', ''),
  coalesce(e->>'createdAt', ''),
  coalesce(e->>'updatedAt', ''),
  coalesce(e->>'createdBy', ''),
  e
from jsonb_array_elements(
  coalesce(
    (select data from public.app_state where key = 'main')->'buyers',
    '[]'::jsonb
  )
) as e
where e->>'id' is not null
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  full_name = excluded.full_name,
  company_name = excluded.company_name,
  phone = excluded.phone,
  email = excluded.email,
  preferred_contact_method = excluded.preferred_contact_method,
  preferred_markets = excluded.preferred_markets,
  property_types = excluded.property_types,
  budget_min = excluded.budget_min,
  budget_max = excluded.budget_max,
  status = excluded.status,
  notes = excluded.notes,
  source = excluded.source,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  created_by = excluded.created_by,
  meta = excluded.meta,
  row_updated_at = now();

-- =========================================================================
-- buyer_properties  (entity collection: 'relationships')
-- =========================================================================
insert into public.buyer_properties (
  id, workspace_id, buyer_id, property_id,
  interest_status, interest_notes,
  first_contact_date, last_interaction_date, next_follow_up_date,
  next_action, assigned_user_id, relationship_status,
  created_at, updated_at,
  last_contacted_at, last_message_sent_at, last_call_at,
  sync_status, source_row_id, meta
)
select
  e->>'id',
  coalesce(e->>'orgId', 'default'),
  coalesce(e->>'buyerId', ''),
  coalesce(e->>'propertyId', ''),
  coalesce(e->>'interestStatus', ''),
  coalesce(e->>'interestNotes', ''),
  e->>'firstContactDate',
  e->>'lastInteractionDate',
  e->>'nextFollowUpDate',
  coalesce(e->>'nextAction', ''),
  e->>'assignedUserId',
  coalesce(e->>'relationshipStatus', ''),
  coalesce(e->>'createdAt', ''),
  coalesce(e->>'updatedAt', ''),
  e->>'lastContactedAt',
  e->>'lastMessageSentAt',
  e->>'lastCallAt',
  coalesce(e->>'syncStatus', ''),
  coalesce(e->>'sourceRowId', ''),
  e
from jsonb_array_elements(
  coalesce(
    (select data from public.app_state where key = 'main')->'relationships',
    '[]'::jsonb
  )
) as e
where e->>'id' is not null
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  buyer_id = excluded.buyer_id,
  property_id = excluded.property_id,
  interest_status = excluded.interest_status,
  interest_notes = excluded.interest_notes,
  first_contact_date = excluded.first_contact_date,
  last_interaction_date = excluded.last_interaction_date,
  next_follow_up_date = excluded.next_follow_up_date,
  next_action = excluded.next_action,
  assigned_user_id = excluded.assigned_user_id,
  relationship_status = excluded.relationship_status,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  last_contacted_at = excluded.last_contacted_at,
  last_message_sent_at = excluded.last_message_sent_at,
  last_call_at = excluded.last_call_at,
  sync_status = excluded.sync_status,
  source_row_id = excluded.source_row_id,
  meta = excluded.meta,
  row_updated_at = now();

-- =========================================================================
-- interactions
-- =========================================================================
insert into public.interactions (
  id, workspace_id, buyer_id, property_id, event_type, direction,
  occurred_at, recorded_at, original_content, enhanced_notes, outcome,
  potential_offer_amount, potential_offer_confirmed, next_action,
  missing_info, is_ai_suggestion, created_by, created_at, updated_at, meta
)
select
  e->>'id',
  coalesce(e->>'orgId', 'default'),
  e->>'buyerId',
  e->>'propertyId',
  coalesce(e->>'eventType', ''),
  coalesce(e->>'direction', ''),
  coalesce(e->>'occurredAt', ''),
  coalesce(e->>'recordedAt', ''),
  coalesce(e->>'originalContent', ''),
  coalesce(e->>'enhancedNotes', ''),
  coalesce(e->>'outcome', ''),
  nullif(e->>'potentialOfferAmount', '')::numeric,
  coalesce((e->>'potentialOfferConfirmed')::boolean, false),
  coalesce(e->>'nextAction', ''),
  array(select jsonb_array_elements_text(coalesce(e->'missingInfo', '[]'::jsonb))),
  coalesce((e->>'isAiSuggestion')::boolean, false),
  coalesce(e->>'createdBy', ''),
  coalesce(e->>'createdAt', ''),
  coalesce(e->>'updatedAt', ''),
  e
from jsonb_array_elements(
  coalesce(
    (select data from public.app_state where key = 'main')->'interactions',
    '[]'::jsonb
  )
) as e
where e->>'id' is not null
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  buyer_id = excluded.buyer_id,
  property_id = excluded.property_id,
  event_type = excluded.event_type,
  direction = excluded.direction,
  occurred_at = excluded.occurred_at,
  recorded_at = excluded.recorded_at,
  original_content = excluded.original_content,
  enhanced_notes = excluded.enhanced_notes,
  outcome = excluded.outcome,
  potential_offer_amount = excluded.potential_offer_amount,
  potential_offer_confirmed = excluded.potential_offer_confirmed,
  next_action = excluded.next_action,
  missing_info = excluded.missing_info,
  is_ai_suggestion = excluded.is_ai_suggestion,
  created_by = excluded.created_by,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  meta = excluded.meta,
  row_updated_at = now();

-- =========================================================================
-- tasks
-- =========================================================================
insert into public.tasks (
  id, workspace_id, buyer_id, property_id, related_interaction_id,
  task_type, description, due_date, due_time, assigned_user_id, priority,
  status, completion_notes, draft_message, created_at,
  completed_at, completion_via, sent_at, meta
)
select
  e->>'id',
  coalesce(e->>'orgId', 'default'),
  e->>'buyerId',
  e->>'propertyId',
  e->>'relatedInteractionId',
  coalesce(e->>'taskType', ''),
  coalesce(e->>'description', ''),
  e->>'dueDate',
  e->>'dueTime',
  coalesce(e->>'assignedUserId', ''),
  coalesce(e->>'priority', ''),
  coalesce(e->>'status', ''),
  coalesce(e->>'completionNotes', ''),
  coalesce(e->>'draftMessage', ''),
  coalesce(e->>'createdAt', ''),
  e->>'completedAt',
  e->>'completedVia',
  e->>'sentAt',
  e
from jsonb_array_elements(
  coalesce(
    (select data from public.app_state where key = 'main')->'tasks',
    '[]'::jsonb
  )
) as e
where e->>'id' is not null
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  buyer_id = excluded.buyer_id,
  property_id = excluded.property_id,
  related_interaction_id = excluded.related_interaction_id,
  task_type = excluded.task_type,
  description = excluded.description,
  due_date = excluded.due_date,
  due_time = excluded.due_time,
  assigned_user_id = excluded.assigned_user_id,
  priority = excluded.priority,
  status = excluded.status,
  completion_notes = excluded.completion_notes,
  draft_message = excluded.draft_message,
  created_at = excluded.created_at,
  completed_at = excluded.completed_at,
  completion_via = excluded.completion_via,
  sent_at = excluded.sent_at,
  meta = excluded.meta,
  row_updated_at = now();

-- =========================================================================
-- offers
-- =========================================================================
insert into public.offers (
  id, workspace_id, buyer_id, property_id, amount, offer_date, terms,
  expires_at, status, negotiation_notes, next_action,
  created_by, created_at, updated_at, meta
)
select
  e->>'id',
  coalesce(e->>'orgId', 'default'),
  coalesce(e->>'buyerId', ''),
  coalesce(e->>'propertyId', ''),
  coalesce(nullif(e->>'amount', '')::numeric, 0),
  coalesce(e->>'offerDate', ''),
  coalesce(e->>'terms', ''),
  e->>'expiresAt',
  coalesce(e->>'status', ''),
  coalesce(e->>'negotiationNotes', ''),
  coalesce(e->>'nextAction', ''),
  coalesce(e->>'createdBy', ''),
  coalesce(e->>'createdAt', ''),
  coalesce(e->>'updatedAt', ''),
  e
from jsonb_array_elements(
  coalesce(
    (select data from public.app_state where key = 'main')->'offers',
    '[]'::jsonb
  )
) as e
where e->>'id' is not null
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  buyer_id = excluded.buyer_id,
  property_id = excluded.property_id,
  amount = excluded.amount,
  offer_date = excluded.offer_date,
  terms = excluded.terms,
  expires_at = excluded.expires_at,
  status = excluded.status,
  negotiation_notes = excluded.negotiation_notes,
  next_action = excluded.next_action,
  created_by = excluded.created_by,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  meta = excluded.meta,
  row_updated_at = now();

-- =========================================================================
-- access_info  (entity collection: 'access_infoTable')
-- =========================================================================
insert into public.access_info (
  id, workspace_id, property_id, access_code, created_at, updated_at, meta
)
select
  e->>'id',
  coalesce(e->>'orgId', 'default'),
  coalesce(e->>'propertyId', ''),
  coalesce(e->>'accessCode', ''),
  coalesce(e->>'createdAt', ''),
  coalesce(e->>'updatedAt', ''),
  e
from jsonb_array_elements(
  coalesce(
    (select data from public.app_state where key = 'main')->'access_infoTable',
    '[]'::jsonb
  )
) as e
where e->>'id' is not null
on conflict (id) do update set
  workspace_id = excluded.workspace_id,
  property_id = excluded.property_id,
  access_code = excluded.access_code,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at,
  meta = excluded.meta,
  row_updated_at = now();
