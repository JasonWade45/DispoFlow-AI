"use client";

import { useMemo, useState } from "react";
import { cx, formatDateTime } from "@/lib/format";
import { buyerById, propertyById, userById } from "@/lib/selectors";
import { useDb } from "@/lib/store";
import { Card, DirectionIcon, EmptyState, Input, PageHeader, Select } from "@/components/ui";

const EVENT_TONES: Record<string, string> = {
  "Incoming SMS": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Outgoing SMS": "bg-sky-50 text-sky-700 ring-sky-200",
  "Incoming Email": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Outgoing Email": "bg-sky-50 text-sky-700 ring-sky-200",
  "Phone Call": "bg-indigo-50 text-indigo-700 ring-indigo-200",
  Voicemail: "bg-orange-50 text-orange-700 ring-orange-200",
  "Internal Note": "bg-amber-50 text-amber-700 ring-amber-200",
  "Follow-Up Completed": "bg-emerald-50 text-emerald-700 ring-emerald-200",
  "Offer Created": "bg-violet-50 text-violet-700 ring-violet-200",
  "Offer Updated": "bg-violet-50 text-violet-700 ring-violet-200",
  "Status Changed": "bg-slate-100 text-slate-600 ring-slate-200",
  "Other Interaction": "bg-slate-100 text-slate-600 ring-slate-200",
};

function rangeCutoff(range: string): number | null {
  const now = Date.now();
  if (range === "7") return now - 7 * 86400000;
  if (range === "30") return now - 30 * 86400000;
  return null;
}

function EventPill({ label }: { label: string }) {
  const tone = EVENT_TONES[label] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tone,
      )}
    >
      {label}
    </span>
  );
}

export default function ActivityPage() {
  const db = useDb();
  const [eventType, setEventType] = useState("all");
  const [actor, setActor] = useState("all");
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [range, setRange] = useState("all");
  const [query, setQuery] = useState("");

  const eventTypes = useMemo(
    () => [...new Set(db.interactions.map((i) => i.eventType))].sort() as string[],
    [db.interactions],
  );

  const actors = useMemo(
    () => [...new Set(db.interactions.map((i) => i.createdBy))] as string[],
    [db.interactions],
  );

  const propertyIds = useMemo(
    () => [...new Set(db.interactions.map((i) => i.propertyId).filter((id): id is string => Boolean(id)))] as string[],
    [db.interactions],
  );

  const topTypes = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of db.interactions) {
      counts.set(i.eventType, (counts.get(i.eventType) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4);
  }, [db.interactions]);

  const feed = useMemo(() => {
    const q = query.trim().toLowerCase();
    const cutoff = rangeCutoff(range);
    return [...db.interactions]
      .filter((i) => {
        if (eventType !== "all" && i.eventType !== eventType) return false;
        if (actor !== "all" && i.createdBy !== actor) return false;
        if (propertyFilter !== "all" && i.propertyId !== propertyFilter) return false;
        if (cutoff !== null && new Date(i.occurredAt).getTime() < cutoff) return false;
        if (!q) return true;
        const userName = userById(db, i.createdBy)?.name ?? "";
        const buyerName = buyerById(db, i.buyerId)?.fullName ?? "";
        return (
          i.originalContent.toLowerCase().includes(q) ||
          i.enhancedNotes.toLowerCase().includes(q) ||
          i.eventType.toLowerCase().includes(q) ||
          userName.toLowerCase().includes(q) ||
          buyerName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }, [db, eventType, actor, propertyFilter, range, query]);

  return (
    <div>
      <PageHeader
        title="Activity"
        subtitle={`${db.interactions.length} event${db.interactions.length === 1 ? "" : "s"} logged`}
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {topTypes.map(([type, count]) => (
          <button
            key={type}
            onClick={() => setEventType(eventType === type ? "all" : type)}
            className={cx(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              eventType === type
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
            )}
          >
            {type} · {count}
          </button>
        ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <Select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          aria-label="Filter by event type"
        >
          <option value="all">All event types</option>
          {eventTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </Select>
        <Select
          value={actor}
          onChange={(e) => setActor(e.target.value)}
          aria-label="Filter by actor"
        >
          <option value="all">All actors</option>
          {actors.map((id) => (
            <option key={id} value={id}>
              {userById(db, id)?.name ?? id}
            </option>
          ))}
        </Select>
        <Select
          value={propertyFilter}
          onChange={(e) => setPropertyFilter(e.target.value)}
          aria-label="Filter by property"
        >
          <option value="all">All properties</option>
          {propertyIds.map((id) => (
            <option key={id} value={id}>
              {propertyById(db, id)?.address ?? id}
            </option>
          ))}
        </Select>
        <Select value={range} onChange={(e) => setRange(e.target.value)} aria-label="Filter by date range">
          <option value="all">All time</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </Select>
        <Input
          placeholder="Search activity…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Card>
        {feed.length === 0 ? (
          <EmptyState title="No activity matches" body="Try clearing filters or widening the date range." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {feed.map((item) => {
              const userName = userById(db, item.createdBy)?.name ?? "Unknown user";
              const buyer = buyerById(db, item.buyerId);
              const property = propertyById(db, item.propertyId);
              const detail = item.enhancedNotes || item.originalContent;
              return (
                <li key={item.id} className="flex gap-3 px-4 py-3">
                  <div className="w-40 shrink-0 pt-0.5 text-xs text-slate-400">
                    {formatDateTime(item.occurredAt)}
                  </div>
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <DirectionIcon direction={item.direction} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <EventPill label={item.eventType} />
                        <span className="text-xs font-semibold text-slate-800">{userName}</span>
                        {buyer && <span className="text-xs text-slate-500">· {buyer.fullName}</span>}
                      </div>
                      {detail && <p className="mt-1 text-sm text-slate-700">{detail}</p>}
                      {item.outcome && (
                        <p className="mt-0.5 text-xs text-slate-500">Outcome: {item.outcome}</p>
                      )}
                      {property && (
                        <span className="mt-1.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                          {property.address}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
