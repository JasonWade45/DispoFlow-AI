import { beforeEach, describe, expect, it } from "vitest";
import { createSeed } from "@/lib/seed-work";
import { getDb, updateDb } from "@/lib/store";
import { addBuyer, addProperty, linkBuyerToProperty, logInteraction } from "@/lib/actions";
import {
  blockedFollowUpReason,
  generateFollowUp,
  noHistoryFlag,
  type FollowUpContext,
} from "@/lib/ai/followup";
import type { Buyer, Property } from "@/types";

function reset() {
  localStorage.clear();
  updateDb(() => createSeed());
}

/**
 * Reproduces the real backlog: a buyer linked to a property whose only records
 * are system events (status changes, offer created) — no SMS back-and-forth.
 */
function setupPair(opts: { withMessage?: boolean; withSystemEvent?: boolean } = {}): {
  buyer: Buyer;
  property: Property;
} {
  const propertyId = addProperty({
    address: "2807 Leisure Woods Ln",
    city: "Decatur",
    state: "GA",
    zip: "30032",
    status: "Available",
    askingPrice: 205000,
    arv: null,
    estimatedRepairs: null,
    assignmentPrice: null,
    expectedClosingDate: null,
    notes: "",
    userId: "u_owner",
  });
  const buyerId = addBuyer({
    fullName: "Deyanira Vittini",
    companyName: "",
    phone: "347-949-2234",
    email: "",
    preferredContactMethod: "",
    preferredMarkets: ["Atlanta"],
    budgetMin: null,
    budgetMax: null,
    status: "Active",
    notes: "",
    userId: "u_owner",
  });
  linkBuyerToProperty({
    buyerId,
    propertyId,
    interestStatus: "Interested",
    interestNotes: "",
    assignedUserId: null,
    userId: "u_owner",
  });

  if (opts.withSystemEvent) {
    logInteraction({
      buyerId,
      propertyId,
      eventType: "Status Changed",
      occurredAt: new Date(Date.now() - 180 * 86400000).toISOString(),
      recordedAt: new Date().toISOString(),
      originalContent: "Deyanira Vittini linked to 2807 Leisure Woods Ln (Interested)",
      enhanced: null,
      useEnhanced: false,
      userId: "u_owner",
    });
  }
  if (opts.withMessage) {
    logInteraction({
      buyerId,
      propertyId,
      eventType: "Incoming SMS",
      occurredAt: new Date(Date.now() - 86400000).toISOString(),
      recordedAt: new Date().toISOString(),
      originalContent: "Is the price still negotiable?",
      enhanced: null,
      useEnhanced: false,
      userId: "u_owner",
    });
  }

  const g = getDb();
  return {
    buyer: g.buyers.find((b) => b.id === buyerId)!,
    property: g.properties.find((p) => p.id === propertyId)!,
  };
}

function ctxFor(buyer: Buyer, property: Property, variant = 0): FollowUpContext {
  const g = getDb();
  const interactions = g.interactions
    .filter((i) => i.buyerId === buyer.id)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  return {
    buyer,
    property,
    interactions,
    offers: g.offers.filter((o) => o.buyerId === buyer.id && o.propertyId === property.id),
    tasks: g.tasks.filter((t) => t.buyerId === buyer.id && t.propertyId === property.id),
    mode: "Standard Follow-Up",
    variant,
  };
}

describe("follow-ups without message history", () => {
  beforeEach(reset);

  it("does not block a buyer whose only records are system events", async () => {
    const { buyer, property } = setupPair({ withSystemEvent: true });
    const ctx = ctxFor(buyer, property);

    expect(ctx.interactions.length).toBeGreaterThan(0);
    expect(blockedFollowUpReason(ctx)).toBeNull();

    const draft = await generateFollowUp(ctx);
    expect(draft.blockedReason).toBeNull();
    expect(draft.message).toContain(property.address);
    expect(draft.message.length).toBeGreaterThan(40);
  });

  it("flags the draft as a first touch for human review", async () => {
    const { buyer, property } = setupPair({ withSystemEvent: true });
    const draft = await generateFollowUp(ctxFor(buyer, property));

    expect(draft.flag).toMatch(/first touch/i);
    expect(noHistoryFlag(ctxFor(buyer, property))).toMatch(/first touch/i);
  });

  it("does not block or flag a buyer with zero interactions at all", async () => {
    const { buyer, property } = setupPair();
    // Linking a buyer always logs a system event, so an empty history only
    // happens for a freshly picked pair — model it directly on the context.
    const ctx: FollowUpContext = { ...ctxFor(buyer, property), interactions: [] };

    expect(blockedFollowUpReason(ctx)).toBeNull();

    const draft = await generateFollowUp(ctx);
    expect(draft.blockedReason).toBeNull();
    expect(draft.message).toContain(property.address);
    expect(draft.flag).toMatch(/first touch/i);
  });

  it("drops the first-touch flag once a real message exists", async () => {
    const { buyer, property } = setupPair({ withSystemEvent: true, withMessage: true });
    const ctx = ctxFor(buyer, property);
    const draft = await generateFollowUp(ctx);

    expect(noHistoryFlag(ctx)).toBeNull();
    expect(draft.flag).toBeNull();
    expect(draft.why).toMatch(/question/i);
  });

  it("still blocks Do Not Contact buyers regardless of history", async () => {
    const { buyer, property } = setupPair({ withMessage: true });
    const dnc: Buyer = { ...buyer, status: "Do Not Contact" };
    const draft = await generateFollowUp(ctxFor(dnc, property));

    expect(draft.blockedReason).toMatch(/Do Not Contact/);
    expect(draft.message).toBe("");
  });
});
