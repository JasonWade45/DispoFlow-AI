import { NextRequest, NextResponse } from "next/server";
import { groqExtractAccessInfo } from "@/lib/ai/access-info";

export const maxDuration = 30;

interface AccessInfoBody {
  items: Array<{ id: string; text: string }>;
}

function isValidBody(body: unknown): body is AccessInfoBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.items) || b.items.length === 0 || b.items.length > 40) return false;
  return b.items.every(
    (it) =>
      typeof it === "object" &&
      it !== null &&
      typeof (it as Record<string, unknown>).id === "string" &&
      typeof (it as Record<string, unknown>).text === "string",
  );
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json(
      { error: "Missing or invalid field: items (Array<{ id: string; text: string }>, 1-40 entries)" },
      { status: 400 },
    );
  }

  try {
    const results = await groqExtractAccessInfo(body.items);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Groq access-info extraction error:", error);
    const message = error instanceof Error ? error.message : "Failed to extract access info";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
