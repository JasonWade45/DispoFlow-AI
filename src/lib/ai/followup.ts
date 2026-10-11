import type { Buyer, Interaction, Offer, Property } from "@/types";
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

export interface FollowUpContext {
  buyer: Buyer;
  property: Property;
  interactions: Interaction[];
  offers: Offer[];
  mode: FollowUpMode;
  variant: number;
}

export interface FollowUpDraft {
  message: string;
  mode: FollowUpMode;
  why: string;
  sources: string[];
  blockedReason: string | null;
}

function streetName(address: string): string {
  const parts = address.split(" ");
  return parts.length > 2 ? parts.slice(1).join(" ") : address;
}

function lastInbound(interactions: Interaction[]): Interaction | undefined {
  return interactions.find((i) => i.direction === "in");
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

function buildMessage(ctx: FollowUpContext): { message: string; why: string; sources: string[] } {
  const { buyer, property, interactions, offers, mode, variant } = ctx;
  const first = isFirst(buyer.fullName);
  const prop = streetName(property.address);
  const inbound = lastInbound(interactions);
  const offer = confirmedOffer(offers);
  const silentDays = daysSinceLastContact(interactions);
  const topics = openQuestionTopics(interactions);
  const sources: string[] = [];

  if (inbound) {
    sources.push(`Last buyer message (${relativeTime(inbound.occurredAt)}): "${inbound.originalContent}"`);
  }
  const priorNotes = interactions.filter((i) => i.direction !== "in").slice(0, 3);
  for (const n of priorNotes) {
    sources.push(`${n.eventType} (${relativeTime(n.occurredAt)}): "${n.originalContent.slice(0, 120)}"`);
  }
  if (offer) {
    sources.push(`Open offer: ${formatMoney(offer.amount)} — ${offer.status}`);
  }
  if (property.expectedClosingDate) {
    sources.push(`Property status: ${property.status}, expected closing ${property.expectedClosingDate}`);
  }

  let message = "";
  let why = "";

  const priceConcern = mentionsPriceConcern(interactions);
  const wantsPartner = mentionsPartner(interactions);
  const openTasksNote = "";

  switch (mode) {
    case "Price Objection Follow-Up":
      message =
        variant % 2 === 0
          ? `Hey ${first} — following up on ${property.address}. I get that the price feels heavy. I can walk you through the comps and the repair numbers so you can see where the value sits. If there's a number that works for you, send it over and I'll bring it to the seller.`
          : `Hey ${first}, checking back in on ${prop}. Price is the sticking point, right? Happy to share the comps behind the ask — and if you have a number in mind, I'll present it.`;
      why = "The buyer's latest message raised a price concern, so this draft addresses it directly without inventing a new price.";
      break;

    case "Offer Follow-Up":
      message = offer
        ? `Hey ${first} — wanted to confirm we're still aligned on the ${formatMoney(offer.amount)} offer for ${property.address}. Let me know if anything changed on your end so I can keep the seller updated.`
        : `Hey ${first} — we haven't seen a formal offer from you on ${property.address} yet. If you're still interested, let's get your number in writing so we can move it forward.`;
      why = offer
        ? `There is an offer on record (${formatMoney(offer.amount)}, ${offer.status}); this keeps the buyer committed to it.`
        : "The buyer showed interest but no confirmed offer exists yet.";
      break;

    case "Information Requested":
      message = topics.length > 0
        ? `Hey ${first} — still working on ${topics[0]} for ${property.address}. Wanted to keep you posted and answer anything else that would help you move forward.`
        : `Hey ${first} — following up on the information you asked about for ${property.address}. What else would be helpful before you make a decision?`;
      why = "The buyer previously asked a question that was never answered in the thread.";
      break;

    case "No Response Follow-Up":
      message =
        variant % 2 === 0
          ? `Hey ${first} — circling back on ${property.address}. Still available and still interested in talking if you are.`
          : `Hey ${first}, haven't heard back on ${property.address}. Is this one still on your radar? A quick yes/no helps me know where to focus.`;
      why = `The last buyer message was ${silentDays !== null ? `${silentDays} day${silentDays === 1 ? "" : "s"}` : "a while"} ago with no reply since.`;
      break;

    case "Decision Follow-Up":
      message = wantsPartner
        ? `Hey ${first} — just checking in to see if you and your partner had a chance to review the numbers on ${property.address}. Let me know what you think and if there's a price point that would make sense for you.`
        : `Hey ${first} — any update on your decision for ${property.address}? Happy to talk through it if that's easier.`;
      why = "The buyer said they needed to discuss or review before deciding.";
      break;

    case "Re-Engagement":
      message = `Hey ${first} — it's been a bit since we last spoke about ${property.address}. We've had movement on the list since then. Want me to send you what's still a fit for ${buyer.preferredMarkets[0] ?? "your markets"}?`;
      why = `No contact for ${silentDays ?? "several"} days; this reopens the conversation without assuming continued interest.`;
      break;

    case "Custom Follow-Up":
      message = `Hey ${first} — following up on ${property.address}. Let me know where your head is at on this one.`;
      why = "Custom mode: a neutral, context-free draft for you to edit.";
      break;

    default:
      if (priceConcern && wantsPartner) {
        message = `Hey ${first}, just checking in to see if you and your partner had a chance to review the numbers on ${property.address}. Let me know what you think and if there's a price point that would make sense for you.`;
        why = "The last message combined a price concern with a need to review with a partner — this follows up on exactly that.";
      } else if (priceConcern) {
        message = `Hey ${first} — checking back on ${property.address}. Happy to talk through the pricing if it helps. Is there a number that would work for you?`;
        why = "The most recent buyer message raised a price concern.";
      } else if (variant % 2 === 0) {
        message = `Hey ${first} — just checking in to see where you are on ${property.address}. Any thoughts after reviewing the numbers?`;
        why = "Standard follow-up based on the latest point in the conversation.";
      } else {
        message = `Hey ${first}, following up on ${property.address}. Anything I can answer to help you move forward?`;
        why = "Standard follow-up, angled at removing friction.";
      }
      break;
  }

  if (variant === 1 && mode !== "Custom Follow-Up") {
    message = message.replace(/^Hey [^,]+,?\s*/, "");
    message = message.charAt(0).toUpperCase() + message.slice(1);
  }

  if (openTasksNote) sources.push(openTasksNote);

  return { message, why, sources };
}

export async function generateFollowUp(ctx: FollowUpContext): Promise<FollowUpDraft> {
  await delay(800 + Math.random() * 600);

  if (ctx.buyer.status === "Do Not Contact") {
    return {
      message: "",
      mode: ctx.mode,
      why: "",
      sources: [],
      blockedReason:
        "This buyer is marked Do Not Contact. No follow-up message will be suggested.",
    };
  }

  if (ctx.property.status === "Sold" || ctx.property.status === "Cancelled") {
    return {
      message: "",
      mode: ctx.mode,
      why: "",
      sources: [],
      blockedReason: `Property status is ${ctx.property.status}. Review the status before sending any marketing follow-up.`,
    };
  }

  if (ctx.interactions.length === 0) {
    return {
      message: "",
      mode: ctx.mode,
      why: "",
      sources: [],
      blockedReason: "No conversation history for this buyer on this property yet — log an interaction first.",
    };
  }

  const { message, why, sources } = buildMessage(ctx);
  return { message, mode: ctx.mode, why, sources, blockedReason: null };
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
