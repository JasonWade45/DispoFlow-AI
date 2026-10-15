import { NextRequest, NextResponse } from "next/server";
import type { DgConversation, DgMessage, DgPayload } from "@/lib/dispo-genius";
import {
  GhlError,
  asArray,
  asRecord,
  asString,
  ghlGet,
  resolveLocationId,
} from "@/lib/dispo-genius-server";

export const maxDuration = 60;

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

export async function GET(request: NextRequest) {
  const token = process.env.DISPOGENIUS_PIT_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        configured: false,
        error: "DispoGenius token is not configured. Set the DISPOGENIUS_PIT_TOKEN env var.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const check = url.searchParams.get("check") === "1";
  const explicitLocation =
    url.searchParams.get("locationId") || process.env.DISPOGENIUS_LOCATION_ID || "";

  try {
    const locationId = await resolveLocationId(token, explicitLocation);
    if (check) return NextResponse.json({ configured: true, locationId });

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

    const payload: DgPayload = {
      locationId,
      fetchedAt: new Date().toISOString(),
      conversations: [...byId.values()],
      totals: { conversations: conversations.length, messages: joined },
    };
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach DispoGenius";
    console.error("DispoGenius conversations error:", error);
    const status =
      error instanceof GhlError && error.status >= 400 && error.status < 600 ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
