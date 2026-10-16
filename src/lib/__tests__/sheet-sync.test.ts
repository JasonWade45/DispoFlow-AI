import { beforeEach, describe, expect, it } from "vitest";
import { createSeed } from "@/lib/seed-work";
import { getDb, updateDb } from "@/lib/store";
import {
  addBuyer,
  addProperty,
  createTask,
  linkBuyerToProperty,
} from "@/lib/actions";
import {
  applySheetRecords,
  buildSyncRecords,
  formatSheetSyncSummary,
  isSheetSyncDue,
  parseSheetDate,
} from "@/lib/sheet-sync";
import type { SheetSyncResult } from "@/lib/sheet-sync";
import {
  autoMap,
  buildRecords,
  columnLetterToIndex,
  detectGroupedRows,
  indexToColumnLetter,
} from "@/lib/sheet-mapping";
import type { ColumnMapping, SheetConnection } from "@/types";

const HEADERS = [
  "Address",
  "Status",
  "Price",
  "ARV",
  "Buyer Name",
  "Buyer Phone",
  "Buyer Email",
  "Interest Status",
  "Offer Amount",
  "Notes",
  "Next Follow-up Date",
  "Follow-up Status",
];

const MAPPINGS: ColumnMapping[] = [
  { logicalField: "address", columnLetter: "A", headerName: "Address", source: "sheet" },
  { logicalField: "status", columnLetter: "B", headerName: "Status", source: "sheet" },
  { logicalField: "askingPrice", columnLetter: "C", headerName: "Price", source: "sheet" },
  { logicalField: "arv", columnLetter: "D", headerName: "ARV", source: "sheet" },
  { logicalField: "buyerName", columnLetter: "E", headerName: "Buyer Name", source: "sheet" },
  { logicalField: "buyerPhone", columnLetter: "F", headerName: "Buyer Phone", source: "sheet" },
  { logicalField: "buyerEmail", columnLetter: "G", headerName: "Buyer Email", source: "sheet" },
  { logicalField: "interestStatus", columnLetter: "H", headerName: "Interest Status", source: "sheet" },
  { logicalField: "offerAmount", columnLetter: "I", headerName: "Offer Amount", source: "sheet" },
  { logicalField: "notes", columnLetter: "J", headerName: "Notes", source: "sheet" },
  { logicalField: "nextFollowUpDate", columnLetter: "K", headerName: "Next Follow-up Date", source: "sheet" },
  { logicalField: "followUpStatus", columnLetter: "L", headerName: "Follow-up Status", source: "sheet" },
];

function recordsFrom(rows: string[][]) {
  return buildRecords(HEADERS, rows, MAPPINGS);
}

function reset() {
  localStorage.clear();
  updateDb(() => createSeed());
}

function seedSheetProperty(overrides: Partial<Record<string, string>> = {}) {
  const ts = new Date().toISOString();
  return addProperty({
    address: "1 Test St",
    city: "Austin",
    state: "TX",
    zip: "78701",
    status: "Available",
    askingPrice: 200000,
    arv: null,
    estimatedRepairs: null,
    assignmentPrice: null,
    expectedClosingDate: null,
    notes: "app notes",
    userId: "u_owner",
    sourceWebsite: "google-sheets",
    sourceRowId: overrides.sourceRowId ?? "2",
    lastSyncedAt: ts,
    syncStatus: "synced",
  });
}

describe("sheet-mapping", () => {
  it("buildRecords maps cells by header and trims values", () => {
    const recs = recordsFrom([["10 New Rd, Austin, TX 78701", "Pending", "$150,000", "", "", "", "", "", "", "  hi  "]]);
    expect(recs).toHaveLength(1);
    expect(recs[0]._row).toBe(2);
    expect(recs[0].address).toBe("10 New Rd, Austin, TX 78701");
    expect(recs[0].status).toBe("Pending");
    expect(recs[0].askingPrice).toBe("$150,000");
    expect(recs[0].notes).toBe("hi");
    expect(recs[0].arv).toBe("");
  });

  it("autoMap matches common header names", () => {
    const mappings = autoMap(["Property Address", "Price", "ARV", "Buyer Name", "Unknown Col"]);
    const fields = mappings.map((m) => m.logicalField);
    expect(fields).toContain("address");
    expect(fields).toContain("askingPrice");
    expect(fields).toContain("arv");
    expect(fields).toContain("buyerName");
    expect(fields).not.toContain("notes");
  });

  it("autoMap skips empty headers instead of matching them to every field", () => {
    const mappings = autoMap(["", "Name", "", "Phone Number"]);
    const address = mappings.find((m) => m.logicalField === "address");
    expect(address).toBeUndefined();
    const buyer = mappings.find((m) => m.logicalField === "buyerName");
    expect(buyer?.headerName).toBe("Name");
    const phone = mappings.find((m) => m.logicalField === "buyerPhone");
    expect(phone?.headerName).toBe("Phone Number");
  });

  it("column letters round-trip past Z", () => {
    expect(indexToColumnLetter(0)).toBe("A");
    expect(indexToColumnLetter(25)).toBe("Z");
    expect(indexToColumnLetter(26)).toBe("AA");
    expect(columnLetterToIndex("AA")).toBe(26);
  });
});

describe("parseSheetDate", () => {
  it("parses ISO, US and day-first dates", () => {
    expect(parseSheetDate("2026-10-25")).toBe("2026-10-25");
    expect(parseSheetDate("10/25/2026")).toBe("2026-10-25");
    expect(parseSheetDate("25/10/2026")).toBe("2026-10-25");
    expect(parseSheetDate("2026-10-25T14:30:00Z")).toBe("2026-10-25");
  });

  it("returns null for garbage", () => {
    expect(parseSheetDate("not a date")).toBeNull();
    expect(parseSheetDate("")).toBeNull();
  });
});

describe("applySheetRecords", () => {
  beforeEach(reset);

  it("creates property, buyer, relationship, offer and follow-up from a new row", () => {
    const recs = recordsFrom([
      ["10 New Rd, Austin, TX 78701", "Available", "$150,000", "$200,000", "John Doe", "555-1234", "john@x.com", "Interested", "$140,000", "hello", "2026-10-20", "Scheduled"],
    ]);
    const stats = applySheetRecords(recs, MAPPINGS, "u_owner");

    expect(stats.created).toBe(1);
    expect(stats.buyersTouched).toBe(2);
    expect(stats.offersTouched).toBe(1);
    expect(stats.tasksTouched).toBe(1);

    const db = getDb();
    const p = db.properties.find((x) => x.sourceRowId === "2");
    expect(p).toBeDefined();
    expect(p?.address).toBe("10 New Rd");
    expect(p?.city).toBe("Austin");
    expect(p?.state).toBe("TX");
    expect(p?.askingPrice).toBe(150000);
    expect(p?.arv).toBe(200000);
    expect(p?.sourceWebsite).toBe("google-sheets");

    const buyer = db.buyers.find((b) => b.fullName === "John Doe");
    expect(buyer?.phone).toBe("555-1234");
    expect(buyer?.email).toBe("john@x.com");

    const rel = db.relationships.find(
      (r) => r.buyerId === buyer?.id && r.propertyId === p?.id,
    );
    expect(rel).toBeDefined();

    const offer = db.offers.find((o) => o.propertyId === p?.id);
    expect(offer?.amount).toBe(140000);

    const task = db.tasks.find((t) => t.propertyId === p?.id);
    expect(task?.dueDate).toBe("2026-10-20");
  });

  it("sheet wins on non-empty cells but empty cells keep app values", () => {
    seedSheetProperty();
    const recs = recordsFrom([
      ["1 Test St, Austin, TX 78701", "Pending", "", "$250,000", "", "", "", "", "", "sheet notes"],
    ]);
    const stats = applySheetRecords(recs, MAPPINGS, "u_owner");

    expect(stats.updated).toBe(1);
    const p = getDb().properties[0];
    expect(p.status).toBe("Pending");
    expect(p.askingPrice).toBe(200000);
    expect(p.arv).toBe(250000);
    expect(p.notes).toBe("sheet notes");
  });

  it("status changes are logged as interactions", () => {
    seedSheetProperty();
    const recs = recordsFrom([["1 Test St, Austin, TX 78701", "Under Contract"]]);
    applySheetRecords(recs, MAPPINGS, "u_owner");

    const db = getDb();
    expect(db.properties[0].status).toBe("Under Contract");
    const log = db.interactions.find(
      (i) => i.eventType === "Status Changed" && i.originalContent.includes("Under Contract"),
    );
    expect(log).toBeDefined();
  });

  it("does not create duplicates when synced twice", () => {
    const recs = recordsFrom([["10 New Rd, Austin, TX 78701", "Available"]]);
    applySheetRecords(recs, MAPPINGS, "u_owner");
    const second = applySheetRecords(recordsFrom([["10 New Rd, Austin, TX 78701", "Available"]]), MAPPINGS, "u_owner");
    expect(second.created).toBe(0);
    expect(second.unchanged + second.updated).toBe(1);
    expect(getDb().properties).toHaveLength(1);
  });

  it("falls back to sourceRowId when the address in the sheet changed", () => {
    seedSheetProperty({ sourceRowId: "2" });
    const recs = recordsFrom([["1 Renamed St, Austin, TX 78701", "Available"]]);
    const stats = applySheetRecords(recs, MAPPINGS, "u_owner");

    expect(stats.created).toBe(0);
    expect(stats.updated).toBe(1);
    const p = getDb().properties[0];
    expect(p.address).toBe("1 Renamed St");
    expect(p.sourceRowId).toBe("2");
  });

  it("counts rows deleted from the sheet as missing but never deletes properties", () => {
    seedSheetProperty({ sourceRowId: "9" });
    const recs = recordsFrom([
      ["5 Other St, Dallas, TX 75201", "Available"],
      ["", "Available"],
    ]);
    const stats = applySheetRecords(recs, MAPPINGS, "u_owner");

    expect(stats.created).toBe(1);
    expect(stats.skipped).toBe(1);
    expect(stats.missing).toBe(1);
    expect(getDb().properties).toHaveLength(2);
    expect(getDb().properties.find((p) => p.address === "1 Test St")).toBeDefined();
  });

  it("skips rows whose address is not a street address", () => {
    const recs = recordsFrom([
      ["Interested", "Available"],
      ["SOLD", "Available"],
      ["c", "Available"],
      ["10 Real Rd, Austin, TX 78701", "Available"],
    ]);
    const stats = applySheetRecords(recs, MAPPINGS, "u_owner");
    expect(stats.created).toBe(1);
    expect(stats.skipped).toBe(3);
    expect(getDb().properties).toHaveLength(1);
    expect(getDb().properties[0].address).toBe("10 Real Rd");
  });

  it("completes an open follow-up task when the sheet marks it completed", () => {
    const propertyId = seedSheetProperty();
    const buyerId = addBuyer({
      fullName: "Jane Roe",
      companyName: "",
      phone: "",
      email: "",
      preferredContactMethod: "",
      preferredMarkets: [],
      budgetMin: null,
      budgetMax: null,
      status: "Active",
      notes: "",
      userId: "u_owner",
    });
    linkBuyerToProperty({
      buyerId,
      propertyId,
      interestStatus: "Interested",
      interestNotes: "",
      assignedUserId: null,
      userId: "u_owner",
    });
    const taskId = createTask({
      buyerId,
      propertyId,
      taskType: "Follow-Up",
      description: "Call",
      dueDate: "2026-10-15",
      dueTime: null,
      assignedUserId: "u_owner",
      priority: "Medium",
    });

    const recs = recordsFrom([
      ["1 Test St, Austin, TX 78701", "", "", "", "Jane Roe", "", "", "Interested", "", "", "", "Completed"],
    ]);
    const stats = applySheetRecords(recs, MAPPINGS, "u_owner");

    expect(stats.tasksTouched).toBe(1);
    const task = getDb().tasks.find((t) => t.id === taskId);
    expect(task?.status).toBe("Completed");
  });
});

describe("grouped sheets (address carried to buyer rows)", () => {
  const GROUP_HEADERS = ["Status", "Source / Address", "Name", "Phone"];
  const GROUP_MAPPINGS: ColumnMapping[] = [
    { logicalField: "address", columnLetter: "B", headerName: "Source / Address", source: "sheet" },
    { logicalField: "interestStatus", columnLetter: "A", headerName: "Status", source: "sheet" },
    { logicalField: "buyerName", columnLetter: "C", headerName: "Name", source: "sheet" },
    { logicalField: "buyerPhone", columnLetter: "D", headerName: "Phone", source: "sheet" },
  ];

  const groupedRows: string[][] = [
    ["", "", "", ""],
    ["Property", "property address", "", ""],
    ["", "1110 Buckhurst Dr, Atlanta, GA 30349", "", ""],
    ["Interested", "Dipo Genuis", "Ben Winwood", "555-0100"],
    ["Undecided", "Facebook", "Jane Roe", "555-0200"],
    ["", "", "", ""],
  ];

  function groupedRecords(carryAddress = true) {
    return buildRecords(GROUP_HEADERS, groupedRows, GROUP_MAPPINGS, 2, { carryAddress });
  }

  it("buildRecords carries the property address down to buyer rows", () => {
    const recs = groupedRecords();
    expect(recs[2].address).toBe("1110 Buckhurst Dr, Atlanta, GA 30349");
    expect(recs[2].carried).toBeUndefined();
    expect(recs[3].address).toBe("1110 Buckhurst Dr, Atlanta, GA 30349");
    expect(recs[3].carried).toBe(true);
    expect(recs[3].buyerName).toBe("Ben Winwood");
    expect(recs[4].address).toBe("1110 Buckhurst Dr, Atlanta, GA 30349");
    // rows before the first property header keep their raw values
    expect(recs[0].address).toBe("");
    expect(recs[1].address).toBe("property address");
  });

  it("keeps raw cells when carry is off", () => {
    const recs = groupedRecords(false);
    expect(recs[3].address).toBe("Dipo Genuis");
    expect(recs[3].carried).toBeUndefined();
  });

  it("captures the Source value from the address column on carried buyer rows", () => {
    const recs = groupedRecords();
    expect(recs[3].source).toBe("Dipo Genuis");
    expect(recs[4].source).toBe("Facebook");
    expect(recs[2].source).toBe(""); // property header row has no source
  });

  it("detects grouped layout from the data", () => {
    expect(detectGroupedRows(GROUP_HEADERS, groupedRows, GROUP_MAPPINGS)).toBe(true);
    const flat = [
      ["Interested", "1110 Buckhurst Dr, Atlanta, GA 30349", "Ben Winwood", "555-0100"],
      ["Undecided", "1401 Alleen Ave SW, Atlanta, GA 30310", "Jane Roe", "555-0200"],
      ["Interested", "5847 McEver Rd, Flowery Branch, GA 30542", "Sam Smith", "555-0300"],
    ];
    expect(detectGroupedRows(GROUP_HEADERS, flat, GROUP_MAPPINGS)).toBe(false);
    expect(detectGroupedRows(GROUP_HEADERS, groupedRows, [])).toBe(false);
    expect(detectGroupedRows(GROUP_HEADERS, [], GROUP_MAPPINGS)).toBe(false);
  });

  it("imports a grouped sheet end-to-end: property, buyers, and links", () => {
    reset();
    const recs = groupedRecords();
    const stats = applySheetRecords(recs, GROUP_MAPPINGS, "u_owner");

    expect(stats.created).toBe(1);
    expect(stats.skipped).toBe(2); // blank + legend rows before the first property
    const db = getDb();
    expect(db.properties).toHaveLength(1);
    expect(db.properties[0].address).toContain("Buckhurst");
    expect(db.properties[0].notes).toBe("");
    expect(db.buyers).toHaveLength(2);
    expect(db.buyers.map((b) => b.fullName).sort()).toEqual(["Ben Winwood", "Jane Roe"]);
    expect(db.relationships).toHaveLength(2);
    const ben = db.buyers.find((b) => b.fullName === "Ben Winwood");
    const rel = db.relationships.find((r) => r.buyerId === ben?.id);
    expect(rel?.propertyId).toBe(db.properties[0].id);
    expect(rel?.interestStatus).toBe("Interested");
  });

  it("does not let carried buyer rows pollute property fields or create dupes on resync", () => {
    reset();
    applySheetRecords(groupedRecords(), GROUP_MAPPINGS, "u_owner");
    const second = applySheetRecords(groupedRecords(), GROUP_MAPPINGS, "u_owner");

    expect(second.created).toBe(0);
    expect(second.buyersTouched).toBe(0);
    const db = getDb();
    expect(db.properties).toHaveLength(1);
    expect(db.buyers).toHaveLength(2);
    expect(db.relationships).toHaveLength(2);
    expect(second.missing).toBe(0);
  });

  it("ignores junk property statuses from the sheet", () => {
    reset();
    const recs = buildRecords(
      GROUP_HEADERS,
      [
        ["Interested", "1110 Buckhurst Dr, Atlanta, GA 30349", "", ""],
        ["Interested", "1110 Buckhurst Dr, Atlanta, GA 30349", "Ben Winwood", "555-0100"],
      ],
      [
        { logicalField: "address", columnLetter: "B", headerName: "Source / Address", source: "sheet" },
        { logicalField: "status", columnLetter: "A", headerName: "Status", source: "sheet" },
      ],
      2,
    );
    applySheetRecords(recs, [
      { logicalField: "address", columnLetter: "B", headerName: "Source / Address", source: "sheet" },
      { logicalField: "status", columnLetter: "A", headerName: "Status", source: "sheet" },
    ], "u_owner");

    expect(getDb().properties[0].status).toBe("Available");
  });
});

describe("isSheetSyncDue", () => {
  function conn(lastSyncAt: string | null): SheetConnection {
    return {
      id: "sc_1",
      orgId: "o",
      spreadsheetId: "s1",
      spreadsheetName: "Sheet",
      worksheetName: "Leads",
      isConnected: true,
      lastSyncAt,
      lastSyncStatus: "synced",
      lastSyncError: null,
      columnMappings: [],
      createdAt: "",
      updatedAt: "",
    };
  }

  it("never due when disconnected", () => {
    expect(isSheetSyncDue(undefined)).toBe(false);
    expect(isSheetSyncDue({ ...conn(null), isConnected: false })).toBe(false);
  });

  it("due when never synced", () => {
    expect(isSheetSyncDue(conn(null))).toBe(true);
  });

  it("not due right after a sync, due after the interval", () => {
    expect(isSheetSyncDue(conn(new Date().toISOString()))).toBe(false);
    expect(
      isSheetSyncDue(conn(new Date(Date.now() - 6 * 60 * 1000).toISOString())),
    ).toBe(true);
  });
});

describe("formatSheetSyncSummary", () => {
  it("summarizes changes and errors", () => {
    const base: SheetSyncResult = {
      created: 0, updated: 0, unchanged: 0, skipped: 0, missing: 0,
      buyersTouched: 0, offersTouched: 0, tasksTouched: 0, rowsRead: 12, error: null,
      accessFilled: 0,
    };
    expect(formatSheetSyncSummary(base)).toContain("12 rows checked");
    expect(formatSheetSyncSummary({ ...base, created: 2, updated: 3 })).toContain("+2 new");
    expect(formatSheetSyncSummary({ ...base, error: "boom" })).toContain("boom");
  });
});

describe("buildSyncRecords (grouped rows carried during sync)", () => {
  const GROUP_HEADERS = ["Status", "Source / Address", "Name", "Phone"];
  const GROUP_MAPPINGS: ColumnMapping[] = [
    { logicalField: "address", columnLetter: "B", headerName: "Source / Address", source: "sheet" },
    { logicalField: "interestStatus", columnLetter: "A", headerName: "Status", source: "sheet" },
    { logicalField: "buyerName", columnLetter: "C", headerName: "Name", source: "sheet" },
    { logicalField: "buyerPhone", columnLetter: "D", headerName: "Phone", source: "sheet" },
  ];
  const groupedRows: string[][] = [
    ["", "1110 Buckhurst Dr, Atlanta, GA 30349", "", ""],
    ["Interested", "Dipo Genuis", "Ben Winwood", "555-0100"],
    ["Undecided", "Facebook", "Jane Roe", "555-0200"],
  ];

  function conn(groupedRowsFlag?: boolean): SheetConnection {
    return {
      id: "sc_1",
      orgId: "o",
      spreadsheetId: "s1",
      spreadsheetName: "Sheet",
      worksheetName: "Leads",
      isConnected: true,
      lastSyncAt: null,
      lastSyncStatus: "synced",
      lastSyncError: null,
      columnMappings: GROUP_MAPPINGS,
      groupedRows: groupedRowsFlag,
      createdAt: "",
      updatedAt: "",
    };
  }

  it("carries addresses to buyer rows when groupedRows is saved true", () => {
    const recs = buildSyncRecords(GROUP_HEADERS, groupedRows, conn(true));
    expect(recs[1].address).toBe("1110 Buckhurst Dr, Atlanta, GA 30349");
    expect(recs[1].carried).toBe(true);
    expect(recs[1].buyerName).toBe("Ben Winwood");
    expect(recs[2].carried).toBe(true);
  });

  it("falls back to detecting the grouped layout when groupedRows is not saved", () => {
    const recs = buildSyncRecords(GROUP_HEADERS, groupedRows, conn(undefined));
    expect(recs[1].address).toBe("1110 Buckhurst Dr, Atlanta, GA 30349");
    expect(recs[1].carried).toBe(true);
  });

  it("keeps buyer rows uncarried when groupedRows is explicitly false", () => {
    const recs = buildSyncRecords(GROUP_HEADERS, groupedRows, conn(false));
    expect(recs[1].carried).toBeUndefined();
    expect(recs[1].address).toBe("Dipo Genuis");
  });

  it("creates buyers and relationships through the sync path without polluting property fields", () => {
    reset();
    const recs = buildSyncRecords(GROUP_HEADERS, groupedRows, conn(true));
    const stats = applySheetRecords(recs, GROUP_MAPPINGS, "u_owner");

    expect(stats.created).toBe(1);
    const db = getDb();
    expect(db.properties).toHaveLength(1);
    expect(db.properties[0].sourceRowId).toBe("2");
    expect(db.properties[0].notes).toBe("");
    expect(db.buyers).toHaveLength(2);
    expect(db.relationships).toHaveLength(2);
    expect(db.relationships.every((r) => r.propertyId === db.properties[0].id)).toBe(true);
  });

  it("does not duplicate buyers or clobber the property row id on resync", () => {
    reset();
    const recs = buildSyncRecords(GROUP_HEADERS, groupedRows, conn(true));
    applySheetRecords(recs, GROUP_MAPPINGS, "u_owner");
    const second = applySheetRecords(recs, GROUP_MAPPINGS, "u_owner");

    expect(second.created).toBe(0);
    const db = getDb();
    expect(db.buyers).toHaveLength(2);
    expect(db.relationships).toHaveLength(2);
    expect(db.properties[0].sourceRowId).toBe("2");
  });
});
