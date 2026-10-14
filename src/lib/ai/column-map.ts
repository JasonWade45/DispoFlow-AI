import type { ColumnMapping } from "@/types";
import { LOGICAL_FIELDS, indexToColumnLetter, columnLetterToIndex } from "@/lib/sheet-mapping";
import { callGroq, isGroqConfigured } from "@/lib/ai/groq";

export interface AiColumnMapResult {
  mapping: Record<string, number>;
  notes: string;
  addressValid: boolean;
}

// In grouped sheets one column legitimately holds several meanings:
// property rows show a price, buyer rows show their interest status.
const SHAREABLE_FIELDS = new Set(["status", "interestStatus", "askingPrice"]);

function canShareColumn(field: string, other: string): boolean {
  return SHAREABLE_FIELDS.has(field) && SHAREABLE_FIELDS.has(other);
}

export function buildColumnMapSystemPrompt(): string {
  return [
    "You map spreadsheet columns to CRM fields for a US real-estate wholesaling app.",
    "You receive column headers and sample data rows from one worksheet. Decide which column index (0-based) holds each field.",
    "",
    "Fields:",
    '- address (REQUIRED): the property street address, e.g. "123 Main St" or "6582 Splitpine Ct, Atlanta, GA 30318". Pick the column whose SAMPLE VALUES are street addresses (they start with a house number). NEVER pick a column whose values are status words (SOLD, Pending, Available, Interested, Undecided, Not Interested) or labels — that column is status or interestStatus, not an address. In GROUPED sheets the address column contains street addresses ONLY on property header rows (single filled cell), while the rows below it in the same column contain source names (Facebook, Zillow, Dipo Genuis) or are empty — if ANY column contains street addresses, that is the address column.',
    "- status: property pipeline status (Available, Marketing, Offer Received, Under Contract, Pending, Sold, On Hold, Cancelled). Map status ONLY when the column holds pipeline words for properties.",
    "- askingPrice / arv: money amounts. In GROUPED sheets one column often holds the price on property rows and interest words (Interested/Undecided) on the buyer rows below — when that is the pattern, map BOTH askingPrice and interestStatus (and status, if pipeline words appear) to that same column.",
    "- listingUrl / photosUrl: URLs.",
    "- buyerName / buyerPhone / buyerEmail: the contact person's details.",
    "- interestStatus: how the buyer feels about this property (Interested, Undecided, Not Interested...). If a column mixes buyer-interest words with a few pipeline words from legend rows (Sold, Pending), it is interestStatus — NOT status. Choose status only if the column is pipeline words on property rows.",
    "- offerAmount: money the buyer offered.",
    "- lastContactDate / lastMessageSentDate / nextFollowUpDate: dates.",
    "- followUpStatus: task or follow-up state.",
    "- notes: free text.",
    "- sourceRowId: a stable row identifier / id column.",
    "- lastModified: a last-edited timestamp.",
    "",
    "Rules:",
    "- Trust the SAMPLE VALUES over header names — headers may be missing, abbreviated, swapped, or themselves be data.",
    "- Each column may be used at most once, EXCEPT askingPrice / interestStatus / status, which may all share one column in grouped sheets (price on property rows, interest words on buyer rows). Only map fields you can identify confidently; skip the rest.",
    "- If the first row looks like data instead of headers, map by inspecting the values.",
    "- If NO column contains street addresses, return the fields you DID identify, set address only if truly confident, and in notes explain which columns you inspected, quote 1-2 example values from the most plausible candidates, and say why each is not an address.",
    '- Output JSON only: {"mapping": {"address": 0, "status": 1, ...}, "notes": "one short sentence about what you found"}',
  ].join("\n");
}

export function buildColumnMapUserPrompt(headers: string[], sampleRows: string[][]): string {
  const lines: string[] = [];
  lines.push("HEADERS (column index: value):");
  headers.forEach((h, i) => lines.push(`${i}: ${h || "(empty)"}`));
  lines.push("");
  lines.push("SAMPLE ROWS (arrays aligned to the header indices):");
  for (const row of sampleRows.slice(0, 12)) {
    const cells = headers.map((_, i) => (row[i] ?? "").slice(0, 80));
    lines.push(JSON.stringify(cells));
  }
  lines.push("");
  lines.push("Return the mapping JSON.");
  return lines.join("\n");
}

export function pickSampleRows(rows: string[][], max = 12): string[][] {
  if (rows.length <= max) return rows;
  const indexed = rows.map((row, idx) => ({ row, idx }));
  const picked = new Map<number, string[]>();

  const addSpread = (pool: Array<{ row: string[]; idx: number }>, budget: number) => {
    if (pool.length === 0 || budget <= 0) return;
    const step = Math.max(1, Math.ceil(pool.length / budget));
    for (let i = 0; i < pool.length && picked.size < max; i += step) {
      const item = pool[i];
      if (!picked.has(item.idx)) picked.set(item.idx, item.row);
    }
  };

  const streetLike = (row: string[]) => row.some((c) => /^\d+\s+\S/.test((c ?? "").trim()));
  const dense = (row: string[]) => row.filter((c) => c && c.trim()).length >= 3;

  // 1) rows containing street addresses — in grouped sheets the property header
  //    row has the address in a single cell and must not be filtered out
  addSpread(indexed.filter((r) => streetLike(r.row)), Math.ceil(max / 3));
  // 2) data-dense rows (buyer/contact rows in flat and grouped sheets)
  addSpread(indexed.filter((r) => dense(r.row)), max - picked.size);
  // 3) anything else, evenly spaced
  addSpread(indexed, max - picked.size);

  return [...picked.entries()].sort((a, b) => a[0] - b[0]).map(([, row]) => row);
}

function addressColumnLooksRight(idx: number, sampleRows: string[][]): boolean {
  const values = sampleRows
    .map((r) => (r[idx] ?? "").trim())
    .filter(Boolean)
    .slice(0, 24);
  if (values.length === 0) return true;
  const streetLike = values.filter((v) => /^\d+\s+\S/.test(v)).length;
  if (streetLike === 0) return false;
  if (values.length <= 4) return streetLike >= Math.ceil(values.length / 2);
  // grouped sheets: the address column mixes street addresses (property header
  // rows) with source names (buyer rows) — require a solid minority instead of a majority
  return streetLike >= 2 && streetLike >= Math.ceil(values.length * 0.25);
}

export function parseAiColumnMapping(
  content: string,
  headers: string[],
  sampleRows: string[][] = [],
): AiColumnMapResult | null {
  let obj: unknown;
  try {
    obj = JSON.parse(content);
  } catch {
    return null;
  }
  const root = obj as { mapping?: unknown; notes?: unknown };
  if (typeof root.mapping !== "object" || root.mapping === null) return null;

  const raw = root.mapping as Record<string, unknown>;
  const mapping: Record<string, number> = {};
  const used = new Map<number, string>();

  for (const field of LOGICAL_FIELDS) {
    const value = raw[field.key];
    if (value == null) continue;
    let idx: number;
    if (typeof value === "number") {
      idx = value;
    } else if (typeof value === "string" && /^[A-Za-z]+$/.test(value.trim())) {
      idx = columnLetterToIndex(value.trim());
    } else if (typeof value === "string" && /^\d+$/.test(value.trim())) {
      idx = Number(value.trim());
    } else {
      continue;
    }
    if (!Number.isInteger(idx) || idx < 0 || idx >= headers.length) continue;
    const taken = used.get(idx);
    if (taken !== undefined && !canShareColumn(field.key, taken)) continue;
    if (taken === undefined) used.set(idx, field.key);
    mapping[field.key] = idx;
  }

  let addressValid = false;
  if (mapping.address !== undefined) {
    if (addressColumnLooksRight(mapping.address, sampleRows)) {
      addressValid = true;
    } else {
      delete mapping.address;
    }
  }

  return {
    mapping,
    notes: typeof root.notes === "string" ? root.notes.trim() : "",
    addressValid,
  };
}

export function mergeMappings(base: ColumnMapping[], overlay: ColumnMapping[]): ColumnMapping[] {
  const out: ColumnMapping[] = [];
  const fields = new Set<string>();
  const claimed = new Map<number, string>(); // first (overlay) claim per column
  const overlayIdx = new Map<number, string>(); // allows shareable fields inside one source

  for (const m of overlay) {
    const idx = columnLetterToIndex(m.columnLetter);
    if (fields.has(m.logicalField)) continue;
    const taken = overlayIdx.get(idx);
    if (taken !== undefined && !canShareColumn(m.logicalField, taken)) continue;
    if (taken === undefined) overlayIdx.set(idx, m.logicalField);
    claimed.set(idx, m.logicalField);
    fields.add(m.logicalField);
    out.push(m);
  }
  for (const m of base) {
    const idx = columnLetterToIndex(m.columnLetter);
    if (fields.has(m.logicalField) || claimed.has(idx)) continue;
    claimed.set(idx, m.logicalField);
    fields.add(m.logicalField);
    out.push(m);
  }
  return out;
}

export function toColumnMappings(mapping: Record<string, number>, headers: string[]): ColumnMapping[] {
  const out: ColumnMapping[] = [];
  for (const field of LOGICAL_FIELDS) {
    const idx = mapping[field.key];
    if (idx === undefined) continue;
    out.push({
      logicalField: field.key,
      columnLetter: indexToColumnLetter(idx),
      headerName: headers[idx] ?? "",
      source: "ai",
    });
  }
  return out;
}

export async function groqAutoMapColumns(
  headers: string[],
  sampleRows: string[][],
): Promise<AiColumnMapResult | null> {
  if (!isGroqConfigured() || headers.length === 0) return null;
  const content = await callGroq(
    buildColumnMapSystemPrompt(),
    buildColumnMapUserPrompt(headers, sampleRows),
    0.1,
  );
  const result = parseAiColumnMapping(content, headers, sampleRows);
  if (!result || Object.keys(result.mapping).length === 0) return null;
  return result;
}
