"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import type { Direction, Property } from "@/types";
import { useDb, useSession } from "@/lib/store";
import {
  buyerById,
  interactionsForPair,
  interactionsForProperty,
  nextTaskForPair,
  offersForProperty,
  propertyById,
  relationshipsForProperty,
} from "@/lib/selectors";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  fullAddress,
  parseMoney,
  relativeTime,
} from "@/lib/format";
import { changePropertyStatus, updateProperty } from "@/lib/actions";
import { useModals } from "@/components/modals/ModalHost";
import {
  Badge,
  Button,
  Card,
  DirectionIcon,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Textarea,
} from "@/components/ui";

const DIRECTION_META: Record<Direction, { label: string; tone: string }> = {
  in: { label: "In", tone: "text-emerald-600" },
  out: { label: "Out", tone: "text-sky-600" },
  internal: { label: "Internal", tone: "text-amber-600" },
  system: { label: "System", tone: "text-slate-500" },
};

const SYNC_TONES: Record<string, string> = {
  never: "bg-slate-100 text-slate-600",
  synced: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  error: "bg-rose-100 text-rose-700",
  conflict: "bg-orange-100 text-orange-700",
};

export default function PropertyDetailPage() {
  const db = useDb();
  const { id } = useParams<{ id: string }>();
  const property = propertyById(db, id);

  if (!property) {
    return (
      <Card>
        <EmptyState
          title="Property not found"
          body="This property does not exist or was removed."
          action={
            <Link
              href="/properties"
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              Back to Properties
            </Link>
          }
        />
      </Card>
    );
  }

  return (
    <Suspense fallback={<Card><p className="px-4 py-6 text-center text-sm text-slate-400">Loading…</p></Card>}>
      <PropertyDetail key={property.id} property={property} />
    </Suspense>
  );
}

function PropertyDetail({ property }: { property: Property }) {
  const db = useDb();
  const session = useSession();
  const modals = useModals();
  const searchParams = useSearchParams();
  const focusBuyerId = searchParams.get("buyer");

  const [info, setInfo] = useState(() => ({
    address: property.address,
    city: property.city,
    state: property.state,
    zip: property.zip,
    accessType: property.accessType ?? "",
    askingPrice: property.askingPrice === null ? "" : String(property.askingPrice),
    arv: property.arv === null ? "" : String(property.arv),
    estimatedRepairs: property.estimatedRepairs === null ? "" : String(property.estimatedRepairs),
    assignmentPrice: property.assignmentPrice === null ? "" : String(property.assignmentPrice),
    marketingStartedAt: property.marketingStartedAt ? property.marketingStartedAt.slice(0, 10) : "",
    expectedClosingDate: property.expectedClosingDate ? property.expectedClosingDate.slice(0, 10) : "",
    propertyType: property.propertyType ?? "",
    bedrooms: property.bedrooms ?? "",
    bathrooms: property.bathrooms ?? "",
    sqft: property.sqft ?? "",
    lotSize: property.lotSize ?? "",
    yearBuilt: property.yearBuilt ?? "",
    listingUrl: property.listingUrl ?? "",
    photosUrl: property.photosUrl ?? "",
  }));
  const [notes, setNotes] = useState(property.notes);
  const [infoSaved, setInfoSaved] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusValue, setStatusValue] = useState(property.status);
  const [historyTab, setHistoryTab] = useState<string>(focusBuyerId ?? "all");

  useEffect(() => {
    if (!infoSaved) return;
    const t = window.setTimeout(() => setInfoSaved(false), 2000);
    return () => window.clearTimeout(t);
  }, [infoSaved]);

  useEffect(() => {
    if (!notesSaved) return;
    const t = window.setTimeout(() => setNotesSaved(false), 2000);
    return () => window.clearTimeout(t);
  }, [notesSaved]);

  const setInfoField =
    (key: keyof typeof info) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setInfo((f) => ({ ...f, [key]: e.target.value }));

  function saveInfo() {
    updateProperty(property.id, {
      address: info.address.trim() || property.address,
      city: info.city.trim(),
      state: info.state.trim().toUpperCase(),
      zip: info.zip.trim(),
      accessType: info.accessType,
      askingPrice: parseMoney(info.askingPrice),
      arv: parseMoney(info.arv),
      estimatedRepairs: parseMoney(info.estimatedRepairs),
      assignmentPrice: parseMoney(info.assignmentPrice),
      marketingStartedAt: info.marketingStartedAt || null,
      expectedClosingDate: info.expectedClosingDate || null,
      propertyType: info.propertyType,
      bedrooms: info.bedrooms,
      bathrooms: info.bathrooms,
      sqft: info.sqft,
      lotSize: info.lotSize,
      yearBuilt: info.yearBuilt,
      listingUrl: info.listingUrl,
      photosUrl: info.photosUrl,
    });
    setInfoSaved(true);
  }

  function saveNotes() {
    updateProperty(property.id, { notes });
    setNotesSaved(true);
  }

  function openStatusModal() {
    setStatusValue(property.status);
    setStatusOpen(true);
  }

  function applyStatus() {
    changePropertyStatus(property.id, statusValue, session.userId ?? "");
    setStatusOpen(false);
  }

  const relationships = relationshipsForProperty(db, property.id);
  const offers = offersForProperty(db, property.id).sort(
    (a, b) => b.offerDate.localeCompare(a.offerDate) || b.createdAt.localeCompare(a.createdAt),
  );
  const allInteractions = interactionsForProperty(db, property.id);
  const hasSource = property.listingUrl || property.sourceWebsite || property.photosUrl;

  return (
    <div>
      <PageHeader
        title={fullAddress(property)}
        subtitle={`updated ${relativeTime(property.updatedAt)}`}
        actions={
          <>
            <Badge label={property.status} />
            <Button variant="secondary" onClick={openStatusModal}>
              Change Status
            </Button>
            <Button
              variant="secondary"
              onClick={() => modals.logInteraction({ propertyId: property.id })}
            >
              Log Interaction
            </Button>
            <Button
              variant="secondary"
              onClick={() => modals.generateFollowUp({ propertyId: property.id })}
            >
              Generate Follow-Up
            </Button>
            <Button
              variant="secondary"
              onClick={() => modals.createFollowUp({ propertyId: property.id })}
            >
              Create Follow-Up
            </Button>
            <Button variant="secondary" onClick={() => modals.addOffer({ propertyId: property.id })}>
              Add Offer
            </Button>
            <Button onClick={() => modals.linkBuyer({ propertyId: property.id })}>
              Link Buyer
            </Button>
          </>
        }
      />

      {property.accessInfo && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-800">
          Access: {property.accessInfo}
        </div>
      )}

      <Modal
        open={statusOpen}
        onClose={() => setStatusOpen(false)}
        title="Change Status"
        description="Update this property's pipeline status."
        footer={
          <>
            <Button variant="secondary" onClick={() => setStatusOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyStatus}>Apply</Button>
          </>
        }
      >
        <Field label="Property Status">
          <Select value={statusValue} onChange={(e) => setStatusValue(e.target.value)}>
            {db.settings.propertyStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      {(() => {
        const gallery = (property.photos && property.photos.length > 0)
          ? property.photos
          : property.photosUrl
            ? [property.photosUrl]
            : [];
        if (gallery.length === 0) return null;
        return (
          <Card className="mb-5">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">
                Photos ({gallery.length})
              </h2>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {gallery.map((src, i) => (
                  <a
                    key={i}
                    href={src}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block overflow-hidden rounded-lg border border-slate-200"
                  >
                    <img
                      src={src}
                      alt={`Photo ${i + 1}`}
                      className="h-40 w-full object-cover transition-transform group-hover:scale-105"
                      loading="lazy"
                    />
                  </a>
                ))}
              </div>
            </div>
          </Card>
        );
      })()}

      {hasSource && (
        <Card className="mb-5">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Source & Sync</h2>
          </div>
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {property.listingUrl && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Listing</p>
                <a
                  href={property.listingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                >
                  {property.listingUrl.replace(/^https?:\/\//, "").slice(0, 40)}…
                </a>
              </div>
            )}
            {property.photosUrl && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Photos</p>
                <a
                  href={property.photosUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 block truncate text-sm font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                >
                  View gallery →
                </a>
              </div>
            )}
            {property.sourceWebsite && (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Source</p>
                <p className="mt-1 text-sm text-slate-700">{property.sourceWebsite}</p>
              </div>
            )}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Sync Status</p>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${SYNC_TONES[property.syncStatus ?? "never"] ?? SYNC_TONES.never}`}
                >
                  {property.syncStatus ?? "never"}
                </span>
                {property.lastSyncedAt && (
                  <span className="text-xs text-slate-400">
                    {relativeTime(property.lastSyncedAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Property Information</h2>
          </div>
          <div className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Address" className="sm:col-span-2">
                <Input value={info.address} onChange={setInfoField("address")} />
              </Field>
              <Field label="City">
                <Input value={info.city} onChange={setInfoField("city")} />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="State">
                  <Input value={info.state} onChange={setInfoField("state")} />
                </Field>
                <Field label="ZIP">
                  <Input value={info.zip} onChange={setInfoField("zip")} />
                </Field>
              </div>
              <Field label="Status">
                <div className="pt-1">
                  <Badge label={property.status} />
                </div>
              </Field>
              <Field label="Access">
                <Select
                  value={info.accessType}
                  onChange={(e) => setInfo((f) => ({ ...f, accessType: e.target.value }))}
                >
                  <option value="">— Not set —</option>
                  <option value="Appointments">Appointments</option>
                  <option value="Lockbox">Lockbox</option>
                  <option value="Open">Open</option>
                </Select>
              </Field>
              <Field label="Asking Price">
                <Input
                  value={info.askingPrice}
                  onChange={setInfoField("askingPrice")}
                  placeholder="150000"
                />
              </Field>
              <Field label="ARV">
                <Input value={info.arv} onChange={setInfoField("arv")} placeholder="220000" />
              </Field>
              <Field label="Estimated Repairs">
                <Input
                  value={info.estimatedRepairs}
                  onChange={setInfoField("estimatedRepairs")}
                  placeholder="25000"
                />
              </Field>
              <Field label="Assignment Price">
                <Input
                  value={info.assignmentPrice}
                  onChange={setInfoField("assignmentPrice")}
                  placeholder="20000"
                />
              </Field>
              <Field label="Property Type">
                <Input value={info.propertyType} onChange={setInfoField("propertyType")} placeholder="Single Family" />
              </Field>
              <Field label="Bedrooms">
                <Input value={info.bedrooms} onChange={setInfoField("bedrooms")} placeholder="3" />
              </Field>
              <Field label="Bathrooms">
                <Input value={info.bathrooms} onChange={setInfoField("bathrooms")} placeholder="1.5" />
              </Field>
              <Field label="Sq Ft">
                <Input value={info.sqft} onChange={setInfoField("sqft")} placeholder="1,128" />
              </Field>
              <Field label="Lot Size">
                <Input value={info.lotSize} onChange={setInfoField("lotSize")} placeholder="0.90 acres" />
              </Field>
              <Field label="Year Built">
                <Input value={info.yearBuilt} onChange={setInfoField("yearBuilt")} placeholder="1962" />
              </Field>
              <Field label="Listing URL" className="sm:col-span-2">
                <Input value={info.listingUrl} onChange={setInfoField("listingUrl")} placeholder="https://..." />
              </Field>
              <Field label="Photos URL" className="sm:col-span-2">
                <Input value={info.photosUrl} onChange={setInfoField("photosUrl")} placeholder="https://..." />
              </Field>
              <Field label="Marketing Started">
                <Input
                  type="date"
                  value={info.marketingStartedAt}
                  onChange={setInfoField("marketingStartedAt")}
                />
              </Field>
              <Field label="Expected Closing">
                <Input
                  type="date"
                  value={info.expectedClosingDate}
                  onChange={setInfoField("expectedClosingDate")}
                />
              </Field>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={saveInfo}>Save</Button>
              {infoSaved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
            </div>
          </div>
        </Card>

        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Property Notes</h2>
          </div>
          <div className="space-y-3 p-4">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={12}
              placeholder="Condition details, seller situation, access notes…"
            />
            <div className="flex items-center gap-3">
              <Button onClick={saveNotes}>Save</Button>
              {notesSaved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Interested Buyers</h2>
          <span className="text-xs text-slate-400">{relationships.length} linked</span>
        </div>
        {relationships.length === 0 ? (
          <EmptyState
            title="No interested buyers yet"
            body="Link a buyer to this property to start tracking interest and offers."
            action={
              <Button onClick={() => modals.linkBuyer({ propertyId: property.id })}>
                Link Buyer
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Buyer</th>
                  <th className="px-4 py-3 font-medium">Interest Status</th>
                  <th className="px-4 py-3 font-medium">Last Message Sent</th>
                  <th className="px-4 py-3 font-medium">Next Follow-Up</th>
                  <th className="px-4 py-3 font-medium">Next Action</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {relationships.map((r) => {
                  const buyer = buyerById(db, r.buyerId);
                  const pairOffers = db.offers
                    .filter((o) => o.buyerId === r.buyerId && o.propertyId === r.propertyId)
                    .sort(
                      (a, b) =>
                        b.offerDate.localeCompare(a.offerDate) ||
                        b.createdAt.localeCompare(a.createdAt),
                    );
                  const nextTask = nextTaskForPair(db, r.buyerId, r.propertyId);
                  const followUp = nextTask?.dueDate ?? r.nextFollowUpDate;
                  return (
                    <tr
                      key={r.id}
                      className={`transition-colors hover:bg-slate-50 ${focusBuyerId === r.buyerId ? "bg-indigo-50" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <Link
                          href={`/buyers/${r.buyerId}`}
                          className="font-medium text-slate-900 hover:text-slate-700"
                        >
                          {buyer?.fullName ?? "Unknown buyer"}
                        </Link>
                        {pairOffers.length > 0 && (
                          <p className="mt-0.5 text-xs text-slate-400">
                            {formatMoney(pairOffers[0].amount)} offer
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={r.interestStatus} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.lastMessageSentAt ? relativeTime(r.lastMessageSentAt) : "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(followUp)}</td>
                      <td className="max-w-[14rem] truncate px-4 py-3 text-slate-600">
                        {r.nextAction || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              modals.generateFollowUp({
                                buyerId: r.buyerId,
                                propertyId: r.propertyId,
                              })
                            }
                          >
                            Message
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              modals.logInteraction({
                                buyerId: r.buyerId,
                                propertyId: r.propertyId,
                              })
                            }
                          >
                            Log
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-5">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Offers</h2>
          <span className="text-xs text-slate-400">{offers.length} total</span>
        </div>
        {offers.length === 0 ? (
          <EmptyState
            title="No offers yet"
            body="When a buyer submits an offer, it will show up here."
            action={
              <Button onClick={() => modals.addOffer({ propertyId: property.id })}>
                Add Offer
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Buyer</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Offer Date</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Expires</th>
                  <th className="hidden px-4 py-3 font-medium md:table-cell">Terms</th>
                  <th className="px-4 py-3 font-medium">Next Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {offers.map((o) => {
                  const buyer = buyerById(db, o.buyerId);
                  return (
                    <tr key={o.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {formatMoney(o.amount)}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/buyers/${o.buyerId}`}
                          className="font-medium text-slate-900 hover:text-slate-700"
                        >
                          {buyer?.fullName ?? "Unknown buyer"}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={o.status} />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(o.offerDate)}</td>
                      <td className="hidden px-4 py-3 text-slate-600 md:table-cell">
                        {formatDate(o.expiresAt)}
                      </td>
                      <td className="hidden max-w-[16rem] truncate px-4 py-3 text-slate-600 md:table-cell">
                        {o.terms || "—"}
                      </td>
                      <td className="max-w-[14rem] truncate px-4 py-3 text-slate-600">
                        {o.nextAction || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Communication History</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{allInteractions.length} events</span>
            <Select
              value={historyTab}
              onChange={(e) => setHistoryTab(e.target.value)}
              className="w-48"
              aria-label="Filter by buyer"
            >
              <option value="all">All buyers</option>
              {relationships.map((r) => {
                const b = buyerById(db, r.buyerId);
                return (
                  <option key={r.buyerId} value={r.buyerId}>
                    {b?.fullName ?? r.buyerId}
                  </option>
                );
              })}
            </Select>
          </div>
        </div>
        {(() => {
          const filtered =
            historyTab === "all"
              ? allInteractions
              : interactionsForPair(db, historyTab, property.id);
          if (filtered.length === 0) {
            return (
              <EmptyState
                title="No activity yet"
                body="Log an interaction to start the timeline for this property."
                action={
                  <Button onClick={() => modals.logInteraction({ propertyId: property.id })}>
                    Log Interaction
                  </Button>
                }
              />
            );
          }
          return (
            <ul className="divide-y divide-slate-100">
              {filtered.map((i) => {
                const buyer = buyerById(db, i.buyerId);
                const meta = DIRECTION_META[i.direction];
                const occurredMs = Date.parse(i.occurredAt);
                const recordedMs = Date.parse(i.recordedAt);
                const showLogged =
                  Number.isFinite(occurredMs) &&
                  Number.isFinite(recordedMs) &&
                  Math.abs(recordedMs - occurredMs) > 60000;
                return (
                  <li key={i.id} className="flex gap-3 px-4 py-3">
                    <DirectionIcon direction={i.direction} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[11px] font-semibold uppercase tracking-wide ${meta.tone}`}
                        >
                          {meta.label}
                        </span>
                        <Badge label={i.eventType} />
                        {buyer && i.buyerId && (
                          <Link
                            href={`/buyers/${i.buyerId}`}
                            className="text-xs font-medium text-slate-500 hover:text-slate-800"
                          >
                            {buyer.fullName}
                          </Link>
                        )}
                        {i.potentialOfferAmount !== null && (
                          <Badge
                            label={`Mentioned: ${formatMoney(i.potentialOfferAmount)} (unconfirmed)`}
                          />
                        )}
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap text-sm text-slate-800">
                        {i.originalContent}
                      </p>
                      {i.enhancedNotes && (
                        <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">
                            AI Enhanced
                          </p>
                          <p className="mt-1 text-sm text-indigo-900">{i.enhancedNotes}</p>
                          {i.outcome && (
                            <p className="mt-1 text-xs text-indigo-700">Outcome: {i.outcome}</p>
                          )}
                        </div>
                      )}
                      <p className="mt-1.5 text-xs text-slate-400">
                        Occurred {formatDateTime(i.occurredAt)}
                        {showLogged && (
                          <span> · logged {formatDateTime(i.recordedAt)}</span>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          );
        })()}
      </Card>
    </div>
  );
}
