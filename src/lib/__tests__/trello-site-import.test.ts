import { describe, expect, it } from "vitest";
import { createSeed } from "@/lib/seed-work";
import type { Property } from "@/types";
import {
  applyTrelloSiteImport,
  parseTrelloSiteImport,
  statusFromTrelloList,
} from "@/lib/trello-site-import";

describe("statusFromTrelloList", () => {
  it("maps the board lists to pipeline statuses", () => {
    expect(statusFromTrelloList("CLOSED")).toBe("Sold");
    expect(statusFromTrelloList("CLOSED BUT NOT FUNDED -5,000")).toBe("Pending");
    expect(statusFromTrelloList("Under contract - 102,500")).toBe("Under Contract");
    expect(statusFromTrelloList("ON HOLD")).toBe("On Hold");
    expect(statusFromTrelloList("Did not Sell")).toBe("On Hold");
    expect(statusFromTrelloList("Did not sell/Attack")).toBe("On Hold");
    expect(statusFromTrelloList("ARCHIVED")).toBe("On Hold");
    expect(statusFromTrelloList("ACTIVE PROPERTIES")).toBe("Marketing");
    expect(statusFromTrelloList("Coming soon")).toBe("Marketing");
    expect(statusFromTrelloList("Coming soon/Not sure about")).toBe("Marketing");
    expect(statusFromTrelloList("Get Ready for Marketing (closed)")).toBe("Marketing");
    expect(statusFromTrelloList("abraham list")).toBe("Available");
    expect(statusFromTrelloList("New List")).toBe("Available");
    expect(statusFromTrelloList("Proeprties to Research and see if they sold (closed)")).toBe(
      "Available",
    );
    expect(statusFromTrelloList("Day 1: VIP Buyers - Old Buyers list (closed)")).toBe("Available");
    expect(statusFromTrelloList("")).toBe("Available");
  });

  it("ignores the archived-list marker in parentheses", () => {
    expect(statusFromTrelloList("AQUISITIONS LEADS (closed)")).toBe("Available");
    expect(statusFromTrelloList("On Hold/not sold (closed)")).toBe("On Hold");
  });
});

function rawRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    address: "10 Greenway Ct",
    city: "McDonough",
    state: "GA",
    zip: "30253",
    siteAddress: "10 Greenway Ct, McDonough, GA 30253",
    askingPrice: 30000,
    propertyType: "Home",
    bedrooms: "3",
    bathrooms: "1",
    sqft: "1,056",
    photos: ["https://image.example/1.jpg"],
    listingUrl: "https://www.elevatereg.com/property/10-greenway-ct/",
    trelloList: "CLOSED",
    trelloCardName: "10 Greenway Ct, McDonough, GA 30253 - 1,000",
    trelloUrl: "https://trello.com/c/abc123",
    trelloClosed: false,
    trelloDesc: "Burned down house",
    ...over,
  };
}

function fileOf(props: unknown[]): string {
  return JSON.stringify({ kind: "dispoflow-trello-site-import", version: 1, properties: props });
}

describe("parseTrelloSiteImport", () => {
  it("parses rows, derives status, and appends the source link to notes", () => {
    const rows = parseTrelloSiteImport(fileOf([rawRow()]));
    expect(rows).toHaveLength(1);
    expect(rows[0].address).toBe("10 Greenway Ct");
    expect(rows[0].status).toBe("Sold");
    expect(rows[0].askingPrice).toBe(30000);
    expect(rows[0].notes).toContain("Burned down house");
    expect(rows[0].notes).toContain("Source: https://trello.com/c/abc123");
    expect(rows[0].listingUrl).toContain("elevatereg.com");
  });

  it("rejects files that are not a prepared import", () => {
    expect(() => parseTrelloSiteImport("not json at all")).toThrow(/JSON/);
    expect(() => parseTrelloSiteImport(JSON.stringify({ kind: "other", properties: [] }))).toThrow(
      /not a DispoFlow/,
    );
    expect(() => parseTrelloSiteImport(fileOf([]))).toThrow(/No properties/);
  });

  it("skips rows without an address", () => {
    const rows = parseTrelloSiteImport(fileOf([rawRow({ address: "" }), rawRow()]));
    expect(rows).toHaveLength(1);
  });

  it("tolerates missing optional fields", () => {
    const rows = parseTrelloSiteImport(
      fileOf([{ address: "5 Old Rd", trelloList: "New List" }]),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("Available");
    expect(rows[0].photos).toEqual([]);
    expect(rows[0].askingPrice).toBeNull();
  });
});

function mkProperty(over: Partial<Property> = {}): Property {
  return {
    id: "p_existing",
    orgId: "org_1",
    address: "10 Greenway Ct",
    city: "McDonough",
    state: "GA",
    zip: "30253",
    accessInfo: "",
    status: "Marketing",
    accessType: "",
    askingPrice: 25000,
    arv: null,
    estimatedRepairs: null,
    assignmentPrice: null,
    marketingStartedAt: null,
    expectedClosingDate: null,
    notes: "old notes",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    createdBy: "u_owner",
    propertyType: "",
    bedrooms: "",
    bathrooms: "",
    sqft: "",
    lotSize: "",
    yearBuilt: "",
    listingUrl: "",
    photosUrl: "",
    photos: [],
    sourceWebsite: "",
    sourcePropertyId: "",
    sourceRowId: "",
    firstImportedAt: null,
    lastSyncedAt: null,
    syncStatus: "never",
    ...over,
  };
}

describe("applyTrelloSiteImport", () => {
  it("creates new properties with site data and provenance", () => {
    const db = createSeed();
    const rows = parseTrelloSiteImport(
      fileOf([
        rawRow(),
        rawRow({
          address: "20 Oak St",
          city: "Dallas",
          zip: "30157",
          askingPrice: 90000,
          trelloList: "ON HOLD",
          photos: [],
        }),
      ]),
    );
    const r = applyTrelloSiteImport(db, rows, "u_owner");

    expect(r.counts).toEqual({ created: 2, updated: 0, skipped: 0 });
    expect(r.db.properties).toHaveLength(2);

    const p = r.db.properties.find((x) => x.address === "10 Greenway Ct");
    expect(p).toBeDefined();
    expect(p?.status).toBe("Sold");
    expect(p?.askingPrice).toBe(30000);
    expect(p?.sourceWebsite).toBe("Trello");
    expect(p?.listingUrl).toContain("elevatereg.com");
    expect(p?.photos).toHaveLength(1);
    expect(p?.createdBy).toBe("u_owner");

    const hold = r.db.properties.find((x) => x.address === "20 Oak St");
    expect(hold?.status).toBe("On Hold");
  });

  it("skips duplicate addresses inside the file", () => {
    const db = createSeed();
    const rows = parseTrelloSiteImport(fileOf([rawRow(), rawRow()]));
    const r = applyTrelloSiteImport(db, rows, "u_owner");
    expect(r.counts).toEqual({ created: 1, updated: 0, skipped: 1 });
    expect(r.db.properties).toHaveLength(1);
  });

  it("updates an existing property instead of duplicating it", () => {
    const db = { ...createSeed(), properties: [mkProperty()] };
    const rows = parseTrelloSiteImport(fileOf([rawRow()]));
    const r = applyTrelloSiteImport(db, rows, "u_owner");

    expect(r.counts).toEqual({ created: 0, updated: 1, skipped: 0 });
    expect(r.db.properties).toHaveLength(1);

    const p = r.db.properties[0];
    expect(p.id).toBe("p_existing");
    expect(p.status).toBe("Sold");
    expect(p.askingPrice).toBe(30000);
    expect(p.notes).toContain("Burned down house");
    expect(p.syncStatus).toBe("synced");
  });

  it("keeps existing values when the incoming row has nothing better", () => {
    const db = { ...createSeed(), properties: [mkProperty({ photos: ["https://old/img.jpg"] })] };
    const rows = parseTrelloSiteImport(fileOf([rawRow({ photos: [] })]));
    const r = applyTrelloSiteImport(db, rows, "u_owner");
    expect(r.db.properties[0].photos).toEqual(["https://old/img.jpg"]);
  });

  it("leaves the database untouched when rows are all duplicates", () => {
    const db = { ...createSeed(), properties: [mkProperty()] };
    const rows = parseTrelloSiteImport(fileOf([rawRow(), rawRow()]));
    const r = applyTrelloSiteImport(db, rows, "u_owner");
    expect(r.counts).toEqual({ created: 0, updated: 1, skipped: 1 });
    expect(r.db.properties).toHaveLength(1);
  });
});
