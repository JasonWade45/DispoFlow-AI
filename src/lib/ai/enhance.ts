import { delay } from "@/lib/format";

export interface EnhanceContext {
  buyerName: string;
  propertyAddress: string;
}

export interface EnhanceResult {
  summary: string;
  outcome: string;
  potentialOfferAmount: number | null;
  nextAction: string;
  missingInfo: string[];
  ambiguous: boolean;
}

const PRICE_PATTERNS = [
  "too high",
  "price is high",
  "a little high",
  "overpriced",
  "above market",
  "price is a little high",
  "bit high",
  "little rich",
];

const PARTNER_PATTERNS = [
  "partner",
  "wife",
  "husband",
  "discuss",
  "talk to",
  "think about",
  "think it over",
  "run the numbers",
  "review the numbers",
  "get back to",
  "sleep on",
];

const INTEREST_PATTERNS = [
  "interested",
  "like it",
  "i like",
  "still available",
  "want it",
  "would take it",
  "send it over",
  "want to move forward",
  "sounds good",
];

const NOT_INTERESTED_PATTERNS = [
  "not interested",
  "no longer interested",
  "going another direction",
  "pass on it",
  "i'll pass",
  "stop texting",
  "remove me",
  "don't contact",
  "do not contact",
];

const INFO_PATTERNS = [
  "send me",
  "inspection report",
  "comps",
  "repair estimate",
  "condition",
  "more info",
  "more information",
  "the numbers",
  "details",
  "photos",
  "what is the",
  "what's the",
];

function extractLockbox(raw: string): { code: string | null; cleanAddress: string } {
  const match = raw.match(/LOCK BOX IS\s+(\d{1,6})/i)
  if (match) {
    const code = match[1]
    const clean = raw.replace(/\s+LOCK BOX IS.*$/i, '').trim()
    return { code, cleanAddress: clean }
  }
  return { code: null, cleanAddress: raw.trim() }
}

function normalizePhone(v: string): string {
  return (v || "").replace(/[^0-9+]/g, "")
}

function normalizeEmail(v: string): string {
  return (v || "").toLowerCase().trim()
}

function normalizeName(v: string): string {
  return (v || "").trim()
}

function flagImpossibleValues(property: Property): string[] {
  const issues: string[] = []
  // Check ZIP format (should be 5 digits)
  const zipMatch = property.zip.match(/^\d{5}(-\d{4})?$/)
  if (!zipMatch && property.zip && property.zip !== "") {
    issues.push("ZIP format invalid")
  }
  // Check state format (should be 2 letters)
  const stateMatch = property.state.match(/^[A-Z]{2}$/)
  if (!stateMatch && property.state && property.state !== "") {
    issues.push("State format invalid")
  }
  // Check if price is reasonable (basic check)
  if (property.askingPrice && property.askingPrice < 1000) {
    issues.push("Asking price unusually low")
  }
  if (property.arv && property.arv < 1000) {
    issues.push("ARV unusually low")
  }
  return issues
}

export function buildEnhanceContext(property: Property, buyer: Buyer): EnhanceContext {
  return {
    buyerName: buyer.fullName,
    propertyAddress: property.address,
  }
}

export function groqEnhance(input: {
  property: Property
  buyer: Buyer
  interaction?: Interaction
}): Promise<EnhanceResult> {
  // TODO: Implement Groq API call
  return Promise.resolve({
    summary: "",
    outcome: "",
    potentialOfferAmount: null,
    nextAction: "",
    missingInfo: [],
    ambiguous: false,
  })
}
  const kMatch = text.match(/(?:\$|usd\s*)?(\d{1,3}(?:\.\d+)?)\s*k\b/i);
  if (kMatch) {
    const v = Number(kMatch[1]);
    if (Number.isFinite(v) && v > 0) return Math.round(v * 1000);
  }
  const fullMatch = text.match(/\$\s*(\d{1,3}(?:,\d{3})+(?:\.\d{2})?|\d{4,}(?:\.\d{2})?)/);
  if (fullMatch) {
    const v = Number(fullMatch[1].replace(/,/g, ""));
    if (Number.isFinite(v) && v > 0) return Math.round(v);
  }
  return null;
}

function includesAny(text: string, patterns: string[]): boolean {
  return patterns.some((p) => text.includes(p));
}

export async function enhanceNotes(
  original: string,
  ctx: EnhanceContext,
): Promise<EnhanceResult> {
  await delay(700 + Math.random() * 500);

  const text = original.toLowerCase().trim();
  const missingInfo: string[] = [];

  const priceConcern = includesAny(text, PRICE_PATTERNS);
  const withPartner = includesAny(text, PARTNER_PATTERNS);
  const notInterested = includesAny(text, NOT_INTERESTED_PATTERNS);
  const interested = includesAny(text, INTEREST_PATTERNS);
  const needsInfo = includesAny(text, INFO_PATTERNS);
  const amount = extractAmount(original);

  if (!notInterested && !priceConcern && !interested && !needsInfo && !withPartner && amount === null) {
    return {
      summary: `These notes about ${ctx.propertyAddress} do not state a clear outcome. The original text was kept as-is: "${original.trim()}"`,
      outcome: "",
      potentialOfferAmount: null,
      nextAction: "Clarify the buyer's position (interested / not interested / needs more information) before saving.",
      missingInfo: [
        "No clear buyer position detected",
        "No price or timeline mentioned",
        "No confirmed follow-up date",
      ],
      ambiguous: true,
    };
  }

  const sentences: string[] = [];
  if (notInterested) {
    sentences.push(`${ctx.buyerName} is not interested in ${ctx.propertyAddress} and asked not to be contacted further.`);
  } else if (interested) {
    sentences.push(`${ctx.buyerName} expressed interest in ${ctx.propertyAddress}.`);
  } else if (amount !== null || priceConcern) {
    sentences.push(`${ctx.buyerName} is engaged on ${ctx.propertyAddress} but has not confirmed a decision.`);
  }

  if (priceConcern) {
    sentences.push(`${ctx.buyerName} considers the asking price too high.`);
  }
  if (withPartner && !notInterested) {
    sentences.push(`${ctx.buyerName} wants to review the numbers with their partner before deciding.`);
  }
  if (needsInfo && !notInterested) {
    sentences.push(`${ctx.buyerName} is waiting on additional information before moving forward.`);
  }
  if (amount !== null) {
    sentences.push(`A potential offer of $${amount.toLocaleString("en-US")} was mentioned — unconfirmed.`);
  }

  const summary = sentences.join(" ");

  let outcome = "";
  if (notInterested) outcome = "Not Interested";
  else if (priceConcern && amount !== null) outcome = "Price Concern — potential offer";
  else if (priceConcern) outcome = "Price Concern";
  else if (needsInfo) outcome = "Needs Information";
  else if (interested && amount !== null) outcome = "Interested — potential offer";
  else if (interested) outcome = "Interested";
  else outcome = "Undecided";

  let nextAction = "";
  if (notInterested) {
    nextAction = "Update the buyer's relationship status and stop outreach on this property.";
  } else if (priceConcern && withPartner) {
    nextAction = `Follow up with ${ctx.buyerName} to confirm the decision after the partner review.`;
  } else if (priceConcern) {
    nextAction = "Prepare pricing context (comps and repair numbers) and follow up on the price concern.";
  } else if (needsInfo) {
    nextAction = "Send the requested information, then confirm the buyer's next step.";
  } else if (interested) {
    nextAction = "Schedule the next follow-up and qualify timeline and financing.";
  } else {
    nextAction = "Clarify the buyer's position on the next contact.";
  }

  if (amount !== null && outcome.includes("potential offer")) {
    missingInfo.push("Potential offer is unconfirmed — verify before creating an Offer record");
  }
  missingInfo.push("No confirmed follow-up date");

  return {
    summary,
    outcome,
    potentialOfferAmount: amount,
    nextAction,
    missingInfo,
    ambiguous: false,
  };
}
