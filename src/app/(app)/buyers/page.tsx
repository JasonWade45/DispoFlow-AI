"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DB } from "@/types";
import { useDb } from "@/lib/store";
import {
  interactionsForBuyer,
  isOpenOffer,
  offersForBuyer,
  propertyById,
  relationshipsForBuyer,
  taskDueTimestamp,
} from "@/lib/selectors";
import { formatDate, relativeTime } from "@/lib/format";
import { useModals } from "@/components/modals/ModalHost";
import { Badge, Button, Card, EmptyState, Input, PageHeader, Select } from "@/components/ui";

type SortKey = "name" | "contact" | "followup";

function lastContactIso(db: DB, buyerId: string): string {
  return interactionsForBuyer(db, buyerId)[0]?.occurredAt ?? "";
}

function nextFollowUpDue(db: DB, buyerId: string): string | null {
  const open = db.tasks.filter(
    (t) =>
      t.buyerId === buyerId &&
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

export default function BuyersPage() {
  const db = useDb();
  const modals = useModals();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("All");
  const [propertyFilter, setPropertyFilter] = useState("All");
  const [sort, setSort] = useState<SortKey>("name");

  const query = search.trim().toLowerCase();
  const digits = query.replace(/\D/g, "");

  const propertyOptions = Array.from(
    new Map(
      db.relationships
        .map((r) => {
          const p = propertyById(db, r.propertyId);
          return p ? ([r.propertyId, p.address] as const) : null;
        })
        .filter((x): x is readonly [string, string] => x !== null),
    ).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  const filtered = db.buyers
    .filter((b) => {
      if (status !== "All" && b.status !== status) return false;
      if (
        propertyFilter !== "All" &&
        !db.relationships.some((r) => r.buyerId === b.id && r.propertyId === propertyFilter)
      )
        return false;
      if (!query) return true;
      return (
        b.fullName.toLowerCase().includes(query) ||
        b.email.toLowerCase().includes(query) ||
        b.companyName.toLowerCase().includes(query) ||
        b.phone.toLowerCase().includes(query) ||
        (digits.length > 0 && b.phone.replace(/\D/g, "").includes(digits))
      );
    })
    .sort((a, b) => {
      if (sort === "contact") {
        return lastContactIso(db, b.id).localeCompare(lastContactIso(db, a.id));
      }
      if (sort === "followup") {
        const at = nextFollowUpDue(db, a.id);
        const bt = nextFollowUpDue(db, b.id);
        if (at === null && bt === null) return a.fullName.localeCompare(b.fullName);
        if (at === null) return 1;
        if (bt === null) return -1;
        return at.localeCompare(bt);
      }
      return a.fullName.localeCompare(b.fullName);
    });

  const activeCount = db.buyers.filter((b) => b.status === "Active").length;

  return (
    <div>
      <PageHeader
        title="Buyers"
        subtitle={`${db.buyers.length} buyers · ${activeCount} active · ${filtered.length} shown`}
        actions={
          <>
            <Button variant="secondary" onClick={() => modals.logInteraction()}>
              Log Interaction
            </Button>
            <Button onClick={() => modals.addBuyer()}>Add Buyer</Button>
          </>
        }
      />

      <Card className="mb-4 p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, email, or company"
            className="sm:flex-1"
          />
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="sm:w-48"
              aria-label="Filter by status"
            >
              <option value="All">All</option>
              {db.settings.buyerStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="sm:w-56"
              aria-label="Filter by property"
            >
              <option value="All">All properties</option>
              {propertyOptions.map(([pid, address]) => (
                <option key={pid} value={pid}>
                  {address}
                </option>
              ))}
            </Select>
          <Select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="sm:w-56"
            aria-label="Sort buyers"
          >
            <option value="name">Name A–Z</option>
            <option value="contact">Last Contact (recent first)</option>
            <option value="followup">Next Follow-Up (soonest first)</option>
          </Select>
        </div>
      </Card>

      <Card>
        {filtered.length === 0 ? (
          <EmptyState
            title={db.buyers.length === 0 ? "No buyers yet" : "No buyers match"}
            body={
              db.buyers.length === 0
                ? "Add your first buyer to start tracking conversations."
                : "Try adjusting your search or status filter."
            }
            action={
              db.buyers.length === 0 ? (
                <Button onClick={() => modals.addBuyer()}>Add Buyer</Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Buyer</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Phone</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Email</th>
                  <th className="px-4 py-3 font-medium">Preferred Markets</th>
                  <th className="px-4 py-3 font-medium">Buyer Status</th>
                  <th className="px-4 py-3 font-medium">Properties</th>
                  <th className="px-4 py-3 font-medium"># Active Offers</th>
                  <th className="px-4 py-3 font-medium">Last Contact</th>
                  <th className="px-4 py-3 font-medium">Next Follow-Up</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((b) => {
                  const rels = relationshipsForBuyer(db, b.id).filter(
                    (r) => r.relationshipStatus === "Active",
                  );
                  const propertyLinks = rels
                    .map((r) => ({
                      id: r.propertyId,
                      address: propertyById(db, r.propertyId)?.address ?? "",
                    }))
                    .filter((x) => x.address);
                  const openOffers = offersForBuyer(db, b.id).filter(isOpenOffer).length;
                  const lastContact = lastContactIso(db, b.id);
                  const due = nextFollowUpDue(db, b.id);
                  return (
                    <tr
                      key={b.id}
                      onClick={() => router.push(`/buyers/${b.id}`)}
                      className="cursor-pointer transition-colors hover:bg-slate-50"
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/buyers/${b.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-medium text-slate-900 hover:text-slate-700"
                        >
                          {b.fullName}
                        </Link>
                        {b.companyName && (
                          <p className="text-xs text-slate-400">{b.companyName}</p>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                        {b.phone || "—"}
                      </td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                        {b.email || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {b.preferredMarkets.length > 0 ? b.preferredMarkets.join(", ") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={b.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {propertyLinks.length === 0 ? (
                          "—"
                        ) : (
                          <div className="space-y-0.5">
                            {propertyLinks.slice(0, 2).map((x) => (
                              <Link
                                key={x.id}
                                href={`/properties/${x.id}`}
                                onClick={(e) => e.stopPropagation()}
                                className="block max-w-[16rem] truncate text-xs font-medium text-slate-600 hover:text-slate-900"
                              >
                                {x.address}
                              </Link>
                            ))}
                            {propertyLinks.length > 2 && (
                              <p className="text-xs text-slate-400">
                                +{propertyLinks.length - 2} more
                              </p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{openOffers}</td>
                      <td className="px-4 py-3 text-slate-600">{relativeTime(lastContact)}</td>
                      <td className="px-4 py-3 text-slate-600">{due ? formatDate(due) : "—"}</td>
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
