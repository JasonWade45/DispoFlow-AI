import { NextRequest, NextResponse } from "next/server";
import { groqExtractAccessInfo } from "@/lib/ai/access-info";
import { accessInfoRequestSchema, firstIssue } from "@/lib/schemas";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = accessInfoRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  try {
    const results = await groqExtractAccessInfo(parsed.data.items);
    return NextResponse.json({ results });
  } catch (error) {
    console.error("Groq access-info extraction error:", error);
    const message = error instanceof Error ? error.message : "Failed to extract access info";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
