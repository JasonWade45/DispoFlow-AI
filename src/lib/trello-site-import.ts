// src/lib/trello-site-import.ts
// Parses a prepared "Trello export × elevatereg.com" JSON file and merges the
// matched properties into the database (additive, deduped by normalized address).

import type { DB, Property } from "@/types";
import { normalizeAddress } from "@/lib/sync";
import { uid } from "@/lib/format";

export const TRELLO_SITE_IMPORT_KIND = "dispoflow-trello-site-import";

export interface TrelloSiteImportRow {
  address: string;
  city: string;
  state: string;
  zip: string;
  status: string;
  askingPrice: number | null;
  propertyType: string;
  bedrooms: string;
  bathrooms: string;
  sqft: string;
  photos: string[];
  listingUrl: string;
  notes: string;
  trelloList: string;
  trelloCardName: string;
  trelloUrl: string;
}

export interface TrelloSiteImportCounts {
  created: number;
  updated: number;
  skipped: number;
}

/**
 * Maps a Trello list (column) name to a DispoFlow pipeline status.
 * The trailing "(closed)" marker on archived lists is ignored — it means the
 * list itself was archived in Trello, not that a deal closed.
 */
export function statusFromTrelloList(listName: string): string {
  const n = String(listName || "")
    .toLowerCase()
    .replace(/\(closed\)/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!n) return "Available";
  if (/under contract/.test(n)) return "Under Contract";
  if (/not funded/.test(n)) return "Pending";
  if (/\bclosed\b/.test(n)) return "Sold";
  if (/did not sell|on hold|not sold/.test(n)) return "On Hold";
  if (/archiv/.test(n)) return "On Hold";
  if (/offer/.test(n)) return "Offer Received";
  if (/active|coming soon|marketing|get ready/.test(n)) return "Marketing";
  if (
    /lead|research|new list|abraham|curtis|looking at|see if they sold|vip buyers|email blast|realtor blast|wholesalers/.test(
      n,
    )
  ) {
    return "Available";
  }
  return "Available";
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/** Reads and validates a prepared import file. Throws with a friendly message on bad input. */
export function parseTrelloSiteImport(text: string): TrelloSiteImportRow[] {
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("The file is not valid JSON.");
  }
  const p = payload as { kind?: unknown; properties?: unknown };
  if (!p || typeof p !== "object" || p.kind !== TRELLO_SITE_IMPORT_KIND || !Array.isArray(p.properties)) {
    throw new Error("This file is not a DispoFlow Trello × website import file.");
  }

  const rows: TrelloSiteImportRow[] = [];
  for (const item of p.properties) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const address = str(r.address);
    if (!address) continue;
    const trelloList = str(r.trelloList);
    const trelloUrl = str(r.trelloUrl);
    const desc = str(r.trelloDesc);
    const photos = Array.isArray(r.photos)
      ? r.photos.filter((u): u is string => typeof u === "string" && u.length > 0).slice(0, 6)
      : [];
    const askingPrice =
      typeof r.askingPrice === "number" && Number.isFinite(r.askingPrice) ? r.askingPrice : null;
    const notes = [desc, trelloUrl ? `Source: ${trelloUrl}` : ""].filter(Boolean).join("\n");

    rows.push({
      address,
      city: str(r.city),
      state: str(r.state),
      zip: str(r.zip),
      status: statusFromTrelloList(trelloList),
      askingPrice,
      propertyType: str(r.propertyType),
      bedrooms: str(r.bedrooms),
      bathrooms: str(r.bathrooms),
      sqft: str(r.sqft),
      photos,
      listingUrl: str(r.listingUrl),
      notes,
      trelloList,
      trelloCardName: str(r.trelloCardName),
      trelloUrl,
    });
  }
  if (!rows.length) throw new Error("No properties with an address were found in the file.");
  return rows;
}

/**
 * Pure merge: adds new properties and refreshes existing ones (matched by
 * normalized address). Duplicate addresses inside the file are skipped.
 */
export function applyTrelloSiteImport(
  db: DB,
  rows: TrelloSiteImportRow[],
  userId: string,
): { db: DB; counts: TrelloSiteImportCounts } {
  const ts = new Date().toISOString();
  const counts: TrelloSiteImportCounts = { created: 0, updated: 0, skipped: 0 };
  const existingByAddress = new Map(db.properties.map((p) => [normalizeAddress(p.address), p]));
  const patches = new Map<string, Partial<Property>>();
  const seen = new Set<string>();
  const created: Property[] = [];

  for (const row of rows) {
    const key = normalizeAddress(row.address);
    if (!key || seen.has(key)) {
      counts.skipped++;
      continue;
    }
    seen.add(key);

    const existing = existingByAddress.get(key);
    if (existing) {
      counts.updated++;
      patches.set(existing.id, {
        status: row.status,
        askingPrice: row.askingPrice ?? existing.askingPrice,
        city: existing.city || row.city,
        zip: existing.zip || row.zip,
        propertyType: existing.propertyType || row.propertyType,
        bedrooms: existing.bedrooms || row.bedrooms,
        bathrooms: existing.bathrooms || row.bathrooms,
        sqft: existing.sqft || row.sqft,
        notes: row.notes || existing.notes,
        listingUrl: row.listingUrl || existing.listingUrl,
        photos: row.photos.length ? row.photos : existing.photos,
        lastSyncedAt: ts,
        syncStatus: "synced",
        updatedAt: ts,
      });
      continue;
    }

    counts.created++;
    created.push({
      id: uid("pts_"),
      orgId: db.organization.id,
      address: row.address,
      city: row.city,
      state: row.state,
      zip: row.zip,
      accessInfo: "",
      status: row.status || "Available",
      accessType: "",
      askingPrice: row.askingPrice,
      arv: null,
      estimatedRepairs: null,
      assignmentPrice: null,
      marketingStartedAt: null,
      expectedClosingDate: null,
      notes: row.notes,
      propertyType: row.propertyType,
      bedrooms: row.bedrooms,
      bathrooms: row.bathrooms,
      sqft: row.sqft,
      lotSize: "",
      yearBuilt: "",
      listingUrl: row.listingUrl,
      photosUrl: row.photos[0] || "",
      photos: row.photos,
      sourceWebsite: "Trello",
      sourcePropertyId: row.trelloUrl,
      sourceRowId: row.trelloUrl,
      firstImportedAt: ts,
      lastSyncedAt: ts,
      syncStatus: "synced",
      createdBy: userId,
      createdAt: ts,
      updatedAt: ts,
    });
  }

  const properties = db.properties.map((p) => {
    const patch = patches.get(p.id);
    return patch ? { ...p, ...patch } : p;
  });

  return {
    db: { ...db, properties: [...properties, ...created] },
    counts,
  };
}
