import { NextRequest, NextResponse } from "next/server";
import { isGroqConfigured } from "@/lib/ai/groq";
import { groqAutoMapColumns } from "@/lib/ai/column-map";

export const maxDuration = 30;

interface MapColumnsBody {
  headers: string[];
  sampleRows?: string[][];
}

function isValidBody(body: unknown): body is MapColumnsBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  if (!Array.isArray(b.headers) || b.headers.length === 0) return false;
  if (!b.headers.every((h) => typeof h === "string")) return false;
  if (b.sampleRows !== undefined) {
    if (!Array.isArray(b.sampleRows)) return false;
    if (!b.sampleRows.every((r) => Array.isArray(r) && r.every((c) => typeof c === "string"))) {
      return false;
    }
  }
  return true;
}

export async function POST(request: NextRequest) {
  if (!isGroqConfigured()) {
    return NextResponse.json(
      { error: "Groq API key is not configured. Add GROQ_API_KEY to .env.local and restart the dev server." },
      { status: 503 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!isValidBody(body)) {
    return NextResponse.json(
      { error: "Missing or invalid fields: headers (string[]), sampleRows (string[][])" },
      { status: 400 },
    );
  }

  try {
    const result = await groqAutoMapColumns(body.headers, body.sampleRows ?? []);
    if (!result) {
      return NextResponse.json(
        { error: "AI could not identify a property address column in this sheet." },
        { status: 422 },
      );
    }
    return NextResponse.json(result);
  } catch (error) {
    console.error("Groq column mapping error:", error);
    const message = error instanceof Error ? error.message : "Failed to map columns";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
