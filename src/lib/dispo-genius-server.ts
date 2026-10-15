import type { DgConversation, DgMessage, DgPayload } from "@/lib/dispo-genius";

const BASE = "https://services.leadconnectorhq.com";

export class GhlError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function ghlFetch(
  path: string,
  token: string,
  versions: string[],
  params: Record<string, string>,
  init: { method: "GET" | "POST"; body?: string },
): Promise<unknown> {
  let lastError: GhlError | null = null;
  for (const version of versions) {
    const url = new URL(BASE + path);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const res = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: version,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body,
      cache: "no-store",
    });
    if (res.ok) return res.json();
    const text = await res.text().catch(() => "");
    lastError = new GhlError(
      res.status,
      `DispoGenius API ${res.status} on ${path}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
    if (res.status !== 400) throw lastError;
  }
  throw lastError ?? new GhlError(502, `DispoGenius API failed on ${path}`);
}

export async function ghlGet(
  path: string,
  token: string,
  versions: string[],
  params: Record<string, string>,
): Promise<unknown> {
  return ghlFetch(path, token, versions, params, { method: "GET" });
}

export async function ghlPost(
  path: string,
  token: string,
  versions: string[],
  body: unknown,
): Promise<unknown> {
  return ghlFetch(path, token, versions, {}, { method: "POST", body: JSON.stringify(body) });
}

export async function resolveLocationId(token: string, explicit: string): Promise<string> {
  if (explicit) return explicit;
  const res = asRecord(await ghlGet("/locations/search", token, ["2021-07-28"], { limit: "1" }));
  const locations = asArray(res.locations).length
    ? asArray(res.locations)
    : asArray(asRecord(res.data).locations);
  const first = asRecord(locations[0]);
  const id = asString(first.id);
  if (!id) throw new GhlError(404, "Could not discover a DispoGenius location id");
  return id;
}

const MAX_CONVERSATIONS = 50;
const MESSAGE_PAGE_SIZE = 500;
const MAX_MESSAGE_PAGES = 3;

function toDgMessage(raw: unknown): DgMessage | null {
  const m = asRecord(raw);
  const id = asString(m.id);
  if (!id) return null;
  const messageType = asString(m.messageType);
  if (messageType.startsWith("TYPE_ACTIVITY")) return null;
  return {
    id,
    conversationId: asString(m.conversationId),
    body: asString(m.body),
    direction: asString(m.direction),
    messageType: messageType || asString(m.type),
    dateAdded: asString(m.dateAdded),
  };
}

function toDgConversation(raw: unknown): DgConversation {
  const c = asRecord(raw);
  return {
    id: asString(c.id),
    contactId: asString(c.contactId),
    name: asString(c.fullName) || asString(c.contactName),
    email: asString(c.email),
    phone: asString(c.phone),
    lastMessageBody: asString(c.lastMessageBody),
    messages: [],
  };
}

async function fetchMessagePage(
  token: string,
  locationId: string,
  channel: string | null,
  cursor: string,
): Promise<{ messages: DgMessage[]; nextCursor: string }> {
  const params: Record<string, string> = {
    locationId,
    limit: String(MESSAGE_PAGE_SIZE),
    sortBy: "createdAt",
    sortOrder: "desc",
  };
  if (channel) params.channel = channel;
  if (cursor) params.cursor = cursor;
  const res = asRecord(
    await ghlGet("/conversations/messages/export", token, ["2021-04-15", "v3"], params),
  );
  const messages: DgMessage[] = [];
  for (const raw of asArray(res.messages)) {
    const msg = toDgMessage(raw);
    if (msg) messages.push(msg);
  }
  return { messages, nextCursor: asString(res.nextCursor) };
}

export async function fetchDgPayload(token: string, explicitLocation: string): Promise<DgPayload> {
  const locationId = await resolveLocationId(token, explicitLocation);

  const convRes = asRecord(
    await ghlGet("/conversations/search", token, ["2021-04-15", "v3"], {
      locationId,
      limit: String(MAX_CONVERSATIONS),
      sortBy: "last_message_date",
      sort: "desc",
    }),
  );
  const conversations = asArray(convRes.conversations)
    .map(toDgConversation)
    .filter((c) => c.id);
  const byId = new Map(conversations.map((c) => [c.id, c]));

  const collected: DgMessage[] = [];
  let cursor = "";
  for (let page = 0; page < MAX_MESSAGE_PAGES; page++) {
    const result = await fetchMessagePage(token, locationId, null, cursor);
    collected.push(...result.messages);
    cursor = result.nextCursor;
    if (!cursor) break;
  }
  const emailPage = await fetchMessagePage(token, locationId, "Email", "");
  collected.push(...emailPage.messages);

  let joined = 0;
  for (const msg of collected) {
    const conv = byId.get(msg.conversationId);
    if (!conv) continue;
    conv.messages.push(msg);
    joined += 1;
  }
  for (const conv of byId.values()) {
    conv.messages.sort((a, b) => a.dateAdded.localeCompare(b.dateAdded));
  }

  return {
    locationId,
    fetchedAt: new Date().toISOString(),
    conversations: [...byId.values()],
    totals: { conversations: conversations.length, messages: joined },
  };
}

export function isDgConfigured(): boolean {
  return typeof process.env.DISPOGENIUS_PIT_TOKEN === "string" && process.env.DISPOGENIUS_PIT_TOKEN.length > 0;
}
