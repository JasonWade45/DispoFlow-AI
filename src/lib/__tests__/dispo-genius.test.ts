import { describe, expect, it } from "vitest";
import {
  buildInteractionsFromDg,
  dgDirection,
  ensureBuyersFromConversations,
  findBuyerForConversation,
  inferPropertyForBuyer,
  mapDgEventType,
  relinkDgInteractions,
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

function interaction(overrides: Partial<Interaction> = {}): Interaction {
  return {
    id: "i_dg_m1",
    orgId: "org_1",
    buyerId: null,
    propertyId: null,
    eventType: "Incoming SMS",
    direction: "in",
    occurredAt: "2026-10-15T12:00:00.000Z",
    recordedAt: "2026-10-15T12:00:00.000Z",
    originalContent: "hello",
    enhancedNotes: "",
    outcome: "",
    potentialOfferAmount: null,
    potentialOfferConfirmed: false,
    nextAction: "",
    missingInfo: [],
    isAiSuggestion: false,
    createdBy: "u_owner",
    createdAt: "2026-10-15T12:00:00.000Z",
    updatedAt: "2026-10-15T12:00:00.000Z",
    ...overrides,
  };
}

describe("inferPropertyForBuyer", () => {
  const base = {
    buyers: [buyer()],
    relationships: [{ id: "r_1", buyerId: "b_1", propertyId: "p_1" }],
    properties: [{ id: "p_1", address: "123 Main St" }],
  } as unknown as DB;

  it("assigns the buyer's only linked property", () => {
    expect(inferPropertyForBuyer(base, "b_1", "anything at all")).toBe("p_1");
  });

  it("returns null without a buyer or any relationship", () => {
    expect(inferPropertyForBuyer(base, null, "hello")).toBeNull();
    expect(inferPropertyForBuyer(base, "b_missing", "hello")).toBeNull();
    const noRel = { buyers: [buyer()], relationships: [], properties: [] } as unknown as DB;
    expect(inferPropertyForBuyer(noRel, "b_1", "hello")).toBeNull();
  });

  it("with several links matches only when the body mentions the address", () => {
    const multi = {
      buyers: [buyer()],
      relationships: [
        { id: "r_1", buyerId: "b_1", propertyId: "p_1" },
        { id: "r_2", buyerId: "b_1", propertyId: "p_2" },
      ],
      properties: [
        { id: "p_1", address: "123 Main St" },
        { id: "p_2", address: "456 Oak Ave" },
      ],
    } as unknown as DB;
    expect(inferPropertyForBuyer(multi, "b_1", "Is 456 OAK AVE still available?")).toBe("p_2");
    expect(inferPropertyForBuyer(multi, "b_1", "just checking in")).toBeNull();
  });
});

describe("buildInteractionsFromDg property attribution", () => {
  const now = "2026-10-15T12:00:00.000Z";

  it("links messages to the buyer's only related property", () => {
    const b = buyer();
    const db = {
      ...makeDb([b]),
      relationships: [{ id: "r_1", buyerId: b.id, propertyId: "p_1" }],
      properties: [{ id: "p_1", address: "123 Main St" }],
    } as unknown as DB;
    const p = payload([
      conv({
        messages: [
          { id: "m1", conversationId: "c_1", body: "hi", direction: "inbound", messageType: "TYPE_SMS", dateAdded: now },
        ],
      }),
    ]);

    const { interactions } = buildInteractionsFromDg(p, db, "u_owner", now);
    expect(interactions[0].buyerId).toBe(b.id);
    expect(interactions[0].propertyId).toBe("p_1");
  });

  it("keeps propertyId null when the buyer has no relationships", () => {
    const b = buyer();
    const p = payload([
      conv({
        messages: [
          { id: "m1", conversationId: "c_1", body: "hi", direction: "inbound", messageType: "TYPE_SMS", dateAdded: now },
        ],
      }),
    ]);

    const { interactions } = buildInteractionsFromDg(p, makeDb([b]), "u_owner", now);
    expect(interactions[0].propertyId).toBeNull();
  });
});

describe("relinkDgInteractions", () => {
  const now = "2026-10-15T12:00:00.000Z";

  function linkedDb(orphan: Interaction): DB {
    return {
      buyers: [buyer()],
      interactions: [orphan],
      relationships: [{ id: "r_1", buyerId: "b_1", propertyId: "p_1" }],
      properties: [{ id: "p_1", address: "123 Main St" }],
    } as unknown as DB;
  }

  function payloadFor(msgId: string): DgPayload {
    return payload([
      conv({
        messages: [
          { id: msgId, conversationId: "c_1", body: "hey", direction: "inbound", messageType: "TYPE_SMS", dateAdded: now },
        ],
      }),
    ]);
  }

  it("attaches orphaned imported messages to the matching buyer and property", () => {
    const orphan = interaction();
    const db = linkedDb(orphan);
    const r = relinkDgInteractions(db, payloadFor("m1"));

    expect(r.relinked).toBe(1);
    expect(r.interactions[0].buyerId).toBe("b_1");
    expect(r.interactions[0].propertyId).toBe("p_1");
    expect(r.interactions[0].id).toBe("i_dg_m1");
    expect(db.interactions[0].buyerId).toBeNull(); // input not mutated
  });

  it("leaves fully linked and non-DG interactions untouched", () => {
    const done = interaction({ buyerId: "b_1", propertyId: "p_1" });
    const other = interaction({ id: "i_manual_1" });
    const db = linkedDb(done);
    db.interactions = [done, other];

    const r = relinkDgInteractions(db, payloadFor("m1"));
    expect(r.relinked).toBe(0);
    expect(r.interactions).toHaveLength(0);
  });

  it("skips messages that are no longer in the payload", () => {
    const orphan = interaction({ id: "i_dg_m99" });
    const r = relinkDgInteractions(linkedDb(orphan), payloadFor("m1"));
    expect(r.relinked).toBe(0);
  });

  it("falls back to the conversation match when the old buyer id is gone", () => {
    const orphan = interaction({ buyerId: "b_gone" });
    const db = linkedDb(orphan);
    const r = relinkDgInteractions(db, payloadFor("m1"));
    // old buyer id no longer exists → falls back to the conversation match
    expect(r.relinked).toBe(1);
    expect(r.interactions[0].buyerId).toBe("b_1");
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

describe("ensureBuyersFromConversations", () => {
  const NOW = "2026-10-16T12:00:00.000Z";

  it("creates a buyer for an unmatched conversation", () => {
    const db = makeDb([], []);
    const p = payload([conv({ id: "c_9", phone: "+15559998888", name: "Bob Ray", email: "bob@example.com" })]);
    const result = ensureBuyersFromConversations(db, p, "u_owner", NOW);
    expect(result.created).toBe(1);
    expect(result.db.buyers).toHaveLength(1);
    expect(result.db.buyers[0].fullName).toBe("Bob Ray");
    expect(result.db.buyers[0].phone).toBe("+15559998888");
    expect(result.db.buyers[0].status).toBe("Active");
  });

  it("does not create a buyer when phone already matches", () => {
    const db = makeDb([buyer({ phone: "(555) 123-4567" })], []);
    const p = payload([conv({ phone: "+15551234567" })]);
    const result = ensureBuyersFromConversations(db, p, "u_owner", NOW);
    expect(result.created).toBe(0);
    expect(result.db.buyers).toHaveLength(1);
  });

  it("does not create a buyer when email matches", () => {
    const db = makeDb([buyer({ phone: "" })], []);
    const p = payload([conv({ phone: "", email: "jane@example.com" })]);
    const result = ensureBuyersFromConversations(db, p, "u_owner", NOW);
    expect(result.created).toBe(0);
  });

  it("does not create a buyer when name matches", () => {
    const db = makeDb([buyer({ phone: "", email: "" })], []);
    const p = payload([conv({ phone: "", email: "", name: "Jane Roe" })]);
    const result = ensureBuyersFromConversations(db, p, "u_owner", NOW);
    expect(result.created).toBe(0);
  });

  it("skips conversations with no identity at all", () => {
    const db = makeDb([], []);
    const p = payload([conv({ phone: "", email: "", name: "" })]);
    const result = ensureBuyersFromConversations(db, p, "u_owner", NOW);
    expect(result.created).toBe(0);
  });

  it("creates only one buyer for two conversations with the same phone", () => {
    const db = makeDb([], []);
    const p = payload([
      conv({ id: "c_1", phone: "+15551234567", name: "Jane Roe" }),
      conv({ id: "c_2", phone: "+15551234567", name: "Jane Roe" }),
    ]);
    const result = ensureBuyersFromConversations(db, p, "u_owner", NOW);
    expect(result.created).toBe(1);
  });

  it("does not mutate the input db", () => {
    const db = makeDb([], []);
    const p = payload([conv({ phone: "+15559998888", name: "Bob Ray" })]);
    ensureBuyersFromConversations(db, p, "u_owner", NOW);
    expect(db.buyers).toHaveLength(0);
  });

  it("uses the phone as a fallback display name when there is no name", () => {
    const db = makeDb([], []);
    const p = payload([conv({ phone: "+15559998888", name: "", email: "" })]);
    const result = ensureBuyersFromConversations(db, p, "u_owner", NOW);
    expect(result.db.buyers[0].fullName).toBe("+15559998888");
  });
});
