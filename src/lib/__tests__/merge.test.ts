import { beforeEach, describe, expect, it } from "vitest";
import { createSeed } from "@/lib/seed-work";
import { updateDb, getDb } from "@/lib/store";
import { addBuyer, addProperty, linkBuyerToProperty } from "@/lib/actions";
import { autoMergeDuplicates, duplicateOverview } from "@/lib/merge";

function reset() {
  localStorage.clear();
  updateDb(() => createSeed());
}

function addSheetProp(address: string, row: string, extra: Partial<Parameters<typeof addProperty>[0]> = {}) {
  return addProperty({
    address,
    city: "Austin",
    state: "TX",
    zip: "78701",
    status: "Available",
    askingPrice: null,
    arv: null,
    estimatedRepairs: null,
    assignmentPrice: null,
    expectedClosingDate: null,
    notes: "",
    userId: "u_owner",
    sourceWebsite: "google-sheets",
    sourceRowId: row,
    ...extra,
  });
}

describe("autoMergeDuplicates", () => {
  beforeEach(reset);

  it("merges properties with the same normalized address and keeps the richer record", () => {
    addSheetProp("10 New Rd", "2", { askingPrice: 150000 });
    addSheetProp("10 New  Rd!", "3", { arv: 220000, bedrooms: "3" });

    const r = autoMergeDuplicates();
    expect(r.propertiesMerged).toBe(1);

    const db = getDb();
    expect(db.properties).toHaveLength(1);
    const keep = db.properties[0];
    expect(keep.askingPrice).toBe(150000);
    expect(keep.arv).toBe(220000);
    expect(keep.bedrooms).toBe("3");
  });

  it("remaps relationships to the surviving property", () => {
    const a = addSheetProp("5 Oak Ave", "2");
    const b = addSheetProp("5 oak  ave", "3");
    expect(a).not.toBe(b);
    const buyerId = addBuyer({
      fullName: "Jane Roe",
      companyName: "",
      phone: "555-0001",
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
      propertyId: b,
      interestStatus: "Interested",
      interestNotes: "",
      assignedUserId: null,
      userId: "u_owner",
    });

    autoMergeDuplicates();
    const db = getDb();
    expect(db.properties).toHaveLength(1);
    const rel = db.relationships[0];
    expect(rel.propertyId).toBe(db.properties[0].id);
    expect(rel.buyerId).toBe(buyerId);
  });

  it("merges buyers sharing a phone number and dedupes their relationship", () => {
    const propId = addSheetProp("9 Elm St", "2");
    const b1 = addBuyer({
      fullName: "John Doe",
      companyName: "",
      phone: "(555) 123-4567",
      email: "",
      preferredContactMethod: "",
      preferredMarkets: [],
      budgetMin: null,
      budgetMax: null,
      status: "Active",
      notes: "",
      userId: "u_owner",
    });
    const b2 = addBuyer({
      fullName: "J. Doe",
      companyName: "",
      phone: "5551234567",
      email: "john@x.com",
      preferredContactMethod: "",
      preferredMarkets: [],
      budgetMin: null,
      budgetMax: null,
      status: "Active",
      notes: "",
      userId: "u_owner",
    });
    linkBuyerToProperty({
      buyerId: b1,
      propertyId: propId,
      interestStatus: "New",
      interestNotes: "",
      assignedUserId: null,
      userId: "u_owner",
    });
    linkBuyerToProperty({
      buyerId: b2,
      propertyId: propId,
      interestStatus: "Interested",
      interestNotes: "",
      assignedUserId: null,
      userId: "u_owner",
    });

    const r = autoMergeDuplicates();
    expect(r.buyersMerged).toBe(1);
    expect(r.relationshipsMerged).toBe(1);

    const db = getDb();
    expect(db.buyers).toHaveLength(1);
    expect(db.buyers[0].email).toBe("john@x.com");
    expect(db.buyers[0].phone.replace(/[^0-9]/g, "")).toBe("5551234567");
    expect(db.relationships).toHaveLength(1);
    expect(db.relationships[0].buyerId).toBe(db.buyers[0].id);
  });

  it("is a no-op when nothing is duplicated", () => {
    addSheetProp("1 First St", "2");
    addSheetProp("2 Second St", "3");
    const r = autoMergeDuplicates();
    expect(r).toEqual({ propertiesMerged: 0, buyersMerged: 0, relationshipsMerged: 0 });
    expect(getDb().properties).toHaveLength(2);
  });
});

describe("duplicateOverview", () => {
  beforeEach(reset);

  it("counts groups without merging", () => {
    addSheetProp("7 Pine Rd", "2");
    addSheetProp("7 pine  rd.", "3");
    addSheetProp("8 Birch Ln", "4");
    const o = duplicateOverview();
    expect(o.propertyGroups).toBe(1);
    expect(o.total).toBe(1);
  });
});
