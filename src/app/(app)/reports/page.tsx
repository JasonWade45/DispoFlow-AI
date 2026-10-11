"use client";

import { useMemo, useState, type ReactNode } from "react";
import { computeKpis, isActiveProperty } from "@/lib/selectors";
import { useDb } from "@/lib/store";
import { cx, formatMoney } from "@/lib/format";
import { Card, EmptyState, PageHeader, Tabs } from "@/components/ui";

const PERIOD_DAYS: Record<string, number> = {
  "Last 7 days": 7,
  "Last 30 days": 30,
  "Last 90 days": 90,
};

function periodCutoff(days: number): number {
  return Date.now() - days * 86400000;
}

function SectionCard({
  title,
  hint,
  className,
  children,
}: {
  title: string;
  hint?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={className}>
      <div className="border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-800">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-slate-400">{hint}</p>}
      </div>
      {children}
    </Card>
  );
}

function BarRow({
  label,
  count,
  max,
  right,
}: {
  label: string;
  count: number;
  max: number;
  right?: string;
}) {
  const pct = max > 0 ? Math.max(3, Math.round((count / max) * 100)) : 0;
  return (
    <div className="flex items-center gap-3 px-4 py-2">
      <span className="w-36 shrink-0 truncate text-xs font-medium text-slate-700 sm:w-44">
        {label}
      </span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-slate-800" style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right text-xs font-semibold text-slate-800">{count}</span>
      <span className="w-16 shrink-0 text-right text-xs text-slate-500">{right ?? ""}</span>
    </div>
  );
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-3">
      <p className={cx("text-xl font-semibold text-slate-900", tone)}>{value}</p>
      <p className="mt-0.5 text-xs font-medium text-slate-600">{label}</p>
      <p className="text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}

export default function ReportsPage() {
  const db = useDb();
  const [periodLabel, setPeriodLabel] = useState("Last 30 days");
  const days = PERIOD_DAYS[periodLabel] ?? 30;

  const stages = [...db.settings.interestStatuses];
  const seenStages = new Set(stages);
  for (const r of db.relationships) {
    if (!seenStages.has(r.interestStatus)) {
      stages.push(r.interestStatus);
      seenStages.add(r.interestStatus);
    }
  }
  const pipelineRows = stages
    .map((stage) => {
      const rows = db.relationships.filter((r) => r.interestStatus === stage);
      const value = db.offers
        .filter((o) => rows.some((r) => r.buyerId === o.buyerId && r.propertyId === o.propertyId))
        .reduce((sum, o) => sum + o.amount, 0);
      return { label: stage, count: rows.length, value };
    })
    .filter((row) => row.count > 0);
  const pipelineMax = Math.max(1, ...pipelineRows.map((r) => r.count));

  const inPeriod = useMemo(
    () => {
      const cutoff = periodCutoff(days);
      return db.interactions.filter((i) => new Date(i.occurredAt).getTime() >= cutoff);
    },
    [db.interactions, days],
  );
  const typeCounts = new Map<string, number>();
  for (const i of inPeriod) {
    typeCounts.set(i.eventType, (typeCounts.get(i.eventType) ?? 0) + 1);
  }
  const activityRows = [...typeCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const activityMax = Math.max(1, ...activityRows.map((r) => r.count));

  const priced = db.properties
    .map((p) => p.askingPrice)
    .filter((v): v is number => typeof v === "number");
  const totalValue = priced.reduce((sum, v) => sum + v, 0);
  const avgPrice = priced.length > 0 ? totalValue / priced.length : 0;
  const activeProperties = db.properties.filter(isActiveProperty).length;
  const activePct =
    db.properties.length > 0
      ? Math.round((activeProperties / db.properties.length) * 100)
      : 0;

  const kpis = computeKpis(db);
  const followUpTiles = [
    { label: "Overdue", value: kpis.overdue, hint: "Past due, not done", tone: "text-rose-600" },
    { label: "Due today", value: kpis.dueToday, hint: "Scheduled for today", tone: "text-amber-600" },
    { label: "Next 7 days", value: kpis.upcoming, hint: "Upcoming follow-ups", tone: "text-sky-600" },
  ];

  const marketCounts = new Map<string, number>();
  for (const b of db.buyers) {
    const market = b.preferredMarkets[0] ?? "Unspecified";
    marketCounts.set(market, (marketCounts.get(market) ?? 0) + 1);
  }
  const leadRows = [...marketCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  const leadMax = Math.max(1, ...leadRows.map((r) => r.count));

  const teamRows = db.users
    .map((u) => ({
      ...u,
      count: inPeriod.filter((i) => i.createdBy === u.id).length,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return (
    <div>
      <PageHeader
        title="Reports"
        subtitle="Pipeline, activity, and portfolio at a glance"
        actions={<Tabs tabs={Object.keys(PERIOD_DAYS)} active={periodLabel} onChange={setPeriodLabel} />}
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <SectionCard
          title="Pipeline summary"
          hint="Prospects per stage with associated offer value"
          className="lg:col-span-2"
        >
          {pipelineRows.length === 0 ? (
            <EmptyState title="Nothing in the pipeline" body="Link a buyer to a property to start tracking interest stages." />
          ) : (
            <div className="py-2">
              {pipelineRows.map((row) => (
                <BarRow
                  key={row.label}
                  label={row.label}
                  count={row.count}
                  max={pipelineMax}
                  right={formatMoney(row.value)}
                />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Activity mix" hint={`Logged events in the ${periodLabel.toLowerCase()}`}>
          {activityRows.length === 0 ? (
            <EmptyState title="No activity in this period" body="Try a longer period, or log a new interaction." />
          ) : (
            <div className="py-2">
              {activityRows.map((row) => (
                <BarRow key={row.label} label={row.label} count={row.count} max={activityMax} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Portfolio" hint="Snapshot of your property book">
          {db.properties.length === 0 ? (
            <EmptyState title="No properties yet" body="Add a property to see portfolio stats here." />
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4">
              <StatTile label="Properties" value={String(db.properties.length)} hint="In the workspace" />
              <StatTile label="Total asking value" value={formatMoney(totalValue)} hint="Sum of listed prices" />
              <StatTile label="Average asking" value={formatMoney(Math.round(avgPrice))} hint={`Across ${priced.length} priced`} />
              <StatTile label="Active share" value={`${activePct}%`} hint={`${activeProperties} not sold or cancelled`} />
            </div>
          )}
        </SectionCard>

        <SectionCard
          title="Follow-ups"
          hint="Open tasks by due window"
          className="lg:col-span-2"
        >
          <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
            {followUpTiles.map((tile) => (
              <StatTile
                key={tile.label}
                label={tile.label}
                value={String(tile.value)}
                hint={tile.hint}
                tone={tile.tone}
              />
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Lead sources" hint="Buyers grouped by primary target market">
          {leadRows.length === 0 ? (
            <EmptyState title="No buyers yet" body="Add buyers to see where your pipeline comes from." />
          ) : (
            <div className="py-2">
              {leadRows.map((row) => (
                <BarRow key={row.label} label={row.label} count={row.count} max={leadMax} />
              ))}
            </div>
          )}
        </SectionCard>

        <SectionCard title="Team" hint={`Events logged in the ${periodLabel.toLowerCase()}`}>
          <ul className="divide-y divide-slate-100">
            {teamRows.map((u) => (
              <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">{u.name}</p>
                  <p className="truncate text-xs text-slate-400">{u.email}</p>
                </div>
                <span className="shrink-0 text-sm font-semibold text-slate-800">{u.count}</span>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}
