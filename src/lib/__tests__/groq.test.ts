import { describe, expect, it } from "vitest";
import type { Buyer, Interaction, Offer, Property } from "@/types";
import { buildGroqSystemPrompt, buildGroqUserPrompt, isGroqConfigured, type GroqPromptInput } from "@/lib/ai/groq";

const buyer: Buyer = {
  id: "b1",
  orgId: "o1",
  fullName: "Jamal Carter",
  companyName: "",
  phone: "555-0100",
  email: "",
  preferredContactMethod: "",
  preferredMarkets: ["Austin"],
  propertyTypes: [],
  budgetMin: null,
  budgetMax: null,
  status: "Active",
  notes: "",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  createdBy: "u_owner",
};

const property: Property = {
  id: "p1",
  orgId: "o1",
  address: "10 New Rd",
  city: "Austin",
  state: "TX",
  zip: "78701",
  accessInfo: "",
  status: "Available",
  accessType: "",
  askingPrice: 150000,
  arv: 220000,
  estimatedRepairs: null,
  assignmentPrice: null,
  marketingStartedAt: null,
  expectedClosingDate: null,
  notes: "",
  createdAt: "2026-10-01T10:00:00.000Z",
  updatedAt: "2026-10-01T10:00:00.000Z",
  createdBy: "u_owner",
  propertyType: "",
  bedrooms: "",
  bathrooms: "",
  sqft: "",
  lotSize: "",
  yearBuilt: "",
  listingUrl: "",
  photosUrl: "",
  photos: [],
  sourceWebsite: "",
  sourcePropertyId: "",
  sourceRowId: "",
  firstImportedAt: null,
  lastSyncedAt: null,
  syncStatus: "never",
};

const interactions: Interaction[] = [
  {
    id: "i1",
    orgId: "o1",
    buyerId: "b1",
    propertyId: "p1",
    eventType: "Incoming SMS",
    direction: "in",
    occurredAt: "2026-10-12T15:00:00.000Z",
    recordedAt: "2026-10-12T15:00:00.000Z",
    originalContent: "Is the price still negotiable? I need to talk it over with my wife.",
    enhancedNotes: "",
    outcome: "",
    potentialOfferAmount: null,
    potentialOfferConfirmed: false,
    nextAction: "",
    missingInfo: [],
    isAiSuggestion: false,
    createdBy: "u_owner",
    createdAt: "2026-10-12T15:00:00.000Z",
    updatedAt: "2026-10-12T15:00:00.000Z",
  },
  {
    id: "i2",
    orgId: "o1",
    buyerId: "b1",
    propertyId: "p1",
    eventType: "Outgoing SMS",
    direction: "out",
    occurredAt: "2026-10-13T09:00:00.000Z",
    recordedAt: "2026-10-13T09:00:00.000Z",
    originalContent: "Hey Jamal — the comps are ready, let me know when you've talked it over.",
    enhancedNotes: "",
    outcome: "",
    potentialOfferAmount: null,
    potentialOfferConfirmed: false,
    nextAction: "",
    missingInfo: [],
    isAiSuggestion: false,
    createdBy: "u_owner",
    createdAt: "2026-10-13T09:00:00.000Z",
    updatedAt: "2026-10-13T09:00:00.000Z",
  },
];

const offers: Offer[] = [
  {
    id: "of1",
    orgId: "o1",
    buyerId: "b1",
    propertyId: "p1",
    amount: 142000,
    offerDate: "2026-10-10",
    terms: "Cash, 14-day close",
    expiresAt: null,
    status: "Submitted",
    negotiationNotes: "",
    nextAction: "",
    createdBy: "u_owner",
    createdAt: "2026-10-10T10:00:00.000Z",
    updatedAt: "2026-10-10T10:00:00.000Z",
  },
];

function input(overrides: Partial<GroqPromptInput> = {}): GroqPromptInput {
  return {
    buyer,
    property,
    interactions,
    offers,
    mode: "Standard Follow-Up",
    variant: 0,
    ...overrides,
  };
}

describe("buildGroqSystemPrompt", () => {
  it("sets grounding, repetition and JSON-output rules", () => {
    const s = buildGroqSystemPrompt();
    expect(s).toMatch(/NEVER invent/);
    expect(s).toMatch(/MESSAGES ALREADY SENT/);
    expect(s).toMatch(/\{"message": "\.\.\.", "why": "\.\.\.", "flag": "\.\.\."\}/);
    expect(s).toMatch(/under 320 characters/);
    expect(s).toMatch(/PROPERTY STATUS is authoritative/);
    expect(s).toMatch(/never present it as available/);
    expect(s).toMatch(/never invent it/);
  });
});

describe("buildGroqUserPrompt", () => {
  it("includes the full conversation transcript with direction labels", () => {
    const p = buildGroqUserPrompt(input());
    expect(p).toContain("BUYER: Is the price still negotiable?");
    expect(p).toContain("US: Hey Jamal");
  });

  it("includes asking price, ARV and the confirmed offer amount", () => {
    const p = buildGroqUserPrompt(input());
    expect(p).toContain("$150,000");
    expect(p).toContain("$220,000");
    expect(p).toContain("$142,000");
    expect(p).toContain("Cash, 14-day close");
  });

  it("lists prior sent messages so the model avoids repeating them", () => {
    const p = buildGroqUserPrompt(input());
    expect(p).toContain("MESSAGES ALREADY SENT");
    expect(p).toContain("comps are ready");
  });

  it("embeds refine instructions and the current draft when refining", () => {
    const p = buildGroqUserPrompt(
      input({ refine: "shorter", currentMessage: "Hey Jamal — long draft here." }),
    );
    expect(p).toContain("REFINE INSTRUCTION:");
    expect(p).toContain("significantly shorter");
    expect(p).toContain('CURRENT DRAFT (revise this, don\'t start over): "Hey Jamal — long draft here."');
  });

  it("varies by variant seed", () => {
    const a = buildGroqUserPrompt(input({ variant: 0 }));
    const b = buildGroqUserPrompt(input({ variant: 3 }));
    expect(a).toContain("VARIANT SEED: 0");
    expect(b).toContain("VARIANT SEED: 3");
  });

  it("names the last speaker", () => {
    const p = buildGroqUserPrompt(input());
    expect(p).toContain("LAST SPEAKER: US");
  });

  it("flags a sold property and offers similar available properties", () => {
    const sold: Property = { ...property, status: "Sold" };
    const alt: Property = {
      ...property,
      id: "p2",
      address: "22 Oak Ave",
      status: "Available",
      askingPrice: 165000,
      bedrooms: "3",
      bathrooms: "2",
      sqft: "1500",
    };
    const p = buildGroqUserPrompt(input({ property: sold, similarProperties: [alt] }));
    expect(p).toContain("is SOLD");
    expect(p).toContain("Do not present it as available");
    expect(p).toContain("SIMILAR AVAILABLE PROPERTIES (offer these instead):");
    expect(p).toContain("22 Oak Ave");
    expect(p).toContain("$165,000");
  });

  it("tells the model when the property is not sold so it stays on the status line only", () => {
    const p = buildGroqUserPrompt(input());
    expect(p).toContain("Property status: Available");
    expect(p).not.toContain("Do not present it as available");
  });
});

describe("isGroqConfigured", () => {
  it("reads GROQ_API_KEY from the environment", () => {
    const prev = process.env.GROQ_API_KEY;
    try {
      process.env.GROQ_API_KEY = "gsk_test";
      expect(isGroqConfigured()).toBe(true);
      delete process.env.GROQ_API_KEY;
      expect(isGroqConfigured()).toBe(false);
    } finally {
      if (prev === undefined) delete process.env.GROQ_API_KEY;
      else process.env.GROQ_API_KEY = prev;
    }
  });
});
