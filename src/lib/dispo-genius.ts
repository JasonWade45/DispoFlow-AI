import type { Buyer, DB, Direction, Interaction, InteractionType } from "@/types";
import { uid } from "@/lib/format";

export interface DgMessage {
  id: string;
  conversationId: string;
  body: string;
  direction: string;
  messageType: string;
  dateAdded: string;
}

export interface DgConversation {
  id: string;
  contactId: string;
  name: string;
  email: string;
  phone: string;
  lastMessageBody: string;
  messages: DgMessage[];
}

export interface DgPayload {
  locationId: string;
  fetchedAt: string;
  conversations: DgConversation[];
  totals: { conversations: number; messages: number };
}

export interface DgSyncSummary {
  conversations: number;
  imported: number;
  skipped: number;
  matched: number;
  unmatched: number;
  relinked?: number;
}

export interface DgBuildResult {
  interactions: Interaction[];
  summary: DgSyncSummary;
}

export function dgDirection(raw: string | undefined): Direction {
  const d = (raw || "").toLowerCase();
  if (d === "inbound" || d === "in") return "in";
  if (d === "outbound" || d === "out") return "out";
  if (d === "internal") return "internal";
  return "system";
}

export function mapDgEventType(messageType: string, direction: string): InteractionType {
  const t = (messageType || "").toUpperCase();
  const outbound = (direction || "").toLowerCase() === "outbound";
  if (t.includes("INTERNAL")) return "Internal Note";
  if (t.includes("VOICEMAIL")) return "Voicemail";
  if (t.includes("EMAIL")) return outbound ? "Outgoing Email" : "Incoming Email";
  if (t.includes("CALL")) return "Phone Call";
  const messaging = ["SMS", "WHATSAPP", "RCS", "WEBCHAT", "FACEBOOK", "INSTAGRAM", "TIKTOK", "GMB"];
  if (messaging.some((k) => t.includes(k))) return outbound ? "Outgoing SMS" : "Incoming SMS";
  return "Other Interaction";
}

export function normalizedDgPhone(v: string): string {
  return (v || "").replace(/[^0-9]/g, "");
}

function phoneKey(v: string): string {
  const digits = normalizedDgPhone(v);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

export function findBuyerForConversation(
  buyers: Buyer[],
  conv: { name: string; phone: string; email: string },
): Buyer | undefined {
  const key = phoneKey(conv.phone);
  if (key.length >= 7) {
    const byPhone = buyers.find((b) => phoneKey(b.phone) === key);
    if (byPhone) return byPhone;
  }
  const email = (conv.email || "").trim().toLowerCase();
  if (email) {
    const byEmail = buyers.find((b) => (b.email || "").trim().toLowerCase() === email);
    if (byEmail) return byEmail;
  }
  const name = (conv.name || "").trim().toLowerCase();
  if (name) {
    const byName = buyers.find((b) => (b.fullName || "").trim().toLowerCase() === name);
    if (byName) return byName;
  }
  return undefined;
}

function validIsoDate(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Links a conversation message to a property: a buyer linked to exactly one
 * property gets every message attributed to it; buyers with several links get
 * a message only when its body mentions one of their property addresses.
 */
export function inferPropertyForBuyer(
  db: DB,
  buyerId: string | null,
  body: string,
  cache?: Map<string, { propertyId: string; address: string }[]>,
): string | null {
  if (!buyerId) return null;
  if (!cache) {
    cache = new Map();
  }
  let links = cache.get(buyerId);
  if (!links) {
    const properties = db.properties ?? [];
    links = (db.relationships ?? [])
      .filter((r) => r.buyerId === buyerId)
      .map((r) => ({
        propertyId: r.propertyId,
        address: properties.find((p) => p.id === r.propertyId)?.address ?? "",
      }))
      .filter((l) => Boolean(l.address));
    cache.set(buyerId, links);
  }
  if (links.length === 0) return null;
  if (links.length === 1) return links[0].propertyId;
  const low = (body || "").toLowerCase();
  const hit = links.find((l) => low.includes(l.address.toLowerCase()));
  return hit ? hit.propertyId : null;
}

export function buildInteractionsFromDg(
  payload: DgPayload,
  db: DB,
  userId: string,
  now: string,
): DgBuildResult {
  const existing = new Set(db.interactions.map((i) => i.id));
  const interactions: Interaction[] = [];
  const summary: DgSyncSummary = {
    conversations: 0,
    imported: 0,
    skipped: 0,
    matched: 0,
    unmatched: 0,
  };
  const propCache = new Map<string, { propertyId: string; address: string }[]>();

  for (const conv of payload.conversations) {
    summary.conversations += 1;
    const buyer = findBuyerForConversation(db.buyers, conv);
    if (buyer) summary.matched += 1;
    else summary.unmatched += 1;
    for (const msg of conv.messages) {
      const id = `i_dg_${msg.id}`;
      if (existing.has(id)) {
        summary.skipped += 1;
        continue;
      }

      const eventType = mapDgEventType(msg.messageType, msg.direction);
      let body = (msg.body || "").trim();
      if (!body) {
        if (eventType === "Phone Call") body = "Phone call";
        else if (eventType === "Voicemail") body = "Voicemail";
        else continue;
      }

      let direction = dgDirection(msg.direction);
      if (direction === "system") {
        if (eventType.startsWith("Incoming")) direction = "in";
        else if (eventType.startsWith("Outgoing")) direction = "out";
        else if (eventType === "Internal Note") direction = "internal";
      }

      interactions.push({
        id,
        orgId: db.organization.id,
        buyerId: buyer ? buyer.id : null,
        propertyId: inferPropertyForBuyer(db, buyer ? buyer.id : null, body, propCache),
        eventType,
        direction,
        occurredAt: validIsoDate(msg.dateAdded) ?? now,
        recordedAt: now,
        originalContent: body,
        enhancedNotes: "",
        outcome: "",
        potentialOfferAmount: null,
        potentialOfferConfirmed: false,
        nextAction: "",
        missingInfo: [],
        isAiSuggestion: false,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      existing.add(id);
      summary.imported += 1;
    }
  }

  interactions.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  return { interactions, summary };
}

export interface DgBuyerCreationResult {
  db: DB;
  created: number;
}

/**
 * Creates Buyer records for conversations that don't match any existing buyer
 * (matched by phone, then email, then name — same order as the interaction
 * import), so every conversation lands on a real buyer profile instead of
 * staying unmatched. Pure: returns a new DB without mutating the input.
 */
export function ensureBuyersFromConversations(
  db: DB,
  payload: DgPayload,
  userId: string,
  now: string,
): DgBuyerCreationResult {
  const buyers: Buyer[] = [...db.buyers];
  let created = 0;

  for (const conv of payload.conversations) {
    if (findBuyerForConversation(buyers, conv)) continue;
    const phone = (conv.phone || "").trim();
    const email = (conv.email || "").trim();
    const name = (conv.name || "").trim();
    if (!phone && !email && !name) continue;

    buyers.push({
      id: uid("b"),
      orgId: db.organization.id,
      fullName: name || phone || email,
      companyName: "",
      phone,
      email,
      preferredContactMethod: "SMS",
      preferredMarkets: [],
      propertyTypes: [],
      budgetMin: null,
      budgetMax: null,
      status: "Active",
      notes: "Created automatically from a DispoGenius conversation.",
      createdAt: now,
      updatedAt: now,
      createdBy: userId,
    });
    created += 1;
  }

  return { db: created > 0 ? { ...db, buyers } : db, created };
}

/** Strips stray wrapping quotes/whitespace that sheets and CRMs sometimes leave on names. */
export function cleanBuyerName(raw: string): string {
  return (raw || "").trim().replace(/^["'\u201C\u201D\u2018\u2019]+|["'\u201C\u201D\u2018\u2019]+$/g, "").trim();
}

/** True when fullName carries no real person name (empty, dash, just a phone number, just an email). */
export function isPlaceholderName(fullName: string, phone?: string, email?: string): boolean {
  const name = (fullName || "").trim();
  if (!name) return true;
  if (/^[-\u2013\u2014_.]+$/i.test(name)) return true;
  const low = name.toLowerCase();
  if (low === "n/a" || low === "na" || low === "unknown" || low === "none") return true;
  const digits = name.replace(/\D/g, "");
  const phoneDigits = (phone || "").replace(/\D/g, "");
  if (digits.length >= 7 && /^[\d\s\-()+.]+$/.test(name)) return true;
  if (phoneDigits && digits === phoneDigits) return true;
  if (name.includes("@") && !/\s/.test(name)) return true;
  return false;
}

export interface DgNameEnrichResult {
  db: DB;
  updated: number;
}

/**
 * Fills missing/placeholder buyer names (phone-as-name, "-", empty) from
 * DispoGenius conversation names matched by phone, then email — sheet rows
 * often carry only a phone number. Also strips stray quotes from real names.
 * Pure: returns a new DB without mutating the input.
 */
export function enrichBuyerNamesFromConversations(
  db: DB,
  payload: DgPayload,
  now: string,
): DgNameEnrichResult {
  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const conv of payload.conversations) {
    const name = cleanBuyerName(conv.name);
    if (!name || isPlaceholderName(name, conv.phone, conv.email)) continue;
    const pk = phoneKey(conv.phone);
    if (pk.length >= 7 && !byPhone.has(pk)) byPhone.set(pk, name);
    const em = (conv.email || "").trim().toLowerCase();
    if (em && !byEmail.has(em)) byEmail.set(em, name);
  }
  if (byPhone.size === 0 && byEmail.size === 0) return { db, updated: 0 };

  let updated = 0;
  const buyers = db.buyers.map((b) => {
    const cleaned = cleanBuyerName(b.fullName);
    const placeholder = isPlaceholderName(b.fullName, b.phone, b.email);
    let next = "";
    if (placeholder) {
      const pk = phoneKey(b.phone);
      next =
        (pk.length >= 7 ? byPhone.get(pk) : undefined) ??
        byEmail.get((b.email || "").trim().toLowerCase()) ??
        "";
      if (!next && !isPlaceholderName(cleaned, b.phone, b.email)) next = cleaned;
    } else {
      next = cleaned;
    }
    if (!next || next === b.fullName) return b;
    updated += 1;
    return { ...b, fullName: next, updatedAt: now };
  });

  return { db: updated > 0 ? { ...db, buyers } : db, updated };
}

export interface DgRelinkResult {
  interactions: Interaction[];
  relinked: number;
}

/**
 * Re-attributes already-imported messages (i_dg_*) that were logged before a
 * matching buyer or a property link existed — e.g. the first import ran while
 * the buyer list was still empty. Returns patched copies of the changed
 * interactions; callers merge them back by id.
 */
export function relinkDgInteractions(db: DB, payload: DgPayload): DgRelinkResult {
  const convByMsgId = new Map<string, DgConversation>();
  for (const conv of payload.conversations) {
    for (const m of conv.messages) convByMsgId.set(m.id, conv);
  }
  const propCache = new Map<string, { propertyId: string; address: string }[]>();
  const out: Interaction[] = [];

  for (const i of db.interactions) {
    if (!i.id.startsWith("i_dg_")) continue;
    if (i.buyerId && i.propertyId) continue;
    const conv = convByMsgId.get(i.id.slice("i_dg_".length));
    if (!conv) continue;
    const buyer =
      (i.buyerId ? db.buyers.find((b) => b.id === i.buyerId) : undefined) ??
      findBuyerForConversation(db.buyers, conv);
    if (!buyer) continue;
    const propertyId =
      i.propertyId ?? inferPropertyForBuyer(db, buyer.id, i.originalContent, propCache);
    if (buyer.id === i.buyerId && propertyId === i.propertyId) continue;
    out.push({ ...i, buyerId: buyer.id, propertyId });
  }

  return { interactions: out, relinked: out.length };
}

export interface DgSendInput {
  phone: string;
  name: string;
  email: string;
  message: string;
}

export function validateDgSend(
  raw: unknown,
): { ok: true; value: DgSendInput } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "Invalid JSON body" };
  const b = raw as Record<string, unknown>;
  const phone = typeof b.phone === "string" ? b.phone.trim() : "";
  const message = typeof b.message === "string" ? b.message.trim() : "";
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  if (!message) return { ok: false, error: "Missing field: message" };
  if (message.length > 1600) {
    return { ok: false, error: "Message is too long (max 1600 characters)" };
  }
  if (normalizedDgPhone(phone).length < 10) {
    return { ok: false, error: "Missing or invalid field: phone (need a 10+ digit number)" };
  }
  return { ok: true, value: { phone, name, email, message } };
}
