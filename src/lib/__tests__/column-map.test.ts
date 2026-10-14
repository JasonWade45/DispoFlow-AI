import { describe, expect, it } from "vitest";
import {
  buildColumnMapSystemPrompt,
  buildColumnMapUserPrompt,
  mergeMappings,
  parseAiColumnMapping,
  pickSampleRows,
  toColumnMappings,
} from "@/lib/ai/column-map";

const headers = ["Property Address", "Status", "Price", "Buyer Name", "Phone", "Interest Status"];
const rows = [
  ["6582 Splitpine Ct, Atlanta, GA 30318", "Interested", "$145,000", "Melissa R Fletcher", "(678) 949-0192", "Interested"],
  ["123 Main St, Dallas, GA 30157", "SOLD", "$90,000", "John Doe", "555-123-4567", "Undecided"],
];

describe("buildColumnMap prompts", () => {
  it("system prompt requires a street-address column and bans status words", () => {
    const p = buildColumnMapSystemPrompt();
    expect(p).toContain("address (REQUIRED)");
    expect(p).toContain("SOLD");
    expect(p).toContain('"mapping"');
  });

  it("user prompt includes headers with indices and sample rows", () => {
    const p = buildColumnMapUserPrompt(headers, rows);
    expect(p).toContain("0: Property Address");
    expect(p).toContain("5: Interest Status");
    expect(p).toContain("6582 Splitpine Ct");
  });
});

describe("parseAiColumnMapping", () => {
  it("parses a valid mapping", () => {
    const content = JSON.stringify({ mapping: { address: 0, status: 1, askingPrice: 2, buyerName: 3, interestStatus: 5 }, notes: "clear sheet" });
    const r = parseAiColumnMapping(content, headers, rows);
    expect(r).not.toBeNull();
    expect(r!.mapping).toEqual({ address: 0, status: 1, askingPrice: 2, buyerName: 3, interestStatus: 5 });
    expect(r!.notes).toBe("clear sheet");
    expect(r!.addressValid).toBe(true);
  });

  it("rejects invalid JSON", () => {
    expect(parseAiColumnMapping("not json", headers, rows)).toBeNull();
  });

  it("returns a partial mapping with addressValid=false when address is missing", () => {
    const r = parseAiColumnMapping(JSON.stringify({ mapping: { status: 1 }, notes: "no address here" }), headers, rows);
    expect(r).not.toBeNull();
    expect(r!.mapping).toEqual({ status: 1 });
    expect(r!.addressValid).toBe(false);
    expect(r!.notes).toBe("no address here");
  });

  it("drops a suggested address column that does not look like street addresses", () => {
    const content = JSON.stringify({ mapping: { address: 1, status: 0 }, notes: "col 1 is status words" });
    const r = parseAiColumnMapping(content, headers, rows);
    expect(r).not.toBeNull();
    expect(r!.mapping).toEqual({ status: 0 });
    expect(r!.addressValid).toBe(false);
    expect(r!.notes).toBe("col 1 is status words");
  });

  it("drops out-of-range and duplicate column indices", () => {
    const content = JSON.stringify({ mapping: { address: 0, status: 0, askingPrice: 99 } });
    const r = parseAiColumnMapping(content, headers, rows);
    expect(r).not.toBeNull();
    expect(r!.mapping).toEqual({ address: 0 });
  });

  it("drops unknown field keys", () => {
    const content = JSON.stringify({ mapping: { address: 0, bogusField: 1, status: 1 } });
    const r = parseAiColumnMapping(content, headers, rows);
    expect(r!.mapping).toEqual({ address: 0, status: 1 });
  });

  it("accepts column letters instead of indices", () => {
    const content = JSON.stringify({ mapping: { address: "A", status: "B" } });
    const r = parseAiColumnMapping(content, headers, rows);
    expect(r!.mapping).toEqual({ address: 0, status: 1 });
  });
});

describe("pickSampleRows", () => {
  const filled = (tag: string) => [`${tag} St, Atlanta, GA`, "Interested", "$100,000", "John Doe", "555-0100", "call him"];

  it("returns all rows when under the max", () => {
    const rows = [filled("A"), filled("B")];
    expect(pickSampleRows(rows)).toHaveLength(2);
  });

  it("prefers data-dense rows over legend/empty rows and spreads across the sheet", () => {
    const legend = [
      ["Property", "", "", "", "", ""],
      ["Interested", "", "", "", "", ""],
      ["Undecided", "", "", "", "", ""],
      ["", "", "", "", "", ""],
      ["", "", "", "", "", ""],
    ];
    const data = Array.from({ length: 60 }, (_, i) => filled(`Data${i}`));
    const picked = pickSampleRows([...legend, ...data], 8);
    expect(picked.length).toBeLessThanOrEqual(8);
    expect(picked.every((r) => r[1] !== "")).toBe(true);
    const firstDataIdx = picked.findIndex((r) => r[0].startsWith("Data"));
    const lastDataIdx = picked.length - 1 - [...picked].reverse().findIndex((r) => r[0].startsWith("Data"));
    expect(firstDataIdx).toBeGreaterThanOrEqual(0);
    expect(lastDataIdx).toBeGreaterThan(firstDataIdx);
  });

  it("falls back to evenly spaced rows when nothing is data-dense", () => {
    const rows = Array.from({ length: 50 }, (_, i) => [`row ${i}`, "", "", "", "", ""]);
    const picked = pickSampleRows(rows, 5);
    expect(picked.length).toBeLessThanOrEqual(5);
    expect(picked.length).toBeGreaterThan(1);
  });

  it("keeps sparse address-only property header rows in grouped sheets", () => {
    const rows: string[][] = [["", "", "", "", "", ""]];
    for (let i = 0; i < 30; i++) {
      rows.push(["Interested", "Facebook", "$100,000", "John Doe", "555-0100", "call him"]);
    }
    rows.splice(5, 0, ["", "1110 Buckhurst Dr, Atlanta, GA 30349", "", "", "", ""]);
    rows.splice(15, 0, ["", "1401 Alleen Ave SW, Atlanta, GA 30310", "", "", "", ""]);

    const picked = pickSampleRows(rows, 8);
    expect(picked.length).toBeLessThanOrEqual(8);
    expect(picked.some((r) => (r[1] ?? "").includes("Buckhurst"))).toBe(true);
    expect(picked.some((r) => (r[1] ?? "").includes("Alleen"))).toBe(true);
    expect(picked.some((r) => r[3] === "John Doe")).toBe(true);
  });
});

describe("toColumnMappings", () => {
  it("builds ColumnMapping rows with header names and ai source", () => {
    const out = toColumnMappings({ address: 0, status: 1 }, headers);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({
      logicalField: "address",
      columnLetter: "A",
      headerName: "Property Address",
      source: "ai",
    });
    expect(out[1].logicalField).toBe("status");
    expect(out[1].columnLetter).toBe("B");
  });

  it("handles column indices past Z", () => {
    const h = Array.from({ length: 27 }, (_, i) => `Col ${i}`);
    const out = toColumnMappings({ address: 26 }, h);
    expect(out[0].columnLetter).toBe("AA");
  });
});

describe("mergeMappings", () => {
  it("prefers AI mappings over header-name matches for the same field", () => {
    const base = toColumnMappings({ address: 0, status: 1 }, headers);
    const overlay = toColumnMappings({ address: 2 }, headers);
    const merged = mergeMappings(base, overlay);
    const address = merged.find((m) => m.logicalField === "address");
    expect(address?.columnLetter).toBe("C");
    const status = merged.find((m) => m.logicalField === "status");
    expect(status?.columnLetter).toBe("B");
  });

  it("keeps base fields the AI did not map and drops base fields that reuse an AI column", () => {
    const base = toColumnMappings({ address: 0, status: 1, askingPrice: 2 }, headers);
    const overlay = toColumnMappings({ interestStatus: 1 }, headers);
    const merged = mergeMappings(base, overlay);
    const fields = merged.map((m) => m.logicalField);
    expect(fields).toContain("interestStatus");
    expect(fields).toContain("address");
    expect(fields).not.toContain("status");
    expect(fields).toContain("askingPrice");
    expect(merged.map((m) => m.columnLetter).filter((l, i, a) => a.indexOf(l) !== i)).toHaveLength(0);
  });
});
