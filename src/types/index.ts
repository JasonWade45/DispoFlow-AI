export type ID = string;

export type Role = "owner" | "team";

export interface Organization {
  id: ID;
  name: string;
  createdAt: string;
}

export interface User {
  id: ID;
  orgId: ID;
  name: string;
  email: string;
  role: Role;
  active: boolean;
}

export type PropertyStatus =
  | "Available"
  | "Marketing"
  | "Offer Received"
  | "Under Contract"
  | "Pending"
  | "Sold"
  | "On Hold"
  | "Cancelled";

export type AccessType = "Appointments" | "Lockbox" | "Open" | "";

export type SyncStatus = "never" | "synced" | "pending" | "error" | "conflict";

export interface Property {
  id: ID;
  orgId: ID;
  address: string;
  city: string;
  state: string;
  zip: string;
  status: string;
  accessType: string;
  askingPrice: number | null;
  arv: number | null;
  estimatedRepairs: number | null;
  assignmentPrice: number | null;
  marketingStartedAt: string | null;
  expectedClosingDate: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: ID;
  propertyType: string;
  bedrooms: string;
  bathrooms: string;
  sqft: string;
  lotSize: string;
  yearBuilt: string;
  listingUrl: string;
  photosUrl: string;
  sourceWebsite: string;
  sourcePropertyId: string;
  sourceRowId: string;
  firstImportedAt: string | null;
  lastSyncedAt: string | null;
  syncStatus: SyncStatus;
}

export type BuyerStatus = "Active" | "Inactive" | "Do Not Contact";
export type ContactMethod = "Phone" | "SMS" | "Email";

export interface Buyer {
  id: ID;
  orgId: ID;
  fullName: string;
  companyName: string;
  phone: string;
  email: string;
  preferredContactMethod: ContactMethod | "";
  preferredMarkets: string[];
  propertyTypes: string[];
  budgetMin: number | null;
  budgetMax: number | null;
  status: BuyerStatus;
  notes: string;
  createdAt: string;
  updatedAt: string;
  createdBy: ID;
}

export type InterestStatus =
  | "New"
  | "Interested"
  | "Undecided"
  | "Needs Information"
  | "Price Concern"
  | "Offer Submitted"
  | "Counteroffer"
  | "Accepted"
  | "Not Interested"
  | "No Response"
  | "Closed — Won"
  | "Closed — Lost";

export type RelationshipStatus = "Active" | "Paused" | "Closed";

export interface BuyerProperty {
  id: ID;
  orgId: ID;
  buyerId: ID;
  propertyId: ID;
  interestStatus: string;
  interestNotes: string;
  firstContactDate: string | null;
  lastInteractionDate: string | null;
  nextFollowUpDate: string | null;
  nextAction: string;
  assignedUserId: ID | null;
  relationshipStatus: RelationshipStatus;
  createdAt: string;
  updatedAt: string;
  lastContactedAt: string | null;
  lastMessageSentAt: string | null;
  lastCallAt: string | null;
  syncStatus: SyncStatus;
  sourceRowId: string;
}

export type InteractionType =
  | "Incoming SMS"
  | "Outgoing SMS"
  | "Incoming Email"
  | "Outgoing Email"
  | "Phone Call"
  | "Voicemail"
  | "Internal Note"
  | "Follow-Up Completed"
  | "Offer Created"
  | "Offer Updated"
  | "Status Changed"
  | "Other Interaction";

export type Direction = "in" | "out" | "internal" | "system";

export interface Interaction {
  id: ID;
  orgId: ID;
  buyerId: ID | null;
  propertyId: ID | null;
  eventType: InteractionType;
  direction: Direction;
  occurredAt: string;
  recordedAt: string;
  originalContent: string;
  enhancedNotes: string;
  outcome: string;
  potentialOfferAmount: number | null;
  potentialOfferConfirmed: boolean;
  nextAction: string;
  missingInfo: string[];
  isAiSuggestion: boolean;
  createdBy: ID;
  createdAt: string;
  updatedAt: string;
}

export type TaskStatus =
  | "Needs Scheduling"
  | "Scheduled"
  | "Due"
  | "Overdue"
  | "Completed"
  | "Cancelled";

export type Priority = "Low" | "Medium" | "High" | "Urgent";

export type CompletionVia = "sent" | "complete" | "cancelled" | null;

export interface Task {
  id: ID;
  orgId: ID;
  buyerId: ID | null;
  propertyId: ID | null;
  relatedInteractionId: ID | null;
  taskType: string;
  description: string;
  dueDate: string | null;
  dueTime: string | null;
  assignedUserId: ID;
  priority: Priority;
  status: Exclude<TaskStatus, "Due" | "Overdue">;
  completionNotes: string;
  createdAt: string;
  completedAt: string | null;
  completedVia: CompletionVia;
  sentAt: string | null;
}

export type OfferStatus =
  | "Draft"
  | "Submitted"
  | "Under Review"
  | "Countered"
  | "Accepted"
  | "Rejected"
  | "Withdrawn"
  | "Expired";

export interface Offer {
  id: ID;
  orgId: ID;
  buyerId: ID;
  propertyId: ID;
  amount: number;
  offerDate: string;
  terms: string;
  expiresAt: string | null;
  status: OfferStatus;
  negotiationNotes: string;
  nextAction: string;
  createdBy: ID;
  createdAt: string;
  updatedAt: string;
}

export interface Settings {
  propertyStatuses: string[];
  interestStatuses: string[];
  buyerStatuses: string[];
  offerStatuses: string[];
  taskTypes: string[];
  priorityRulesEnabled: boolean;
}

export type FieldSource = "app" | "sheet" | "newest";

export interface ColumnMapping {
  logicalField: string;
  columnLetter: string;
  headerName: string;
  source: FieldSource;
}

export interface SheetConnection {
  id: ID;
  orgId: ID;
  spreadsheetId: string;
  spreadsheetName: string;
  worksheetName: string;
  isConnected: boolean;
  lastSyncAt: string | null;
  lastSyncStatus: SyncStatus;
  lastSyncError: string | null;
  columnMappings: ColumnMapping[];
  createdAt: string;
  updatedAt: string;
}

export interface ImportHistoryEntry {
  id: ID;
  orgId: ID;
  source: string;
  importedAt: string;
  newCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  notes: string;
}

export interface SyncJob {
  id: ID;
  orgId: ID;
  connectionId: ID;
  startedAt: string;
  completedAt: string | null;
  status: "running" | "success" | "error" | "cancelled";
  pulledCount: number;
  pushedCount: number;
  errorCount: number;
  errorMessage: string | null;
}

export interface DB {
  version: number;
  organization: Organization;
  users: User[];
  properties: Property[];
  buyers: Buyer[];
  relationships: BuyerProperty[];
  interactions: Interaction[];
  tasks: Task[];
  offers: Offer[];
  settings: Settings;
  sheetConnections: SheetConnection[];
  importHistory: ImportHistoryEntry[];
  syncJobs: SyncJob[];
}

export interface Session {
  userId: ID | null;
  user: User | null;
}
