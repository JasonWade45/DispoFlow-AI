import { NextRequest, NextResponse } from "next/server";
import { groqGenerateFollowUp, isGroqConfigured } from "@/lib/ai/groq";
import type { FollowUpContext } from "@/lib/ai/followup";
import { firstIssue, followUpRequestSchema } from "@/lib/schemas";

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

  const parsed = followUpRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: firstIssue(parsed.error) }, { status: 400 });
  }

  const ctx: FollowUpContext = {
    buyer: parsed.data.buyer,
    property: parsed.data.property,
    interactions: parsed.data.interactions,
    offers: parsed.data.offers,
    tasks: parsed.data.tasks ?? [],
    mode: parsed.data.mode,
    variant: parsed.data.variant ?? 0,
  };

  try {
    const draft = await groqGenerateFollowUp(ctx, {
      refine: parsed.data.refine ?? null,
      currentMessage: parsed.data.currentMessage ?? null,
    });
    return NextResponse.json(draft);
  } catch (error) {
    console.error("Groq follow-up error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate follow-up";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
