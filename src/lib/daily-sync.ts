import type { DB, Interaction, Task } from "@/types";
import {
  buildInteractionsFromDg,
  ensureBuyersFromConversations,
  relinkDgInteractions,
  type DgPayload,
} from "@/lib/dispo-genius";
import { generateFollowUp, blockedFollowUpReason, type FollowUpContext } from "@/lib/ai/followup";
import { groqGenerateFollowUp, isGroqConfigured } from "@/lib/ai/groq";
import { uid } from "@/lib/format";

export const FOLLOW_UP_TASK_TYPE = "Send SMS";

/** All in/out interactions for a buyer, newest first (ignores property — DG messages are buyer-level). */
export function buyerInteractions(db: DB, buyerId: string): Interaction[] {
  return db.interactions
    .filter((i) => i.buyerId === buyerId && (i.direction === "in" || i.direction === "out"))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

/** True when the buyer's most recent message is inbound — they wrote and we haven't replied. */
export function needsFollowUp(db: DB, buyerId: string): boolean {
  const last = buyerInteractions(db, buyerId)[0];
  return Boolean(last && last.direction === "in");
}

export interface DailySyncResult {
  imported: number;
  skipped: number;
  matched: number;
  unmatched: number;
  conversations: number;
  draftsCreated: number;
  draftsSkipped: number;
  buyersCreated: number;
  relinked: number;
}

/**
 * Merge DispoGenius conversations into the DB and create follow-up draft tasks
 * for every buyer whose latest message is an unanswered inbound. Pure: returns
 * a new DB without mutating the input.
 */
export async function runDailySync(
  db: DB,
  payload: DgPayload,
  userId: string,
  now: string,
  opts: { maxDrafts?: number; useAi?: boolean } = {},
): Promise<{ db: DB; result: DailySyncResult }> {
  const maxDrafts = opts.maxDrafts ?? 20;
  const useAi = opts.useAi ?? isGroqConfigured();

  const withBuyers = ensureBuyersFromConversations(db, payload, userId, now);
  const { interactions, summary } = buildInteractionsFromDg(payload, withBuyers.db, userId, now);
  const relink = relinkDgInteractions(withBuyers.db, payload);
  const relinkedById = new Map(relink.interactions.map((i) => [i.id, i]));
  const mergedInteractions: Interaction[] = [
    ...withBuyers.db.interactions.map((i) => relinkedById.get(i.id) ?? i),
    ...interactions,
  ];
  const draftDb: DB = { ...withBuyers.db, interactions: mergedInteractions };

  // Buyers referenced by the newly imported or relinked interactions that have a relationship (property context).
  const candidateBuyerIds = new Set<string>();
  for (const i of interactions) {
    if (i.buyerId) candidateBuyerIds.add(i.buyerId);
  }
  for (const i of relink.interactions) {
    if (i.buyerId) candidateBuyerIds.add(i.buyerId);
  }

  const existingOpenDraftBuyers = new Set(
    withBuyers.db.tasks
      .filter(
        (t) =>
          t.taskType === FOLLOW_UP_TASK_TYPE &&
          t.status !== "Cancelled" &&
          t.status !== "Completed" &&
          t.buyerId,
      )
      .map((t) => t.buyerId as string),
  );

  const newTasks: Task[] = [];
  let draftsCreated = 0;
  let draftsSkipped = 0;

  for (const buyerId of candidateBuyerIds) {
    if (draftsCreated >= maxDrafts) break;
    if (existingOpenDraftBuyers.has(buyerId)) {
      draftsSkipped += 1;
      continue;
    }
    if (!needsFollowUp(draftDb, buyerId)) continue;

    const buyer = withBuyers.db.buyers.find((b) => b.id === buyerId);
    if (!buyer) continue;
    // Pick the first relationship for property context.
    const relationship = db.relationships.find((r) => r.buyerId === buyerId);
    const property = relationship
      ? db.properties.find((p) => p.id === relationship.propertyId)
      : undefined;
    if (!property) {
      draftsSkipped += 1;
      continue;
    }

    const pairInteractions = buyerInteractions(draftDb, buyerId);
    const offers = db.offers.filter((o) => o.buyerId === buyerId);
    const tasks = db.tasks.filter((t) => t.buyerId === buyerId);
    const ctx: FollowUpContext = {
      buyer,
      property,
      interactions: pairInteractions,
      offers,
      tasks,
      mode: "Standard Follow-Up",
      variant: 0,
    };

    if (blockedFollowUpReason(ctx)) {
      draftsSkipped += 1;
      continue;
    }

    let message = "";
    let why = "";
    try {
      const draft =
        useAi && isGroqConfigured()
          ? await groqGenerateFollowUp(ctx)
          : await generateFollowUp(ctx);
      message = draft.message;
      why = draft.why;
    } catch {
      const fallback = await generateFollowUp(ctx);
      message = fallback.message;
      why = fallback.why;
    }

    if (!message) {
      draftsSkipped += 1;
      continue;
    }

    newTasks.push({
      id: uid("t"),
      orgId: db.organization.id,
      buyerId,
      propertyId: property.id,
      relatedInteractionId: null,
      taskType: FOLLOW_UP_TASK_TYPE,
      description: `Follow-up draft: "${message}"${why ? ` — ${why}` : ""}`,
      dueDate: now.slice(0, 10),
      dueTime: null,
      assignedUserId: userId,
      priority: "Medium",
      status: "Needs Scheduling",
      completionNotes: "",
      createdAt: now,
      completedAt: null,
      completedVia: null,
      sentAt: null,
    });
    existingOpenDraftBuyers.add(buyerId);
    draftsCreated += 1;
  }

  const nextDb: DB = {
    ...draftDb,
    tasks: [...newTasks, ...db.tasks],
  };

  return {
    db: nextDb,
    result: {
      imported: summary.imported,
      skipped: summary.skipped,
      matched: summary.matched,
      unmatched: summary.unmatched,
      conversations: summary.conversations,
      draftsCreated,
      draftsSkipped,
      buyersCreated: withBuyers.created,
      relinked: relink.relinked,
    },
  };
}

export function formatDailySyncSummary(r: DailySyncResult): string {
  const parts = [
    `${r.imported} new message${r.imported === 1 ? "" : "s"}`,
    `${r.draftsCreated} follow-up draft${r.draftsCreated === 1 ? "" : "s"}`,
  ];
  if (r.buyersCreated > 0) parts.push(`${r.buyersCreated} new buyer${r.buyersCreated === 1 ? "" : "s"}`);
  if (r.relinked > 0) parts.push(`${r.relinked} old message${r.relinked === 1 ? "" : "s"} relinked`);
  return parts.join(" · ");
}
