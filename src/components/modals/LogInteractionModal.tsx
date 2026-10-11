"use client";

import { useState } from "react";
import type { Interaction } from "@/types";
import { useDb, useSession } from "@/lib/store";
import { buyerById, propertyById } from "@/lib/selectors";
import { enhanceNotes, type EnhanceResult } from "@/lib/ai/enhance";
import { logInteraction } from "@/lib/actions";
import { Badge, Button, Field, Input, Modal, Select, Spinner, Textarea } from "@/components/ui";

const EVENT_TYPES: Interaction["eventType"][] = [
  "Incoming SMS",
  "Outgoing SMS",
  "Incoming Email",
  "Outgoing Email",
  "Phone Call",
  "Voicemail",
  "Internal Note",
  "Other Interaction",
];

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function LogInteractionModal({
  open,
  onClose,
  defaultBuyerId,
  defaultPropertyId,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  defaultBuyerId?: string | null;
  defaultPropertyId?: string | null;
  onSaved?: (interactionId: string) => void;
}) {
  const db = useDb();
  const session = useSession();
  const [buyerId, setBuyerId] = useState(defaultBuyerId ?? "");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [eventType, setEventType] = useState<Interaction["eventType"]>("Incoming SMS");
  const [occurredAt, setOccurredAt] = useState(toLocalInput(new Date().toISOString()));
  const [content, setContent] = useState("");
  const [enhanced, setEnhanced] = useState<EnhanceResult | null>(null);
  const [useEnhanced, setUseEnhanced] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [summary, setSummary] = useState("");
  const [outcome, setOutcome] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const buyer = buyerById(db, buyerId || null);
  const property = propertyById(db, propertyId || null);
  const buyerRelationships = db.relationships.filter((r) => r.buyerId === buyerId);

  async function runEnhance() {
    if (!content.trim()) {
      setError("Write your notes first, then run Enhance Notes.");
      return;
    }
    setError("");
    setEnhancing(true);
    try {
      const result = await enhanceNotes(content, {
        buyerName: buyer?.fullName ?? "The buyer",
        propertyAddress: property?.address ?? "the property",
      });
      setEnhanced(result);
      setSummary(result.summary);
      setOutcome(result.outcome);
      setNextAction(result.nextAction);
      setUseEnhanced(true);
    } finally {
      setEnhancing(false);
    }
  }

  function save() {
    if (!content.trim()) {
      setError("Original notes are required — the AI never replaces them.");
      return;
    }
    setSaving(true);
    const recordedAt = new Date().toISOString();
    const occurred = new Date(occurredAt).toISOString();
    const finalEnhanced: EnhanceResult | null =
      useEnhanced && enhanced
        ? { ...enhanced, summary, outcome, nextAction }
        : null;
    const id = logInteraction({
      buyerId: buyerId || null,
      propertyId: propertyId || null,
      eventType,
      occurredAt: occurred,
      recordedAt,
      originalContent: content.trim(),
      enhanced: finalEnhanced,
      useEnhanced: useEnhanced && !!enhanced,
      userId: session.userId ?? "u_sarah",
    });
    setSaving(false);
    onSaved?.(id);
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log Interaction"
      description="Record a message, call, or note. The AI can organize your notes — you approve before saving."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save Interaction"}
          </Button>
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
                  {b.companyName ? ` — ${b.companyName}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Property (optional)">
            <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">— No specific property —</option>
              {(buyerRelationships.length > 0
                ? db.properties.filter((p) =>
                    buyerRelationships.some((r) => r.propertyId === p.id),
                  )
                : db.properties
              ).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}, {p.city}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Event Type">
            <Select
              value={eventType}
              onChange={(e) => setEventType(e.target.value as Interaction["eventType"])}
            >
              {EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Occurred At"
            hint="When it actually happened — not when you are logging it."
          >
            <Input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Original Content / Notes">
          <Textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value);
              setError("");
            }}
            placeholder={
              eventType.includes("SMS") || eventType.includes("Email")
                ? "Paste the message text…"
                : "Type your quick notes from the call…"
            }
            className="min-h-28"
          />
        </Field>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={runEnhance} disabled={enhancing}>
            {enhancing ? "Enhancing…" : "Enhance Notes (AI)"}
          </Button>
          <span className="text-xs text-slate-400">
            Original text is always kept — AI output is a suggestion you edit first.
          </span>
        </div>

        {enhancing && <Spinner label="Reading your notes…" />}

        {enhanced && !enhancing && (
          <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                AI Enhanced — review before saving
              </p>
              <label className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={useEnhanced}
                  onChange={(e) => setUseEnhanced(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-slate-300"
                />
                Save with the interaction
              </label>
            </div>

            <div className="space-y-3">
              <Field label="Interaction Summary">
                <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} className="min-h-20" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Outcome">
                  <Input value={outcome} onChange={(e) => setOutcome(e.target.value)} placeholder="e.g. Interested — Price Concern" />
                </Field>
                <Field label="Potential Offer" hint="Unconfirmed until you create an Offer record">
                  <Input
                    value={
                      enhanced.potentialOfferAmount !== null
                        ? `$${enhanced.potentialOfferAmount.toLocaleString("en-US")} — Unconfirmed`
                        : "None detected"
                    }
                    readOnly
                    className="bg-indigo-50/60"
                  />
                </Field>
              </div>
              <Field label="Next Action">
                <Input value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
              </Field>
              {enhanced.missingInfo.length > 0 && (
                <div className="rounded-lg bg-white/70 p-3">
                  <p className="mb-1 text-[11px] font-semibold uppercase text-slate-500">
                    Missing information
                  </p>
                  <ul className="space-y-0.5">
                    {enhanced.missingInfo.map((m) => (
                      <li key={m} className="flex items-start gap-1.5 text-xs text-slate-600">
                        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-amber-500" />
                        {m}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {enhanced.ambiguous && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  The notes are too vague to extract a reliable outcome. Clarify the buyer&apos;s
                  position manually instead of accepting a guess.
                </p>
              )}
            </div>
          </div>
        )}

        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>}

        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
          <Badge label={eventType} />
          {buyer && <Badge label={buyer.fullName} className="bg-white" />}
          <span>Recorded at {new Date().toLocaleString("en-US")}</span>
        </div>
      </div>
    </Modal>
  );
}
