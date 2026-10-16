import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_TASK_TYPE,
  buyerInteractions,
  formatDailySyncSummary,
  needsFollowUp,
  runDailySync,
} from "@/lib/daily-sync";
import type { DgConversation, DgMessage, DgPayload } from "@/lib/dispo-genius";
import type { Buyer, BuyerProperty, DB, Interaction, Property } from "@/types";

const NOW = "2026-10-16T12:00:00.000Z";

function makeBuyer(id: string, phone: string, name: string): Buyer {
  return {
    id,
    orgId: "org_1",
    fullName: name,
    companyName: "",
    phone,
    email: `${id}@example.com`,
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
  };
}

function makeProperty(id: string): Property {
  return {
    id,
    orgId: "org_1",
    title: `Property ${id}`,
    addressLine: "1 Main St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    country: "USA",
    propertyType: "Single Family",
    bedrooms: 3,
    bathrooms: 2,
    squareFeet: 1800,
    lotSize: null,
    yearBuilt: 2000,
    condition: "Good",
    description: "",
    askingPrice: 400000,
    arv: null,
    rentEstimate: null,
    images: [],
    features: [],
    status: "Active",
    listedAt: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdBy: "u_owner",
  } as unknown as Property;
}

function makeRelationship(id: string, buyerId: string, propertyId: string): BuyerProperty {
  return {
    id,
    orgId: "org_1",
    buyerId,
    propertyId,
    interestStatus: "Exploring",
    interestNotes: "",
    firstContactDate: null,
    lastInteractionDate: null,
    nextFollowUpDate: null,
    nextAction: "",
    assignedUserId: "u_owner",
    relationshipStatus: "Active",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastContactedAt: null,
    lastMessageSentAt: null,
    lastCallAt: null,
    syncStatus: "Not Started",
    sourceRowId: "",
  } as unknown as BuyerProperty;
}

function makeInteraction(
  id: string,
  buyerId: string,
  direction: "in" | "out",
  occurredAt: string,
  content = "hello",
): Interaction {
  return {
    id,
    orgId: "org_1",
    buyerId,
    propertyId: null,
    eventType: direction === "in" ? "Incoming SMS" : "Outgoing SMS",
    direction,
    occurredAt,
    recordedAt: occurredAt,
    originalContent: content,
    enhancedNotes: "",
    outcome: "",
    potentialOfferAmount: null,
    potentialOfferConfirmed: false,
    nextAction: "",
    missingInfo: [],
    isAiSuggestion: false,
    createdBy: "u_owner",
    createdAt: occurredAt,
    updatedAt: occurredAt,
  };
}

function makeDb(): DB {
  return {
    organization: { id: "org_1" },
    buyers: [makeBuyer("b_1", "5551234567", "Jane Roe"), makeBuyer("b_2", "5559876543", "John Doe")],
    properties: [makeProperty("p_1")],
    relationships: [makeRelationship("r_1", "b_1", "p_1")],
    interactions: [],
    offers: [],
    tasks: [],
    activity: [],
    users: [],
  } as unknown as DB;
}

function msg(id: string, conversationId: string, body: string, direction: string, messageType = "SMS", dateAdded = NOW): DgMessage {
  return { id, conversationId, body, direction, messageType, dateAdded };
}

function conv(id: string, contactId: string, phone: string, messages: DgMessage[], overrides: Partial<DgConversation> = {}): DgConversation {
  return {
    id,
    contactId,
    name: "Jane Roe",
    email: "b_1@example.com",
    phone,
    lastMessageBody: messages[messages.length - 1]?.body ?? "",
    messages,
    ...overrides,
  };
}

function payload(conversations: DgConversation[]): DgPayload {
  return {
    locationId: "loc_1",
    fetchedAt: NOW,
    conversations,
    totals: {
      conversations: conversations.length,
      messages: conversations.reduce((n, c) => n + c.messages.length, 0),
    },
  };
}

describe("buyerInteractions", () => {
  it("returns in/out interactions newest first, ignoring property", () => {
    const db = makeDb();
    db.interactions = [
      makeInteraction("i1", "b_1", "out", "2026-10-14T00:00:00.000Z"),
      makeInteraction("i2", "b_1", "in", "2026-10-15T00:00:00.000Z"),
      makeInteraction("i3", "b_1", "in", "2026-10-13T00:00:00.000Z"),
      makeInteraction("i4", "b_2", "in", "2026-10-15T00:00:00.000Z"),
    ];
    const result = buyerInteractions(db, "b_1");
    expect(result.map((i) => i.id)).toEqual(["i2", "i1", "i3"]);
  });
});

describe("needsFollowUp", () => {
  it("true when last message is inbound", () => {
    const db = makeDb();
    db.interactions = [
      makeInteraction("i1", "b_1", "out", "2026-10-14T00:00:00.000Z"),
      makeInteraction("i2", "b_1", "in", "2026-10-15T00:00:00.000Z"),
    ];
    expect(needsFollowUp(db, "b_1")).toBe(true);
  });

  it("false when last message is outbound", () => {
    const db = makeDb();
    db.interactions = [
      makeInteraction("i1", "b_1", "in", "2026-10-14T00:00:00.000Z"),
      makeInteraction("i2", "b_1", "out", "2026-10-15T00:00:00.000Z"),
    ];
    expect(needsFollowUp(db, "b_1")).toBe(false);
  });

  it("false when no interactions", () => {
    expect(needsFollowUp(makeDb(), "b_1")).toBe(false);
  });
});

describe("runDailySync", () => {
  it("imports DG messages as interactions", async () => {
    const db = makeDb();
    const p = payload([
      conv("c_1", "ct_1", "+15551234567", [
        msg("m_1", "c_1", "interested in the property", "inbound"),
      ]),
    ]);
    const { db: nextDb, result } = await runDailySync(db, p, "u_owner", NOW, { useAi: false });
    expect(result.imported).toBe(1);
    expect(nextDb.interactions).toHaveLength(1);
    expect(nextDb.interactions[0].id).toBe("i_dg_m_1");
    expect(nextDb.interactions[0].buyerId).toBe("b_1");
  });

  it("creates a draft task when last message is inbound and buyer has a relationship", async () => {
    const db = makeDb();
    const p = payload([
      conv("c_1", "ct_1", "+15551234567", [
        msg("m_1", "c_1", "interested in the property", "inbound"),
      ]),
    ]);
    const { db: nextDb, result } = await runDailySync(db, p, "u_owner", NOW, { useAi: false });
    expect(result.draftsCreated).toBe(1);
    const draft = nextDb.tasks.find((t) => t.taskType === FOLLOW_UP_TASK_TYPE);
    expect(draft).toBeDefined();
    expect(draft?.buyerId).toBe("b_1");
    expect(draft?.propertyId).toBe("p_1");
    expect(draft?.status).toBe("Needs Scheduling");
    expect(draft?.description).toContain("Follow-up draft:");
  });

  it("does not create a draft when last message is outbound (we already replied)", async () => {
    const db = makeDb();
    const p = payload([
      conv("c_1", "ct_1", "+15551234567", [
        msg("m_1", "c_1", "interested", "inbound", "SMS", "2026-10-14T00:00:00.000Z"),
        msg("m_2", "c_1", "sounds good", "outbound", "SMS", "2026-10-15T00:00:00.000Z"),
      ]),
    ]);
    const { result } = await runDailySync(db, p, "u_owner", NOW, { useAi: false });
    expect(result.draftsCreated).toBe(0);
  });

  it("skips a buyer that already has an open draft task", async () => {
    const db = makeDb();
    db.tasks = [
      {
        id: "t_existing",
        orgId: "org_1",
        buyerId: "b_1",
        propertyId: "p_1",
        relatedInteractionId: null,
        taskType: FOLLOW_UP_TASK_TYPE,
        description: "existing draft",
        dueDate: "2026-10-16",
        dueTime: null,
        assignedUserId: "u_owner",
        priority: "Medium",
        status: "Needs Scheduling",
        completionNotes: "",
        createdAt: NOW,
        completedAt: null,
        completedVia: null,
        sentAt: null,
      },
    ];
    const p = payload([
      conv("c_1", "ct_1", "+15551234567", [
        msg("m_1", "c_1", "interested", "inbound"),
      ]),
    ]);
    const { db: nextDb, result } = await runDailySync(db, p, "u_owner", NOW, { useAi: false });
    expect(result.draftsCreated).toBe(0);
    expect(result.draftsSkipped).toBe(1);
    expect(nextDb.tasks.filter((t) => t.taskType === FOLLOW_UP_TASK_TYPE)).toHaveLength(1);
  });

  it("skips a buyer with no relationship (no property context)", async () => {
    const db = makeDb();
    db.relationships = [];
    const p = payload([
      conv("c_1", "ct_1", "+15551234567", [
        msg("m_1", "c_1", "interested", "inbound"),
      ]),
    ]);
    const { result } = await runDailySync(db, p, "u_owner", NOW, { useAi: false });
    expect(result.draftsCreated).toBe(0);
    expect(result.draftsSkipped).toBe(1);
  });

  it("respects maxDrafts cap", async () => {
    const db = makeDb();
    // Three buyers, all inbound, all with relationships.
    db.buyers.push(makeBuyer("b_3", "5551112222", "Ann Smith"), makeBuyer("b_4", "5553334444", "Bob Lee"));
    db.relationships.push(
      makeRelationship("r_2", "b_3", "p_1"),
      makeRelationship("r_3", "b_4", "p_1"),
    );
    const p = payload([
      conv("c_1", "ct_1", "+15551234567", [msg("m_1", "c_1", "hi", "inbound")], { name: "Jane Roe", email: "b_1@example.com" }),
      conv("c_2", "ct_2", "+15559876543", [msg("m_2", "c_2", "hi", "inbound")], { name: "John Doe", email: "b_2@example.com" }),
      conv("c_3", "ct_3", "+15551112222", [msg("m_3", "c_3", "hi", "inbound")], { name: "Ann Smith", email: "b_3@example.com" }),
      conv("c_4", "ct_4", "+15553334444", [msg("m_4", "c_4", "hi", "inbound")], { name: "Bob Lee", email: "b_4@example.com" }),
    ]);
    const { result } = await runDailySync(db, p, "u_owner", NOW, { useAi: false, maxDrafts: 2 });
    expect(result.draftsCreated).toBe(2);
  });

  it("does not mutate the input db", async () => {
    const db = makeDb();
    const p = payload([
      conv("c_1", "ct_1", "+15551234567", [msg("m_1", "c_1", "interested", "inbound")]),
    ]);
    const originalInteractions = db.interactions.length;
    const originalTasks = db.tasks.length;
    await runDailySync(db, p, "u_owner", NOW, { useAi: false });
    expect(db.interactions).toHaveLength(originalInteractions);
    expect(db.tasks).toHaveLength(originalTasks);
  });

  it("skips already-imported messages (dedup by interaction id)", async () => {
    const db = makeDb();
    db.interactions = [makeInteraction("i_dg_m_1", "b_1", "in", "2026-10-15T00:00:00.000Z")];
    const p = payload([
      conv("c_1", "ct_1", "+15551234567", [msg("m_1", "c_1", "interested", "inbound")]),
    ]);
    const { result } = await runDailySync(db, p, "u_owner", NOW, { useAi: false });
    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });
});

describe("formatDailySyncSummary", () => {
  it("formats with correct pluralization", () => {
    expect(
      formatDailySyncSummary({
        imported: 1,
        draftsCreated: 1,
        buyersCreated: 0,
        skipped: 0,
        matched: 0,
        unmatched: 0,
        conversations: 1,
        draftsSkipped: 0,
        relinked: 0,
      }),
    ).toBe("1 new message · 1 follow-up draft");
    expect(
      formatDailySyncSummary({
        imported: 5,
        draftsCreated: 2,
        buyersCreated: 3,
        skipped: 0,
        matched: 0,
        unmatched: 0,
        conversations: 5,
        draftsSkipped: 0,
        relinked: 0,
      }),
    ).toBe("5 new messages · 2 follow-up drafts · 3 new buyers");
  });

  it("mentions relinked messages when present", () => {
    expect(
      formatDailySyncSummary({
        imported: 0,
        draftsCreated: 1,
        buyersCreated: 2,
        skipped: 10,
        matched: 4,
        unmatched: 0,
        conversations: 4,
        draftsSkipped: 0,
        relinked: 7,
      }),
    ).toBe("0 new messages · 1 follow-up draft · 2 new buyers · 7 old messages relinked");
  });
});

describe("runDailySync buyer creation", () => {
  it("creates buyers for unmatched conversations and links their interactions", async () => {
    const db = makeDb();
    db.buyers = []; // no buyers at all — like the live system
    const p = payload([
      conv("c_1", "ct_1", "+15551234567", [
        msg("m_1", "c_1", "interested in the property", "inbound"),
      ]),
    ]);
    const { db: nextDb, result } = await runDailySync(db, p, "u_owner", NOW, { useAi: false });
    expect(result.buyersCreated).toBe(1);
    expect(result.matched).toBe(1);
    expect(nextDb.buyers).toHaveLength(1);
    expect(nextDb.buyers[0].phone).toBe("+15551234567");
    expect(nextDb.interactions[0].buyerId).toBe(nextDb.buyers[0].id);
  });

  it("does not create a buyer when one already matches by phone", async () => {
    const db = makeDb();
    const p = payload([
      conv("c_1", "ct_1", "+15551234567", [msg("m_1", "c_1", "hi", "inbound")]),
    ]);
    const { result } = await runDailySync(db, p, "u_owner", NOW, { useAi: false });
    expect(result.buyersCreated).toBe(0);
  });
});
