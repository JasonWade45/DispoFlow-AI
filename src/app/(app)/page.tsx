"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useDb, useSession } from "@/lib/store";
import {
  buyerById,
  computeAlerts,
  computeKpis,
  isOpenOffer,
  propertyById,
  sortTasksByPriority,
  taskStatus,
} from "@/lib/selectors";
import { formatDate, formatMoney, formatTime, relativeTime, cx } from "@/lib/format";
import { markSent } from "@/lib/actions";
import { useModals } from "@/components/modals/ModalHost";
import SyncBanner from "@/components/SyncBanner";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import type { Task } from "@/types";

function KpiCard({
  label,
  value,
  href,
  tone,
  hint,
}: {
  label: string;
  value: number;
  href: string;
  tone: string;
  hint?: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "rounded-xl border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        tone,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </Link>
  );
}

const ALERT_TONES: Record<string, string> = {
  danger: "border-rose-200 bg-rose-50 text-rose-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-sky-200 bg-sky-50 text-sky-800",
};

function TaskRow({
  task,
  db,
  modals,
  sessionUserId,
}: {
  task: Task;
  db: ReturnType<typeof useDb>;
  modals: ReturnType<typeof useModals>;
  sessionUserId: string;
}) {
  const buyer = buyerById(db, task.buyerId);
  const property = propertyById(db, task.propertyId);
  const s = taskStatus(task);
  const isMessage = task.taskType.toLowerCase().includes("message");
  const propertyHref =
    task.propertyId && task.buyerId
      ? `/properties/${task.propertyId}?buyer=${task.buyerId}`
      : task.propertyId
        ? `/properties/${task.propertyId}`
        : task.buyerId
          ? `/buyers/${task.buyerId}`
          : null;

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Badge label={s} />
          <span className="text-xs text-slate-400">{task.taskType}</span>
          {task.priority === "Urgent" && <Badge label="Urgent" />}
          {task.completedVia === "sent" && <Badge label="Sent" />}
        </div>
        <p className="mt-1 truncate text-sm text-slate-800">
          {propertyHref ? (
            <Link href={propertyHref} className="hover:text-slate-950 hover:underline">
              {task.description}
            </Link>
          ) : (
            task.description
          )}
        </p>
        <p className="mt-0.5 truncate text-xs text-slate-400">
          {buyer?.fullName ?? "No buyer"}
          {property ? ` · ${property.address}` : ""}
          {task.dueDate ? ` · due ${formatDate(task.dueDate)} ${formatTime(task.dueTime)}` : " · no date"}
          {task.sentAt ? ` · sent ${relativeTime(task.sentAt)}` : ""}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {isMessage && task.status !== "Completed" && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => markSent(task.id, "Message sent from dashboard", sessionUserId)}
            title="Mark message as sent"
          >
            Mark Sent
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => modals.completeTask(task)}
          title="Complete"
        >
          Done
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() =>
            modals.generateFollowUp({ buyerId: task.buyerId, propertyId: task.propertyId })
          }
          title="Generate follow-up message"
        >
          Message
        </Button>
      </div>
    </li>
  );
}

function SectionCard({
  title,
  count,
  tone,
  tasks,
  db,
  modals,
  sessionUserId,
  emptyText,
  viewAllHref,
}: {
  title: string;
  count: number;
  tone: string;
  tasks: Task[];
  db: ReturnType<typeof useDb>;
  modals: ReturnType<typeof useModals>;
  sessionUserId: string;
  emptyText: string;
  viewAllHref: string;
}) {
  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
          <span className={cx("rounded-full px-2 py-0.5 text-[11px] font-semibold", tone)}>
            {count}
          </span>
        </div>
        <Link href={viewAllHref} className="text-xs font-medium text-slate-500 hover:text-slate-800">
          View all
        </Link>
      </div>
      <ul className="divide-y divide-slate-100">
        {tasks.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-slate-400">{emptyText}</li>
        )}
        {tasks.slice(0, 5).map((t) => (
          <TaskRow key={t.id} task={t} db={db} modals={modals} sessionUserId={sessionUserId} />
        ))}
      </ul>
    </Card>
  );
}

export default function DashboardPage() {
  const db = useDb();
  const session = useSession();
  const modals = useModals();
  const k = computeKpis(db);
  const alerts = computeAlerts(db);

  const sections = useMemo(() => {
    const now = new Date();
    const todayIsoStr = now.toISOString().slice(0, 10);
    const openTasks = db.tasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled");

    const overdue: Task[] = [];
    const dueToday: Task[] = [];
    const upcoming: Task[] = [];
    const unscheduled: Task[] = [];
    const completedToday: Task[] = [];

    for (const t of openTasks) {
      const s = taskStatus(t, now);
      if (s === "Overdue") overdue.push(t);
      else if (s === "Due") dueToday.push(t);
      else if (s === "Needs Scheduling") unscheduled.push(t);
      else if (s === "Scheduled") {
        const due = t.dueDate ? new Date(t.dueDate + "T23:59:59").getTime() : 0;
        if (due - now.getTime() <= 7 * 86400000) upcoming.push(t);
      }
    }

    for (const t of db.tasks) {
      if (
        t.status === "Completed" &&
        t.completedAt &&
        t.completedAt.slice(0, 10) === todayIsoStr
      ) {
        completedToday.push(t);
      }
    }

    const syncFailed = db.properties.filter((p) => p.syncStatus === "error");

    return {
      overdue: sortTasksByPriority(db, overdue, now),
      dueToday: sortTasksByPriority(db, dueToday, now),
      upcoming: sortTasksByPriority(db, upcoming, now),
      unscheduled: sortTasksByPriority(db, unscheduled, now),
      completedToday: completedToday.sort((a, b) =>
        (b.completedAt ?? "").localeCompare(a.completedAt ?? ""),
      ),
      syncFailed,
    };
  }, [db]);

  const attentionOffers = db.offers
    .filter(isOpenOffer)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);
  const recentProperties = [...db.properties]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  const userName =
    db.users.find((u) => u.id === session.userId)?.name.split(" ")[0] ?? "there";

  return (
    <div>
      <PageHeader
        title={`Welcome back, ${userName}`}
        subtitle={new Date().toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          year: "numeric",
        })}
        actions={
          <>
            <Button variant="secondary" onClick={() => modals.logInteraction()}>
              Log Interaction
            </Button>
            <Button variant="secondary" onClick={() => modals.createFollowUp()}>
              Create Follow-Up
            </Button>
            <Button onClick={() => modals.addProperty()}>Add Property</Button>
          </>
        }
      />

      <SyncBanner />

      {db.properties.length === 0 && (
        <Card className="mb-5 border-dashed px-6 py-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 10.5L12 3l9 7.5M5 9.5V21h14V9.5" />
            </svg>
          </div>
          <h2 className="mt-3 text-base font-semibold text-slate-800">No properties yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
            Pull your properties from ElevateReg or import from Trello to get started.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Button
              onClick={() => {
                window.dispatchEvent(new CustomEvent("dispoflow:sync-now"));
              }}
            >
              Sync ElevateReg Now
            </Button>
            <Link href="/settings/trello">
              <Button variant="secondary">Connect Trello</Button>
            </Link>
            <Button variant="ghost" onClick={() => modals.addProperty()}>
              Add Manually
            </Button>
          </div>
        </Card>
      )}

      <div id="alerts" className="mb-5 space-y-2">
        {alerts.length === 0 && (
          <Card className="px-4 py-3 text-sm text-slate-500">
            Nothing needs attention right now.
          </Card>
        )}
        {alerts.map((a) => (
          <Link
            key={a.id}
            href={a.href}
            className={cx(
              "flex items-start gap-3 rounded-xl border px-4 py-3 transition-colors hover:brightness-[0.98]",
              ALERT_TONES[a.severity],
            )}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mt-0.5 shrink-0">
              <path d="M12 9v4m0 4h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{a.title}</p>
              <p className="truncate text-xs opacity-80">{a.body}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Overdue Follow-Ups" value={k.overdue} href="/follow-ups?tab=Overdue" tone="border-rose-200" hint="Past due, not completed" />
        <KpiCard label="Due Today" value={k.dueToday} href="/follow-ups?tab=Due" tone="border-amber-200" hint="Scheduled for today" />
        <KpiCard label="Upcoming" value={k.upcoming} href="/follow-ups?tab=Scheduled" tone="border-sky-200" hint="Next 7 days" />
        <KpiCard label="Unscheduled" value={k.unscheduled} href="/follow-ups?tab=Needs%20Scheduling" tone="border-purple-200" hint="No date picked yet" />
        <KpiCard label="Active Properties" value={k.activeProperties} href="/properties" tone="border-indigo-200" hint="Not sold or cancelled" />
        <KpiCard label="Active Buyers" value={k.activeBuyers} href="/buyers" tone="border-emerald-200" hint="In the pipeline" />
        <KpiCard label="Open Offers" value={k.openOffers} href="/offers" tone="border-orange-200" hint="No final outcome yet" />
        <KpiCard label="Completed Today" value={k.completedToday} href="/follow-ups?tab=Completed" tone="border-emerald-200" hint="Follow-ups done today" />
      </div>

      <div className="mb-6 grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Overdue"
          count={sections.overdue.length}
          tone="bg-rose-100 text-rose-700"
          tasks={sections.overdue}
          db={db}
          modals={modals}
          sessionUserId={session.userId ?? "u_sarah"}
          emptyText="Nothing overdue — you're caught up."
          viewAllHref="/follow-ups?tab=Overdue"
        />
        <SectionCard
          title="Due Today"
          count={sections.dueToday.length}
          tone="bg-amber-100 text-amber-700"
          tasks={sections.dueToday}
          db={db}
          modals={modals}
          sessionUserId={session.userId ?? "u_sarah"}
          emptyText="Nothing due today."
          viewAllHref="/follow-ups?tab=Due"
        />
        <SectionCard
          title="Upcoming (7 days)"
          count={sections.upcoming.length}
          tone="bg-sky-100 text-sky-700"
          tasks={sections.upcoming}
          db={db}
          modals={modals}
          sessionUserId={session.userId ?? "u_sarah"}
          emptyText="Nothing scheduled in the next 7 days."
          viewAllHref="/follow-ups?tab=Scheduled"
        />
        <SectionCard
          title="Unscheduled"
          count={sections.unscheduled.length}
          tone="bg-purple-100 text-purple-700"
          tasks={sections.unscheduled}
          db={db}
          modals={modals}
          sessionUserId={session.userId ?? "u_sarah"}
          emptyText="Everything has a date."
          viewAllHref="/follow-ups?tab=Needs%20Scheduling"
        />
        <SectionCard
          title="Completed Today"
          count={sections.completedToday.length}
          tone="bg-emerald-100 text-emerald-700"
          tasks={sections.completedToday}
          db={db}
          modals={modals}
          sessionUserId={session.userId ?? "u_sarah"}
          emptyText="No follow-ups completed yet today."
          viewAllHref="/follow-ups?tab=Completed"
        />
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-slate-800">Sync Issues</h2>
              <span
                className={cx(
                  "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                  sections.syncFailed.length > 0
                    ? "bg-rose-100 text-rose-700"
                    : "bg-emerald-100 text-emerald-700",
                )}
              >
                {sections.syncFailed.length}
              </span>
            </div>
            <Link href="/properties" className="text-xs font-medium text-slate-500 hover:text-slate-800">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {sections.syncFailed.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-400">
                All properties synced successfully.
              </li>
            )}
            {sections.syncFailed.slice(0, 5).map((p) => (
              <li key={p.id}>
                <Link href={`/properties/${p.id}`} className="block px-4 py-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-medium text-slate-800">{p.address}</p>
                    <Badge label={p.syncStatus} />
                  </div>
                  <p className="mt-0.5 text-xs text-slate-400">
                    {p.sourceWebsite || "Unknown source"} · last synced{" "}
                    {p.lastSyncedAt ? relativeTime(p.lastSyncedAt) : "never"}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Priority follow-ups</h2>
            <Link href="/follow-ups" className="text-xs font-medium text-slate-500 hover:text-slate-800">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {sortTasksByPriority(db, db.tasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled"))
              .slice(0, 6)
              .map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  db={db}
                  modals={modals}
                  sessionUserId={session.userId ?? "u_sarah"}
                />
              ))}
            {db.tasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled").length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-400">
                All clear — no open follow-ups.
              </li>
            )}
          </ul>
        </Card>

        <div className="space-y-5">
          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Offers needing attention</h2>
              <Link href="/offers" className="text-xs font-medium text-slate-500 hover:text-slate-800">
                View all
              </Link>
            </div>
            <ul className="divide-y divide-slate-100">
              {attentionOffers.length === 0 && (
                <li className="px-4 py-6 text-center text-sm text-slate-400">No open offers.</li>
              )}
              {attentionOffers.map((o) => {
                const buyer = buyerById(db, o.buyerId);
                const property = propertyById(db, o.propertyId);
                return (
                  <li key={o.id} className="px-4 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-slate-800">{formatMoney(o.amount)}</p>
                      <Badge label={o.status} />
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {buyer?.fullName} · {property?.address}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {o.nextAction ? `Next: ${o.nextAction}` : `Updated ${relativeTime(o.updatedAt)}`}
                    </p>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Recently updated properties</h2>
              <Link href="/properties" className="text-xs font-medium text-slate-500 hover:text-slate-800">
                View all
              </Link>
            </div>
            <ul className="divide-y divide-slate-100">
              {recentProperties.map((p) => (
                <li key={p.id}>
                  <Link href={`/properties/${p.id}`} className="block px-4 py-3 hover:bg-slate-50">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-800">{p.address}</p>
                      <Badge label={p.status} />
                    </div>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {p.city}, {p.state} · {formatMoney(p.askingPrice)} · updated {relativeTime(p.updatedAt)}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}