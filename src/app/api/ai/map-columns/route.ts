import { NextRequest, NextResponse } from "next/server";
import { isGroqConfigured } from "@/lib/ai/groq";
import { groqAutoMapColumns } from "@/lib/ai/column-map";
import { firstIssue, mapColumnsRequestSchema } from "@/lib/schemas";

export const maxDuration = 30;

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

  const parsed = mapColumnsRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  try {
    const result = await groqAutoMapColumns(parsed.data.headers, parsed.data.sampleRows ?? []);
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
