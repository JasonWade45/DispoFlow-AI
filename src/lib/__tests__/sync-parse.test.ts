import { describe, expect, it } from "vitest";
import { normalizeAddress, parseAddressParts } from "@/lib/sync";
import { parseMoney } from "@/lib/format";

describe("normalizeAddress", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalizeAddress("123 Main St., Austin, TX 78701")).toBe(
      "123 main st austin tx 78701",
    );
  });

  it("collapses whitespace", () => {
    expect(normalizeAddress("  440   Oak   Ave  ")).toBe("440 oak ave");
  });

  it("handles empty string", () => {
    expect(normalizeAddress("")).toBe("");
  });
});

describe("parseAddressParts", () => {
  it("parses comma-separated full address", () => {
    const r = parseAddressParts("123 Main St, Austin, TX 78701");
    expect(r).toEqual({
      address: "123 Main St",
      city: "Austin",
      state: "TX",
      zip: "78701",
    });
  });

  it("parses comma-less address with state and zip", () => {
    const r = parseAddressParts("440 Oak Ave Houston TX 77001");
    expect(r).not.toBeNull();
    expect(r?.state).toBe("TX");
    expect(r?.zip).toBe("77001");
    expect(r?.address).toContain("Oak");
  });

  it("handles multi-word city with commas", () => {
    const r = parseAddressParts("99 Elm Rd, San Antonio, TX 78205");
    expect(r?.city).toBe("San Antonio");
  });

  it("handles zip+4", () => {
    const r = parseAddressParts("5 Pine Ct, Dallas, TX 75201-1234");
    expect(r?.zip).toBe("75201-1234");
  });

  it("returns null for garbage", () => {
    expect(parseAddressParts("???")).toBeNull();
  });
});

describe("parseMoney", () => {
  it("parses plain numbers", () => {
    expect(parseMoney("312500")).toBe(312500);
  });

  it("parses k suffix", () => {
    expect(parseMoney("440k")).toBe(440000);
  });

  it("parses K suffix with decimals", () => {
    expect(parseMoney("44.5K")).toBe(44500);
  });

  it("parses commas and dollar signs", () => {
    expect(parseMoney("$1,250,000")).toBe(1250000);
  });

  it("parses M suffix", () => {
    expect(parseMoney("1.2m")).toBe(1200000);
  });

  it("returns null for empty or garbage", () => {
    expect(parseMoney("")).toBeNull();
    expect(parseMoney("abc")).toBeNull();
  });
});
