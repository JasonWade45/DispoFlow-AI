import type { DB, Settings, User } from "@/types";
import { ORG_ID, ts } from "./seed-core";
import { uid } from "./format";

export const seedUsers: User[] = [
  { id: "u_owner", orgId: ORG_ID, name: "Jason Wade", email: "owner@dispoflow.demo", role: "owner", active: true },
  { id: "u_sarah", orgId: ORG_ID, name: "Sarah Mendez", email: "sarah@dispoflow.demo", role: "team", active: true },
  { id: "u_marcus", orgId: ORG_ID, name: "Marcus Reed", email: "marcus@dispoflow.demo", role: "team", active: true },
  { id: "u_tom", orgId: ORG_ID, name: "Tom Alvarez", email: "tom@dispoflow.demo", role: "team", active: true },
];

export const seedSettings: Settings = {
  propertyStatuses: ["Available", "Marketing", "Offer Received", "Under Contract", "Pending", "Sold", "On Hold", "Cancelled"],
  interestStatuses: ["New", "Interested", "Undecided", "Needs Information", "Price Concern", "Offer Submitted", "Counteroffer", "Accepted", "Not Interested", "No Response", "Closed — Won", "Closed — Lost"],
  buyerStatuses: ["Active", "Inactive", "Do Not Contact"],
  offerStatuses: ["Draft", "Submitted", "Under Review", "Countered", "Accepted", "Rejected", "Withdrawn", "Expired"],
  taskTypes: ["Follow-Up Call", "Send SMS", "Send Email", "Send Documents", "Schedule Showing", "Update Buyer", "Other"],
  priorityRulesEnabled: true,
};

/** Helper: create a property record */
function prop(id: string, overrides: Partial<Record<string, any>>): any {
  return {
    id,
    orgId: ORG_ID,
    address: "",
    city: "",
    state: "GA",
    zip: "",
    accessInfo: "",
    status: "Available",
    accessType: "",
    askingPrice: null,
    arv: null,
    estimatedRepairs: null,
    assignmentPrice: null,
    expectedClosingDate: null,
    notes: "",
    createdAt: ts(10),
    updatedAt: ts(5),
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
    ...overrides,
  };
}

/** Helper: create a buyer record */
function buyer(id: string, overrides: Partial<Record<string, any>>): any {
  return {
    id,
    orgId: ORG_ID,
    fullName: "",
    companyName: "",
    phone: "",
    email: "",
    preferredContactMethod: "SMS",
    preferredMarkets: [],
    propertyTypes: [],
    budgetMin: null,
    budgetMax: null,
    status: "Active",
    notes: "",
    source: "",
    createdAt: ts(20),
    updatedAt: ts(10),
    createdBy: "u_owner",
    ...overrides,
  };
}

/** Helper: create a buyer-property relationship */
function rel(id: string, overrides: Partial<Record<string, any>>): any {
  return {
    id,
    orgId: ORG_ID,
    buyerId: "",
    propertyId: "",
    interestStatus: "New",
    interestNotes: "",
    firstContactDate: ts(15).slice(0, 10),
    lastInteractionDate: null,
    nextFollowUpDate: null,
    nextAction: "",
    assignedUserId: null,
    relationshipStatus: "Active",
    createdAt: ts(15),
    updatedAt: ts(10),
    lastContactedAt: null,
    lastMessageSentAt: null,
    lastCallAt: null,
    syncStatus: "never",
    sourceRowId: "",
    ...overrides,
  };
}

/** Helper: create a task */
function task(id: string, overrides: Partial<Record<string, any>>): any {
  return {
    id,
    orgId: ORG_ID,
    buyerId: "",
    propertyId: "",
    relatedInteractionId: null,
    taskType: "Follow-Up Call",
    description: "",
    dueDate: null,
    dueTime: null,
    assignedUserId: "u_owner",
    priority: "Medium",
    status: "Scheduled",
    completionNotes: "",
    createdAt: ts(10),
    completedAt: null,
    completedVia: null,
    sentAt: null,
    ...overrides,
  };
}

/** Helper: create an offer */
function offer(id: string, overrides: Partial<Record<string, any>>): any {
  return {
    id,
    orgId: ORG_ID,
    buyerId: "",
    propertyId: "",
    amount: 0,
    offerDate: ts(10).slice(0, 10),
    terms: "",
    expiresAt: null,
    status: "Submitted",
    negotiationNotes: "",
    nextAction: "",
    createdBy: "u_owner",
    createdAt: ts(10),
    updatedAt: ts(5),
    ...overrides,
  };
}

/** Helper: create an interaction */
function interaction(id: string, overrides: Partial<Record<string, any>>): any {
  return {
    id,
    orgId: ORG_ID,
    buyerId: null,
    propertyId: null,
    eventType: "Incoming SMS",
    direction: "in",
    occurredAt: ts(5),
    recordedAt: ts(5),
    enhancedNotes: "",
    outcome: "",
    potentialOfferAmount: null,
    potentialOfferConfirmed: false,
    nextAction: "",
    missingInfo: [],
    isAiSuggestion: false,
    createdBy: "u_owner",
    createdAt: ts(5),
    updatedAt: ts(5),
    ...overrides,
  };
}

export function createSeed(): DB {
  return {
    version: 3,
    organization: { id: ORG_ID, name: "Summit Property Buyers", createdAt: ts(120) },
    users: seedUsers,
    properties: [],
    buyers: [],
    relationships: [],
    interactions: [],
    tasks: [],
    offers: [],
    settings: seedSettings,
    sheetConnections: [],
    trelloConnections: [],
    importHistory: [],
    syncJobs: [],
    access_infoTable: [],
  };
}

/** Demo data so a new install isn't completely empty. Load via the Settings page. */
export function createDemoSeed(): DB {
  const now = new Date();
  const today = now.toISOString().slice(0, 10);

  const base = createSeed();

  const properties = [
    prop("p_3344", {
      address: "3344 Windsor Castle Ct",
      city: "Decatur",
      zip: "30034",
      status: "Marketing",
      askingPrice: 145000,
      arv: 180000,
      notes: "Motivated seller, needs quick sale.",
    }),
    prop("p_442", {
      address: "442 Oak Lane",
      city: "Atlanta",
      zip: "30309",
      status: "Available",
      askingPrice: 112500,
      arv: 150000,
      notes: "Realtor-listed, cash buyers preferred.",
    }),
    prop("p_100", {
      address: "100 Main St",
      city: "Anywhere",
      zip: "30303",
      status: "Under Contract",
      askingPrice: 157000,
      arv: 200000,
      notes: "Under contract, backup offers accepted.",
    }),
    prop("p_555", {
      address: "555 Peachtree St NE",
      city: "Atlanta",
      zip: "30308",
      status: "Offer Received",
      askingPrice: 210000,
      arv: 260000,
      notes: "Two offers received, reviewing terms.",
    }),
    prop("p_777", {
      address: "777 Ponce de Leon Ave",
      city: "Atlanta",
      zip: "30306",
      status: "Pending",
      askingPrice: 320000,
      arv: 380000,
      notes: "Pending inspection, closing next month.",
    }),
  ];

  const buyers = [
    buyer("b_alice", {
      fullName: "Alice Buyer",
      phone: "(555) 123-4567",
      email: "alice@x.com",
      source: "Dispo Genius",
      type: "Cash Buyer",
      notes: "Likes Decatur area, quick closer.",
    }),
    buyer("b_bob", {
      fullName: "Bob Realtor",
      phone: "555-987-6543",
      email: "bob@realty.com",
      source: "Facebook",
      type: "Realtor",
      notes: "Represents several investors.",
    }),
    buyer("b_carol", {
      fullName: "Carol Investor",
      phone: "(555) 222-3333",
      email: "carol@inv.com",
      source: "Dispo Genius",
      type: "Cash Buyer",
      notes: "Remove Me flagged on 100 Main St only.",
    }),
    buyer("b_dave", {
      fullName: "Dave Cash",
      phone: "555-000-1111",
      email: "",
      source: "Facebook Buyer",
      type: "Cash Buyer",
      notes: "No email on file, SMS only.",
    }),
    buyer("b_eve", {
      fullName: "Eve Jones",
      phone: "(555) 444-5555",
      email: "eve@email.com",
      source: "Investorbase Buyer",
      type: "",
      notes: "First-time buyer, needs financing.",
    }),
  ];

  const relationships = [
    rel("r_1", { buyerId: "b_alice", propertyId: "p_3344", interestStatus: "Interested", lastContactedAt: ts(2), lastMessageSentAt: ts(1), nextFollowUpDate: ts(-1).slice(0, 10), nextAction: "Send follow-up SMS" }),
    rel("r_2", { buyerId: "b_alice", propertyId: "p_442", interestStatus: "Undecided", lastContactedAt: ts(5), nextFollowUpDate: ts(3).slice(0, 10), nextAction: "Call to discuss price" }),
    rel("r_3", { buyerId: "b_bob", propertyId: "p_442", interestStatus: "Interested", lastContactedAt: ts(3), nextFollowUpDate: today, nextAction: "Send offer terms" }),
    rel("r_4", { buyerId: "b_carol", propertyId: "p_100", interestStatus: "Remove Me", lastContactedAt: ts(1), nextFollowUpDate: null, nextAction: "Do not contact" }),
    rel("r_5", { buyerId: "b_carol", propertyId: "p_3344", interestStatus: "Interested", lastContactedAt: ts(4), nextFollowUpDate: ts(7).slice(0, 10), nextAction: "Follow up next week" }),
    rel("r_6", { buyerId: "b_dave", propertyId: "p_555", interestStatus: "Interested", lastContactedAt: ts(6), nextFollowUpDate: ts(-2).slice(0, 10), nextAction: "Overdue — call now" }),
    rel("r_7", { buyerId: "b_eve", propertyId: "p_777", interestStatus: "Undecided", lastContactedAt: ts(8), nextFollowUpDate: ts(5).slice(0, 10), nextAction: "Email financing options" }),
  ];

  const offers = [
    offer("o_1", { buyerId: "b_alice", propertyId: "p_3344", amount: 145000, status: "Submitted", nextAction: "Awaiting seller response" }),
    offer("o_2", { buyerId: "b_bob", propertyId: "p_442", amount: 110000, status: "Under Review", nextAction: "Counteroffer sent" }),
    offer("o_3", { buyerId: "b_dave", propertyId: "p_555", amount: 200000, status: "Submitted", nextAction: "Under review by seller" }),
  ];

  const tasks = [
    task("t_1", { buyerId: "b_alice", propertyId: "p_3344", taskType: "Send SMS", description: "Follow up — 3344 Windsor Castle Ct", dueDate: ts(-1).slice(0, 10), priority: "High", status: "Scheduled", nextAction: "Send follow-up SMS" }),
    task("t_2", { buyerId: "b_bob", propertyId: "p_442", taskType: "Follow-Up Call", description: "Call about 442 Oak Lane", dueDate: today, priority: "Medium", status: "Scheduled", nextAction: "Call to discuss price" }),
    task("t_3", { buyerId: "b_dave", propertyId: "p_555", taskType: "Send SMS", description: "Follow up — 555 Peachtree St NE", dueDate: ts(-2).slice(0, 10), priority: "Urgent", status: "Scheduled", nextAction: "Overdue — call now" }),
    task("t_4", { buyerId: "b_eve", propertyId: "p_777", taskType: "Send Email", description: "Email financing options — 777 Ponce de Leon Ave", dueDate: ts(5).slice(0, 10), priority: "Low", status: "Scheduled", nextAction: "Email financing options" }),
    task("t_5", { buyerId: "b_alice", propertyId: "p_442", taskType: "Follow-Up Call", description: "Call Alice re: 442 Oak Lane", dueDate: ts(3).slice(0, 10), priority: "Medium", status: "Scheduled", nextAction: "Call to discuss price" }),
    task("t_6", { buyerId: "b_carol", propertyId: "p_100", taskType: "Other", description: "Do not contact — 100 Main St", dueDate: null, priority: "Low", status: "Cancelled", completionNotes: "Buyer requested removal" }),
  ];

  const interactions = [
    interaction("i_1", { buyerId: "b_alice", propertyId: "p_3344", eventType: "Incoming SMS", direction: "in", occurredAt: ts(1), originalContent: "I'm interested in 3344 Windsor Castle Ct. Can you send more info?" }),
    interaction("i_2", { buyerId: "b_bob", propertyId: "p_442", eventType: "Outgoing SMS", direction: "out", occurredAt: ts(2), originalContent: "Hi Bob, here are the terms for 442 Oak Lane." }),
    interaction("i_3", { buyerId: "b_dave", propertyId: "p_555", eventType: "Incoming SMS", direction: "in", occurredAt: ts(3), originalContent: "I can do $200k for 555 Peachtree. Let's talk." }),
  ];

  return {
    ...base,
    properties,
    buyers,
    relationships,
    interactions,
    tasks,
    offers,
  };
}
