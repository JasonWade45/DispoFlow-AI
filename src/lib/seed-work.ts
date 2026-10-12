import type { DB, Settings, User } from "@/types";
import { ORG_ID, ts } from "./seed-core";

export const seedUsers: User[] = [
  { id: "u_owner", orgId: ORG_ID, name: "Dana Whitfield", email: "owner@dispoflow.demo", role: "owner", active: true },
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

export function createSeed(): DB {
  return {
    version: 2,
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
    importHistory: [],
    syncJobs: [],
  };
}
