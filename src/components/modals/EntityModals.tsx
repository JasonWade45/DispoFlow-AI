"use client";

import { useState } from "react";
import { useDb, useSession } from "@/lib/store";
import { addBuyer, addOffer, addProperty, linkBuyerToProperty } from "@/lib/actions";
import { parseMoney, todayIso } from "@/lib/format";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";

export function AddPropertyModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const db = useDb();
  const session = useSession();
  const [form, setForm] = useState({
    address: "",
    city: "",
    state: "",
    zip: "",
    status: "Available",
    accessType: "",
    askingPrice: "",
    arv: "",
    estimatedRepairs: "",
    assignmentPrice: "",
    expectedClosingDate: "",
    notes: "",
    companyLink: "",
  });
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(false);
  const [preview, setPreview] = useState<{
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    askingPrice?: number;
    arv?: number;
    estimatedRepairs?: number;
    accessType?: string;
    companyLink?: string;
    financingNote?: string;
    specs?: { bedrooms?: string; bathrooms?: string; sqft?: string; yearBuilt?: string };
    images?: string[];
    comps?: Array<{ address?: string; soldPrice?: number }>;
  } | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const dupes = db.properties.filter((p) =>
    form.address.trim().length > 4 &&
    (p.address.toLowerCase().includes(form.address.trim().toLowerCase()) ||
      form.address.trim().toLowerCase().includes(p.address.toLowerCase())),
  );

  async function fetchFromElevateReg() {
    if (!form.companyLink.trim()) {
      setError("Enter an ElevateReg property URL first.");
      return;
    }
    if (!form.companyLink.includes('elevatereg.com/property/')) {
      setError("URL must be from elevatereg.com/property/");
      return;
    }
    setFetching(true);
    setError("");
    setPreview(null);
    try {
      const res = await fetch('/api/scrape/elevatereg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: form.companyLink }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch');
      setPreview(data.property);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch property');
    } finally {
      setFetching(false);
    }
  }

  function applyPreview() {
    if (!preview) return;
    setForm(f => ({
      ...f,
      address: preview.address,
      city: preview.city,
      state: preview.state,
      zip: preview.zip,
      accessType: preview.accessType ?? f.accessType,
      askingPrice: preview.askingPrice?.toString() || "",
      arv: preview.arv?.toString() || "",
      estimatedRepairs: preview.estimatedRepairs?.toString() || "",
      notes: [
        f.notes,
        `Source: ${preview.companyLink}`,
        preview.financingNote ? `Financing: ${preview.financingNote}` : "",
        preview.comps && preview.comps.length > 0 ? `Comps: ${preview.comps.map((c) => `${c.address} - $${c.soldPrice?.toLocaleString()}`).join('; ')}` : "",
      ].filter(Boolean).join('\n'),
    }));
    setPreview(null);
  }

  function submit() {
    if (!form.address.trim() || !form.city.trim() || !form.state.trim()) {
      setError("Address, city, and state are required.");
      return;
    }
    const id = addProperty({
      address: form.address,
      city: form.city,
      state: form.state,
      zip: form.zip,
      status: form.status,
      accessType: form.accessType,
      askingPrice: parseMoney(form.askingPrice),
      arv: parseMoney(form.arv),
      estimatedRepairs: parseMoney(form.estimatedRepairs),
      assignmentPrice: parseMoney(form.assignmentPrice),
      expectedClosingDate: form.expectedClosingDate || null,
      notes: form.notes,
      userId: session.userId ?? "u_owner",
    });
    onCreated?.(id);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Property"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Add Property</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property Address" className="sm:col-span-2">
            <Input value={form.address} onChange={set("address")} placeholder="4812 Maple Grove Dr" />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={set("city")} placeholder="Dallas" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="State">
              <Input value={form.state} onChange={set("state")} placeholder="TX" maxLength={2} />
            </Field>
            <Field label="ZIP Code">
              <Input value={form.zip} onChange={set("zip")} placeholder="75228" />
            </Field>
          </div>
        </div>

        {dupes.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="mb-1 text-xs font-semibold text-amber-800">
              Possible duplicate{dupes.length > 1 ? "s" : ""} — review before creating:
            </p>
            {dupes.map((p) => (
              <p key={p.id} className="text-xs text-amber-700">
                {p.address}, {p.city}, {p.state} — {p.status}
              </p>
            ))}
          </div>
        )}

        <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 mb-4">
          <p className="text-xs font-semibold text-indigo-700 mb-2">Fetch from ElevateReg</p>
          <div className="flex flex-wrap gap-2">
            <Field label="Company Link" className="flex-1 min-w-[200px]">
              <Input
                value={form.companyLink}
                onChange={set("companyLink")}
                placeholder="https://www.elevatereg.com/property/..."
              />
            </Field>
            <Button
              variant="secondary"
              onClick={fetchFromElevateReg}
              disabled={fetching}
              className="self-end"
            >
              {fetching ? "Fetching…" : "Fetch & Preview"}
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-rose-700">{error}</p>}
        </div>

        {preview && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-emerald-700">Preview from ElevateReg</p>
              <Button size="sm" variant="ghost" onClick={applyPreview}>Apply to Form</Button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="font-medium">{preview.address}, {preview.city}, {preview.state} {preview.zip}</span>
              </div>
              <div>
                <span className="font-medium">Asking: ${preview.askingPrice?.toLocaleString() ?? '—'}</span>
              </div>
              <div>
                <span className="font-medium">ARV: ${preview.arv?.toLocaleString() ?? '—'}</span>
              </div>
              <div>
                <span className="font-medium">Images: {preview.images.length}</span>
              </div>
              <div>
                <span className="font-medium">Comps: {preview.comps.length}</span>
              </div>
              <div>
                <span className="font-medium">Specs: {Object.entries(preview.specs).filter(([,v]) => v).length} fields</span>
              </div>
            </div>
            {preview.financingNote && (
              <p className="mt-2 text-xs text-indigo-700 bg-indigo-50 p-2 rounded">{preview.financingNote}</p>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Property Status">
            <Select value={form.status} onChange={set("status")}>
              {db.settings.propertyStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Access">
            <Select value={form.accessType} onChange={set("accessType")}>
              <option value="">— Not set —</option>
              <option value="Appointments">Appointments</option>
              <option value="Lockbox">Lockbox</option>
              <option value="Open">Open</option>
            </Select>
          </Field>
          <Field label="Expected Closing Date">
            <Input type="date" value={form.expectedClosingDate} onChange={set("expectedClosingDate")} />
          </Field>
          <Field label="Asking Price">
            <Input value={form.askingPrice} onChange={set("askingPrice")} placeholder="189000" />
          </Field>
          <Field label="ARV">
            <Input value={form.arv} onChange={set("arv")} placeholder="265000" />
          </Field>
          <Field label="Estimated Repairs">
            <Input value={form.estimatedRepairs} onChange={set("estimatedRepairs")} placeholder="32000" />
          </Field>
          <Field label="Assignment Price">
            <Input value={form.assignmentPrice} onChange={set("assignmentPrice")} placeholder="155000" />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea value={form.notes} onChange={set("notes")} placeholder="Condition, showing instructions, seller situation…" />
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
}

export function AddBuyerModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (id: string) => void;
}) {
  const db = useDb();
  const session = useSession();
  const [form, setForm] = useState({
    fullName: "",
    companyName: "",
    phone: "",
    email: "",
    preferredContactMethod: "",
    preferredMarkets: "",
    budgetMin: "",
    budgetMax: "",
    status: "Active",
    notes: "",
  });
  const [error, setError] = useState("");

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const dupes = db.buyers.filter(
    (b) =>
      (form.email.trim() && b.email.toLowerCase() === form.email.trim().toLowerCase()) ||
      (form.phone.trim() && b.phone === form.phone.trim()) ||
      (form.fullName.trim().length > 3 &&
        b.fullName.toLowerCase() === form.fullName.trim().toLowerCase()),
  );

  function submit() {
    if (!form.fullName.trim()) {
      setError("Buyer name is required.");
      return;
    }
    const id = addBuyer({
      fullName: form.fullName,
      companyName: form.companyName,
      phone: form.phone,
      email: form.email,
      preferredContactMethod: form.preferredContactMethod,
      preferredMarkets: form.preferredMarkets
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
      budgetMin: parseMoney(form.budgetMin),
      budgetMax: parseMoney(form.budgetMax),
      status: form.status,
      notes: form.notes,
      userId: session.userId ?? "u_owner",
    });
    onCreated?.(id);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Buyer"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Add Buyer</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full Name *">
            <Input value={form.fullName} onChange={set("fullName")} placeholder="John Calloway" />
          </Field>
          <Field label="Company">
            <Input value={form.companyName} onChange={set("companyName")} placeholder="Calloway Property Group" />
          </Field>
          <Field label="Phone">
            <Input value={form.phone} onChange={set("phone")} placeholder="(214) 555-0138" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={set("email")} placeholder="john@company.com" />
          </Field>
          <Field label="Preferred Contact Method">
            <Select value={form.preferredContactMethod} onChange={set("preferredContactMethod")}>
              <option value="">—</option>
              <option value="Phone">Phone</option>
              <option value="SMS">SMS</option>
              <option value="Email">Email</option>
            </Select>
          </Field>
          <Field label="Buyer Status">
            <Select value={form.status} onChange={set("status")}>
              {db.settings.buyerStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Preferred Markets" hint="Comma separated" className="sm:col-span-2">
            <Input
              value={form.preferredMarkets}
              onChange={set("preferredMarkets")}
              placeholder="Dallas, TX, Houston, TX"
            />
          </Field>
          <Field label="Budget Min">
            <Input value={form.budgetMin} onChange={set("budgetMin")} placeholder="120000" />
          </Field>
          <Field label="Budget Max">
            <Input value={form.budgetMax} onChange={set("budgetMax")} placeholder="200000" />
          </Field>
        </div>

        {dupes.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <p className="mb-1 text-xs font-semibold text-amber-800">Possible duplicate buyers:</p>
            {dupes.map((b) => (
              <p key={b.id} className="text-xs text-amber-700">
                {b.fullName} — {b.email || b.phone} ({b.status})
              </p>
            ))}
          </div>
        )}

        <Field label="General Notes">
          <Textarea
            value={form.notes}
            onChange={set("notes")}
            placeholder="Markets they buy in, communication style, deal criteria…"
          />
        </Field>

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
}

export function LinkBuyerModal({
  open,
  onClose,
  defaultPropertyId,
  defaultBuyerId,
  onLinked,
}: {
  open: boolean;
  onClose: () => void;
  defaultPropertyId?: string | null;
  defaultBuyerId?: string | null;
  onLinked?: (relationshipId: string) => void;
}) {
  const db = useDb();
  const session = useSession();
  const [buyerId, setBuyerId] = useState(defaultBuyerId ?? "");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [interestStatus, setInterestStatus] = useState("New");
  const [interestNotes, setInterestNotes] = useState("");
  const [error, setError] = useState("");

  const already = db.relationships.find(
    (r) => r.buyerId === buyerId && r.propertyId === propertyId,
  );

  function submit() {
    if (!buyerId || !propertyId) {
      setError("Select both a buyer and a property.");
      return;
    }
    if (already) {
      setError("This buyer is already linked to that property.");
      return;
    }
    const id = linkBuyerToProperty({
      buyerId,
      propertyId,
      interestStatus,
      interestNotes,
      assignedUserId: session.userId ?? "u_sarah",
      userId: session.userId ?? "u_sarah",
    });
    if (id) onLinked?.(id);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Link Buyer to Property"
      description="Creates an interest record independent from the buyer and the property."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Link</Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Buyer">
          <Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
            <option value="">— Select buyer —</option>
            {db.buyers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.fullName} — {b.status}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Property">
          <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
            <option value="">— Select property —</option>
            {db.properties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.address}, {p.city} ({p.status})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Interest Status">
          <Select value={interestStatus} onChange={(e) => setInterestStatus(e.target.value)}>
            {db.settings.interestStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Interest Notes">
          <Textarea
            value={interestNotes}
            onChange={(e) => setInterestNotes(e.target.value)}
            placeholder="Why are they interested? Any conditions?"
          />
        </Field>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
}

export function AddOfferModal({
  open,
  onClose,
  defaultBuyerId,
  defaultPropertyId,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  defaultBuyerId?: string | null;
  defaultPropertyId?: string | null;
  onCreated?: (id: string) => void;
}) {
  const db = useDb();
  const session = useSession();
  const [buyerId, setBuyerId] = useState(defaultBuyerId ?? "");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [amount, setAmount] = useState("");
  const [offerDate, setOfferDate] = useState(todayIso());
  const [terms, setTerms] = useState("Cash");
  const [expiresAt, setExpiresAt] = useState("");
  const [status, setStatus] = useState("Draft");
  const [negotiationNotes, setNegotiationNotes] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [error, setError] = useState("");

  function submit() {
    if (!buyerId || !propertyId) {
      setError("Select both a buyer and a property.");
      return;
    }
    const amt = parseMoney(amount);
    if (amt === null || amt <= 0) {
      setError("Enter a valid offer amount.");
      return;
    }
    const id = addOffer({
      buyerId,
      propertyId,
      amount: amt,
      offerDate,
      terms,
      expiresAt: expiresAt || null,
      status,
      negotiationNotes,
      nextAction,
      userId: session.userId ?? "u_sarah",
    });
    onCreated?.(id);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add Offer"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Save Offer</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Buyer">
            <Select value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
              <option value="">— Select buyer —</option>
              {db.buyers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.fullName}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Property">
            <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">— Select property —</option>
              {db.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}, {p.city}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Offer Amount *">
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="161000" />
          </Field>
          <Field label="Offer Date">
            <Input type="date" value={offerDate} onChange={(e) => setOfferDate(e.target.value)} />
          </Field>
          <Field label="Terms">
            <Input value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="Cash, 14-day close" />
          </Field>
          <Field label="Expiration Date">
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </Field>
          <Field label="Offer Status">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {db.settings.offerStatuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Next Action">
            <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} placeholder="Present counter" />
          </Field>
        </div>
        <Field label="Negotiation Notes">
          <Textarea value={negotiationNotes} onChange={(e) => setNegotiationNotes(e.target.value)} />
        </Field>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}
      </div>
    </Modal>
  );
}
