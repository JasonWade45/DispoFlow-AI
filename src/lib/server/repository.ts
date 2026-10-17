import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type {
  AccessInfoEntry,
  Buyer,
  BuyerProperty,
  Interaction,
  Offer,
  Property,
  Task,
} from "@/types";

// ---------------------------------------------------------------------------
// Normalized workspace repository (Phase 2).
//
// The 7 core collections live in real Postgres tables; the non-core
// collections (settings, sheetConnections, trelloConnections, users,
// organization, importHistory, syncJobs) stay in the app_state blob.
// cloud-state.ts picks blob vs tables via DATA_SOURCE=blob|tables.
//
// Design:
//   * orgId  <-> workspace_id is translated at this boundary only.
//   * meta jsonb carries the verbatim original entity (audit/future fields);
//     it is written on save and never read on load (columns are the truth).
//   * timestamps are text (exact ISO-8601 round-trip).
//   * load is strict: any unparseable row => null => caller falls back to
//     the blob (which is dual-written, so nothing is ever lost).
//   * all-empty load => null => "not backfilled yet" fallback guard.
// ---------------------------------------------------------------------------

export interface CoreWorkspace {
  properties: Property[];
  buyers: Buyer[];
  relationships: BuyerProperty[];
  interactions: Interaction[];
  tasks: Task[];
  offers: Offer[];
  access_infoTable: AccessInfoEntry[];
}

export interface RepoTransport {
  select(table: string): Promise<unknown[] | null>;
  upsert(table: string, rows: unknown[]): Promise<boolean>;
}

export interface Repository {
  loadWorkspace(): Promise<CoreWorkspace | null>;
  saveWorkspace(core: CoreWorkspace): Promise<boolean>;
}

const txt = z.string().default("");
const num = z.number().nullish();
const ts = z.string().nullish();
const arr = z.array(z.string()).default([]);
const flag = z.boolean().default(false);

const propertyRowSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default("default"),
  address: txt,
  city: txt,
  state: txt,
  zip: txt,
  access_info: txt,
  status: txt,
  access_type: txt,
  asking_price: num,
  arv: num,
  estimated_repairs: num,
  assignment_price: num,
  marketing_started_at: ts,
  expected_closing_date: ts,
  notes: txt,
  created_at: txt,
  created_by: txt,
  updated_at: txt,
  property_type: txt,
  bedrooms: txt,
  bathrooms: txt,
  sqft: txt,
  lot_size: txt,
  year_built: txt,
  listing_url: txt,
  photos_url: txt,
  photos: arr,
  source_website: txt,
  source_property_id: txt,
  source_row_id: txt,
  first_imported_at: ts,
  last_synced_at: ts,
  sync_status: z.string().default("never"),
  meta: z.unknown().optional(),
});

const buyerRowSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default("default"),
  full_name: txt,
  company_name: txt,
  phone: txt,
  email: txt,
  preferred_contact_method: txt,
  preferred_markets: arr,
  property_types: arr,
  budget_min: num,
  budget_max: num,
  status: txt,
  notes: txt,
  source: txt,
  created_at: txt,
  updated_at: txt,
  created_by: txt,
  meta: z.unknown().optional(),
});

const buyerPropertyRowSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default("default"),
  buyer_id: txt,
  property_id: txt,
  interest_status: txt,
  interest_notes: txt,
  first_contact_date: ts,
  last_interaction_date: ts,
  next_follow_up_date: ts,
  next_action: txt,
  assigned_user_id: ts,
  relationship_status: txt,
  created_at: txt,
  updated_at: txt,
  last_contacted_at: ts,
  last_message_sent_at: ts,
  last_call_at: ts,
  sync_status: txt,
  source_row_id: txt,
  meta: z.unknown().optional(),
});

const interactionRowSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default("default"),
  buyer_id: ts,
  property_id: ts,
  event_type: txt,
  direction: txt,
  occurred_at: txt,
  recorded_at: txt,
  original_content: txt,
  enhanced_notes: txt,
  outcome: txt,
  potential_offer_amount: num,
  potential_offer_confirmed: flag,
  next_action: txt,
  missing_info: arr,
  is_ai_suggestion: flag,
  created_by: txt,
  created_at: txt,
  updated_at: txt,
  meta: z.unknown().optional(),
});

const taskRowSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default("default"),
  buyer_id: ts,
  property_id: ts,
  related_interaction_id: ts,
  task_type: txt,
  description: txt,
  due_date: ts,
  due_time: ts,
  assigned_user_id: txt,
  priority: txt,
  status: txt,
  completion_notes: txt,
  draft_message: txt,
  created_at: txt,
  completed_at: ts,
  completed_via: ts,
  sent_at: ts,
  meta: z.unknown().optional(),
});

const offerRowSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default("default"),
  buyer_id: txt,
  property_id: txt,
  amount: z.number().default(0),
  offer_date: txt,
  terms: txt,
  expires_at: ts,
  status: txt,
  negotiation_notes: txt,
  next_action: txt,
  created_by: txt,
  created_at: txt,
  updated_at: txt,
  meta: z.unknown().optional(),
});

const accessInfoRowSchema = z.object({
  id: z.string(),
  workspace_id: z.string().default("default"),
  property_id: txt,
  access_code: txt,
  created_at: txt,
  updated_at: txt,
  meta: z.unknown().optional(),
});

type PropertyRow = z.infer<typeof propertyRowSchema>;
type BuyerRow = z.infer<typeof buyerRowSchema>;
type BuyerPropertyRow = z.infer<typeof buyerPropertyRowSchema>;
type InteractionRow = z.infer<typeof interactionRowSchema>;
type TaskRow = z.infer<typeof taskRowSchema>;
type OfferRow = z.infer<typeof offerRowSchema>;
type AccessInfoRow = z.infer<typeof accessInfoRowSchema>;

const n = <T>(v: T | null | undefined): T | null => v ?? null;

// --- row -> entity ----------------------------------------------------------

function toProperty(r: PropertyRow): Property {
  return {
    id: r.id,
    orgId: r.workspace_id,
    address: r.address,
    city: r.city,
    state: r.state,
    zip: r.zip,
    accessInfo: r.access_info,
    status: r.status,
    accessType: r.access_type,
    askingPrice: n(r.asking_price),
    arv: n(r.arv),
    estimatedRepairs: n(r.estimated_repairs),
    assignmentPrice: n(r.assignment_price),
    marketingStartedAt: n(r.marketing_started_at),
    expectedClosingDate: n(r.expected_closing_date),
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
    propertyType: r.property_type,
    bedrooms: r.bedrooms,
    bathrooms: r.bathrooms,
    sqft: r.sqft,
    lotSize: r.lot_size,
    yearBuilt: r.year_built,
    listingUrl: r.listing_url,
    photosUrl: r.photos_url,
    photos: r.photos,
    sourceWebsite: r.source_website,
    sourcePropertyId: r.source_property_id,
    sourceRowId: r.source_row_id,
    firstImportedAt: n(r.first_imported_at),
    lastSyncedAt: n(r.last_synced_at),
    syncStatus: r.sync_status as Property["syncStatus"],
  };
}

function toBuyer(r: BuyerRow): Buyer {
  return {
    id: r.id,
    orgId: r.workspace_id,
    fullName: r.full_name,
    companyName: r.company_name,
    phone: r.phone,
    email: r.email,
    preferredContactMethod: r.preferred_contact_method as Buyer["preferredContactMethod"],
    preferredMarkets: r.preferred_markets,
    propertyTypes: r.property_types,
    budgetMin: n(r.budget_min),
    budgetMax: n(r.budget_max),
    status: r.status as Buyer["status"],
    notes: r.notes,
    source: r.source,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    createdBy: r.created_by,
  };
}

function toBuyerProperty(r: BuyerPropertyRow): BuyerProperty {
  return {
    id: r.id,
    orgId: r.workspace_id,
    buyerId: r.buyer_id,
    propertyId: r.property_id,
    interestStatus: r.interest_status,
    interestNotes: r.interest_notes,
    firstContactDate: n(r.first_contact_date),
    lastInteractionDate: n(r.last_interaction_date),
    nextFollowUpDate: n(r.next_follow_up_date),
    nextAction: r.next_action,
    assignedUserId: n(r.assigned_user_id),
    relationshipStatus: r.relationship_status as BuyerProperty["relationshipStatus"],
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    lastContactedAt: n(r.last_contacted_at),
    lastMessageSentAt: n(r.last_message_sent_at),
    lastCallAt: n(r.last_call_at),
    syncStatus: r.sync_status as BuyerProperty["syncStatus"],
    sourceRowId: r.source_row_id,
  };
}

function toInteraction(r: InteractionRow): Interaction {
  return {
    id: r.id,
    orgId: r.workspace_id,
    buyerId: n(r.buyer_id),
    propertyId: n(r.property_id),
    eventType: r.event_type as Interaction["eventType"],
    direction: r.direction as Interaction["direction"],
    occurredAt: r.occurred_at,
    recordedAt: r.recorded_at,
    originalContent: r.original_content,
    enhancedNotes: r.enhanced_notes,
    outcome: r.outcome,
    potentialOfferAmount: n(r.potential_offer_amount),
    potentialOfferConfirmed: r.potential_offer_confirmed,
    nextAction: r.next_action,
    missingInfo: r.missing_info,
    isAiSuggestion: r.is_ai_suggestion,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toTask(r: TaskRow): Task {
  return {
    id: r.id,
    orgId: r.workspace_id,
    buyerId: n(r.buyer_id),
    propertyId: n(r.property_id),
    relatedInteractionId: n(r.related_interaction_id),
    taskType: r.task_type,
    description: r.description,
    dueDate: n(r.due_date),
    dueTime: n(r.due_time),
    assignedUserId: r.assigned_user_id,
    priority: r.priority as Task["priority"],
    status: r.status as Task["status"],
    completionNotes: r.completion_notes,
    draftMessage: r.draft_message,
    createdAt: r.created_at,
    completedAt: n(r.completed_at),
    completedVia: n(r.completed_via) as Task["completedVia"],
    sentAt: n(r.sent_at),
  };
}

function toOffer(r: OfferRow): Offer {
  return {
    id: r.id,
    orgId: r.workspace_id,
    buyerId: r.buyer_id,
    propertyId: r.property_id,
    amount: r.amount,
    offerDate: r.offer_date,
    terms: r.terms,
    expiresAt: n(r.expires_at),
    status: r.status as Offer["status"],
    negotiationNotes: r.negotiation_notes,
    nextAction: r.next_action,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function toAccessInfo(r: AccessInfoRow): AccessInfoEntry {
  return {
    id: r.id,
    orgId: r.workspace_id,
    propertyId: r.property_id,
    accessCode: r.access_code,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

// --- entity -> row ----------------------------------------------------------

function fromProperty(p: Property): PropertyRow {
  return {
    id: p.id,
    workspace_id: p.orgId,
    address: p.address,
    city: p.city,
    state: p.state,
    zip: p.zip,
    access_info: p.accessInfo,
    status: p.status,
    access_type: p.accessType,
    asking_price: p.askingPrice,
    arv: p.arv,
    estimated_repairs: p.estimatedRepairs,
    assignment_price: p.assignmentPrice,
    marketing_started_at: p.marketingStartedAt,
    expected_closing_date: p.expectedClosingDate,
    notes: p.notes,
    created_at: p.createdAt,
    created_by: p.createdBy,
    updated_at: p.updatedAt,
    property_type: p.propertyType,
    bedrooms: p.bedrooms,
    bathrooms: p.bathrooms,
    sqft: p.sqft,
    lot_size: p.lotSize,
    year_built: p.yearBuilt,
    listing_url: p.listingUrl,
    photos_url: p.photosUrl,
    photos: p.photos,
    source_website: p.sourceWebsite,
    source_property_id: p.sourcePropertyId,
    source_row_id: p.sourceRowId,
    first_imported_at: p.firstImportedAt,
    last_synced_at: p.lastSyncedAt,
    sync_status: p.syncStatus,
    meta: p,
  };
}

function fromBuyer(b: Buyer): BuyerRow {
  return {
    id: b.id,
    workspace_id: b.orgId,
    full_name: b.fullName,
    company_name: b.companyName,
    phone: b.phone,
    email: b.email,
    preferred_contact_method: b.preferredContactMethod,
    preferred_markets: b.preferredMarkets,
    property_types: b.propertyTypes,
    budget_min: b.budgetMin,
    budget_max: b.budgetMax,
    status: b.status,
    notes: b.notes,
    source: b.source ?? "",
    created_at: b.createdAt,
    updated_at: b.updatedAt,
    created_by: b.createdBy,
    meta: b,
  };
}

function fromBuyerProperty(rel: BuyerProperty): BuyerPropertyRow {
  return {
    id: rel.id,
    workspace_id: rel.orgId,
    buyer_id: rel.buyerId,
    property_id: rel.propertyId,
    interest_status: rel.interestStatus,
    interest_notes: rel.interestNotes,
    first_contact_date: rel.firstContactDate,
    last_interaction_date: rel.lastInteractionDate,
    next_follow_up_date: rel.nextFollowUpDate,
    next_action: rel.nextAction,
    assigned_user_id: rel.assignedUserId,
    relationship_status: rel.relationshipStatus,
    created_at: rel.createdAt,
    updated_at: rel.updatedAt,
    last_contacted_at: rel.lastContactedAt,
    last_message_sent_at: rel.lastMessageSentAt,
    last_call_at: rel.lastCallAt,
    sync_status: rel.syncStatus,
    source_row_id: rel.sourceRowId,
    meta: rel,
  };
}

function fromInteraction(i: Interaction): InteractionRow {
  return {
    id: i.id,
    workspace_id: i.orgId,
    buyer_id: i.buyerId,
    property_id: i.propertyId,
    event_type: i.eventType,
    direction: i.direction,
    occurred_at: i.occurredAt,
    recorded_at: i.recordedAt,
    original_content: i.originalContent,
    enhanced_notes: i.enhancedNotes,
    outcome: i.outcome,
    potential_offer_amount: i.potentialOfferAmount,
    potential_offer_confirmed: i.potentialOfferConfirmed,
    next_action: i.nextAction,
    missing_info: i.missingInfo,
    is_ai_suggestion: i.isAiSuggestion,
    created_by: i.createdBy,
    created_at: i.createdAt,
    updated_at: i.updatedAt,
    meta: i,
  };
}

function fromTask(t: Task): TaskRow {
  return {
    id: t.id,
    workspace_id: t.orgId,
    buyer_id: t.buyerId,
    property_id: t.propertyId,
    related_interaction_id: t.relatedInteractionId,
    task_type: t.taskType,
    description: t.description,
    due_date: t.dueDate,
    due_time: t.dueTime,
    assigned_user_id: t.assignedUserId,
    priority: t.priority,
    status: t.status,
    completion_notes: t.completionNotes,
    draft_message: t.draftMessage ?? "",
    created_at: t.createdAt,
    completed_at: t.completedAt,
    completed_via: t.completedVia,
    sent_at: t.sentAt,
    meta: t,
  };
}

function fromOffer(o: Offer): OfferRow {
  return {
    id: o.id,
    workspace_id: o.orgId,
    buyer_id: o.buyerId,
    property_id: o.propertyId,
    amount: o.amount,
    offer_date: o.offerDate,
    terms: o.terms,
    expires_at: o.expiresAt,
    status: o.status,
    negotiation_notes: o.negotiationNotes,
    next_action: o.nextAction,
    created_by: o.createdBy,
    created_at: o.createdAt,
    updated_at: o.updatedAt,
    meta: o,
  };
}

function fromAccessInfo(entry: AccessInfoEntry): AccessInfoRow {
  return {
    id: entry.id,
    workspace_id: entry.orgId,
    property_id: entry.propertyId,
    access_code: entry.accessCode,
    created_at: entry.createdAt,
    updated_at: entry.updatedAt,
    meta: entry,
  };
}

// --- parsing ----------------------------------------------------------------

async function loadTable<T>(
  transport: RepoTransport,
  table: string,
  parse: (value: unknown) => T | null,
): Promise<T[] | null> {
  const raw = await transport.select(table);
  if (raw === null) return null;
  const out: T[] = [];
  for (const item of raw) {
    const parsed = parse(item);
    if (parsed === null) return null;
    out.push(parsed);
  }
  return out;
}

const parseProperty = (v: unknown): Property | null => {
  const p = propertyRowSchema.safeParse(v);
  return p.success ? toProperty(p.data) : null;
};
const parseBuyer = (v: unknown): Buyer | null => {
  const p = buyerRowSchema.safeParse(v);
  return p.success ? toBuyer(p.data) : null;
};
const parseBuyerProperty = (v: unknown): BuyerProperty | null => {
  const p = buyerPropertyRowSchema.safeParse(v);
  return p.success ? toBuyerProperty(p.data) : null;
};
const parseInteraction = (v: unknown): Interaction | null => {
  const p = interactionRowSchema.safeParse(v);
  return p.success ? toInteraction(p.data) : null;
};
const parseTask = (v: unknown): Task | null => {
  const p = taskRowSchema.safeParse(v);
  return p.success ? toTask(p.data) : null;
};
const parseOffer = (v: unknown): Offer | null => {
  const p = offerRowSchema.safeParse(v);
  return p.success ? toOffer(p.data) : null;
};
const parseAccessInfo = (v: unknown): AccessInfoEntry | null => {
  const p = accessInfoRowSchema.safeParse(v);
  return p.success ? toAccessInfo(p.data) : null;
};

// --- repository -------------------------------------------------------------

export function createRepository(transport: RepoTransport): Repository {
  return {
    async loadWorkspace(): Promise<CoreWorkspace | null> {
      const [properties, buyers, relationships, interactions, tasks, offers, accessInfo] =
        await Promise.all([
          loadTable(transport, "properties", parseProperty),
          loadTable(transport, "buyers", parseBuyer),
          loadTable(transport, "buyer_properties", parseBuyerProperty),
          loadTable(transport, "interactions", parseInteraction),
          loadTable(transport, "tasks", parseTask),
          loadTable(transport, "offers", parseOffer),
          loadTable(transport, "access_info", parseAccessInfo),
        ]);
      if (
        properties === null ||
        buyers === null ||
        relationships === null ||
        interactions === null ||
        tasks === null ||
        offers === null ||
        accessInfo === null
      ) {
        return null;
      }
      // All-empty means "backfill never ran" (or the tables were wiped):
      // fall back to the blob instead of showing an empty workspace.
      const empty =
        properties.length === 0 &&
        buyers.length === 0 &&
        relationships.length === 0 &&
        interactions.length === 0 &&
        tasks.length === 0 &&
        offers.length === 0 &&
        accessInfo.length === 0;
      if (empty) return null;
      return {
        properties,
        buyers,
        relationships,
        interactions,
        tasks,
        offers,
        access_infoTable: accessInfo,
      };
    },

    async saveWorkspace(core: CoreWorkspace): Promise<boolean> {
      const batches: Array<[string, unknown[]]> = [
        ["properties", core.properties.map(fromProperty)],
        ["buyers", core.buyers.map(fromBuyer)],
        ["buyer_properties", core.relationships.map(fromBuyerProperty)],
        ["interactions", core.interactions.map(fromInteraction)],
        ["tasks", core.tasks.map(fromTask)],
        ["offers", core.offers.map(fromOffer)],
        ["access_info", core.access_infoTable.map(fromAccessInfo)],
      ];
      const results = await Promise.all(
        batches.map(([table, rows]) =>
          rows.length > 0 ? transport.upsert(table, rows) : Promise.resolve(true),
        ),
      );
      return results.every((ok) => ok);
    },
  };
}

// --- production transport ---------------------------------------------------

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

function supabaseTransport(): RepoTransport {
  return {
    async select(table: string): Promise<unknown[] | null> {
      const sb = getClient();
      if (!sb) return null;
      const { data, error } = await sb.from(table).select("*");
      if (error) return null;
      return (data ?? null) as unknown[] | null;
    },
    async upsert(table: string, rows: unknown[]): Promise<boolean> {
      const sb = getClient();
      if (!sb) return false;
      const { error } = await sb
        .from(table)
        .upsert(rows as Record<string, unknown>[], { onConflict: "id" });
      return !error;
    },
  };
}

export const repository: Repository = createRepository(supabaseTransport());
