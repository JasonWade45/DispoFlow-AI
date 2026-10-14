import { beforeEach, describe, expect, it } from "vitest";
import { createSeed } from "@/lib/seed-work";
import { getDb, updateDb } from "@/lib/store";
import { importDispoData, type DispoImportPayload } from "@/lib/import-dispo";

function payload(): DispoImportPayload {
  return {
    properties: [
      {
        address: "10 New Rd",
        city: "Austin",
        state: "GA",
        zip: "30001",
        notes: "lockbox 1234",
        status: "Under contract",
        interests: [
          {
            status: "Interested",
            source: "Dipo Genuis",
            offer: 150000,
            earnest: "1000",
            type: "Cash",
            contact: { name: "John Doe", phone: "(555) 123-4567", email: "john@x.com", last_touch: "10/1/2026", notes: null },
          },
          {
            status: "Undecided",
            source: "Facebook",
            offer: null,
            earnest: null,
            type: null,
            contact: { name: "Jane Roe", phone: "5559998888", email: "", last_touch: null, notes: null },
          },
        ],
      },
      {
        address: "20 Oak St",
        city: "Dallas",
        state: "GA",
        zip: "30157",
        notes: "",
        status: "Sold",
        interests: [
          {
            status: "Interested",
            source: "Dipo Genuis",
            offer: 90000,
            earnest: null,
            type: null,
            contact: { name: "John Doe", phone: "5551234567", email: "john@x.com", last_touch: null, notes: null },
          },
        ],
      },
    ],
  };
}

function reset() {
  localStorage.clear();
  updateDb(() => createSeed());
}

describe("importDispoData", () => {
  beforeEach(reset);

  it("replaces old data and imports properties, buyers, links and offers", () => {
    const r = importDispoData(payload(), { replace: true });
    expect(r.properties).toBe(2);
    expect(r.buyers).toBe(2); // John + Jane
    expect(r.relationships).toBe(3);
    expect(r.offers).toBe(2); // John@150k + John@90k (same buyer, two properties)

    const db = getDb();
    expect(db.properties).toHaveLength(2);
    expect(db.buyers).toHaveLength(2);
    expect(db.relationships).toHaveLength(3);
    expect(db.offers).toHaveLength(2);

    const sold = db.properties.find((p) => p.address === "20 Oak St");
    expect(sold?.status).toBe("Sold");
    const uc = db.properties.find((p) => p.address === "10 New Rd");
    expect(uc?.status).toBe("Under Contract");
    expect(uc?.notes).toBe("lockbox 1234");

    const john = db.buyers.find((b) => b.fullName === "John Doe");
    expect(john?.phone).toBeTruthy();
    // John appears on both properties but is one buyer
    const johnRels = db.relationships.filter((r2) => r2.buyerId === john?.id);
    expect(johnRels).toHaveLength(2);
  });

  it("dedupes the same buyer across properties by normalized phone", () => {
    const p = payload();
    // same person, differently formatted phone
    p.properties[1].interests[0].contact!.phone = "555.123.4567";
    const r = importDispoData(p, { replace: true });
    expect(r.buyers).toBe(2);
  });

  it("merges into existing data when replace is false", () => {
    const beforeCount = getDb().properties.length;
    const r = importDispoData(payload(), { replace: false });
    expect(r.properties).toBe(2);
    expect(getDb().properties.length).toBe(beforeCount + 2);
  });

  it("skips interest rows with no usable contact", () => {
    const p = payload();
    p.properties[0].interests[1].contact = null;
    const r = importDispoData(p, { replace: true });
    expect(r.buyers).toBe(1);
    expect(r.relationships).toBe(2);
  });
});
