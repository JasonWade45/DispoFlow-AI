import type { Buyer, Interaction, Offer, Property, Task } from "@/types";
import { delay, formatMoney, isFirst, relativeTime } from "@/lib/format";

export type FollowUpMode =
  | "Standard Follow-Up"
  | "Price Objection Follow-Up"
  | "Offer Follow-Up"
  | "Information Requested"
  | "No Response Follow-Up"
  | "Decision Follow-Up"
  | "Re-Engagement"
  | "Custom Follow-Up";

export const FOLLOW_UP_MODES: FollowUpMode[] = [
  "Standard Follow-Up",
  "Price Objection Follow-Up",
  "Offer Follow-Up",
  "Information Requested",
  "No Response Follow-Up",
  "Decision Follow-Up",
  "Re-Engagement",
  "Custom Follow-Up",
];

export type RefineAction = "shorter" | "direct" | "conversational" | "price" | "another";

export const REFINE_ACTIONS = ["shorter", "direct", "conversational", "price", "another"] as const satisfies readonly RefineAction[];

export interface FollowUpContext {
  buyer: Buyer;
  property: Property;
  interactions: Interaction[];
  offers: Offer[];
  tasks?: Task[];
  mode: FollowUpMode;
  variant: number;
}

export interface FollowUpDraft {
  message: string;
  mode: FollowUpMode;
  why: string;
  sources: string[];
  blockedReason: string | null;
  engine?: "ai" | "templates";
}

export function blockedFollowUpReason(ctx: FollowUpContext): string | null {
  if (ctx.buyer.status === "Do Not Contact") {
    return "This buyer is marked Do Not Contact. No follow-up message will be suggested.";
  }
  if (ctx.property.status === "Sold" || ctx.property.status === "Cancelled") {
    return `Property status is ${ctx.property.status}. Review the status before sending any marketing follow-up.`;
  }
  if (ctx.interactions.length === 0) {
    return "No conversation history for this buyer on this property yet — log an interaction first.";
  }
  return null;
}

function lastInbound(interactions: Interaction[]): Interaction | undefined {
  return interactions.find((i) => i.direction === "in");
}

function lastOutbound(interactions: Interaction[]): Interaction | undefined {
  return interactions.find((i) => i.direction === "out");
}

function openQuestionTopics(interactions: Interaction[]): string[] {
  const topics: string[] = [];
  const joined = interactions
    .filter((i) => i.direction === "in")
    .map((i) => i.originalContent.toLowerCase())
    .join(" ");
  if (joined.includes("inspection")) topics.push("the inspection report");
  if (joined.includes("comp")) topics.push("the comps");
  if (joined.includes("repair")) topics.push("the repair numbers");
  if (joined.includes("condition")) topics.push("the condition details");
  if (joined.includes("rent")) topics.push("the rent comps");
  if (joined.includes("title")) topics.push("the title work");
  if (joined.includes("closing") || joined.includes("close")) topics.push("the closing timeline");
  if (joined.includes("tenant")) topics.push("the tenant situation");
  return topics;
}

function mentionsPriceConcern(interactions: Interaction[]): boolean {
  const last = lastInbound(interactions);
  if (!last) return false;
  const t = last.originalContent.toLowerCase();
  return ["price", "high", "over", "pencil", "market"].some((k) => t.includes(k));
}

function mentionsPartner(interactions: Interaction[]): boolean {
  const last = lastInbound(interactions);
  if (!last) return false;
  const t = last.originalContent.toLowerCase();
  return ["partner", "wife", "husband", "discuss", "review", "think about"].some((k) => t.includes(k));
}

function lastBuyerQuestion(interactions: Interaction[]): string | null {
  const last = lastInbound(interactions);
  if (!last) return null;
  const m = last.originalContent.match(/[^.!?\n]+\?/);
  if (!m) return null;
  const q = m[0].trim();
  return q.length <= 140 ? q : null;
}

function confirmedOffer(offers: Offer[]): Offer | undefined {
  return offers
    .filter((o) => o.status !== "Draft" && o.status !== "Withdrawn" && o.status !== "Rejected")
    .sort((a, b) => b.offerDate.localeCompare(a.offerDate))[0];
}

function daysSinceLastContact(interactions: Interaction[]): number | null {
  const last = interactions[0];
  if (!last) return null;
  return Math.floor((Date.now() - new Date(last.occurredAt).getTime()) / 86400000);
}

function normalizeMsg(s: string): string {
  return s
    .toLowerCase()
    .replace(/^(hey|hi|hello)[!,'"\s]+[a-z]+\s*(—|-|,)?\s*/i, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function messageFingerprint(message: string): string {
  const n = normalizeMsg(message);
  return n.slice(0, 60);
}

export function usedMessageFingerprints(
  interactions: Interaction[],
  tasks: Task[] = [],
): Set<string> {
  const used = new Set<string>();
  for (const i of interactions) {
    if (i.direction !== "out") continue;
    const fp = messageFingerprint(i.originalContent);
    if (fp) used.add(fp);
  }
  for (const t of tasks) {
    if (t.status === "Cancelled") continue;
    const quoted = t.description.match(/"([^"]+)"/);
    const text = quoted?.[1] ?? t.description;
    const fp = messageFingerprint(text);
    if (fp) used.add(fp);
  }
  return used;
}

const OPENINGS: Array<(first: string) => string> = [
  (f) => `Hey ${f}`,
  (f) => `Hi ${f}`,
  (f) => `Hey ${f}, hope you're doing well`,
  (f) => `Hi ${f}, quick follow-up`,
  (f) => `Hey ${f} — me again`,
];

const CLOSERS: string[] = [
  "Let me know what you think.",
  "Either way, a quick note back helps me know where things stand.",
  "Just say the word and I'll keep things moving.",
  "No pressure at all — just want to keep you in the loop.",
];

interface BuiltBody {
  text: string;
  why: string;
  usesConversation: boolean;
}

function buildBody(
  ctx: FollowUpContext,
  bodyIdx: number,
): BuiltBody {
  const { buyer, property, interactions, offers, mode } = ctx;
  const offer = confirmedOffer(offers);
  const silentDays = daysSinceLastContact(interactions);
  const topics = openQuestionTopics(interactions);
  const question = lastBuyerQuestion(interactions);
  const priceConcern = mentionsPriceConcern(interactions);
  const wantsPartner = mentionsPartner(interactions);
  const v = bodyIdx;

  switch (mode) {
    case "Price Objection Follow-Up": {
      const bodies = [
        `I get that the price feels heavy. I can walk you through the comps and the repair numbers so you can see where the value sits. If there's a number that works for you, send it over and I'll bring it to the seller.`,
        `Price is the sticking point, right? Happy to share the comps behind the ask — and if you have a number in mind, I'll present it.`,
        `Totally fair on the price. The numbers behind this one are strong once you see the comps — want me to send them over? And if there's a figure that works for you, I'll take it straight to the seller.`,
        `I hear you on price. Rather than go back and forth, tell me the number that makes sense and I'll see what I can do with the seller.`,
        `Understood on the price. I've seen similar houses nearby close at numbers that might change your mind — I can send those your way if useful.`,
      ];
      return {
        text: bodies[v % bodies.length],
        why: "The buyer's latest message raised a price concern, so this draft addresses it directly without inventing a new price.",
        usesConversation: priceConcern,
      };
    }

    case "Offer Follow-Up": {
      const bodies = offer
        ? [
            `Wanted to confirm we're still aligned on the ${formatMoney(offer.amount)} offer for ${property.address}. Let me know if anything changed on your end so I can keep the seller updated.`,
            `The ${formatMoney(offer.amount)} offer on ${property.address} is still open on our side. Any updates from you? I want to make sure we're still moving in the same direction.`,
            `Checking in on our ${formatMoney(offer.amount)} offer for ${property.address} — the seller is asking for an update. Are we still good on your end?`,
            `Our ${formatMoney(offer.amount)} offer for ${property.address} stands. If something better came along, tell me and I'll see what room we have. Otherwise let's push toward closing.`,
          ]
        : [
            `We haven't seen a formal offer from you on ${property.address} yet. If you're still interested, let's get your number in writing so we can move it forward.`,
            `Still no written offer on ${property.address} from your side. If you want it, now's the time — send me your number and I'll get it in front of the seller today.`,
            `If ${property.address} is still the one for you, I need an offer in writing to move anything. What number should I take to the seller?`,
            `No offer on the table yet for ${property.address}. Even a rough number helps — send it over and we'll formalize from there.`,
          ];
      return {
        text: bodies[v % bodies.length],
        why: offer
          ? `There is an offer on record (${formatMoney(offer.amount)}, ${offer.status}); this keeps the buyer committed to it.`
          : "The buyer showed interest but no confirmed offer exists yet.",
        usesConversation: false,
      };
    }

    case "Information Requested": {
      const t = topics.length > 0 ? topics[v % topics.length] : null;
      const bodies = t
        ? [
            `Still working on ${t} for ${property.address}. Wanted to keep you posted and answer anything else that would help you move forward.`,
            `I've got ${t} ready for ${property.address} — want me to send them over? Happy to walk through anything that's still unclear.`,
            `On ${t} for ${property.address}: I can get you everything we have today. Anything else you need to make a call on this one?`,
            `Update on ${t} for ${property.address} — almost there. While I finish that up, what else would help you decide?`,
          ]
        : [
            `Following up on the information you asked about for ${property.address}. What else would be helpful before you make a decision?`,
            `I haven't forgotten your questions on ${property.address}. Tell me what's still missing and I'll get you answers today.`,
            `Still here for anything you need on ${property.address} — docs, photos, numbers, whatever helps you decide.`,
            `Circling back on the info you wanted for ${property.address}. If you listed your questions, I'll answer them all in one shot.`,
          ];
      return {
        text: bodies[v % bodies.length],
        why: question
          ? `The buyer previously asked: "${question}" — this keeps the thread on answering it.`
          : "The buyer previously asked a question that was never answered in the thread.",
        usesConversation: Boolean(question) || topics.length > 0,
      };
    }

    case "No Response Follow-Up": {
      const bodies = [
        `Circling back on ${property.address}. Still available and still interested in talking if you are.`,
        `Haven't heard back on ${property.address}. Is this one still on your radar? A quick yes/no helps me know where to focus.`,
        `No rush at all — just checking whether ${property.address} is still interesting or I should stop bugging you about it.`,
        `Last ping on ${property.address} from my side. If you're still in, reply here and we'll pick it up. If not, no hard feelings.`,
      ];
      return {
        text: bodies[v % bodies.length],
        why: `The last buyer message was ${silentDays !== null ? `${silentDays} day${silentDays === 1 ? "" : "s"}` : "a while"} ago with no reply since.`,
        usesConversation: false,
      };
    }

    case "Decision Follow-Up": {
      const bodies = wantsPartner
        ? [
            `Just checking in to see if you and your partner had a chance to review the numbers on ${property.address}. Let me know what you think and if there's a price point that would make sense for you.`,
            `Any verdict from you and your partner on ${property.address}? I can re-send the numbers if that helps the conversation.`,
            `Wanted to see where things landed after your discussion on ${property.address}. Even a maybe helps me plan the next step.`,
            `Hope the review with your partner went well on ${property.address}. What's the verdict — move forward, keep thinking, or pass?`,
          ]
        : [
            `Any update on your decision for ${property.address}? Happy to talk through it if that's easier.`,
            `Where's your head at on ${property.address}? A quick answer either way helps me plan.`,
            `Still weighing ${property.address}? If there's one thing holding you up, tell me and I'll try to clear it.`,
            `Decided on ${property.address} yet? I'm here whenever you're ready to move — or to talk it through first.`,
          ];
      return {
        text: bodies[v % bodies.length],
        why: wantsPartner
          ? "The buyer said they needed to discuss or review before deciding."
          : "The buyer is sitting on a decision; this nudges without pressure.",
        usesConversation: wantsPartner,
      };
    }

    case "Re-Engagement": {
      const market = buyer.preferredMarkets[0] ?? "your markets";
      const bodies = [
        `It's been a bit since we last spoke about ${property.address}. We've had movement on the list since then. Want me to send you what's still a fit for ${market}?`,
        `Long time no talk — ${property.address} is still on my mind for you. Are you still buying in ${market}? I've got a couple new ones that might fit.`,
        `Reopening the door on ${property.address}. If you're still looking in ${market}, I'd love to send you what's new. If not, I'll mark you closed out for now.`,
        `Hey — remember ${property.address}? Inventory like this moves fast. If you're still hunting in ${market}, let's reconnect this week.`,
      ];
      return {
        text: bodies[v % bodies.length],
        why: `No contact for ${silentDays ?? "several"} days; this reopens the conversation without assuming continued interest.`,
        usesConversation: false,
      };
    }

    case "Custom Follow-Up": {
      const bodies = [
        `Following up on ${property.address}. Let me know where your head is at on this one.`,
        `Touching base on ${property.address} — anything you need from me to move forward?`,
        `Quick note on ${property.address}: I'm here whenever you're ready to talk numbers, timing, or next steps.`,
        `Re: ${property.address} — what's the best next step from your side?`,
      ];
      return {
        text: bodies[v % bodies.length],
        why: "Custom mode: a neutral, context-free draft for you to edit.",
        usesConversation: false,
      };
    }

    default: {
      const bodies: BuiltBody[] = priceConcern && wantsPartner
        ? [
            {
              text: `Just checking in to see if you and your partner had a chance to review the numbers on ${property.address}. Let me know what you think and if there's a price point that would make sense for you.`,
              why: "The last message combined a price concern with a need to review with a partner — this follows up on exactly that.",
              usesConversation: true,
            },
            {
              text: `Following up on ${property.address} — I know price and the partner conversation were both in play. Where did things land?`,
              why: "Addresses both the price concern and the partner review from the last inbound message.",
              usesConversation: true,
            },
          ]
        : priceConcern
          ? [
              {
                text: `Checking back on ${property.address}. Happy to talk through the pricing if it helps. Is there a number that would work for you?`,
                why: "The most recent buyer message raised a price concern.",
                usesConversation: true,
              },
              {
                text: `On ${property.address} — I know the ask felt high. I can send you the comps that back it up, or hear your number if you have one.`,
                why: "Follows up directly on the price concern from the last message.",
                usesConversation: true,
              },
            ]
          : [
              {
                text: `Just checking in to see where you are on ${property.address}. Any thoughts after reviewing the numbers?`,
                why: "Standard follow-up based on the latest point in the conversation.",
                usesConversation: false,
              },
              {
                text: `Following up on ${property.address}. Anything I can answer to help you move forward?`,
                why: "Standard follow-up, angled at removing friction.",
                usesConversation: false,
              },
              {
                text: `Wanted to see if ${property.address} is still a fit for you. If something changed on your end, I'd rather know now than guess.`,
                why: "Standard follow-up that invites an honest yes/no.",
                usesConversation: false,
              },
              {
                text: `Checking in on ${property.address} one more time. If you're still interested, let's set up a quick call this week.`,
                why: "Standard follow-up pushing toward a concrete next step.",
                usesConversation: false,
              },
            ];
      return bodies[v % bodies.length];
    }
  }
}

function composeMessage(
  ctx: FollowUpContext,
  bodyIdx: number,
  openingIdx: number,
  closingIdx: number,
): { message: string; why: string } {
  const { buyer, interactions } = ctx;
  const first = isFirst(buyer.fullName);
  const body = buildBody(ctx, bodyIdx);
  const inbound = lastInbound(interactions);
  const outbound = lastOutbound(interactions);
  const opening = OPENINGS[openingIdx % OPENINGS.length](first);
  const closing = CLOSERS[closingIdx % CLOSERS.length];

  const message = `${opening} — ${body.text} ${closing}`;
  let why = body.why;

  const question = lastBuyerQuestion(interactions);
  if (question && body.usesConversation) {
    why = `${why} Directly references their last question: "${question}".`;
  }
  if (outbound) {
    why = `${why} Avoids repeating your last message (${relativeTime(outbound.occurredAt)}).`;
  }
  if (inbound) {
    why = `${why} Grounded in their latest message (${relativeTime(inbound.occurredAt)}).`;
  }

  return { message, why };
}

function buildMessage(ctx: FollowUpContext): { message: string; why: string; sources: string[] } {
  const { interactions, offers, variant } = ctx;
  const inbound = lastInbound(interactions);
  const outbound = lastOutbound(interactions);
  const offer = confirmedOffer(offers);
  const used = usedMessageFingerprints(interactions, ctx.tasks ?? []);

  const sources: string[] = [];
  if (inbound) {
    sources.push(`Last buyer message (${relativeTime(inbound.occurredAt)}): "${inbound.originalContent}"`);
  }
  if (outbound) {
    sources.push(`Last message we sent (${relativeTime(outbound.occurredAt)}) — will not repeat`);
  }
  const priorNotes = interactions.filter((i) => i.direction === "in" || i.direction === "out").slice(0, 3);
  for (const n of priorNotes) {
    sources.push(`${n.eventType} (${relativeTime(n.occurredAt)}): "${n.originalContent.slice(0, 120)}"`);
  }
  if (offer) {
    sources.push(`Open offer: ${formatMoney(offer.amount)} — ${offer.status}`);
  }
  if (ctx.property.expectedClosingDate) {
    sources.push(`Property status: ${ctx.property.status}, expected closing ${ctx.property.expectedClosingDate}`);
  }
  if (used.size > 0) {
    sources.push(`Checked ${used.size} previously sent/scheduled message(s) to avoid repetition`);
  }

  const bodyCount = 4;
  const openingCount = OPENINGS.length;
  const closingCount = CLOSERS.length;
  const comboCount = bodyCount * openingCount * closingCount;

  let chosen = -1;
  let composed = { message: "", why: "" };
  for (let i = 0; i < comboCount; i++) {
    const n = (variant + i) % comboCount;
    const bodyIdx = Math.floor(n / (openingCount * closingCount));
    const rest = n % (openingCount * closingCount);
    const openingIdx = Math.floor(rest / closingCount);
    const closingIdx = rest % closingCount;
    const c = composeMessage(ctx, bodyIdx, openingIdx, closingIdx);
    const fp = messageFingerprint(c.message);
    if (!used.has(fp)) {
      chosen = n;
      composed = c;
      break;
    }
  }
  if (chosen < 0) {
    composed = composeMessage(ctx, variant % bodyCount, variant % openingCount, variant % closingCount);
    composed.why += " All known variants were used before — consider editing this draft manually.";
  }

  return { message: composed.message, why: composed.why, sources };
}

export async function generateFollowUp(ctx: FollowUpContext): Promise<FollowUpDraft> {
  await delay(800 + Math.random() * 600);

  const blocked = blockedFollowUpReason(ctx);
  if (blocked) {
    return {
      message: "",
      mode: ctx.mode,
      why: "",
      sources: [],
      blockedReason: blocked,
      engine: "templates",
    };
  }

  const { message, why, sources } = buildMessage(ctx);
  return { message, mode: ctx.mode, why, sources, blockedReason: null, engine: "templates" };
}

export async function refineFollowUp(
  ctx: FollowUpContext,
  draft: FollowUpDraft,
  action: RefineAction,
): Promise<FollowUpDraft> {
  await delay(500 + Math.random() * 400);
  if (draft.blockedReason) return draft;

  let message = draft.message;
  let why = draft.why;

  switch (action) {
    case "shorter": {
      const sentences = message.split(/(?<=\.)\s+/);
      message = sentences.slice(0, Math.max(1, Math.ceil(sentences.length / 2))).join(" ");
      why = `${why} Shortened for a quicker read.`;
      break;
    }
    case "direct": {
      message = message
        .replace(/just checking in to see if/i, "wanted to ask:")
        .replace(/just checking in on/i, "quick question on")
        .replace(/following up on/i, "about")
        .replace(/Happy to talk through it if that's easier\./i, "");
      why = `${why} Rewritten to be more direct.`;
      break;
    }
    case "conversational": {
      message = message.replace(/^Hey /, "Hey! ").replace(/\.$/, " — let me know!");
      why = `${why} Tone made more conversational.`;
      break;
    }
    case "price": {
      message = `Hey ${isFirst(ctx.buyer.fullName)} — I hear you on the price for ${ctx.property.address}. I can walk you through the comps and the repair numbers so you can see where the value comes from, and if there's a number that works for you I'll take it to the seller.`;
      why = "Rewritten to address the price concern specifically — no new prices invented.";
      break;
    }
    case "another": {
      const next: FollowUpContext = { ...ctx, variant: ctx.variant + 1 };
      const rebuilt = buildMessage(next);
      message = rebuilt.message;
      why = rebuilt.why;
      break;
    }
  }

  return { ...draft, message, why };
}
