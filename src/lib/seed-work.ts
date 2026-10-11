import type { DB, Offer, Settings, Task, User } from "@/types";
import { ORG_ID, future, past, seedBuyers, seedProperties, seedRelationships, ts } from "./seed-core";
import { seedInteractions } from "./seed-interactions";

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

type TaskSeed = Partial<Task> & Pick<Task, "id" | "description" | "status">;

const taskRows: TaskSeed[] = [
  { id: "t1", buyerId: "b1", propertyId: "p1", taskType: "Follow-Up Call", description: "Call John to confirm partner decision and probe for an offer number.", dueDate: past(3), dueTime: "10:00", status: "Scheduled", priority: "High", assignedUserId: "u_sarah" },
  { id: "t2", buyerId: "b6", propertyId: "p1", taskType: "Send Documents", description: "Send repair estimate breakdown to Renee.", dueDate: future(1), dueTime: "09:30", status: "Scheduled", priority: "Medium", assignedUserId: "u_sarah" },
  { id: "t3", buyerId: "b11", propertyId: "p1", taskType: "Send Email", description: "Reply to Hector's email with the Maple Grove numbers.", dueDate: past(1), dueTime: "14:00", status: "Scheduled", priority: "High", assignedUserId: "u_marcus" },
  { id: "t4", buyerId: "b7", propertyId: "p2", taskType: "Follow-Up Call", description: "Present the seller counter to Omar.", dueDate: past(2), dueTime: "11:00", status: "Scheduled", priority: "Urgent", assignedUserId: "u_sarah" },
  { id: "t5", buyerId: "b5", propertyId: "p2", taskType: "Send Documents", description: "Send inspection report to Victor once finalized.", dueDate: future(2), dueTime: "15:00", status: "Scheduled", priority: "Medium", assignedUserId: "u_tom" },
  { id: "t6", buyerId: "b13", propertyId: "p2", taskType: "Send SMS", description: "Answer Sam's roof age question with the inspection summary.", dueDate: null, dueTime: null, status: "Scheduled", priority: "Medium", assignedUserId: "u_sarah" },
  { id: "t7", buyerId: "b3", propertyId: "p3", taskType: "Send Email", description: "Send closing schedule from title to Derek.", dueDate: future(3), dueTime: "10:00", status: "Scheduled", priority: "High", assignedUserId: "u_marcus" },
  { id: "t8", buyerId: "b8", propertyId: "p3", taskType: "Follow-Up Call", description: "Ask Bethany if she wants to stay in the loop on Sollars.", dueDate: null, dueTime: null, status: "Scheduled", priority: "Low", assignedUserId: "u_tom" },
  { id: "t9", buyerId: "b14", propertyId: "p3", taskType: "Send SMS", description: "One more try with Marissa, then mark inactive.", dueDate: past(7), dueTime: "09:00", status: "Scheduled", priority: "Medium", assignedUserId: "u_sarah" },
  { id: "t10", buyerId: "b2", propertyId: "p4", taskType: "Send Email", description: "Send listing package to Priya.", dueDate: future(4), dueTime: "10:30", status: "Scheduled", priority: "Medium", assignedUserId: "u_marcus" },
  { id: "t11", buyerId: "b7", propertyId: "p4", taskType: "Send SMS", description: "Send the comps Omar asked for on Rayford.", dueDate: today(), dueTime: "16:00", status: "Scheduled", priority: "High", assignedUserId: "u_sarah" },
  { id: "t12", buyerId: "b4", propertyId: "p5", taskType: "Schedule Showing", description: "Thursday walkthrough with Alicia and her contractor.", dueDate: future(1), dueTime: "14:00", status: "Scheduled", priority: "High", assignedUserId: "u_tom" },
  { id: "t13", buyerId: "b9", propertyId: "p5", taskType: "Send Email", description: "Send seller-side price justification to Grant.", dueDate: null, dueTime: null, status: "Scheduled", priority: "High", assignedUserId: "u_marcus" },
  { id: "t14", buyerId: "b10", propertyId: "p4", taskType: "Follow-Up Call", description: "Re-engage Tanya on Rayford — buyer status is Inactive.", dueDate: future(9), dueTime: "13:00", status: "Scheduled", priority: "Low", assignedUserId: "u_tom" },
  { id: "t15", buyerId: "b5", propertyId: "p6", taskType: "Follow-Up Call", description: "Follow up with Victor after the appraisal on Michigan Ave.", dueDate: future(5), dueTime: "11:00", status: "Scheduled", priority: "Medium", assignedUserId: "u_sarah" },
  { id: "t16", buyerId: "b9", propertyId: "p10", taskType: "Send Documents", description: "Send rent comps for Cedar Hill to Grant.", dueDate: future(6), dueTime: "10:00", status: "Scheduled", priority: "Medium", assignedUserId: "u_marcus" },
  { id: "t17", buyerId: "b4", propertyId: "p10", taskType: "Follow-Up Call", description: "First outreach call to Alicia about Cedar Hill.", dueDate: null, dueTime: null, status: "Scheduled", priority: "Medium", assignedUserId: "u_tom" },
  { id: "t18", buyerId: "b1", propertyId: "p1", taskType: "Send SMS", description: "Confirm John's decision after partner review.", dueDate: today(), dueTime: "17:00", status: "Scheduled", priority: "Urgent", assignedUserId: "u_sarah" },
  { id: "t19", buyerId: "b6", propertyId: "p7", taskType: "Other", description: "Send closing thank-you and ask for a referral.", dueDate: past(12), dueTime: "10:00", status: "Completed", priority: "Low", assignedUserId: "u_sarah", completionNotes: "Sent. Renee referred one lead." },
  { id: "t20", buyerId: "b7", propertyId: "p6", taskType: "Send Email", description: "Email accepted offer confirmation to Omar.", dueDate: past(4), dueTime: "17:00", status: "Completed", priority: "High", assignedUserId: "u_marcus", completionNotes: "Sent and acknowledged." },
  { id: "t21", buyerId: "b3", propertyId: "p3", taskType: "Send Documents", description: "Send title commitment to Derek.", dueDate: today(), dueTime: "09:00", status: "Completed", priority: "Medium", assignedUserId: "u_marcus", completionNotes: "Delivered at 9:12am." },
  { id: "t22", buyerId: "b8", propertyId: "p8", taskType: "Follow-Up Call", description: "Call Bethany about probate status.", dueDate: past(15), dueTime: "11:00", status: "Cancelled", priority: "Low", assignedUserId: "u_tom", completionNotes: "Property on hold — no update to give." },
  { id: "t23", buyerId: "b13", propertyId: "p2", taskType: "Follow-Up Call", description: "Call Sam with the roof details and gauge offer readiness.", dueDate: today(), dueTime: "11:30", status: "Scheduled", priority: "Medium", assignedUserId: "u_sarah" },
  { id: "t24", buyerId: "b15", propertyId: "p7", taskType: "Send SMS", description: "Kevin asked to be told about entry-level Dallas deals.", dueDate: null, dueTime: null, status: "Scheduled", priority: "Low", assignedUserId: "u_tom" },
];

function today(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const seedTasks: Task[] = taskRows.map((t) => ({
  orgId: ORG_ID,
  buyerId: null,
  propertyId: null,
  relatedInteractionId: null,
  taskType: "Follow-Up Call",
  dueDate: null,
  dueTime: null,
  assignedUserId: "u_sarah",
  priority: "Medium",
  completionNotes: "",
  createdAt: ts(20),
  completedAt: t.status === "Completed" ? ts(t.id === "t21" ? 0 : 4, 9, 15) : null,
  ...t,
}) as Task);

type OfferSeed = Partial<Offer> & Pick<Offer, "id" | "buyerId" | "propertyId" | "amount" | "status">;

const offerRows: OfferSeed[] = [
  { id: "o1", buyerId: "b7", propertyId: "p2", amount: 161000, offerDate: past(19), status: "Under Review", terms: "Cash, 14-day close", expiresAt: future(3), negotiationNotes: "Seller weighing against a second offer.", nextAction: "Present counter", createdBy: "u_sarah" },
  { id: "o2", buyerId: "b5", propertyId: "p2", amount: 165500, offerDate: past(6), status: "Draft", terms: "Cash, 21-day close, subject to inspection", expiresAt: null, negotiationNotes: "Victor is waiting on the inspection report before submitting.", nextAction: "Send inspection report", createdBy: "u_tom" },
  { id: "o3", buyerId: "b3", propertyId: "p3", amount: 118000, offerDate: past(30), status: "Accepted", terms: "Cash, 10-day close", expiresAt: null, negotiationNotes: "Assignment fee $21k on top.", nextAction: "Confirm closing date", createdBy: "u_owner" },
  { id: "o4", buyerId: "b5", propertyId: "p6", amount: 170000, offerDate: past(18), status: "Countered", terms: "Cash, 15-day close", expiresAt: future(4), negotiationNotes: "Buyer countered at $170k; deal landed at $174k assignment.", nextAction: "Follow up after appraisal", createdBy: "u_sarah" },
  { id: "o5", buyerId: "b7", propertyId: "p6", amount: 174000, offerDate: past(16), status: "Accepted", terms: "Cash, 12-day close", expiresAt: null, negotiationNotes: "Assignment accepted.", nextAction: "Track appraisal", createdBy: "u_owner" },
  { id: "o6", buyerId: "b15", propertyId: "p7", amount: 148000, offerDate: past(72), status: "Rejected", terms: "Financed, 30-day close", expiresAt: null, negotiationNotes: "Outbid by cash.", nextAction: "", createdBy: "u_marcus" },
  { id: "o7", buyerId: "b6", propertyId: "p7", amount: 155000, offerDate: past(75), status: "Accepted", terms: "Cash, 9-day close", expiresAt: null, negotiationNotes: "Closed.", nextAction: "", createdBy: "u_owner" },
  { id: "o8", buyerId: "b9", propertyId: "p5", amount: 192000, offerDate: "", status: "Draft", terms: "Cash, 14-day close", expiresAt: null, negotiationNotes: "Grant said the ask is ~$15k high; expect a formal offer soon.", nextAction: "Send price justification", createdBy: "u_marcus" },
  { id: "o9", buyerId: "b1", propertyId: "p1", amount: 140000, offerDate: "", status: "Draft", terms: "Cash — verbal only", expiresAt: null, negotiationNotes: "Possible offer mentioned on a call — unconfirmed, pending partner review.", nextAction: "Confirm the number", createdBy: "u_sarah" },
];

export const seedOffers: Offer[] = offerRows.map((o) => ({
  orgId: ORG_ID,
  offerDate: o.offerDate ?? "",
  terms: "",
  expiresAt: null,
  negotiationNotes: "",
  nextAction: "",
  createdBy: "u_sarah",
  createdAt: ts(10),
  updatedAt: ts(2),
  ...o,
}) as Offer);

export function createSeed(): DB {
  return {
    version: 1,
    organization: { id: ORG_ID, name: "Summit Property Buyers", createdAt: ts(120) },
    users: seedUsers,
    properties: seedProperties,
    buyers: seedBuyers,
    relationships: seedRelationships,
    interactions: seedInteractions,
    tasks: seedTasks,
    offers: seedOffers,
    settings: seedSettings,
  };
}
