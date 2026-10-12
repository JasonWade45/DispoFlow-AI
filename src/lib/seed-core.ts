import type { Buyer, BuyerProperty, Property } from "@/types";
import { addDaysIso } from "@/lib/format";

export const ORG_ID = "org_summit";

export function ts(daysAgo: number, hour = 10, min = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, min, 0, 0);
  return d.toISOString();
}

export function future(days: number): string {
  return addDaysIso(days);
}

export function past(days: number): string {
  return addDaysIso(-days);
}

type PropertySeed = Partial<Property> &
  { id: string; address: string; city: string; state: string; zip: string };

const propertySeed: PropertySeed[] = [
  { id: "p1", address: "4812 Maple Grove Dr", city: "Dallas", state: "TX", zip: "75228", status: "Marketing", accessType: "Appointments", askingPrice: 189000, arv: 265000, estimatedRepairs: 32000, marketingStartedAt: past(21), expectedClosingDate: future(24), notes: "Vacant. Roof replaced in 2021. Easy showing — lockbox on side gate." },
  { id: "p2", address: "1130 Birchwood Ave", city: "Phoenix", state: "AZ", zip: "85033", status: "Offer Received", accessType: "Open", askingPrice: 172500, arv: 240000, estimatedRepairs: 28000, marketingStartedAt: past(34), expectedClosingDate: future(18), notes: "Two offers under review. Seller motivated — inherited property." },
  { id: "p3", address: "905 Sollars Rd", city: "Cleveland", state: "OH", zip: "44112", status: "Under Contract", accessType: "Lockbox", askingPrice: 118000, arv: 175000, estimatedRepairs: 41000, assignmentPrice: 139000, marketingStartedAt: past(48), expectedClosingDate: future(11), notes: "Assignment deal. Title work in progress." },
  { id: "p4", address: "2771 Rayford Ln", city: "Houston", state: "TX", zip: "77073", status: "Available", accessType: "Appointments", askingPrice: 154000, arv: 210000, estimatedRepairs: 25000, notes: "Photos pending. Ready to list this week." },
  { id: "p5", address: "614 Peachtree Hollow Ct", city: "Atlanta", state: "GA", zip: "30318", status: "Marketing", accessType: "Lockbox", askingPrice: 205000, arv: 285000, estimatedRepairs: 35000, marketingStartedAt: past(15), notes: "Strong ARV neighborhood. Buyer demand high." },
  { id: "p6", address: "3380 W Michigan Ave", city: "Phoenix", state: "AZ", zip: "85035", status: "Pending", accessType: "Open", askingPrice: 166000, arv: 228000, estimatedRepairs: 30000, assignmentPrice: 174000, marketingStartedAt: past(40), expectedClosingDate: future(6), notes: "Inspection completed. Awaiting appraisal." },
  { id: "p7", address: "8412 Ironwood St", city: "Dallas", state: "TX", zip: "75241", status: "Sold", accessType: "Lockbox", askingPrice: 142000, arv: 198000, estimatedRepairs: 22000, assignmentPrice: 155000, marketingStartedAt: past(96), expectedClosingDate: past(12), notes: "Closed with cash buyer. Keep in history for comps." },
  { id: "p8", address: "1523 Halsted Rd", city: "Cleveland", state: "OH", zip: "44108", status: "On Hold", accessType: "Appointments", askingPrice: 99500, arv: 152000, estimatedRepairs: 38000, marketingStartedAt: past(62), notes: "On hold until seller resolves probate." },
  { id: "p9", address: "720 N Wing St", city: "Houston", state: "TX", zip: "77003", status: "Cancelled", accessType: "", askingPrice: 131000, arv: 178000, estimatedRepairs: 26000, marketingStartedAt: past(75), notes: "Seller backed out. Do not re-market without owner approval." },
  { id: "p10", address: "4025 Cedar Hill Ln", city: "Atlanta", state: "GA", zip: "30331", status: "Available", accessType: "Open", askingPrice: 178000, arv: 246000, estimatedRepairs: 29000 },
];

export const seedProperties: Property[] = propertySeed.map((p) => ({
  orgId: ORG_ID,
  accessType: "",
  askingPrice: null,
  arv: null,
  estimatedRepairs: null,
  assignmentPrice: null,
  marketingStartedAt: null,
  expectedClosingDate: null,
  notes: "",
  createdAt: ts(60),
  updatedAt: ts(3),
  createdBy: "u_owner",
  propertyType: "",
  bedrooms: "",
  bathrooms: "",
  sqft: "",
  lotSize: "",
  yearBuilt: "",
  listingUrl: "",
  photosUrl: "",
  sourceWebsite: "",
  sourcePropertyId: "",
  sourceRowId: "",
  firstImportedAt: null,
  lastSyncedAt: null,
  syncStatus: "never",
  ...p,
}) as Property);

type BuyerSeed = Partial<Buyer> & { id: string; fullName: string };

const buyerSeed: BuyerSeed[] = [
  { id: "b1", fullName: "John Calloway", companyName: "Calloway Property Group", phone: "(214) 555-0138", email: "john@callowayhomes.com", preferredContactMethod: "SMS", preferredMarkets: ["Dallas, TX", "Houston, TX"], propertyTypes: ["Single Family"], budgetMin: 120000, budgetMax: 200000, notes: "Prefers SMS over calls. Decisions go through his business partner, Rick." },
  { id: "b2", fullName: "Priya Nair", companyName: "Lone Star Capital Homes", phone: "(713) 555-0171", email: "priya@lonestarcapital.io", preferredContactMethod: "Email", preferredMarkets: ["Houston, TX", "Dallas, TX"], propertyTypes: ["Single Family", "Townhome"], budgetMin: 140000, budgetMax: 260000, notes: "Wants comps attached to every email." },
  { id: "b3", fullName: "Derek Simmons", companyName: "Buckeye Buy & Hold LLC", phone: "(216) 555-0110", email: "derek@buckeyebnh.com", preferredContactMethod: "Phone", preferredMarkets: ["Cleveland, OH"], propertyTypes: ["Single Family"], budgetMin: 80000, budgetMax: 160000, notes: "Cash buyer, closes fast. Hates waiting on title updates." },
  { id: "b4", fullName: "Alicia Monroe", companyName: "Monroe Renovation Co.", phone: "(404) 555-0193", email: "alicia@monroerenovate.com", preferredContactMethod: "Phone", preferredMarkets: ["Atlanta, GA"], propertyTypes: ["Single Family"], budgetMin: 150000, budgetMax: 300000 },
  { id: "b5", fullName: "Victor Huang", companyName: "AZ Fix & Flip Partners", phone: "(602) 555-0155", email: "victor@azfixflip.com", preferredContactMethod: "Email", preferredMarkets: ["Phoenix, AZ"], propertyTypes: ["Single Family", "Condo"], budgetMin: 100000, budgetMax: 220000, notes: "Always asks for the inspection report before committing." },
  { id: "b6", fullName: "Renee Foster", phone: "(972) 555-0166", email: "renee.foster@gmail.com", preferredContactMethod: "SMS", preferredMarkets: ["Dallas, TX"], propertyTypes: ["Single Family"], budgetMin: 90000, budgetMax: 175000, notes: "First-time investor. Needs more hand-holding." },
  { id: "b7", fullName: "Omar Haddad", companyName: "Haddad Equity Group", phone: "(602) 555-0122", email: "omar@haddadequity.com", preferredContactMethod: "Phone", preferredMarkets: ["Phoenix, AZ", "Houston, TX"], propertyTypes: ["Single Family"], budgetMin: 130000, budgetMax: 250000, notes: "Usually counteroffers 8–10% below ask." },
  { id: "b8", fullName: "Bethany Cole", companyName: "Cole Family Rentals", phone: "(216) 555-0147", email: "bethany@colerentals.com", preferredContactMethod: "Email", preferredMarkets: ["Cleveland, OH"], propertyTypes: ["Single Family", "Small Multi (2–4)"], budgetMin: 75000, budgetMax: 145000, notes: "Buys for cash flow, not flips." },
  { id: "b9", fullName: "Grant Mueller", companyName: "Mueller Capital LLC", phone: "(404) 555-0184", email: "grant@muellercapital.com", preferredContactMethod: "Phone", preferredMarkets: ["Atlanta, GA"], propertyTypes: ["Single Family"], budgetMin: 160000, budgetMax: 320000, notes: "Portfolio buyer — 4 doors closed last year." },
  { id: "b10", fullName: "Tanya Brooks", phone: "(713) 555-0109", email: "tbrooks@outlook.com", preferredContactMethod: "SMS", preferredMarkets: ["Houston, TX"], propertyTypes: ["Single Family"], budgetMin: 100000, budgetMax: 180000, status: "Inactive", notes: "Went quiet after the last deal fell through. Revisit next quarter." },
  { id: "b11", fullName: "Hector Ramos", companyName: "Ramos & Sons Construction", phone: "(214) 555-0198", email: "hector@ramosandsons.com", preferredContactMethod: "Phone", preferredMarkets: ["Dallas, TX"], propertyTypes: ["Single Family"], budgetMin: 110000, budgetMax: 190000 },
  { id: "b12", fullName: "Lauren Pike", companyName: "Pike Residential", phone: "(404) 555-0136", email: "lauren@pikeresidential.com", preferredContactMethod: "Email", preferredMarkets: ["Atlanta, GA"], propertyTypes: ["Townhome", "Condo"], budgetMin: 130000, budgetMax: 230000, status: "Do Not Contact", notes: "Requested no further contact. Honor it." },
  { id: "b13", fullName: "Sam Okafor", companyName: "Okafor Investments", phone: "(602) 555-0177", email: "sam@okaforinv.com", preferredContactMethod: "SMS", preferredMarkets: ["Phoenix, AZ"], propertyTypes: ["Single Family"], budgetMin: 120000, budgetMax: 210000 },
  { id: "b14", fullName: "Marissa Dante", companyName: "Dante Home Buyers", phone: "(216) 555-0163", email: "marissa@dantehomebuyers.com", preferredContactMethod: "Phone", preferredMarkets: ["Cleveland, OH", "Akron, OH"], propertyTypes: ["Single Family"], budgetMin: 70000, budgetMax: 150000, notes: "Runs a tight spreadsheet — send numbers in writing." },
  { id: "b15", fullName: "Kevin Park", phone: "(972) 555-0125", email: "kevin.park@gmail.com", preferredContactMethod: "SMS", preferredMarkets: ["Dallas, TX"], propertyTypes: ["Single Family"], budgetMin: 85000, budgetMax: 155000, notes: "Wants entry-level deals only." },
];

export const seedBuyers: Buyer[] = buyerSeed.map((b) => ({
  orgId: ORG_ID,
  companyName: "",
  phone: "",
  email: "",
  preferredContactMethod: "",
  preferredMarkets: [],
  propertyTypes: [],
  budgetMin: null,
  budgetMax: null,
  status: "Active",
  notes: "",
  createdAt: ts(55),
  updatedAt: ts(2),
  createdBy: "u_owner",
  ...b,
}) as Buyer);

type RelSeed = Partial<BuyerProperty> & { id: string; buyerId: string; propertyId: string };

const relSeed: RelSeed[] = [
  { id: "r1", buyerId: "b1", propertyId: "p1", interestStatus: "Price Concern", firstContactDate: past(8), lastInteractionDate: past(1), nextAction: "Confirm decision after partner review", interestNotes: "Wants to run numbers with his partner Rick." },
  { id: "r2", buyerId: "b6", propertyId: "p1", interestStatus: "Interested", firstContactDate: past(5), lastInteractionDate: past(2), nextFollowUpDate: future(1), nextAction: "Send repair estimate breakdown" },
  { id: "r3", buyerId: "b11", propertyId: "p1", interestStatus: "New", firstContactDate: past(1), interestNotes: "Came from the investor list blast." },
  { id: "r4", buyerId: "b7", propertyId: "p2", interestStatus: "Offer Submitted", firstContactDate: past(20), lastInteractionDate: past(3), nextFollowUpDate: past(2), nextAction: "Present counter to buyer", interestNotes: "Offered $161,000." },
  { id: "r5", buyerId: "b5", propertyId: "p2", interestStatus: "Needs Information", firstContactDate: past(12), lastInteractionDate: past(4), nextFollowUpDate: future(2), nextAction: "Send inspection report", interestNotes: "Waiting on repair numbers." },
  { id: "r6", buyerId: "b13", propertyId: "p2", interestStatus: "Interested", firstContactDate: past(9), lastInteractionDate: past(5) },
  { id: "r7", buyerId: "b3", propertyId: "p3", interestStatus: "Offer Submitted", firstContactDate: past(30), lastInteractionDate: past(6), nextFollowUpDate: future(3), nextAction: "Confirm closing date with buyer", interestNotes: "Assignment accepted at $139,000." },
  { id: "r8", buyerId: "b8", propertyId: "p3", interestStatus: "Undecided", firstContactDate: past(18), lastInteractionDate: past(14), nextAction: "Ask if she wants to stay in the loop", interestNotes: "Concerned about repair scope." },
  { id: "r9", buyerId: "b14", propertyId: "p3", interestStatus: "No Response", firstContactDate: past(16), lastInteractionDate: past(16), nextFollowUpDate: past(7), nextAction: "One more try, then mark inactive" },
  { id: "r10", buyerId: "b2", propertyId: "p4", interestStatus: "New", firstContactDate: past(2), nextFollowUpDate: future(4), nextAction: "Send listing package" },
  { id: "r11", buyerId: "b7", propertyId: "p4", interestStatus: "Interested", firstContactDate: past(2), lastInteractionDate: past(2), interestNotes: "Asked about ARV comps." },
  { id: "r12", buyerId: "b10", propertyId: "p4", interestStatus: "No Response", firstContactDate: past(11), lastInteractionDate: past(11) },
  { id: "r13", buyerId: "b4", propertyId: "p5", interestStatus: "Interested", firstContactDate: past(10), lastInteractionDate: past(2), nextFollowUpDate: future(1), nextAction: "Walk through together Thursday", interestNotes: "Wants to see it in person." },
  { id: "r14", buyerId: "b9", propertyId: "p5", interestStatus: "Price Concern", firstContactDate: past(7), lastInteractionDate: past(3), nextAction: "Prepare seller-side price justification", interestNotes: "Thinks ask is $15k above market." },
  { id: "r15", buyerId: "b12", propertyId: "p5", interestStatus: "Not Interested", firstContactDate: past(13), lastInteractionDate: past(13), interestNotes: "Asked to be removed from outreach." },
  { id: "r16", buyerId: "b5", propertyId: "p6", interestStatus: "Counteroffer", firstContactDate: past(26), lastInteractionDate: past(4), nextFollowUpDate: future(5), nextAction: "Follow up after appraisal", interestNotes: "Countered at $170,000." },
  { id: "r17", buyerId: "b7", propertyId: "p6", interestStatus: "Closed — Won", firstContactDate: past(28), lastInteractionDate: past(4), interestNotes: "Deal pending at $174,000 assignment." },
  { id: "r18", buyerId: "b6", propertyId: "p7", interestStatus: "Closed — Won", firstContactDate: past(80), lastInteractionDate: past(14), interestNotes: "Closed at $155,000." },
  { id: "r19", buyerId: "b15", propertyId: "p7", interestStatus: "Closed — Lost", firstContactDate: past(78), lastInteractionDate: past(70), interestNotes: "Lost to a higher offer." },
  { id: "r20", buyerId: "b8", propertyId: "p8", interestStatus: "Needs Information", firstContactDate: past(45), lastInteractionDate: past(20), nextAction: "Notify when probate clears" },
  { id: "r21", buyerId: "b3", propertyId: "p8", interestStatus: "Undecided", firstContactDate: past(41), lastInteractionDate: past(22) },
  { id: "r22", buyerId: "b11", propertyId: "p9", interestStatus: "Not Interested", firstContactDate: past(60), lastInteractionDate: past(58) },
  { id: "r23", buyerId: "b4", propertyId: "p10", interestStatus: "New", firstContactDate: past(3), nextAction: "First outreach — call this week" },
  { id: "r24", buyerId: "b9", propertyId: "p10", interestStatus: "Interested", firstContactDate: past(3), lastInteractionDate: past(3), nextFollowUpDate: future(6), nextAction: "Send rent comps" },
  { id: "r25", buyerId: "b1", propertyId: "p7", interestStatus: "Closed — Lost", firstContactDate: past(74), lastInteractionDate: past(69), interestNotes: "Outbid at the last minute." },
];

export const seedRelationships: BuyerProperty[] = relSeed.map((r) => ({
  orgId: ORG_ID,
  interestStatus: "New",
  interestNotes: "",
  firstContactDate: null,
  lastInteractionDate: null,
  nextFollowUpDate: null,
  nextAction: "",
  assignedUserId: "u_sarah",
  relationshipStatus: "Active",
  createdAt: ts(40),
  updatedAt: ts(2),
  lastContactedAt: null,
  lastMessageSentAt: null,
  lastCallAt: null,
  syncStatus: "never",
  sourceRowId: "",
  ...r,
}) as BuyerProperty);
