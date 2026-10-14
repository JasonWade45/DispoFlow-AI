import { NextRequest, NextResponse } from "next/server";
import type { Buyer, Interaction, Offer, Property, Task } from "@/types";
import { groqGenerateFollowUp, isGroqConfigured } from "@/lib/ai/groq";
import type { FollowUpContext, FollowUpMode, RefineAction } from "@/lib/ai/followup";

export const maxDuration = 30;

interface FollowUpRequestBody {
  buyer: Buyer;
  property: Property;
  interactions: Interaction[];
  offers: Offer[];
  tasks?: Task[];
  mode: FollowUpMode;
  variant?: number;
  refine?: RefineAction | null;
  currentMessage?: string | null;
}

function isValidContext(body: unknown): body is FollowUpRequestBody {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  return (
    typeof b.buyer === "object" &&
    b.buyer !== null &&
    typeof b.property === "object" &&
    b.property !== null &&
    Array.isArray(b.interactions) &&
    Array.isArray(b.offers) &&
    typeof b.mode === "string"
  );
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

  if (!isValidContext(body)) {
    return NextResponse.json(
      { error: "Missing required fields: buyer, property, interactions (array), offers (array), mode" },
      { status: 400 },
    );
  }

  const ctx: FollowUpContext = {
    buyer: body.buyer,
    property: body.property,
    interactions: body.interactions,
    offers: body.offers,
    tasks: body.tasks ?? [],
    mode: body.mode,
    variant: typeof body.variant === "number" ? body.variant : 0,
  };

  try {
    const draft = await groqGenerateFollowUp(ctx, {
      refine: body.refine ?? null,
      currentMessage: body.currentMessage ?? null,
    });
    return NextResponse.json(draft);
  } catch (error) {
    console.error("Groq follow-up error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate follow-up";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
