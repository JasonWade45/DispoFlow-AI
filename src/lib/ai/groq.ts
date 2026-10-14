import type { Buyer, Interaction, Offer, Property } from "@/types";
import { formatMoney, isFirst, relativeTime } from "@/lib/format";
import {
  blockedFollowUpReason,
  generateFollowUp,
  messageFingerprint,
  usedMessageFingerprints,
  type FollowUpContext,
  type FollowUpDraft,
  type FollowUpMode,
  type RefineAction,
} from "@/lib/ai/followup";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODELS = [
  process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "qwen/qwen3.8-27b",
];

const MODE_GUIDANCE: Record<FollowUpMode, string> = {
  "Standard Follow-Up":
    "A gentle check-in that picks up the conversation where it left off — reference their latest message or an open topic.",
  "Price Objection Follow-Up":
    "Acknowledge the price concern without inventing new numbers, pivot to value (comps, repairs, speed, certainty), and invite a conversation.",
  "Offer Follow-Up":
    "Reference the offer amount exactly as provided, check its status, and keep momentum toward a decision.",
  "Information Requested":
    "Answer with the information we actually have, and ask what else they need before moving forward.",
  "No Response Follow-Up":
    "Short, low-pressure, and a different angle than anything already sent. No guilt-tripping.",
  "Decision Follow-Up":
    "Help them move toward a decision — summarize where things stand and make the next step easy.",
  "Re-Engagement":
    "Warmly restart a cold conversation. No references to how long it's been unless provided.",
  "Custom Follow-Up":
    "Follow the conversation naturally; treat the mode label as intent, not a script.",
};

const REFINE_GUIDANCE: Record<RefineAction, string> = {
  shorter: "Rewrite the current draft to be significantly shorter — same meaning, fewer words.",
  direct: "Rewrite the current draft to be more direct and get to the point faster.",
  conversational: "Rewrite the current draft to sound more casual and conversational.",
  price: "Rewrite the current draft to address the buyer's price concern head-on, without inventing new numbers.",
  another: "Write a completely different version of the current draft — different opening, different angle.",
};

export function isGroqConfigured(): boolean {
  return typeof process.env.GROQ_API_KEY === "string" && process.env.GROQ_API_KEY.length > 0;
}

function transcript(interactions: Interaction[]): string {
  return interactions
    .slice()
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    .map((i) => {
      const when = new Date(i.occurredAt).toISOString().slice(0, 16).replace("T", " ");
      const who = i.direction === "in" ? "BUYER" : i.direction === "out" ? "US" : "NOTE";
      const text = i.originalContent.slice(0, 400);
      return `[${when}] ${who}: ${text}`;
    })
    .join("\n");
}

export interface GroqPromptInput {
  buyer: Buyer;
  property: Property;
  interactions: Interaction[];
  offers: Offer[];
  mode: FollowUpMode;
  variant: number;
  currentMessage?: string | null;
  refine?: RefineAction | null;
}

export function buildGroqSystemPrompt(): string {
  return [
    "You write short SMS follow-up messages for a US real-estate wholesaler talking to a cash buyer about one property.",
    "Rules:",
    "- 1 to 3 sentences, under 320 characters, plain text, no emojis, no hashtags, no placeholders.",
    "- Ground every claim in the provided data. NEVER invent prices, dates, repair costs, comps, or commitments.",
    "- Only mention dollar amounts that appear exactly in the provided offer or asking-price fields.",
    "- If the buyer asked a question last, answer it (or address why you can't yet) before anything else.",
    "- Do NOT repeat or closely rephrase any message listed under MESSAGES ALREADY SENT — bring a fresh angle.",
    "- Sound like a real person: contractions, natural rhythm, zero corporate filler.",
    '- Output JSON only: {"message": "...", "why": "..."} where "why" is one sentence explaining the angle you took.',
  ].join("\n");
}

export function buildGroqUserPrompt(input: GroqPromptInput): string {
  const { buyer, property, interactions, offers, mode } = input;
  const first = isFirst(buyer.fullName);
  const confirmed = offers
    .filter((o) => o.status !== "Draft" && o.status !== "Withdrawn" && o.status !== "Rejected")
    .sort((a, b) => b.offerDate.localeCompare(a.offerDate))
    .slice(0, 3);

  const used = [...usedMessageFingerprints(interactions)];
  const lastOutbound = interactions.find((i) => i.direction === "out");

  const lines: string[] = [];
  lines.push(`MODE: ${mode}`);
  lines.push(`GUIDANCE: ${MODE_GUIDANCE[mode]}`);
  if (input.refine) {
    lines.push(`REFINE INSTRUCTION: ${REFINE_GUIDANCE[input.refine]}`);
  }
  if (input.currentMessage) {
    lines.push(`CURRENT DRAFT (revise this, don't start over): "${input.currentMessage}"`);
  }
  lines.push("");
  lines.push("CONTEXT:");
  lines.push(`- Buyer: ${buyer.fullName} (go by "${first}")${buyer.companyName ? ` of ${buyer.companyName}` : ""}`);
  lines.push(`- Property: ${property.address}, ${property.city} ${property.state} ${property.zip}`);
  if (property.askingPrice != null) lines.push(`- Asking price: ${formatMoney(property.askingPrice)}`);
  if (property.arv != null) lines.push(`- ARV: ${formatMoney(property.arv)}`);
  lines.push(`- Property status: ${property.status}`);
  for (const o of confirmed) {
    lines.push(`- Confirmed offer: ${formatMoney(o.amount)} (${o.status}, ${o.offerDate})${o.terms ? ` — terms: ${o.terms.slice(0, 120)}` : ""}`);
  }
  if (lastOutbound) {
    lines.push(`- Last we heard from them: ${relativeTime(lastOutbound.occurredAt)}`);
  }
  lines.push("");
  lines.push("CONVERSATION TRANSCRIPT (oldest first):");
  lines.push(transcript(interactions) || "(none)");
  lines.push("");
  if (used.length > 0) {
    lines.push("MESSAGES ALREADY SENT (do not repeat or closely rephrase):");
    for (const m of used.slice(0, 8)) lines.push(`- "${m}"`);
    lines.push("");
  }
  lines.push(`VARIANT SEED: ${input.variant} — use it to pick a different angle than earlier attempts.`);
  return lines.join("\n");
}

export async function callGroq(system: string, user: string, temperature: number): Promise<string> {
  const key = process.env.GROQ_API_KEY as string;
  let lastError: unknown;
  for (const model of [...new Set(MODELS)]) {
    try {
      const res = await fetch(GROQ_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          temperature,
          max_tokens: 1200,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        lastError = new Error(`Groq ${res.status} (${model}): ${body.slice(0, 200)}`);
        continue;
      }
      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || content.length === 0) {
        lastError = new Error(`Groq returned empty content (${model})`);
        continue;
      }
      return content;
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Groq request failed");
}

function parseDraft(content: string): { message: string; why: string } {
  try {
    const parsed = JSON.parse(content) as { message?: string; why?: string };
    return {
      message: (parsed.message ?? "").trim(),
      why: (parsed.why ?? "").trim() || "AI-drafted from the conversation history.",
    };
  } catch {
    return { message: content.trim(), why: "AI-drafted from the conversation history." };
  }
}

function buildSources(ctx: FollowUpContext): string[] {
  const sources: string[] = [];
  const lastIn = ctx.interactions.find((i) => i.direction === "in");
  const lastOut = ctx.interactions.find((i) => i.direction === "out");
  if (lastIn) {
    sources.push(`Last buyer message (${relativeTime(lastIn.occurredAt)}): "${lastIn.originalContent.slice(0, 120)}"`);
  }
  if (lastOut) {
    sources.push(`Last message we sent (${relativeTime(lastOut.occurredAt)}) — will not repeat`);
  }
  sources.push(`Groq AI (${MODELS[0]}) drafted from the full transcript.`);
  return sources;
}

export async function groqGenerateFollowUp(
  ctx: FollowUpContext,
  opts: { refine?: RefineAction | null; currentMessage?: string | null } = {},
): Promise<FollowUpDraft> {
  const blocked = blockedFollowUpReason(ctx);
  if (blocked) {
    return { message: "", mode: ctx.mode, why: "", sources: [], blockedReason: blocked, engine: "ai" };
  }

  const system = buildGroqSystemPrompt();
  const baseUser = buildGroqUserPrompt({
    buyer: ctx.buyer,
    property: ctx.property,
    interactions: ctx.interactions,
    offers: ctx.offers,
    mode: ctx.mode,
    variant: ctx.variant,
    currentMessage: opts.currentMessage ?? null,
    refine: opts.refine ?? null,
  });

  const used = usedMessageFingerprints(ctx.interactions, ctx.tasks ?? []);
  const temperature = 0.55 + ((ctx.variant % 4) * 0.1);

  let lastAttempt = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const user =
      attempt === 0
        ? baseUser
        : `${baseUser}\n\nYour previous attempt was rejected for repeating a prior message:\n"${lastAttempt.slice(0, 200)}"\nWrite a genuinely different message with a new opening and angle.`;
    const content = await callGroq(system, user, temperature);
    const { message, why } = parseDraft(content);
    if (!message) {
      lastAttempt = "";
      continue;
    }
    const fp = messageFingerprint(message);
    if (fp && used.has(fp)) {
      lastAttempt = message;
      continue;
    }
    return {
      message: message.slice(0, 500),
      mode: ctx.mode,
      why,
      sources: buildSources(ctx),
      blockedReason: null,
      engine: "ai",
    };
  }

  // Both attempts repeated prior sends (or came back empty) — fall back to the template engine.
  const fallback = await generateFollowUp(ctx);
  return {
    ...fallback,
    why: `${fallback.why} (Groq draft repeated a prior message — template fallback used.)`,
  };
}
