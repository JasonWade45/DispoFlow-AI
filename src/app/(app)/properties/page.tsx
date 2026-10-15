"use client";

import Link from "next/link";
import { useState } from "react";
import type { DB, Property } from "@/types";
import { useDb } from "@/lib/store";
import {
  interactionsForProperty,
  offersForProperty,
  relationshipsForProperty,
  taskDueTimestamp,
} from "@/lib/selectors";
import { formatDate, formatMoney, relativeTime } from "@/lib/format";
import { useModals } from "@/components/modals/ModalHost";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";

type SortKey = "newest" | "address" | "price" | "activity" | "followup" | "status";
type ViewMode = "grid" | "table";

function importedIso(p: { firstImportedAt: string | null; createdAt: string }): string {
  return p.firstImportedAt ?? p.createdAt;
}

function lastActivityIso(db: DB, propertyId: string): string {
  return interactionsForProperty(db, propertyId)[0]?.occurredAt ?? "";
}

function nextFollowUpDue(db: DB, propertyId: string): string | null {
  const open = db.tasks.filter(
    (t) =>
      t.propertyId === propertyId &&
      t.status !== "Completed" &&
      t.status !== "Cancelled" &&
      t.dueDate !== null,
  );
  if (open.length === 0) return null;
  open.sort(
    (a, b) =>
      (taskDueTimestamp(a) ?? Number.POSITIVE_INFINITY) -
      (taskDueTimestamp(b) ?? Number.POSITIVE_INFINITY),
  );
  return open[0].dueDate;
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "Sold"
      ? "bg-slate-400"
      : status === "Under Contract" || status === "Pending"
        ? "bg-amber-500"
        : status === "Marketing"
          ? "bg-blue-500"
          : status === "Cancelled"
            ? "bg-rose-400"
            : status === "Offer Received"
              ? "bg-violet-500"
              : "bg-emerald-500";
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${color}`} />;
}

function PropertyCard({ db, p }: { db: DB; p: Property }) {
  const thumb = p.photos?.[0] ?? p.photosUrl;
  const buyerCount = relationshipsForProperty(db, p.id).length;
  const offerCount = offersForProperty(db, p.id).length;
  const due = nextFollowUpDue(db, p.id);
  const margin = p.askingPrice != null && p.arv != null ? p.arv - p.askingPrice : null;
  const specs = [p.bedrooms && `${p.bedrooms}bd`, p.bathrooms && `${p.bathrooms}ba`, p.sqft && `${p.sqft}sf`]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/properties/${p.id}`}
      className="group overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:border-slate-300 hover:shadow-md"
    >
      {thumb ? (
        <div className="relative aspect-[3/2] overflow-hidden bg-slate-100">
          <img
            src={thumb}
            alt={p.address}
            className="h-full w-full object-cover transition-transform group-hover:scale-[1.03]"
            loading="lazy"
          />
          {margin != null && margin > 0 && (
            <div className="absolute right-0 top-0 rounded-bl-lg bg-emerald-600/90 px-2 py-1 text-[11px] font-semibold text-white">
              +{formatMoney(margin)} margin
            </div>
          )}
          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent px-2.5 pb-2 pt-6">
            <span className="flex items-center gap-1.5 text-xs font-medium text-white">
              <StatusDot status={p.status} />
              {p.status}
            </span>
            {specs && <span className="text-[11px] text-white/90">{specs}</span>}
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center border-b border-slate-100 bg-slate-50 py-7">
          <svg className="text-slate-300" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M3 10.5L12 3l9 7.5" />
            <path d="M5 9.5V21h14V9.5" />
            <path d="M9 21v-6h6v6" />
          </svg>
        </div>
      )}
      <div className="px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm font-medium text-slate-900">{p.address}</p>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-slate-900">
            {p.askingPrice != null ? formatMoney(p.askingPrice) : <span className="font-normal text-slate-400">No price</span>}
          </span>
        </div>
        <p className="mt-0.5 truncate text-xs text-slate-500">
          {p.city}
          {p.state ? `, ${p.state}` : ""} {p.zip}
        </p>
        {p.accessInfo && (
          <p className="mt-1 truncate text-xs font-medium text-amber-700">Access: {p.accessInfo}</p>
        )}
        <div className="mt-1.5 flex items-center gap-2 text-[11px]">
          <span className="flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
            <StatusDot status={p.status} />
            {p.status}
          </span>
          {specs && <span className="text-slate-500">{specs}</span>}
        </div>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-500">
          {buyerCount > 0 && (
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
              {buyerCount}
            </span>
          )}
          {offerCount > 0 && (
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              {offerCount}
            </span>
          )}
          {due && (
            <span className="ml-auto text-amber-600">Follow-up {formatDate(due)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function PropertiesPage() {
  const db = useDb();
  const modals = useModals();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [sort, setSort] = useState<SortKey>("newest");
  const [view, setView] = useState<ViewMode>("grid");

  const query = search.trim().toLowerCase();

  const filtered = db.properties
    .filter((p) => {
      if (status !== "All" && p.status !== status) return false;
      if (!query) return true;
      return (
        p.address.toLowerCase().includes(query) ||
        p.city.toLowerCase().includes(query) ||
        p.state.toLowerCase().includes(query) ||
        p.zip.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      if (sort === "newest") {
        return importedIso(b).localeCompare(importedIso(a));
      }
      if (sort === "price") return (b.askingPrice ?? -1) - (a.askingPrice ?? -1);
      if (sort === "activity") {
        return lastActivityIso(db, b.id).localeCompare(lastActivityIso(db, a.id));
      }
      if (sort === "followup") {
        const at = nextFollowUpDue(db, a.id);
        const bt = nextFollowUpDue(db, b.id);
        if (at === null && bt === null) return a.address.localeCompare(b.address);
        if (at === null) return 1;
        if (bt === null) return -1;
        return at.localeCompare(bt);
      }
      if (sort === "status") return a.status.localeCompare(b.status);
      return a.address.localeCompare(b.address);
    });

  const activeCount = db.properties.filter((p) => p.status !== "Sold" && p.status !== "Cancelled").length;
  const totalValue = db.properties.reduce((s, p) => s + (p.askingPrice ?? 0), 0);

  const statusCounts = new Map<string, number>();
  for (const p of db.properties) {
    statusCounts.set(p.status, (statusCounts.get(p.status) ?? 0) + 1);
  }

  return (
    <div>
      <PageHeader
        title="Properties"
        subtitle={`${activeCount} active · ${db.properties.length} total · ${formatMoney(totalValue)} portfolio`}
        actions={
          <>
            <Button variant="secondary" onClick={() => modals.logInteraction()}>
              Log Interaction
            </Button>
            <Button onClick={() => modals.addProperty()}>Add Property</Button>
          </>
        }
      />

      {db.properties.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setStatus("All")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              status === "All" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            All ({db.properties.length})
          </button>
          {db.settings.propertyStatuses
            .filter((s) => statusCounts.has(s))
            .map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  status === s ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <StatusDot status={s} />
                {s} ({statusCounts.get(s)})
              </button>
            ))}
        </div>
      )}

      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search address, city, state, or ZIP"
            className="sm:flex-1"
          />
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="sm:w-64"
            aria-label="Sort properties"
          >
            <option value="newest">Newest First</option>
            <option value="address">Address A–Z</option>
            <option value="price">Asking Price (high to low)</option>
            <option value="activity">Last Activity</option>
            <option value="followup">Next Follow-Up</option>
            <option value="status">Status</option>
          </Select>
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            <button
              onClick={() => setView("grid")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "grid" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Cards
            </button>
            <button
              onClick={() => setView("table")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                view === "table" ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Table
            </button>
          </div>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState
            title="No properties match your search"
            body="Try adjusting your search or status filter."
            action={
              db.properties.length === 0 ? (
                <Button onClick={() => modals.addProperty()}>Add Property</Button>
              ) : undefined
            }
          />
        </Card>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <PropertyCard key={p.id} db={db} p={p} />
          ))}
        </div>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium"></th>
                  <th className="px-4 py-3 font-medium">Property Address</th>
                  <th className="px-4 py-3 font-medium">City/State/ZIP</th>
                  <th className="px-4 py-3 font-medium">Property Status</th>
                  <th className="hidden px-4 py-3 font-medium lg:table-cell">Access</th>
                  <th className="px-4 py-3 font-medium">Asking Price</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">ARV</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Est. Repairs</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Assignment</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell"># Interested Buyers</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell"># Offers</th>
                  <th className="px-4 py-3 font-medium">Last Activity</th>
                  <th className="px-4 py-3 font-medium">Next Follow-Up</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Expected Closing</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => {
                  const lastActivity = lastActivityIso(db, p.id);
                  const due = nextFollowUpDue(db, p.id);
                  return (
                    <tr key={p.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3">
                        {(() => {
                          const thumb = p.photos?.[0] ?? p.photosUrl;
                          return thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              className="h-12 w-16 rounded-md object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-12 w-16 items-center justify-center rounded-md bg-slate-100 text-[10px] text-slate-400">
                              No img
                            </div>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/properties/${p.id}`}
                          className="font-medium text-slate-900 hover:text-slate-700"
                        >
                          {p.address}
                        </Link>
                        {p.accessInfo && (
                          <p className="mt-0.5 text-xs font-medium text-amber-700">Access: {p.accessInfo}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {p.city}, {p.state} {p.zip}
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={p.status} />
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 lg:table-cell">
                        {p.accessType || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{formatMoney(p.askingPrice)}</td>
                      <td className="hidden px-4 py-3 text-slate-700 md:table-cell">
                        {formatMoney(p.arv)}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-700 md:table-cell">
                        {formatMoney(p.estimatedRepairs)}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-700 md:table-cell">
                        {formatMoney(p.assignmentPrice)}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-700 md:table-cell">
                        {relationshipsForProperty(db, p.id).length}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-700 md:table-cell">
                        {offersForProperty(db, p.id).length}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {lastActivity ? relativeTime(lastActivity) : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{due ? formatDate(due) : "—"}</td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                        {formatDate(p.expectedClosingDate)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
