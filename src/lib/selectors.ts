import type {
  Buyer,
  BuyerProperty,
  DB,
  Interaction,
  Offer,
  Property,
  Task,
  TaskStatus,
  User,
} from "@/types";

export function buyerById(db: DB, id: string | null): Buyer | undefined {
  return id ? db.buyers.find((b) => b.id === id) : undefined;
}

export function propertyById(db: DB, id: string | null): Property | undefined {
  return id ? db.properties.find((p) => p.id === id) : undefined;
}

export function userById(db: DB, id: string | null): User | undefined {
  return id ? db.users.find((u) => u.id === id) : undefined;
}

export function relationshipById(db: DB, id: string): BuyerProperty | undefined {
  return db.relationships.find((r) => r.id === id);
}

export function findRelationship(db: DB, buyerId: string, propertyId: string): BuyerProperty | undefined {
  return db.relationships.find((r) => r.buyerId === buyerId && r.propertyId === propertyId);
}

export function relationshipsForProperty(db: DB, propertyId: string): BuyerProperty[] {
  return db.relationships.filter((r) => r.propertyId === propertyId);
}

export function relationshipsForBuyer(db: DB, buyerId: string): BuyerProperty[] {
  return db.relationships.filter((r) => r.buyerId === buyerId);
}

export function interactionsForProperty(db: DB, propertyId: string): Interaction[] {
  return db.interactions
    .filter((i) => i.propertyId === propertyId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function interactionsForBuyer(db: DB, buyerId: string): Interaction[] {
  return db.interactions
    .filter((i) => i.buyerId === buyerId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function interactionsForPair(db: DB, buyerId: string, propertyId: string): Interaction[] {
  return db.interactions
    .filter((i) => i.buyerId === buyerId && i.propertyId === propertyId)
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

export function offersForProperty(db: DB, propertyId: string): Offer[] {
  return db.offers.filter((o) => o.propertyId === propertyId);
}

export function offersForBuyer(db: DB, buyerId: string): Offer[] {
  return db.offers.filter((o) => o.buyerId === buyerId);
}

export function tasksForRelationship(db: DB, buyerId: string, propertyId: string): Task[] {
  return db.tasks.filter((t) => t.buyerId === buyerId && t.propertyId === propertyId);
}

function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function taskDueTimestamp(task: Task): number | null {
  if (!task.dueDate) return null;
  const [y, m, d] = task.dueDate.split("-").map(Number);
  let hours = 9;
  let minutes = 0;
  if (task.dueTime) {
    const [hh, mm] = task.dueTime.split(":").map(Number);
    if (Number.isFinite(hh)) hours = hh;
    if (Number.isFinite(mm)) minutes = mm;
  }
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hours, minutes, 0, 0);
  return dt.getTime();
}

export function taskStatus(task: Task, now: Date = new Date()): TaskStatus {
  if (task.status === "Completed" || task.status === "Cancelled") return task.status;
  const due = taskDueTimestamp(task);
  if (due === null) return "Needs Scheduling";
  if (due < now.getTime()) return "Overdue";
  const dueDate = new Date(due);
  if (sameDay(dueDate, now)) return "Due";
  return "Scheduled";
}

export interface Kpis {
  overdue: number;
  dueToday: number;
  upcoming: number;
  unscheduled: number;
  activeProperties: number;
  activeBuyers: number;
  openOffers: number;
  completedToday: number;
}

export const CLOSED_PROPERTY_STATUSES = ["Sold", "Cancelled"];

export function isActiveProperty(p: Property): boolean {
  return !CLOSED_PROPERTY_STATUSES.includes(p.status);
}

export const OPEN_OFFER_STATUSES = ["Draft", "Submitted", "Under Review", "Countered"];

export function isOpenOffer(o: Offer): boolean {
  return OPEN_OFFER_STATUSES.includes(o.status);
}

export function computeKpis(db: DB, now: Date = new Date()): Kpis {
  let overdue = 0;
  let dueToday = 0;
  let upcoming = 0;
  let unscheduled = 0;
  let completedToday = 0;

  for (const t of db.tasks) {
    const s = taskStatus(t, now);
    if (s === "Overdue") overdue += 1;
    else if (s === "Due") dueToday += 1;
    else if (s === "Scheduled") {
      const due = taskDueTimestamp(t);
      if (due !== null && due - now.getTime() <= 7 * 86400000) upcoming += 1;
    } else if (s === "Needs Scheduling") unscheduled += 1;

    if (t.status === "Completed" && t.completedAt && sameDay(new Date(t.completedAt), now)) {
      completedToday += 1;
    }
  }

  return {
    overdue,
    dueToday,
    upcoming,
    unscheduled,
    activeProperties: db.properties.filter(isActiveProperty).length,
    activeBuyers: db.buyers.filter((b) => b.status === "Active").length,
    openOffers: db.offers.filter(isOpenOffer).length,
    completedToday,
  };
}

export interface Alert {
  id: string;
  severity: "danger" | "warning" | "info";
  title: string;
  body: string;
  href: string;
}

export function computeAlerts(db: DB, now: Date = new Date()): Alert[] {
  const alerts: Alert[] = [];
  const k = computeKpis(db, now);

  if (k.overdue > 0) {
    alerts.push({
      id: "overdue",
      severity: "danger",
      title: `${k.overdue} overdue follow-up${k.overdue === 1 ? "" : "s"}`,
      body: "Tasks passed their due time without being completed.",
      href: "/follow-ups?tab=Overdue",
    });
  }

  const staleOffers = db.offers.filter(
    (o) => (o.status === "Submitted" || o.status === "Under Review") && daysSince(o.updatedAt) >= 3,
  );
  if (staleOffers.length > 0) {
    alerts.push({
      id: "stale-offers",
      severity: "warning",
      title: `${staleOffers.length} offer${staleOffers.length === 1 ? "" : "s"} waiting on a response`,
      body: "Submitted offers with no update in 3+ days.",
      href: "/offers",
    });
  }

  const closings = db.properties.filter((p) => {
    if (!p.expectedClosingDate) return false;
    const diff = (new Date(p.expectedClosingDate).getTime() - now.getTime()) / 86400000;
    return diff >= 0 && diff <= 7 && p.status !== "Sold" && p.status !== "Cancelled";
  });
  if (closings.length > 0) {
    alerts.push({
      id: "closing",
      severity: "info",
      title: `${closings.length} closing${closings.length === 1 ? "" : "s"} within 7 days`,
      body: closings.map((p) => p.address).join(", "),
      href: "/properties",
    });
  }

  const interestedNoSchedule = db.relationships.filter((r) => {
    if (r.relationshipStatus !== "Active") return false;
    if (!["Interested", "Price Concern", "Offer Submitted"].includes(r.interestStatus)) return false;
    const hasOpenTask = db.tasks.some(
      (t) =>
        t.buyerId === r.buyerId &&
        t.propertyId === r.propertyId &&
        t.status !== "Completed" &&
        t.status !== "Cancelled",
    );
    return !hasOpenTask;
  });
  if (interestedNoSchedule.length > 0) {
    alerts.push({
      id: "no-schedule",
      severity: "warning",
      title: `${interestedNoSchedule.length} interested buyer${interestedNoSchedule.length === 1 ? "" : "s"} without a scheduled follow-up`,
      body: "These conversations need a next step.",
      href: "/follow-ups?tab=Needs%20Scheduling",
    });
  }

  const missingData = db.properties.filter((p) => isActiveProperty(p) && (!p.askingPrice || !p.zip));
  if (missingData.length > 0) {
    alerts.push({
      id: "missing-data",
      severity: "info",
      title: `${missingData.length} propert${missingData.length === 1 ? "y" : "ies"} missing key data`,
      body: "Asking price or ZIP code is empty.",
      href: "/properties",
    });
  }

  return alerts;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

export function openTasks(db: DB): Task[] {
  return db.tasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled");
}

export function nextTaskForPair(db: DB, buyerId: string, propertyId: string): Task | undefined {
  const open = tasksForRelationship(db, buyerId, propertyId)
    .filter((t) => t.status !== "Completed" && t.status !== "Cancelled")
    .sort((a, b) => {
      const at = taskDueTimestamp(a) ?? Number.POSITIVE_INFINITY;
      const bt = taskDueTimestamp(b) ?? Number.POSITIVE_INFINITY;
      return at - bt;
    });
  return open[0];
}

export function lastInteractionForPair(
  interactions: Interaction[],
  buyerId: string,
  propertyId: string,
): Interaction | undefined {
  return interactions.find((i) => i.buyerId === buyerId && i.propertyId === propertyId);
}

export function sortTasksByPriority(db: DB, tasks: Task[], now: Date = new Date()): Task[] {
  const hasOpenOffer = (t: Task): boolean =>
    db.offers.some(
      (o) =>
        o.buyerId === t.buyerId &&
        o.propertyId === t.propertyId &&
        OPEN_OFFER_STATUSES.includes(o.status),
    );

  const score = (t: Task): number => {
    const s = taskStatus(t, now);
    let v = 0;
    if (s === "Overdue") v += 1000;
    else if (s === "Due") v += 800;
    else if (s === "Needs Scheduling") v += 600;
    else v += 400;
    const due = taskDueTimestamp(t);
    if (due !== null) {
      const days = (due - now.getTime()) / 86400000;
      v += Math.max(0, 120 - days * 5);
    }
    if (hasOpenOffer(t)) v += 30;
    if (t.priority === "Urgent") v += 60;
    else if (t.priority === "High") v += 40;
    else if (t.priority === "Medium") v += 20;
    return v;
  };
  return [...tasks].sort((a, b) => score(b) - score(a));
}
