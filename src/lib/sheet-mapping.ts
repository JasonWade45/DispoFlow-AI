import type { ColumnMapping } from "@/types";

export interface LogicalField {
  key: string;
  label: string;
  required?: boolean;
}

export const LOGICAL_FIELDS: LogicalField[] = [
  { key: "address", label: "Property Address", required: true },
  { key: "status", label: "Property Status" },
  { key: "askingPrice", label: "Asking Price" },
  { key: "arv", label: "ARV" },
  { key: "listingUrl", label: "Property Listing URL" },
  { key: "photosUrl", label: "Property Photos URL" },
  { key: "buyerName", label: "Buyer Name" },
  { key: "buyerPhone", label: "Buyer Phone" },
  { key: "buyerEmail", label: "Buyer Email" },
  { key: "interestStatus", label: "Buyer-Property Interest Status" },
  { key: "offerAmount", label: "Offer Amount" },
  { key: "lastContactDate", label: "Last Contact Date" },
  { key: "lastMessageSentDate", label: "Last Message Sent Date" },
  { key: "nextFollowUpDate", label: "Next Follow-up Date" },
  { key: "followUpStatus", label: "Follow-up Status" },
  { key: "notes", label: "Notes" },
  { key: "sourceRowId", label: "Source Row Identifier" },
  { key: "lastModified", label: "Last Modified Timestamp" },
];

export const HEADER_ALIASES: Record<string, string[]> = {
  address: ["address", "property address", "property", "full address", "location"],
  status: ["status", "property status", "stage", "pipeline"],
  askingPrice: ["asking price", "price", "ask", "asking", "list price"],
  arv: ["arv", "after repair value", "after repair", "arv estimate"],
  listingUrl: ["listing url", "listing", "property url", "link", "website"],
  photosUrl: ["photos url", "photos", "pictures", "images", "gallery", "photo"],
  buyerName: ["buyer name", "buyer", "name", "contact name", "full name"],
  buyerPhone: ["buyer phone", "phone", "phone number", "mobile", "cell"],
  buyerEmail: ["buyer email", "email", "email address", "e-mail"],
  interestStatus: ["interest status", "interest", "buyer status", "relationship status"],
  offerAmount: ["offer amount", "offer", "offer price", "submitted offer"],
  lastContactDate: ["last contact date", "last contact", "last touch", "last touch date"],
  lastMessageSentDate: ["last message sent date", "last message", "last message sent", "message date"],
  nextFollowUpDate: ["next follow-up date", "next follow up", "follow up date", "next followup", "due date"],
  followUpStatus: ["follow-up status", "follow up status", "followup status", "task status"],
  notes: ["notes", "notes / last update", "notes/last update", "last update", "comments", "remarks"],
  sourceRowId: ["source row id", "row id", "source id", "id"],
  lastModified: ["last modified", "last modified timestamp", "updated", "modified date"],
};

export function autoMap(headers: string[]): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];
  const usedColumns = new Set<number>();

  for (const field of LOGICAL_FIELDS) {
    const aliases = HEADER_ALIASES[field.key] ?? [field.key.toLowerCase()];
    let bestMatch = -1;
    let bestScore = 0;

    headers.forEach((header, idx) => {
      if (usedColumns.has(idx)) return;
      const h = header.toLowerCase().trim();
      for (const alias of aliases) {
        if (h === alias) {
          if (bestScore < 3) {
            bestScore = 3;
            bestMatch = idx;
          }
        } else if (h.includes(alias) || alias.includes(h)) {
          if (bestScore < 2) {
            bestScore = 2;
            bestMatch = idx;
          }
        }
      }
    });

    if (bestMatch >= 0 && bestScore >= 2) {
      usedColumns.add(bestMatch);
      mappings.push({
        logicalField: field.key,
        columnLetter: indexToColumnLetter(bestMatch),
        headerName: headers[bestMatch],
        source: "sheet",
      });
    }
  }
  return mappings;
}

export function indexToColumnLetter(idx: number): string {
  let n = idx;
  let letters = "";
  while (n >= 0) {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  }
  return letters;
}

export function columnLetterToIndex(letter: string): number {
  const clean = (letter || "").trim().toUpperCase();
  if (!/^[A-Z]+$/.test(clean)) return -1;
  let n = 0;
  for (const ch of clean) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

export function mappingColumnIndex(headers: string[], mapping: ColumnMapping): number {
  const byHeader = headers.findIndex((h) => h === mapping.headerName);
  if (byHeader >= 0) return byHeader;
  const byLetter = columnLetterToIndex(mapping.columnLetter);
  return byLetter >= 0 && byLetter < headers.length ? byLetter : -1;
}

export interface SheetRecord {
  _row: number;
  address: string;
  status: string;
  askingPrice: string;
  arv: string;
  listingUrl: string;
  photosUrl: string;
  buyerName: string;
  buyerPhone: string;
  buyerEmail: string;
  interestStatus: string;
  offerAmount: string;
  lastContactDate: string;
  lastMessageSentDate: string;
  nextFollowUpDate: string;
  followUpStatus: string;
  notes: string;
  sourceRowId: string;
  lastModified: string;
}

export function emptyRecord(row: number): SheetRecord {
  return {
    _row: row,
    address: "",
    status: "",
    askingPrice: "",
    arv: "",
    listingUrl: "",
    photosUrl: "",
    buyerName: "",
    buyerPhone: "",
    buyerEmail: "",
    interestStatus: "",
    offerAmount: "",
    lastContactDate: "",
    lastMessageSentDate: "",
    nextFollowUpDate: "",
    followUpStatus: "",
    notes: "",
    sourceRowId: "",
    lastModified: "",
  };
}

export function buildRecords(
  headers: string[],
  rows: string[][],
  mappings: ColumnMapping[],
  firstDataRow = 2,
): SheetRecord[] {
  const usable = mappings
    .map((m) => ({ field: m.logicalField, index: mappingColumnIndex(headers, m) }))
    .filter((m) => m.index >= 0 && m.field in emptyRecord(0));

  return rows.map((row, i) => {
    const record = emptyRecord(firstDataRow + i);
    for (const { field, index } of usable) {
      const raw = row[index];
      (record as unknown as Record<string, string>)[field] = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
    }
    return record;
  });
}
