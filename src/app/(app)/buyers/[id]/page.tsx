"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { Buyer, Direction } from "@/types";
import { useDb } from "@/lib/store";
import {
  buyerById,
  interactionsForBuyer,
  nextTaskForPair,
  propertyById,
  relationshipsForBuyer,
} from "@/lib/selectors";
import { formatDate, formatDateTime, formatMoney, parseMoney, relativeTime } from "@/lib/format";
import { updateBuyer } from "@/lib/actions";
import { useModals } from "@/components/modals/ModalHost";
import {
  Badge,
  Button,
  Card,
  DirectionIcon,
  EmptyState,
  Field,
  Input,
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

export default function BuyerDetailPage() {
  const db = useDb();
  const { id } = useParams<{ id: string }>();
  const buyer = buyerById(db, id);

  if (!buyer) {
    return (
      <Card>
        <EmptyState
          title="Buyer not found"
          body="This buyer does not exist or was removed."
          action={
            <Link
              href="/buyers"
              className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-700"
            >
              Back to Buyers
            </Link>
          }
        />
      </Card>
    );
  }

  return <BuyerDetail key={buyer.id} buyer={buyer} />;
}

function BuyerDetail({ buyer }: { buyer: Buyer }) {
  const db = useDb();
  const modals = useModals();

  const [profile, setProfile] = useState(() => ({
    fullName: buyer.fullName,
    companyName: buyer.companyName,
    phone: buyer.phone,
    email: buyer.email,
    preferredContactMethod: buyer.preferredContactMethod,
    status: buyer.status,
    budgetMin: buyer.budgetMin === null ? "" : String(buyer.budgetMin),
    budgetMax: buyer.budgetMax === null ? "" : String(buyer.budgetMax),
    preferredMarkets: buyer.preferredMarkets.join(", "),
  }));
  const [notes, setNotes] = useState(buyer.notes);
  const [profileSaved, setProfileSaved] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [eventTypeFilter, setEventTypeFilter] = useState("All");
  const [propertyFilter, setPropertyFilter] = useState("All");
  const [historySearch, setHistorySearch] = useState("");

  useEffect(() => {
    if (!profileSaved) return;
    const t = window.setTimeout(() => setProfileSaved(false), 2000);
    return () => window.clearTimeout(t);
  }, [profileSaved]);

  useEffect(() => {
    if (!notesSaved) return;
    const t = window.setTimeout(() => setNotesSaved(false), 2000);
    return () => window.clearTimeout(t);
  }, [notesSaved]);

  const setProfileField =
    (key: keyof typeof profile) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setProfile((f) => ({ ...f, [key]: e.target.value }));

  function saveProfile() {
    updateBuyer(buyer.id, {
      fullName: profile.fullName.trim() || buyer.fullName,
      companyName: profile.companyName.trim(),
      phone: profile.phone.trim(),
      email: profile.email.trim(),
      preferredContactMethod: profile.preferredContactMethod,
      status: profile.status,
      budgetMin: parseMoney(profile.budgetMin),
      budgetMax: parseMoney(profile.budgetMax),
      preferredMarkets: profile.preferredMarkets
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
    });
    setProfileSaved(true);
  }

  function saveNotes() {
    updateBuyer(buyer.id, { notes });
    setNotesSaved(true);
  }

  const relationships = relationshipsForBuyer(db, buyer.id);
  const interactions = interactionsForBuyer(db, buyer.id);
  const eventTypes = Array.from(new Set(interactions.map((i) => i.eventType)));
  const historyPropertyIds = Array.from(
    new Set(
      interactions
        .map((i) => i.propertyId)
        .filter((pid): pid is string => pid !== null && pid !== undefined),
    ),
  );
  const historyQuery = historySearch.trim().toLowerCase();
  const filteredInteractions = interactions.filter((i) => {
    if (eventTypeFilter !== "All" && i.eventType !== eventTypeFilter) return false;
    if (propertyFilter !== "All" && i.propertyId !== propertyFilter) return false;
    if (historyQuery && !i.originalContent.toLowerCase().includes(historyQuery)) return false;
    return true;
  });

  const budgetRange =
    buyer.budgetMin === null && buyer.budgetMax === null
      ? "—"
      : `${formatMoney(buyer.budgetMin)} – ${formatMoney(buyer.budgetMax)}`;

  const subtitle = [
    buyer.companyName,
    buyer.preferredContactMethod,
    buyer.phone,
    buyer.email,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div>
      <PageHeader
        title={buyer.fullName}
        subtitle={subtitle}
        actions={
          <>
            <Badge label={buyer.status} />
            <Button variant="secondary" onClick={() => modals.logInteraction({ buyerId: buyer.id })}>
              Log Interaction
            </Button>
            <Button
              variant="secondary"
              onClick={() => modals.generateFollowUp({ buyerId: buyer.id })}
            >
              Generate Follow-Up
            </Button>
            <Button
              variant="secondary"
              onClick={() => modals.createFollowUp({ buyerId: buyer.id })}
            >
              Create Follow-Up
            </Button>
            <Button variant="secondary" onClick={() => modals.addOffer({ buyerId: buyer.id })}>
              Add Offer
            </Button>
            <Button onClick={() => modals.linkBuyer({ buyerId: buyer.id })}>
              Link to Property
            </Button>
          </>
        }
      />

      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Profile</h2>
          </div>
          <div className="space-y-4 p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full Name">
                <Input value={profile.fullName} onChange={setProfileField("fullName")} />
              </Field>
              <Field label="Company">
                <Input value={profile.companyName} onChange={setProfileField("companyName")} />
              </Field>
              <Field label="Phone">
                <Input value={profile.phone} onChange={setProfileField("phone")} />
              </Field>
              <Field label="Email">
                <Input type="email" value={profile.email} onChange={setProfileField("email")} />
              </Field>
              <Field label="Preferred Contact Method">
                <Select
                  value={profile.preferredContactMethod}
                  onChange={setProfileField("preferredContactMethod")}
                >
                  <option value="">—</option>
                  <option value="Phone">Phone</option>
                  <option value="SMS">SMS</option>
                  <option value="Email">Email</option>
                </Select>
              </Field>
              <Field label="Buyer Status">
                <Select value={profile.status} onChange={setProfileField("status")}>
                  {db.settings.buyerStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Budget Min">
                <Input
                  value={profile.budgetMin}
                  onChange={setProfileField("budgetMin")}
                  placeholder="120000"
                />
              </Field>
              <Field label="Budget Max">
                <Input
                  value={profile.budgetMax}
                  onChange={setProfileField("budgetMax")}
                  placeholder="200000"
                />
              </Field>
              <Field label="Preferred Markets" hint="Comma separated" className="sm:col-span-2">
                <Input
                  value={profile.preferredMarkets}
                  onChange={setProfileField("preferredMarkets")}
                  placeholder="Dallas, TX, Houston, TX"
                />
              </Field>
            </div>

            <dl className="grid grid-cols-1 gap-x-4 gap-y-3 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Preferred Markets
                </dt>
                <dd className="mt-0.5 text-xs text-slate-800">
                  {buyer.preferredMarkets.length > 0 ? buyer.preferredMarkets.join(", ") : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Property Types
                </dt>
                <dd className="mt-0.5 text-xs text-slate-800">
                  {buyer.propertyTypes.length > 0 ? buyer.propertyTypes.join(", ") : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Budget Range
                </dt>
                <dd className="mt-0.5 text-xs text-slate-800">{budgetRange}</dd>
              </div>
            </dl>

            <div className="flex items-center gap-3">
              <Button onClick={saveProfile}>Save Changes</Button>
              {profileSaved && (
                <span className="text-xs font-medium text-emerald-600">Saved</span>
              )}
            </div>
          </div>
        </Card>

        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Buyer Notes</h2>
          </div>
          <div className="space-y-3 p-4">
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={10}
              placeholder="Markets they buy in, communication style, deal criteria…"
            />
            <div className="flex items-center gap-3">
              <Button onClick={saveNotes}>Save Notes</Button>
              {notesSaved && <span className="text-xs font-medium text-emerald-600">Saved</span>}
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">Interested Properties</h2>
          <span className="text-xs text-slate-400">{relationships.length} linked</span>
        </div>
        {relationships.length === 0 ? (
          <EmptyState
            title="No linked properties"
            body="Link this buyer to a property to start tracking interest and offers."
            action={
              <Button onClick={() => modals.linkBuyer({ buyerId: buyer.id })}>
                Link to Property
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3 font-medium">Property</th>
                  <th className="px-4 py-3 font-medium">Interest Status</th>
                  <th className="px-4 py-3 font-medium">Interest Notes</th>
                  <th className="px-4 py-3 font-medium">Offer Amount</th>
                  <th className="px-4 py-3 font-medium">Last Interaction</th>
                  <th className="px-4 py-3 font-medium">Next Follow-Up</th>
                  <th className="px-4 py-3 font-medium">Next Action</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {relationships.map((r) => {
                  const property = propertyById(db, r.propertyId);
                  const pairOffers = db.offers
                    .filter((o) => o.buyerId === buyer.id && o.propertyId === r.propertyId)
                    .sort(
                      (a, b) =>
                        b.offerDate.localeCompare(a.offerDate) ||
                        b.createdAt.localeCompare(a.createdAt),
                    );
                  const nextTask = nextTaskForPair(db, buyer.id, r.propertyId);
                  const followUp = nextTask?.dueDate ?? r.nextFollowUpDate;
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <Link
                          href={`/properties/${r.propertyId}`}
                          className="font-medium text-slate-900 hover:text-slate-700"
                        >
                          {property?.address ?? "Unknown property"}
                        </Link>
                        {property && <p className="text-xs text-slate-400">{property.city}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <Badge label={r.interestStatus} />
                      </td>
                      <td className="max-w-[16rem] px-4 py-3 text-slate-600">
                        {r.interestNotes || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {formatMoney(pairOffers[0]?.amount)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {relativeTime(r.lastInteractionDate)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(followUp)}</td>
                      <td className="max-w-[14rem] px-4 py-3 text-slate-600">
                        {r.nextAction || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              modals.generateFollowUp({
                                buyerId: buyer.id,
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
                                buyerId: buyer.id,
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
          <h2 className="text-sm font-semibold text-slate-800">Communication History</h2>
          <span className="text-xs text-slate-400">
            {filteredInteractions.length} of {interactions.length}
          </span>
        </div>

        {interactions.length > 0 && (
          <div className="flex flex-col gap-2 border-b border-slate-100 p-4 sm:flex-row sm:items-center">
            <Input
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              placeholder="Search messages"
              className="sm:flex-1"
            />
            <Select
              value={eventTypeFilter}
              onChange={(e) => setEventTypeFilter(e.target.value)}
              className="sm:w-56"
              aria-label="Filter by event type"
            >
              <option value="All">All</option>
              {eventTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Select
              value={propertyFilter}
              onChange={(e) => setPropertyFilter(e.target.value)}
              className="sm:w-56"
              aria-label="Filter by property"
            >
              <option value="All">All</option>
              {historyPropertyIds.map((pid) => (
                <option key={pid} value={pid}>
                  {propertyById(db, pid)?.address ?? "Unknown property"}
                </option>
              ))}
            </Select>
          </div>
        )}

        {interactions.length === 0 ? (
          <EmptyState
            title="No interactions yet"
            body="Log an interaction to start the communication timeline."
            action={
              <Button onClick={() => modals.logInteraction({ buyerId: buyer.id })}>
                Log Interaction
              </Button>
            }
          />
        ) : filteredInteractions.length === 0 ? (
          <EmptyState title="No matching interactions" body="Try adjusting the filters above." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {filteredInteractions.map((i) => {
              const property = i.propertyId ? propertyById(db, i.propertyId) : undefined;
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
                      <span className={`text-[11px] font-semibold uppercase tracking-wide ${meta.tone}`}>
                        {meta.label}
                      </span>
                      <Badge label={i.eventType} />
                      {property && (
                        <Link
                          href={`/properties/${i.propertyId}`}
                          className="text-xs font-medium text-slate-500 hover:text-slate-800"
                        >
                          {property.address}
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
        )}
      </Card>
    </div>
  );
}
