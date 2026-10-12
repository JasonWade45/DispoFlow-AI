"use client";

import Link from "next/link";
import { useState } from "react";
import type { DB } from "@/types";
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

export default function PropertiesPage() {
  const db = useDb();
  const modals = useModals();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [sort, setSort] = useState<SortKey>("newest");

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

  return (
    <div>
      <PageHeader
        title="Properties"
        subtitle={`${activeCount} active · ${db.properties.length} total`}
        actions={
          <>
            <Button variant="secondary" onClick={() => modals.logInteraction()}>
              Log Interaction
            </Button>
            <Button onClick={() => modals.addProperty()}>Add Property</Button>
          </>
        }
      />

      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search address, city, state, or ZIP"
            className="sm:flex-1"
          />
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="sm:w-48"
            aria-label="Filter by status"
          >
            <option value="All">All</option>
            {db.settings.propertyStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
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
        </div>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            title="No properties match your search"
            body="Try adjusting your search or status filter."
            action={
              db.properties.length === 0 ? (
                <Button onClick={() => modals.addProperty()}>Add Property</Button>
              ) : undefined
            }
          />
        ) : (
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
        )}
      </Card>
    </div>
  );
}
