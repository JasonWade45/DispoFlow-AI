import { describe, expect, it } from "vitest";
import {
  buildInteractionsFromDg,
  dgDirection,
  findBuyerForConversation,
  mapDgEventType,
  validateDgSend,
  type DgConversation,
  type DgPayload,
} from "@/lib/dispo-genius";
import type { Buyer, DB, Interaction } from "@/types";

function buyer(overrides: Partial<Buyer> = {}): Buyer {
  return {
    id: "b_1",
    orgId: "org_1",
    fullName: "Jane Roe",
    companyName: "",
    phone: "(555) 123-4567",
    email: "jane@example.com",
    preferredContactMethod: "",
    preferredMarkets: [],
    propertyTypes: [],
    budgetMin: null,
    budgetMax: null,
    status: "Active",
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdBy: "u_owner",
    ...overrides,
  };
}

function makeDb(buyers: Buyer[], interactions: Interaction[] = []): DB {
  return {
    organization: { id: "org_1" },
    buyers,
    interactions,
  } as unknown as DB;
}

function conv(overrides: Partial<DgConversation> = {}): DgConversation {
  return {
    id: "c_1",
    contactId: "ct_1",
    name: "Jane Roe",
    email: "jane@example.com",
    phone: "+15551234567",
    lastMessageBody: "hey",
    messages: [],
    ...overrides,
  };
}

function payload(conversations: DgConversation[]): DgPayload {
  return {
    locationId: "loc_1",
    fetchedAt: "2026-10-15T00:00:00.000Z",
    conversations,
    totals: { conversations: conversations.length, messages: conversations.reduce((n, c) => n + c.messages.length, 0) },
  };
}

describe("dgDirection", () => {
  it("maps raw directions", () => {
    expect(dgDirection("inbound")).toBe("in");
    expect(dgDirection("outbound")).toBe("out");
    expect(dgDirection("internal")).toBe("internal");
    expect(dgDirection("something")).toBe("system");
    expect(dgDirection(undefined)).toBe("system");
  });
});

describe("mapDgEventType", () => {
  it("maps SMS in both directions", () => {
    expect(mapDgEventType("TYPE_SMS", "inbound")).toBe("Incoming SMS");
    expect(mapDgEventType("SMS", "outbound")).toBe("Outgoing SMS");
  });

  it("maps email in both directions", () => {
    expect(mapDgEventType("TYPE_EMAIL", "inbound")).toBe("Incoming Email");
    expect(mapDgEventType("TYPE_CAMPAIGN_EMAIL", "outbound")).toBe("Outgoing Email");
  });

  it("maps calls, voicemail and internal comments", () => {
    expect(mapDgEventType("TYPE_CALL", "inbound")).toBe("Phone Call");
    expect(mapDgEventType("TYPE_CAMPAIGN_VOICEMAIL", "outbound")).toBe("Voicemail");
    expect(mapDgEventType("TYPE_INTERNAL_COMMENT", "inbound")).toBe("Internal Note");
  });

  it("treats whatsapp as messaging", () => {
    expect(mapDgEventType("TYPE_WHATSAPP", "inbound")).toBe("Incoming SMS");
    expect(mapDgEventType("TYPE_INSTAGRAM", "outbound")).toBe("Outgoing SMS");
  });

  it("falls back to Other Interaction", () => {
    expect(mapDgEventType("TYPE_FORM_SUBMISSION", "inbound")).toBe("Other Interaction");
    expect(mapDgEventType("", "inbound")).toBe("Other Interaction");
  });
});

describe("findBuyerForConversation", () => {
  it("matches by phone despite formatting differences", () => {
    const b = buyer({ phone: "555-123-4567" });
    expect(findBuyerForConversation([b], conv({ phone: "+1 (555) 123-4567", email: "", name: "" }))).toBe(b);
  });

  it("matches by email case-insensitively when phone does not match", () => {
    const b = buyer({ phone: "", email: "Jane@Example.com" });
    expect(findBuyerForConversation([b], conv({ phone: "9998887777", email: "jane@example.com", name: "" }))).toBe(b);
  });

  it("matches by exact name as a last resort", () => {
    const b = buyer({ phone: "", email: "", fullName: "John Doe" });
    expect(findBuyerForConversation([b], conv({ phone: "", email: "", name: "john doe" }))).toBe(b);
  });

  it("returns undefined when nothing matches", () => {
    const b = buyer();
    expect(findBuyerForConversation([b], conv({ phone: "9998887777", email: "x@y.com", name: "Ali Hassan" }))).toBeUndefined();
  });
});

describe("buildInteractionsFromDg", () => {
  const now = "2026-10-15T12:00:00.000Z";

  it("creates interactions with deterministic ids and buyer link", () => {
    const b = buyer();
    const db = makeDb([b]);
    const p = payload([
      conv({
        messages: [
          { id: "m1", conversationId: "c_1", body: "hello", direction: "inbound", messageType: "TYPE_SMS", dateAdded: "2026-10-14T10:00:00.000Z" },
          { id: "m2", conversationId: "c_1", body: "calling you", direction: "outbound", messageType: "TYPE_CALL", dateAdded: "2026-10-14T11:00:00.000Z" },
        ],
      }),
    ]);

    const { interactions, summary } = buildInteractionsFromDg(p, db, "u_owner", now);
    expect(interactions).toHaveLength(2);
    expect(interactions.map((i) => i.id)).toEqual(["i_dg_m1", "i_dg_m2"]);
    expect(interactions[0].eventType).toBe("Incoming SMS");
    expect(interactions[0].direction).toBe("in");
    expect(interactions[0].buyerId).toBe(b.id);
    expect(interactions[1].eventType).toBe("Phone Call");
    expect(interactions[1].direction).toBe("out");
    expect(interactions[0].orgId).toBe("org_1");
    expect(interactions[0].createdBy).toBe("u_owner");
    expect(interactions[0].occurredAt).toBe("2026-10-14T10:00:00.000Z");
    expect(summary).toMatchObject({ conversations: 1, imported: 2, skipped: 0, matched: 1, unmatched: 0 });
  });

  it("skips messages already imported on a re-run", () => {
    const b = buyer();
    const p = payload([
      conv({
        messages: [
          { id: "m1", conversationId: "c_1", body: "hello", direction: "inbound", messageType: "TYPE_SMS", dateAdded: "2026-10-14T10:00:00.000Z" },
        ],
      }),
    ]);
    const first = buildInteractionsFromDg(p, makeDb([b]), "u_owner", now);
    const db2 = makeDb([b], first.interactions);
    const second = buildInteractionsFromDg(p, db2, "u_owner", now);
    expect(second.interactions).toHaveLength(0);
    expect(second.summary.imported).toBe(0);
    expect(second.summary.skipped).toBe(1);
  });

  it("imports unmatched conversations with null buyerId", () => {
    const p = payload([
      conv({
        name: "Someone Else",
        phone: "9998887777",
        email: "other@x.com",
        messages: [
          { id: "m9", conversationId: "c_1", body: "hi", direction: "inbound", messageType: "TYPE_SMS", dateAdded: "2026-10-14T10:00:00.000Z" },
        ],
      }),
    ]);
    const { interactions, summary } = buildInteractionsFromDg(p, makeDb([buyer()]), "u_owner", now);
    expect(interactions[0].buyerId).toBeNull();
    expect(summary.matched).toBe(0);
    expect(summary.unmatched).toBe(1);
  });

  it("gives empty call bodies a label and skips empty messages", () => {
    const p = payload([
      conv({
        messages: [
          { id: "m1", conversationId: "c_1", body: "", direction: "outbound", messageType: "TYPE_CALL", dateAdded: "2026-10-14T10:00:00.000Z" },
          { id: "m2", conversationId: "c_1", body: "   ", direction: "inbound", messageType: "TYPE_SMS", dateAdded: "2026-10-14T11:00:00.000Z" },
        ],
      }),
    ]);
    const { interactions, summary } = buildInteractionsFromDg(p, makeDb([buyer()]), "u_owner", now);
    expect(interactions).toHaveLength(1);
    expect(interactions[0].originalContent).toBe("Phone call");
    expect(summary.imported).toBe(1);
    expect(summary.skipped).toBe(0);
  });

  it("falls back to now when dateAdded is invalid", () => {
    const p = payload([
      conv({
        messages: [
          { id: "m1", conversationId: "c_1", body: "hi", direction: "inbound", messageType: "TYPE_SMS", dateAdded: "not-a-date" },
        ],
      }),
    ]);
    const { interactions } = buildInteractionsFromDg(p, makeDb([buyer()]), "u_owner", now);
    expect(interactions[0].occurredAt).toBe(now);
  });

  it("returns interactions sorted by occurredAt", () => {
    const p = payload([
      conv({
        messages: [
          { id: "m2", conversationId: "c_1", body: "second", direction: "inbound", messageType: "TYPE_SMS", dateAdded: "2026-10-14T11:00:00.000Z" },
          { id: "m1", conversationId: "c_1", body: "first", direction: "inbound", messageType: "TYPE_SMS", dateAdded: "2026-10-14T10:00:00.000Z" },
        ],
      }),
    ]);
    const { interactions } = buildInteractionsFromDg(p, makeDb([buyer()]), "u_owner", now);
    expect(interactions.map((i) => i.originalContent)).toEqual(["first", "second"]);
  });

  it("dedupes the same message id across conversations", () => {
    const msg = { id: "m1", conversationId: "c_1", body: "hello", direction: "inbound", messageType: "TYPE_SMS", dateAdded: "2026-10-14T10:00:00.000Z" };
    const p = payload([conv({ id: "c_1", messages: [msg] }), conv({ id: "c_2", messages: [msg] })]);
    const { interactions, summary } = buildInteractionsFromDg(p, makeDb([buyer()]), "u_owner", now);
    expect(interactions).toHaveLength(1);
    expect(summary.imported).toBe(1);
    expect(summary.skipped).toBe(1);
  });
});

describe("validateDgSend", () => {
  it("accepts a valid phone and message, keeping name/email optional", () => {
    const result = validateDgSend({
      phone: "(555) 123-4567",
      message: "  Still interested in selling?  ",
      name: "Jane Roe",
      email: "jane@example.com",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.phone).toBe("(555) 123-4567");
      expect(result.value.message).toBe("Still interested in selling?");
      expect(result.value.name).toBe("Jane Roe");
      expect(result.value.email).toBe("jane@example.com");
    }
  });

  it("accepts missing name and email", () => {
    const result = validateDgSend({ phone: "+1 555 123 4567", message: "hi" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.name).toBe("");
      expect(result.value.email).toBe("");
    }
  });

  it("rejects an empty body", () => {
    const result = validateDgSend(null);
    expect(result.ok).toBe(false);
  });

  it("rejects a missing message", () => {
    const result = validateDgSend({ phone: "5551234567", message: "   " });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.error).toContain("message");
  });

  it("rejects a missing or too-short phone", () => {
    const result = validateDgSend({ phone: "12345", message: "hello" });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.error).toContain("phone");
  });

  it("rejects an over-long message", () => {
    const result = validateDgSend({ phone: "5551234567", message: "x".repeat(1601) });
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.error).toContain("too long");
  });
});
