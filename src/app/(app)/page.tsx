"use client";

import Link from "next/link";
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
import { useModals } from "@/components/modals/ModalHost";
import { Badge, Button, Card, PageHeader } from "@/components/ui";

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

export default function DashboardPage() {
  const db = useDb();
  const session = useSession();
  const modals = useModals();
  const k = computeKpis(db);
  const alerts = computeAlerts(db);

  const openTasks = db.tasks.filter((t) => t.status !== "Completed" && t.status !== "Cancelled");
  const priorityTasks = sortTasksByPriority(db, openTasks).slice(0, 6);
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

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Priority follow-ups</h2>
            <Link href="/follow-ups" className="text-xs font-medium text-slate-500 hover:text-slate-800">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-slate-100">
            {priorityTasks.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-slate-400">All clear — no open follow-ups.</li>
            )}
            {priorityTasks.map((t) => {
              const buyer = buyerById(db, t.buyerId);
              const property = propertyById(db, t.propertyId);
              const s = taskStatus(t);
              return (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge label={s} />
                      <span className="text-xs text-slate-400">{t.taskType}</span>
                      {t.priority === "Urgent" && <Badge label="Urgent" />}
                    </div>
                    <p className="mt-1 truncate text-sm text-slate-800">{t.description}</p>
                    <p className="mt-0.5 truncate text-xs text-slate-400">
                      {buyer?.fullName ?? "No buyer"}
                      {property ? ` · ${property.address}` : ""}
                      {t.dueDate ? ` · due ${formatDate(t.dueDate)} ${formatTime(t.dueTime)}` : " · no date"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => modals.completeTask(t)}
                      title="Complete"
                    >
                      Done
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        modals.generateFollowUp({ buyerId: t.buyerId, propertyId: t.propertyId })
                      }
                      title="Generate follow-up message"
                    >
                      Message
                    </Button>
                  </div>
                </li>
              );
            })}
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