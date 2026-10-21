import { describe, expect, it } from "vitest";
import { coreCounts } from "@/lib/cloud-state";
import { createSeed } from "@/lib/seed-work";
import type { Offer } from "@/types";

const CORE_KEYS = [
  "access_infoTable",
  "buyers",
  "interactions",
  "offers",
  "properties",
  "relationships",
  "tasks",
] as const;

describe("coreCounts", () => {
  it("returns zeros for empty collections", () => {
    const counts = coreCounts({
      ...createSeed(),
      properties: [],
      buyers: [],
      relationships: [],
      interactions: [],
      tasks: [],
      offers: [],
      access_infoTable: [],
    });
    expect(counts).toEqual({
      properties: 0,
      buyers: 0,
      relationships: 0,
      interactions: 0,
      tasks: 0,
      offers: 0,
      access_infoTable: 0,
    });
  });

  it("mirrors each core collection's length and covers exactly the 7 keys", () => {
    const seed = createSeed();
    const extra = { id: "o_fake_1", amount: 100 } as Offer;
    const counts = coreCounts({ ...seed, offers: [...seed.offers, extra] });
    expect(Object.keys(counts).sort()).toEqual([...CORE_KEYS].sort());
    expect(counts.offers).toBe(seed.offers.length + 1);
    expect(counts.properties).toBe(seed.properties.length);
    expect(counts.buyers).toBe(seed.buyers.length);
    expect(counts.tasks).toBe(seed.tasks.length);
  });
});
