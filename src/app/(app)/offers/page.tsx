"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Offer, OfferStatus } from "@/types";
import { updateOffer } from "@/lib/actions";
import { cx, formatDate, formatMoney, todayIso } from "@/lib/format";
import { buyerById, isOpenOffer, propertyById, userById } from "@/lib/selectors";
import { useDb, useSession } from "@/lib/store";
import { useModals } from "@/components/modals/ModalHost";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
} from "@/components/ui";

const OFFER_STATUSES: OfferStatus[] = [
  "Draft",
  "Submitted",
  "Under Review",
  "Countered",
  "Accepted",
  "Rejected",
  "Withdrawn",
  "Expired",
];

const OFFER_TONES: Record<string, string> = {
  Accepted: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Rejected: "bg-amber-50 text-amber-700 ring-amber-200",
  Expired: "bg-slate-100 text-slate-500 ring-slate-200",
  Withdrawn: "bg-slate-100 text-slate-500 ring-slate-200",
};

function OfferStatusPill({ status }: { status: string }) {
  const tone = OFFER_TONES[status] ?? "bg-slate-100 text-slate-600 ring-slate-200";
  return (
    <span
      className={cx(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tone,
      )}
    >
      {status}
    </span>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}

export default function OffersPage() {
  const db = useDb();
  const session = useSession();
  const modals = useModals();
  const [statusFilter, setStatusFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"list" | "report">("list");
  const [reportQuery, setReportQuery] = useState("");
  const [reportStatus, setReportStatus] = useState("all");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [selectedOffer, setSelectedOffer] = useState<Offer | null>(null);
  const [nextStatus, setNextStatus] = useState<string>("Draft");

  const stats = useMemo(() => {
    const total = db.offers.length;
    const open = db.offers.filter(isOpenOffer).length;
    const accepted = db.offers.filter((o) => o.status === "Accepted").length;
    const rejected = db.offers.filter((o) => o.status === "Rejected").length;
    const decided = accepted + rejected;
    const winRate = decided > 0 ? `${Math.round((accepted / decided) * 100)}%` : "n/a";
    return { total, open, accepted, winRate };
  }, [db.offers]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...db.offers]
      .filter((o) => statusFilter === "all" || o.status === statusFilter)
      .filter((o) => {
        if (!q) return true;
        const buyer = buyerById(db, o.buyerId);
        const property = propertyById(db, o.propertyId);
        const title = `${buyer?.fullName ?? ""} — ${property?.address ?? ""}`.toLowerCase();
        return (
          title.includes(q) ||
          o.negotiationNotes.toLowerCase().includes(q) ||
          o.terms.toLowerCase().includes(q) ||
          o.nextAction.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [db, statusFilter, query]);

  const reportRows = useMemo(() => {
    const q = reportQuery.trim().toLowerCase();
    return [...db.offers]
      .map((o) => ({
        offer: o,
        buyer: buyerById(db, o.buyerId),
        property: propertyById(db, o.propertyId),
      }))
      .filter(({ offer }) => reportStatus === "all" || offer.status === reportStatus)
      .filter(({ offer }) => {
        if (!reportFrom && !reportTo) return true;
        const day = offer.offerDate.slice(0, 10);
        if (!day) return false;
        if (reportFrom && day < reportFrom) return false;
        if (reportTo && day > reportTo) return false;
        return true;
      })
      .filter(({ offer, buyer, property }) => {
        if (!q) return true;
        const hay =
          `${buyer?.fullName ?? ""} ${buyer?.phone ?? ""} ${buyer?.email ?? ""} ${property?.address ?? ""} ${offer.status}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => b.offer.offerDate.localeCompare(a.offer.offerDate));
  }, [db, reportQuery, reportStatus, reportFrom, reportTo]);

  const reportTotals = useMemo(
    () => ({
      count: reportRows.length,
      amount: reportRows.reduce((sum, r) => sum + (r.offer.amount || 0), 0),
    }),
    [reportRows],
  );

  function exportPdf() {
    const previous = document.title;
    document.title = `DispoFlow Offers Report - ${todayIso()}`;
    const restore = () => {
      document.title = previous;
      window.removeEventListener("afterprint", restore);
      window.clearTimeout(timer);
    };
    window.addEventListener("afterprint", restore);
    const timer = window.setTimeout(restore, 60000);
    window.print();
  }

  function exportCsv() {
    const quote = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = ["Property", "Buyer", "Phone", "Email", "Amount", "Offer Date", "Status"];
    const lines = [header.map(quote).join(",")];
    for (const { offer, buyer, property } of reportRows) {
      lines.push(
        [
          property?.address ?? "",
          buyer?.fullName ?? "",
          buyer?.phone ?? "",
          buyer?.email ?? "",
          String(offer.amount ?? ""),
          offer.offerDate.slice(0, 10),
          offer.status,
        ]
          .map(quote)
          .join(","),
      );
    }
    const csv = "\uFEFF" + lines.join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `DispoFlow-Offers-Report-${todayIso()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function openDetail(o: Offer) {
    setSelectedOffer(o);
    setNextStatus(o.status);
  }

  function saveStatus() {
    if (!selectedOffer || nextStatus === selectedOffer.status) return;
    updateOffer(selectedOffer.id, { status: nextStatus as OfferStatus }, session.userId ?? "");
  }

  const detailBuyer = selectedOffer ? buyerById(db, selectedOffer.buyerId) : undefined;
  const detailProperty = selectedOffer ? propertyById(db, selectedOffer.propertyId) : undefined;
  const detailCreator = selectedOffer ? userById(db, selectedOffer.createdBy) : undefined;

  return (
    <div>
      <div className="print:hidden">
        <PageHeader
          title="Offers"
          subtitle={`${stats.open} open offer${stats.open === 1 ? "" : "s"} · ${stats.total} total`}
          actions={<Button onClick={() => modals.addOffer()}>Add Offer</Button>}
        />
      </div>

      <div
        className="mb-5 inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm print:hidden"
        role="tablist"
        aria-label="Offers views"
      >
        <button
          type="button"
          role="tab"
          aria-selected={tab === "list"}
          onClick={() => setTab("list")}
          className={cx(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            tab === "list"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          )}
        >
          List
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "report"}
          onClick={() => setTab("report")}
          className={cx(
            "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
            tab === "report"
              ? "bg-slate-900 text-white"
              : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
          )}
        >
          Received Offers
        </button>
      </div>

      {tab === "report" ? (
        <div>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Received Offers Report</h2>
              <p className="mt-0.5 text-sm text-slate-500">
                {db.organization.name ? `${db.organization.name} · ` : ""}
                {reportTotals.count} offers · {formatMoney(reportTotals.amount)} total · Generated{" "}
                {formatDate(todayIso())}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 print:hidden">
              <Input
                placeholder="Search buyer, phone, email, address…"
                value={reportQuery}
                onChange={(e) => setReportQuery(e.target.value)}
                className="sm:w-64"
                aria-label="Search offers report"
              />
              <Select
                value={reportStatus}
                onChange={(e) => setReportStatus(e.target.value)}
                className="sm:w-40"
                aria-label="Filter report by status"
              >
                <option value="all">All statuses</option>
                {OFFER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
              <Input
                type="date"
                value={reportFrom}
                onChange={(e) => setReportFrom(e.target.value)}
                aria-label="Offers from date"
                className="sm:w-40"
              />
              <span className="text-xs text-slate-400">to</span>
              <Input
                type="date"
                value={reportTo}
                onChange={(e) => setReportTo(e.target.value)}
                aria-label="Offers to date"
                className="sm:w-40"
              />
              <Button variant="secondary" onClick={exportCsv}>
                Export CSV
              </Button>
              <Button onClick={exportPdf}>Export PDF</Button>
            </div>
          </div>

          {reportRows.length === 0 ? (
            <EmptyState title="No offers found" body="Try a different search." />
          ) : (
            <Card className="overflow-hidden print:shadow-none">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm print:text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400 print:text-slate-700">
                      <th className="px-4 py-3 font-medium">Property</th>
                      <th className="px-4 py-3 font-medium">Buyer</th>
                      <th className="px-4 py-3 font-medium">Phone</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Offer Date</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 print:divide-slate-200">
                    {reportRows.map(({ offer, buyer, property }) => (
                      <tr key={offer.id} className="align-top">
                        <td className="px-4 py-2.5 font-medium text-slate-800">
                          {property?.address ?? "—"}
                        </td>
                        <td className="px-4 py-2.5 text-slate-800">
                          {buyer?.fullName ?? "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                          {buyer?.phone || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{buyer?.email || "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-slate-900">
                          {formatMoney(offer.amount)}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-slate-600">
                          {formatDate(offer.offerDate)}
                        </td>
                        <td className="px-4 py-2.5">
                          <OfferStatusPill status={offer.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-slate-200 font-semibold text-slate-900">
                      <td className="px-4 py-3" colSpan={4}>
                        Total · {reportTotals.count} offers
                      </td>
                      <td className="px-4 py-3">{formatMoney(reportTotals.amount)}</td>
                      <td className="px-4 py-3" colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </Card>
          )}
        </div>
      ) : (
        <>
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4 print:hidden">
        <StatChip label="Total Offers" value={String(stats.total)} />
        <StatChip label="Open" value={String(stats.open)} />
        <StatChip label="Accepted" value={String(stats.accepted)} />
        <StatChip label="Win Rate" value={stats.winRate} />
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row print:hidden">
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="sm:w-52"
          aria-label="Filter by status"
        >
          <option value="all">All statuses</option>
          {OFFER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        <Input
          placeholder="Search offers…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            title="No offers found"
            body="Try a different filter or add a new offer."
            action={<Button onClick={() => modals.addOffer()}>Add Offer</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Title</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Due</th>
                  <th className="px-4 py-3 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((o) => {
                  const buyer = buyerById(db, o.buyerId);
                  const property = propertyById(db, o.propertyId);
                  return (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => openDetail(o)}
                          className="text-left text-sm font-medium text-slate-800 hover:text-slate-950 hover:underline"
                        >
                          {buyer?.fullName ?? "Unknown buyer"} — {property?.address ?? "Unknown property"}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <OfferStatusPill status={o.status} />
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-slate-800">
                        {formatMoney(o.amount)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{o.terms || "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">
                        {formatDate(o.expiresAt ?? o.offerDate)}
                      </td>
                      <td className="max-w-60 px-4 py-3">
                        <span
                          className="block truncate text-xs text-slate-500"
                          title={o.negotiationNotes || o.nextAction}
                        >
                          {o.negotiationNotes || o.nextAction || "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
        </>
      )}

      {selectedOffer && (
        <Modal
          open
          onClose={() => setSelectedOffer(null)}
          title={`${formatMoney(selectedOffer.amount)} offer`}
          description={`${detailBuyer?.fullName ?? "Unknown buyer"} — ${detailProperty?.address ?? "Unknown property"}`}
          size="lg"
          footer={
            <>
              {detailBuyer && (
                <Link
                  href={`/buyers/${selectedOffer.buyerId}`}
                  className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Open buyer
                </Link>
              )}
              <Button variant="secondary" onClick={() => setSelectedOffer(null)}>
                Close
              </Button>
              <Button onClick={saveStatus} disabled={nextStatus === selectedOffer.status}>
                Update status
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs font-medium text-slate-500">Amount</p>
                <p className="mt-0.5 font-semibold text-slate-900">
                  {formatMoney(selectedOffer.amount)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Current status</p>
                <div className="mt-1">
                  <OfferStatusPill status={selectedOffer.status} />
                </div>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Offer date</p>
                <p className="mt-0.5 text-slate-800">{formatDate(selectedOffer.offerDate)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Expires</p>
                <p className="mt-0.5 text-slate-800">{formatDate(selectedOffer.expiresAt)}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs font-medium text-slate-500">Terms</p>
                <p className="mt-0.5 text-slate-800">{selectedOffer.terms || "—"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs font-medium text-slate-500">Negotiation notes</p>
                <p className="mt-0.5 whitespace-pre-wrap text-slate-800">
                  {selectedOffer.negotiationNotes || "—"}
                </p>
              </div>
              <div className="col-span-2">
                <p className="text-xs font-medium text-slate-500">Next action</p>
                <p className="mt-0.5 text-slate-800">{selectedOffer.nextAction || "—"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Created by</p>
                <p className="mt-0.5 text-slate-800">{detailCreator?.name ?? "Unknown"}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Last updated</p>
                <p className="mt-0.5 text-slate-800">{formatDate(selectedOffer.updatedAt)}</p>
              </div>
            </div>

            <Field label="Status">
              <Select value={nextStatus} onChange={(e) => setNextStatus(e.target.value)}>
                {OFFER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
