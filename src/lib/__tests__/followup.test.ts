import { beforeEach, describe, expect, it } from "vitest";
import { createSeed } from "@/lib/seed-work";
import { getDb, updateDb } from "@/lib/store";
import { addBuyer, addProperty, linkBuyerToProperty, logInteraction, createTask } from "@/lib/actions";
import {
  generateFollowUp,
  refineFollowUp,
  usedMessageFingerprints,
  type FollowUpContext,
} from "@/lib/ai/followup";
import type { Buyer, Interaction, Property, Task } from "@/types";

function reset() {
  localStorage.clear();
  updateDb(() => createSeed());
}

function setupPair(): { buyer: Buyer; property: Property } {
  const propertyId = addProperty({
    address: "10 New Rd",
    city: "Austin",
    state: "TX",
    zip: "78701",
    status: "Available",
    askingPrice: 150000,
    arv: null,
    estimatedRepairs: null,
    assignmentPrice: null,
    expectedClosingDate: null,
    notes: "",
    userId: "u_owner",
  });
  const buyerId = addBuyer({
    fullName: "Jamal Carter",
    companyName: "",
    phone: "555-0100",
    email: "",
    preferredContactMethod: "",
    preferredMarkets: ["Austin"],
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
  logInteraction({
    buyerId,
    propertyId,
    eventType: "Incoming SMS",
    occurredAt: new Date(Date.now() - 86400000).toISOString(),
    recordedAt: new Date().toISOString(),
    originalContent: "Is the price still negotiable? I need to talk it over with my wife.",
    enhanced: null,
    useEnhanced: false,
    userId: "u_owner",
  });
  const g = getDb();
  return {
    buyer: g.buyers.find((b) => b.id === buyerId)!,
    property: g.properties.find((p) => p.id === propertyId)!,
  };
}

function ctxFor(buyer: Buyer, property: Property, variant = 0): FollowUpContext {
  const g = getDb();
  const interactions = g.interactions
    .filter((i) => i.buyerId === buyer.id && i.propertyId === property.id)
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

describe("follow-up anti-repetition", () => {
  beforeEach(reset);

  it("generates different messages for consecutive variants", async () => {
    const { buyer, property } = setupPair();
    const m0 = await generateFollowUp(ctxFor(buyer, property, 0));
    const m1 = await generateFollowUp(ctxFor(buyer, property, 1));
    expect(m0.blockedReason).toBeNull();
    expect(m1.message).not.toBe(m0.message);
  });

  it("skips a variant whose text was already sent", async () => {
    const { buyer, property } = setupPair();
    const first = await generateFollowUp(ctxFor(buyer, property, 0));
    // simulate the user sending that exact message
    logInteraction({
      buyerId: buyer.id,
      propertyId: property.id,
      eventType: "Outgoing SMS",
      occurredAt: new Date().toISOString(),
      recordedAt: new Date().toISOString(),
      originalContent: first.message,
      enhanced: null,
      useEnhanced: false,
      userId: "u_owner",
    });
    const again = await generateFollowUp(ctxFor(buyer, property, 0));
    expect(again.message).not.toBe(first.message);
  });

  it("skips variants captured in scheduled task descriptions", async () => {
    const { buyer, property } = setupPair();
    const first = await generateFollowUp(ctxFor(buyer, property, 0));
    createTask({
      buyerId: buyer.id,
      propertyId: property.id,
      taskType: "Send SMS",
      description: `Send follow-up message: "${first.message.slice(0, 90)}${first.message.length > 90 ? "…" : ""}"`,
      dueDate: "2026-10-20",
      dueTime: "10:00",
      assignedUserId: "u_owner",
      priority: "Medium",
    });
    const again = await generateFollowUp(ctxFor(buyer, property, 0));
    expect(again.message).not.toBe(first.message);
  });

  it("references the buyer's last question in the why", async () => {
    const { buyer, property } = setupPair();
    const draft = await generateFollowUp(ctxFor(buyer, property, 0));
    expect(draft.why).toMatch(/negotiable|question/i);
  });

  it("refine('another') produces a different message", async () => {
    const { buyer, property } = setupPair();
    const ctx = ctxFor(buyer, property, 0);
    const first = await generateFollowUp(ctx);
    const second = await refineFollowUp(ctx, first, "another");
    expect(second.message).not.toBe(first.message);
  });

  it("blocks Do Not Contact buyers", async () => {
    const { buyer, property } = setupPair();
    const dnc: Buyer = { ...buyer, status: "Do Not Contact" };
    const draft = await generateFollowUp(ctxFor(dnc, property, 0));
    expect(draft.blockedReason).toMatch(/Do Not Contact/);
  });
});

describe("usedMessageFingerprints", () => {
  it("collects outgoing interactions and quoted task text", () => {
    const interactions = [
      { direction: "out", originalContent: "Hey Jamal — checking in on the house." },
      { direction: "in", originalContent: "Sure, what's the price?" },
    ] as unknown as Interaction[];
    const tasks = [
      { status: "Scheduled", description: 'Send follow-up message: "Hi Jamal — the comps are ready."' },
      { status: "Cancelled", description: 'Send follow-up message: "Cancelled one."' },
    ] as unknown as Task[];
    const used = usedMessageFingerprints(interactions, tasks);
    expect(used.size).toBe(2);
    expect([...used].some((f) => f.includes("checking in"))).toBe(true);
    expect([...used].some((f) => f.includes("comps are ready"))).toBe(true);
  });
});
