import { describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vm from "node:vm";

const PARSER_PATH = path.join(
  __dirname,
  "../../../appsscript/dispo-follow-up-hub/parser.gs",
);

type AnyFn = (...args: unknown[]) => unknown;

function asFn(v: unknown): AnyFn {
  return v as AnyFn;
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

function loadParser(): Record<string, unknown> {
  const code = fs.readFileSync(PARSER_PATH, "utf8");
  const ctx = vm.createContext({});
  vm.runInContext(code, ctx);
  return ctx as Record<string, unknown>;
}

const ctx = loadParser();
const parsePropertySheet = asFn(ctx.parsePropertySheet);
const parseOfferAmount = asFn(ctx.parseOfferAmount);
const parseDateMdy = asFn(ctx.parseDateMdy);
const dedupeBuyers = asFn(ctx.dedupeBuyers);
const buyerKey = asFn(ctx.buyerKey);

const HEADERS = [
  "Status",
  "Source",
  "Offer",
  "Earnest",
  "Type",
  "Name",
  "Phone Number",
  "Email",
  "Last Touch Date",
  "Notes / Last Update",
];

function row(cells: unknown[]): unknown[] {
  // Pad to 10 columns (A..J) so backgrounds line up.
  return cells.concat(Array(10 - cells.length).fill(""));
}

function greenHeaderCell(): unknown[] {
  const out: unknown[] = [];
  for (let c = 0; c < 10; c++) out.push(c === 0 ? "#70ad47" : "");
  return out;
}

describe("dispo hub parser", () => {
  it("parses grouped property blocks, offer ranges, dates, and dedupes buyers", () => {
    const values: unknown[][] = [
      HEADERS,
      // Property block 1 — header row with "CODE IS 3344"
      row([
        "3344 Windsor Castle Ct, Decatur, GA 30034 – CODE IS 3344",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]),
      row([
        "Interested",
        "Dispo Genius",
        "145k",
        "2k",
        "Cash Buyer",
        "Alice Buyer",
        "(555) 123-4567",
        "alice@x.com",
        "10/5/2026",
        "likes the house",
      ]),
      // blank spacer row between blocks
      row(["", "", "", "", "", "", "", "", "", ""]),
      // Property block 2 — green header row, code detected from text
      row([
        "442 Oak Lane, Atlanta, GA 30309 – CODE IS 442",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]),
      row([
        "Undecided",
        "Facebook",
        "110-115K",
        "",
        "Realtor",
        "Bob Realtor",
        "555-987-6543",
        "",
        "10/12/2026",
        "",
      ]),
      // Same buyer (Alice) under a second property — same phone
      row([
        "Interested",
        "Dispo Genius",
        "140K",
        "",
        "Cash Buyer",
        "Alice Buyer",
        "(555) 123-4567",
        "alice@x.com",
        "10/6/2026",
        "still interested",
      ]),
      // blank spacer row
      row(["", "", "", "", "", "", "", "", "", ""]),
      // Property block 3
      row([
        "100 Main St, Anywhere, GA 30303 – CODE IS 100",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
        "",
      ]),
      // Alice again: "Remove Me" — same phone/email, flagged
      row([
        "Remove Me",
        "Dispo Genius",
        "",
        "",
        "",
        "Alice Buyer",
        "(555) 123-4567",
        "alice@x.com",
        "10/20/2026",
        "do not call",
      ]),
    ];

    const backgrounds: unknown[][] = [
      [],
      [],
      [],
      [],
      greenHeaderCell(), // green header row for block 2
      [],
      [],
      [],
      [],
      [],
    ];

    const result = asRecord(
      parsePropertySheet(values, backgrounds, { firstDataRow: 1 }),
    );
    const records = (result.records as unknown[]) as Record<string, unknown>[];

    expect(result.propertyCount).toBe(3);
    expect(result.orphanRows).toBe(0);
    expect(records).toHaveLength(4);

    // Offer parsing: "145k" -> 145000, original text kept
    expect(records[0].offerText).toBe("145k");
    expect(records[0].offerNumeric).toBe(145000);
    expect(records[0].earnestNumeric).toBe(2000);
    expect(records[0].propertyCode).toBe("3344");
    expect(records[0].propertyAddress).toBe(
      "3344 Windsor Castle Ct, Decatur, GA 30034",
    );
    // Date normalized to ISO, raw text kept
    expect(records[0].lastTouchRaw).toBe("10/5/2026");
    expect(records[0].lastTouchIso).toBe("2026-10-05");
    // Range offer "110-115K" -> average 112.5 * 1000 = 112500
    expect(records[1].offerText).toBe("110-115K");
    expect(records[1].offerNumeric).toBe(112500);
    expect(records[1].type).toBe("Realtor");
    // Same phone under block 2
    expect(records[2].propertyCode).toBe("442");
    expect(records[2].offerNumeric).toBe(140000);
    // Status kept as given
    expect(records[3].statusNormalized).toBe("Remove Me");

    // Deduplication: Alice appears 3 times (same phone) -> one buyer
    const buyers = (dedupeBuyers(records) as unknown[]) as Record<
      string,
      unknown
    >[];
    expect(buyers).toHaveLength(2);
    const alice = buyers.find((b) => (b as Record<string, unknown>).name === "Alice Buyer");
    expect(alice).toBeDefined();
    expect(
      ((alice as Record<string, unknown>).properties as unknown[]).length,
    ).toBe(3);
    expect((alice as Record<string, unknown>).doNotContact).toBe(true);
    expect(
      ((alice as Record<string, unknown>).statuses as unknown[]).includes(
        "Interested",
      ),
    ).toBe(true);
    expect(
      ((alice as Record<string, unknown>).statuses as unknown[]).includes(
        "Remove Me",
      ),
    ).toBe(true);
    expect((alice as Record<string, unknown>).phone).toBe("(555) 123-4567");
    const bob = buyers.find((b) => (b as Record<string, unknown>).name === "Bob Realtor");
    expect(
      ((bob as Record<string, unknown>).properties as unknown[]).length,
    ).toBe(1);
    expect((bob as Record<string, unknown>).doNotContact).toBe(false);
  });

  it("falls back to green background when header text lacks a code", () => {
    const values: unknown[][] = [
      HEADERS,
      row(["442 Oak Lane, Atlanta, GA 30309", "", "", "", "", "", "", "", "", ""]),
    ];
    const backgrounds: unknown[][] = [[], greenHeaderCell()];
    const result = asRecord(
      parsePropertySheet(values, backgrounds, { firstDataRow: 1 }),
    );
    expect(result.propertyCount).toBe(1);
    expect((result.records as unknown[])).toHaveLength(0);
  });

  it("skips rows before the first property header (orphans)", () => {
    const values: unknown[][] = [
      HEADERS,
      row([
        "Interested",
        "Dispo Genius",
        "145k",
        "",
        "",
        "Alice",
        "(555) 111-1111",
        "",
        "",
        "",
      ]),
      row(["3344 Windsor Castle Ct, Decatur, GA 30034 – CODE IS 3344", "", "", "", "", "", "", "", "", ""]),
      row([
        "Undecided",
        "Facebook",
        "110k",
        "",
        "",
        "Bob",
        "(555) 222-2222",
        "",
        "",
        "",
      ]),
    ];
    const result = asRecord(parsePropertySheet(values, [], { firstDataRow: 1 }));
    expect(result.orphanRows).toBe(1);
    const records = (result.records as unknown[]) as Record<string, unknown>[];
    expect(records).toHaveLength(1);
    expect(records[0].name).toBe("Bob");
  });
});

describe("dispo hub helpers", () => {
  it.each([
    ["145k", 145000],
    ["140K", 140000],
    ["110-115K", 112500],
    ["$140,000", 140000],
    ["2k", 2000],
    ["1,500", 1500],
    ["", null],
    ["no offer here", null],
  ])("parseOfferAmount(%s) -> %i", (text, expected) => {
    expect(parseOfferAmount(text)).toBe(expected);
  });

  it.each([
    ["10/5/2026", "2026-10-05"],
    ["1/3/2026", "2026-01-03"],
    ["10/5/26", "2026-10-05"], // lenient Date() fallback
    ["", null],
    ["not a date", null],
  ])("parseDateMdy(%s)", (text, expectedIso) => {
    const out = parseDateMdy(text);
    if (expectedIso === null) {
      expect(out).toBeNull();
    } else {
      expect(out).toEqual([text, expectedIso]);
    }
  });

  it("buyerKey prefers phone, then email, then name", () => {
    expect(buyerKey("Alice", "(555) 123-4567", "a@x.com")).toBe("p:5551234567");
    expect(buyerKey("Alice", "", "a@x.com")).toBe("e:a@x.com");
    expect(buyerKey("Alice", "", "")).toBe("n:alice");
    expect(buyerKey("", "", "")).toBeNull();
  });
});
