import { describe, expect, it } from "vitest";
import {
  buildAccessSystemPrompt,
  buildAccessUserPrompt,
  extractAccessLocal,
  formatAccess,
  parseAccessExtraction,
} from "@/lib/ai/access-info";

describe("extractAccessLocal", () => {
  it("extracts a lockbox code from address text", () => {
    const r = extractAccessLocal("5646 Old Marietta Rd · LOCK BOX IS 5566");
    expect(r?.code).toBe("5566");
  });

  it("extracts a gate code keyword", () => {
    const r = extractAccessLocal("12 Main St · gate code 44A");
    expect(r?.code).toBe("44A");
  });

  it("extracts a showing window phrase", () => {
    const r = extractAccessLocal("9 Elm Ave · showings Sat 10am-2pm only");
    expect(r?.appointment).toContain("showings Sat 10am-2pm");
  });

  it("returns null for plain address text", () => {
    expect(extractAccessLocal("10 New Rd, Austin, TX 78701")).toBeNull();
    expect(extractAccessLocal("")).toBeNull();
  });
});

describe("formatAccess", () => {
  it("combines code and appointment", () => {
    expect(formatAccess({ code: "5566", appointment: "Sat 10-2" })).toBe("5566 · Sat 10-2");
  });
  it("handles single fields and empties", () => {
    expect(formatAccess({ code: "5566", appointment: null })).toBe("5566");
    expect(formatAccess({ code: null, appointment: null })).toBe("");
  });
});

describe("parseAccessExtraction", () => {
  const ids = new Set(["p1", "p2"]);

  it("parses a results object and drops unknown ids", () => {
    const raw = JSON.stringify({
      results: [
        { id: "p1", code: "5566", appointment: null },
        { id: "p2", code: null, appointment: "Sun 9-11am" },
        { id: "p9", code: "0000", appointment: null },
      ],
    });
    const out = parseAccessExtraction(raw, ids);
    expect(out).toHaveLength(2);
    expect(out[0]).toEqual({ id: "p1", code: "5566", appointment: null });
    expect(out[1].appointment).toBe("Sun 9-11am");
  });

  it("parses a bare array and fenced JSON", () => {
    const raw = '```json\n[{"id":"p1","code":"1234","appointment":null}]\n```';
    const out = parseAccessExtraction(raw, ids);
    expect(out).toEqual([{ id: "p1", code: "1234", appointment: null }]);
  });

  it("returns empty on garbage or non-array", () => {
    expect(parseAccessExtraction("not json", ids)).toEqual([]);
    expect(parseAccessExtraction('{"foo":1}', ids)).toEqual([]);
    expect(parseAccessExtraction("", ids)).toEqual([]);
  });

  it("normalizes empty strings to null and truncates long values", () => {
    const raw = JSON.stringify([
      { id: "p1", code: "  ", appointment: "x".repeat(200) },
    ]);
    const out = parseAccessExtraction(raw, ids);
    expect(out[0].code).toBeNull();
    expect(out[0].appointment!.length).toBe(120);
  });
});

describe("prompts", () => {
  it("system prompt demands strict JSON and no invention", () => {
    const s = buildAccessSystemPrompt();
    expect(s).toContain("NEVER invent");
    expect(s).toContain('"results"');
  });

  it("user prompt serializes items with truncated text", () => {
    const prompt = buildAccessUserPrompt([
      { id: "p1", text: "a".repeat(600) },
      { id: "p2", text: "short" },
    ]);
    const parsed = JSON.parse(prompt);
    expect(parsed.items[0].text.length).toBe(500);
    expect(parsed.items[1].text).toBe("short");
  });
});
