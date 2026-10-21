import { describe, expect, it } from "vitest";
import {
  createRepository,
  type CoreWorkspace,
  type RepoTransport,
} from "@/lib/server/repository";
import type {
  AccessInfoEntry,
  Buyer,
  BuyerProperty,
  Interaction,
  Offer,
  Property,
  Task,
} from "@/types";

// --- fake transport ---------------------------------------------------------

interface FakeTransport extends RepoTransport {
  selects: string[];
  selectWorkspaces: Array<string | undefined>;
  upserts: { table: string; rows: unknown[] }[];
  listKeysCalls: string[];
  removes: { table: string; ids: string[] }[];
  failSelect: string | null;
  failUpsert: string | null;
  failListKeys: string | null;
}

function fakeTransport(seed: Partial<Record<string, unknown[]>> = {}): FakeTransport {
  return {
    selects: [],
    selectWorkspaces: [],
    upserts: [],
    listKeysCalls: [],
    removes: [],
    failSelect: null,
    failUpsert: null,
    failListKeys: null,
    async select(table: string, workspaceId?: string) {
      this.selects.push(table);
      this.selectWorkspaces.push(workspaceId);
      if (table === this.failSelect) return null;
      const rows = seed[table] ?? [];
      if (!workspaceId) return rows;
      return rows.filter(
        (r) => (r as { workspace_id?: string }).workspace_id === workspaceId,
      );
    },
    async listKeys(table: string) {
      this.listKeysCalls.push(table);
      if (table === this.failListKeys) return null;
      return (seed[table] ?? []).map((r) => ({
        id: String((r as { id?: unknown }).id),
        workspace_id: String((r as { workspace_id?: unknown }).workspace_id ?? ""),
      }));
    },
    async remove(table: string, ids: string[]) {
      this.removes.push({ table, ids });
      return true;
    },
    async upsert(table: string, rows: unknown[]) {
      this.upserts.push({ table, rows });
      return table !== this.failUpsert;
    },
  };
}

// --- full entity fixtures ---------------------------------------------------

function makeProperty(overrides: Partial<Property> = {}): Property {
  return {
    id: "p1",
    orgId: "org-7",
    address: "5646 Old Marietta Rd",
    city: "Marietta",
    state: "GA",
    zip: "30318",
    accessInfo: "LOCK BOX 5566",
    status: "Active",
    accessType: "Lockbox",
    askingPrice: 145000,
    arv: 210000,
    estimatedRepairs: 12000,
    assignmentPrice: null,
    marketingStartedAt: "2026-10-01T10:00:00.000Z",
    expectedClosingDate: "2026-11-01",
    notes: "motivated seller",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    createdBy: "u1",
    propertyType: "SFR",
    bedrooms: "3",
    bathrooms: "2",
    sqft: "1450",
    lotSize: "0.25",
    yearBuilt: "1978",
    listingUrl: "https://example.com/p1",
    photosUrl: "",
    photos: ["a.jpg", "b.jpg"],
    sourceWebsite: "zillow",
    sourcePropertyId: "z-123",
    sourceRowId: "row-9",
    firstImportedAt: "2026-08-30T00:00:00.000Z",
    lastSyncedAt: "2026-09-03T00:00:00.000Z",
    syncStatus: "synced",
    ...overrides,
  };
}

function makeBuyer(overrides: Partial<Buyer> = {}): Buyer {
  return {
    id: "b1",
    orgId: "org-7",
    fullName: "Sam Rivera",
    companyName: "Rivera Capital",
    phone: "555-0100",
    email: "sam@example.com",
    preferredContactMethod: "SMS",
    preferredMarkets: ["Atlanta", "Marietta"],
    propertyTypes: ["SFR"],
    budgetMin: 100000,
    budgetMax: 250000,
    status: "Active",
    notes: "cash buyer",
    source: "Referral",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
    createdBy: "u1",
    ...overrides,
  };
}

function makeBuyerProperty(overrides: Partial<BuyerProperty> = {}): BuyerProperty {
  return {
    id: "rel1",
    orgId: "org-7",
    buyerId: "b1",
    propertyId: "p1",
    interestStatus: "Interested",
    interestNotes: "likes it",
    firstContactDate: "2026-09-05",
    lastInteractionDate: null,
    nextFollowUpDate: "2026-10-20",
    nextAction: "call",
    assignedUserId: "u1",
    relationshipStatus: "Active",
    createdAt: "2026-09-05T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    lastContactedAt: "2026-09-06T00:00:00.000Z",
    lastMessageSentAt: null,
    lastCallAt: "2026-09-06T01:00:00.000Z",
    syncStatus: "pending",
    sourceRowId: "row-9",
    ...overrides,
  };
}

function makeInteraction(overrides: Partial<Interaction> = {}): Interaction {
  return {
    id: "i1",
    orgId: "org-7",
    buyerId: "b1",
    propertyId: null,
    eventType: "Phone Call",
    direction: "in",
    occurredAt: "2026-09-06T01:00:00.000Z",
    recordedAt: "2026-09-06T01:05:00.000Z",
    originalContent: "hi there",
    enhancedNotes: "called buyer",
    outcome: "left voicemail",
    potentialOfferAmount: 150000.5,
    potentialOfferConfirmed: false,
    nextAction: "call back",
    missingInfo: ["proof of funds"],
    isAiSuggestion: true,
    createdBy: "u1",
    createdAt: "2026-09-06T01:05:00.000Z",
    updatedAt: "2026-09-06T01:05:00.000Z",
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    orgId: "org-7",
    buyerId: "b1",
    propertyId: "p1",
    relatedInteractionId: "i1",
    taskType: "Follow Up",
    description: "call sam",
    dueDate: "2026-10-20",
    dueTime: "10:00",
    assignedUserId: "u1",
    priority: "High",
    status: "Scheduled",
    completionNotes: "",
    draftMessage: "draft text",
    createdAt: "2026-09-06T00:00:00.000Z",
    completedAt: null,
    completedVia: null,
    sentAt: null,
    ...overrides,
  };
}

function makeOffer(overrides: Partial<Offer> = {}): Offer {
  return {
    id: "o1",
    orgId: "org-7",
    buyerId: "b1",
    propertyId: "p1",
    amount: 140000,
    offerDate: "2026-09-10",
    terms: "cash, 10 day close",
    expiresAt: null,
    status: "Draft",
    negotiationNotes: "",
    nextAction: "submit",
    createdBy: "u1",
    createdAt: "2026-09-10T00:00:00.000Z",
    updatedAt: "2026-09-10T00:00:00.000Z",
    ...overrides,
  };
}

function makeAccessInfo(overrides: Partial<AccessInfoEntry> = {}): AccessInfoEntry {
  return {
    id: "a1",
    orgId: "org-7",
    propertyId: "p1",
    accessCode: "5566",
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
    ...overrides,
  };
}

function makeCore(): CoreWorkspace {
  return {
    properties: [makeProperty()],
    buyers: [makeBuyer()],
    relationships: [makeBuyerProperty()],
    interactions: [makeInteraction()],
    tasks: [makeTask()],
    offers: [makeOffer()],
    access_infoTable: [makeAccessInfo()],
  };
}

// --- load -------------------------------------------------------------------

describe("loadWorkspace", () => {
  it("maps rows from all 7 tables into entities", async () => {
    const t = fakeTransport({
      properties: [
        {
          id: "p1",
          workspace_id: "org-7",
          address: "5646 Old Marietta Rd",
          city: "Marietta",
          state: "GA",
          zip: "30318 LOCK BOX IS 5566",
          access_info: "LOCK BOX 5566",
          status: "Active",
          access_type: "Lockbox",
          asking_price: 145000,
          arv: 210000,
          estimated_repairs: 12000,
          assignment_price: null,
          marketing_started_at: "2026-10-01T10:00:00.000Z",
          expected_closing_date: null,
          notes: "motivated seller",
          created_at: "2026-09-01T00:00:00.000Z",
          created_by: "u1",
          updated_at: "2026-09-02T00:00:00.000Z",
          property_type: "SFR",
          bedrooms: "3",
          bathrooms: "2",
          sqft: "1450",
          lot_size: "0.25",
          year_built: "1978",
          listing_url: "https://example.com/p1",
          photos_url: "",
          photos: ["a.jpg", "b.jpg"],
          source_website: "zillow",
          source_property_id: "z-123",
          source_row_id: "row-9",
          first_imported_at: null,
          last_synced_at: "2026-09-03T00:00:00.000Z",
          sync_status: "synced",
          meta: { legacy: true },
          row_updated_at: "2026-09-04T00:00:00.000Z",
        },
      ],
      buyers: [
        {
          id: "b1",
          workspace_id: "org-7",
          full_name: "Sam Rivera",
          budget_min: 100000,
          preferred_markets: ["Atlanta"],
        },
      ],
      buyer_properties: [
        {
          id: "rel1",
          workspace_id: "org-7",
          buyer_id: "b1",
          property_id: "p1",
          assigned_user_id: null,
          first_contact_date: null,
          sync_status: "synced",
        },
      ],
      interactions: [
        {
          id: "i1",
          workspace_id: "org-7",
          buyer_id: "b1",
          property_id: null,
          event_type: "Phone Call",
          direction: "in",
          potential_offer_amount: 150000.5,
          potential_offer_confirmed: true,
          missing_info: ["proof of funds"],
          is_ai_suggestion: false,
        },
      ],
      tasks: [
        {
          id: "t1",
          workspace_id: "org-7",
          buyer_id: null,
          task_type: "Follow Up",
          priority: "High",
          status: "Scheduled",
          completed_via: "sent",
          draft_message: "draft text",
          due_date: null,
        },
      ],
      offers: [
        {
          id: "o1",
          workspace_id: "org-7",
          buyer_id: "b1",
          property_id: "p1",
          amount: 140000,
          status: "Draft",
        },
      ],
      access_info: [
        {
          id: "a1",
          workspace_id: "org-7",
          property_id: "p1",
          access_code: "5566",
          created_at: "2026-09-07T00:00:00.000Z",
        },
      ],
    });

    const loaded = await createRepository(t).loadWorkspace();

    expect(t.selects).toEqual([
      "properties",
      "buyers",
      "buyer_properties",
      "interactions",
      "tasks",
      "offers",
      "access_info",
    ]);
    expect(loaded).not.toBeNull();
    expect(loaded?.properties).toEqual([
      {
        id: "p1",
        orgId: "org-7",
        address: "5646 Old Marietta Rd",
        city: "Marietta",
        state: "GA",
        zip: "30318 LOCK BOX IS 5566",
        accessInfo: "LOCK BOX 5566",
        status: "Active",
        accessType: "Lockbox",
        askingPrice: 145000,
        arv: 210000,
        estimatedRepairs: 12000,
        assignmentPrice: null,
        marketingStartedAt: "2026-10-01T10:00:00.000Z",
        expectedClosingDate: null,
        notes: "motivated seller",
        createdAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-02T00:00:00.000Z",
        createdBy: "u1",
        propertyType: "SFR",
        bedrooms: "3",
        bathrooms: "2",
        sqft: "1450",
        lotSize: "0.25",
        yearBuilt: "1978",
        listingUrl: "https://example.com/p1",
        photosUrl: "",
        photos: ["a.jpg", "b.jpg"],
        sourceWebsite: "zillow",
        sourcePropertyId: "z-123",
        sourceRowId: "row-9",
        firstImportedAt: null,
        lastSyncedAt: "2026-09-03T00:00:00.000Z",
        syncStatus: "synced",
      },
    ]);
    expect(loaded?.buyers).toEqual([
      {
        id: "b1",
        orgId: "org-7",
        fullName: "Sam Rivera",
        companyName: "",
        phone: "",
        email: "",
        preferredContactMethod: "",
        preferredMarkets: ["Atlanta"],
        propertyTypes: [],
        budgetMin: 100000,
        budgetMax: null,
        status: "",
        notes: "",
        source: "",
        createdAt: "",
        updatedAt: "",
        createdBy: "",
      },
    ]);
    expect(loaded?.relationships).toEqual([
      {
        id: "rel1",
        orgId: "org-7",
        buyerId: "b1",
        propertyId: "p1",
        interestStatus: "",
        interestNotes: "",
        firstContactDate: null,
        lastInteractionDate: null,
        nextFollowUpDate: null,
        nextAction: "",
        assignedUserId: null,
        relationshipStatus: "",
        createdAt: "",
        updatedAt: "",
        lastContactedAt: null,
        lastMessageSentAt: null,
        lastCallAt: null,
        syncStatus: "synced",
        sourceRowId: "",
      },
    ]);
    expect(loaded?.interactions).toEqual([
      {
        id: "i1",
        orgId: "org-7",
        buyerId: "b1",
        propertyId: null,
        eventType: "Phone Call",
        direction: "in",
        occurredAt: "",
        recordedAt: "",
        originalContent: "",
        enhancedNotes: "",
        outcome: "",
        potentialOfferAmount: 150000.5,
        potentialOfferConfirmed: true,
        nextAction: "",
        missingInfo: ["proof of funds"],
        isAiSuggestion: false,
        createdBy: "",
        createdAt: "",
        updatedAt: "",
      },
    ]);
    expect(loaded?.tasks).toEqual([
      {
        id: "t1",
        orgId: "org-7",
        buyerId: null,
        propertyId: null,
        relatedInteractionId: null,
        taskType: "Follow Up",
        description: "",
        dueDate: null,
        dueTime: null,
        assignedUserId: "",
        priority: "High",
        status: "Scheduled",
        completionNotes: "",
        draftMessage: "draft text",
        createdAt: "",
        completedAt: null,
        completedVia: "sent",
        sentAt: null,
      },
    ]);
    expect(loaded?.offers).toEqual([
      {
        id: "o1",
        orgId: "org-7",
        buyerId: "b1",
        propertyId: "p1",
        amount: 140000,
        offerDate: "",
        terms: "",
        expiresAt: null,
        status: "Draft",
        negotiationNotes: "",
        nextAction: "",
        createdBy: "",
        createdAt: "",
        updatedAt: "",
      },
    ]);
    expect(loaded?.access_infoTable).toEqual([
      {
        id: "a1",
        orgId: "org-7",
        propertyId: "p1",
        accessCode: "5566",
        createdAt: "2026-09-07T00:00:00.000Z",
        updatedAt: "",
      },
    ]);
  });

  it("returns null when a table select fails", async () => {
    const t = fakeTransport({ properties: [{ id: "p1", workspace_id: "w" }] });
    t.failSelect = "tasks";
    expect(await createRepository(t).loadWorkspace()).toBeNull();
  });

  it("skips an unparseable row instead of failing the whole load", async () => {
    const t = fakeTransport({
      properties: [
        { id: "p-good", workspace_id: "org-7", address: "1 Main St" },
        { id: 42 },
      ],
    });
    const loaded = await createRepository(t).loadWorkspace();
    expect(loaded).not.toBeNull();
    expect(loaded?.properties).toHaveLength(1);
    expect(loaded?.properties[0].id).toBe("p-good");
  });

  it("returns null when every table is empty (not backfilled)", async () => {
    const t = fakeTransport();
    expect(await createRepository(t).loadWorkspace()).toBeNull();
  });

  it("scopes the load to the requested workspace", async () => {
    const t = fakeTransport({
      offers: [
        { id: "o-7", workspace_id: "org-7", buyer_id: "b1", property_id: "p1" },
        { id: "o-9", workspace_id: "org-9", buyer_id: "b9", property_id: "p9" },
      ],
    });
    const loaded = await createRepository(t).loadWorkspace("org-7");
    expect(loaded?.offers.map((o) => o.id)).toEqual(["o-7"]);
    expect(t.selectWorkspaces.every((w) => w === "org-7")).toBe(true);
  });
});

// --- save -------------------------------------------------------------------

describe("saveWorkspace", () => {
  it("upserts all 7 tables with mapped rows", async () => {
    const t = fakeTransport();
    const core = makeCore();
    const ok = await createRepository(t).saveWorkspace(core);

    expect(ok).toBe(true);
    expect(t.upserts.map((u) => u.table)).toEqual([
      "properties",
      "buyers",
      "buyer_properties",
      "interactions",
      "tasks",
      "offers",
      "access_info",
    ]);

    const prop = t.upserts[0].rows[0] as Record<string, unknown>;
    expect(prop.id).toBe("p1");
    expect(prop.workspace_id).toBe("org-7");
    expect(prop.asking_price).toBe(145000);
    expect(prop.photos).toEqual(["a.jpg", "b.jpg"]);
    expect(prop.meta).toEqual(core.properties[0]);
    expect("row_updated_at" in prop).toBe(false);

    const task = t.upserts[4].rows[0] as Record<string, unknown>;
    expect(task.completed_via).toBeNull();
    expect(task.draft_message).toBe("draft text");

    const rel = t.upserts[2].rows[0] as Record<string, unknown>;
    expect(rel.buyer_id).toBe("b1");
    expect(rel.last_message_sent_at).toBeNull();
  });

  it("returns false when any upsert fails", async () => {
    const t = fakeTransport();
    t.failUpsert = "tasks";
    expect(await createRepository(t).saveWorkspace(makeCore())).toBe(false);
  });

  it("skips empty collections instead of upserting nothing", async () => {
    const t = fakeTransport();
    const empty: CoreWorkspace = {
      properties: [],
      buyers: [],
      relationships: [],
      interactions: [],
      tasks: [],
      offers: [],
      access_infoTable: [],
    };
    expect(await createRepository(t).saveWorkspace(empty)).toBe(true);
    expect(t.upserts).toHaveLength(0);
  });

  it("does not touch the tables unless allowDelete is set", async () => {
    const t = fakeTransport();
    expect(await createRepository(t).saveWorkspace(makeCore())).toBe(true);
    expect(t.listKeysCalls).toHaveLength(0);
    expect(t.removes).toHaveLength(0);
  });
});

// --- delete-sync ------------------------------------------------------------

describe("delete-sync (allowDelete)", () => {
  it("removes rows that are absent from the saved workspace", async () => {
    const t = fakeTransport({
      properties: [
        { id: "p1", workspace_id: "org-7" },
        { id: "p-gone", workspace_id: "org-7" },
      ],
      offers: [
        { id: "o1", workspace_id: "org-7" },
        { id: "o-gone", workspace_id: "org-7" },
      ],
    });
    const ok = await createRepository(t).saveWorkspace(makeCore(), { allowDelete: true });
    expect(ok).toBe(true);
    expect(t.removes).toEqual([
      { table: "properties", ids: ["p-gone"] },
      { table: "offers", ids: ["o-gone"] },
    ]);
  });

  it("never touches rows of other workspaces", async () => {
    const t = fakeTransport({
      properties: [
        { id: "p1", workspace_id: "org-7" },
        { id: "p-other", workspace_id: "org-9" },
      ],
    });
    const ok = await createRepository(t).saveWorkspace(makeCore(), { allowDelete: true });
    expect(ok).toBe(true);
    expect(t.removes).toHaveLength(0);
  });

  it("protects rows that failed to parse on load", async () => {
    const t = fakeTransport({
      properties: [
        { id: "p-good", workspace_id: "org-7", address: "1 Main St" },
        { id: 42, workspace_id: "org-7" },
      ],
    });
    const loaded = await createRepository(t).loadWorkspace();
    expect(loaded?.properties.map((p) => p.id)).toEqual(["p-good"]);

    expect(await createRepository(t).saveWorkspace(loaded!, { allowDelete: true })).toBe(true);
    expect(t.removes).toHaveLength(0);
  });

  it("returns false when ids cannot be listed", async () => {
    const t = fakeTransport();
    t.failListKeys = "properties";
    expect(await createRepository(t).saveWorkspace(makeCore(), { allowDelete: true })).toBe(false);
  });
});

// --- round trip -------------------------------------------------------------

describe("round trip", () => {
  it("entity -> rows -> entity preserves every field", async () => {
    const core = makeCore();
    const writer = fakeTransport();
    expect(await createRepository(writer).saveWorkspace(core)).toBe(true);

    const reader = fakeTransport(
      Object.fromEntries(writer.upserts.map((u) => [u.table, u.rows])),
    );
    const loaded = await createRepository(reader).loadWorkspace();
    expect(loaded).toEqual(core);
  });

  it("normalizes an absent optional source to ''", async () => {
    const core = makeCore();
    core.buyers = [makeBuyer({ source: undefined })];
    const writer = fakeTransport();
    await createRepository(writer).saveWorkspace(core);

    const reader = fakeTransport(
      Object.fromEntries(writer.upserts.map((u) => [u.table, u.rows])),
    );
    const loaded = await createRepository(reader).loadWorkspace();
    expect(loaded?.buyers[0].source).toBe("");
  });
});
