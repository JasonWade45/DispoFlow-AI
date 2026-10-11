"use client";

import { useState } from "react";
import { useDb, useSession } from "@/lib/store";
import { buyerById, interactionsForPair, propertyById } from "@/lib/selectors";
import {
  FOLLOW_UP_MODES,
  generateFollowUp,
  refineFollowUp,
  type FollowUpDraft,
  type FollowUpMode,
  type RefineAction,
} from "@/lib/ai/followup";
import { addDaysIso, formatMoney, isFirst } from "@/lib/format";
import { createTask } from "@/lib/actions";
import { Badge, Button, Field, Input, Modal, Select, Spinner } from "@/components/ui";

export default function GenerateFollowUpModal({
  open,
  onClose,
  defaultBuyerId,
  defaultPropertyId,
}: {
  open: boolean;
  onClose: () => void;
  defaultBuyerId?: string | null;
  defaultPropertyId?: string | null;
}) {
  const db = useDb();
  const session = useSession();
  const [buyerId, setBuyerId] = useState(defaultBuyerId ?? "");
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? "");
  const [mode, setMode] = useState<FollowUpMode>("Standard Follow-Up");
  const [draft, setDraft] = useState<FollowUpDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState(0);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [date, setDate] = useState(addDaysIso(2));
  const [time, setTime] = useState("10:00");

  const buyer = buyerById(db, buyerId || null);
  const property = propertyById(db, propertyId || null);

  async function generate(v = 0, m: FollowUpMode = mode) {
    if (!buyer || !property) return;
    setBusy(true);
    setCopied(false);
    try {
      const interactions = interactionsForPair(db, buyer.id, property.id);
      const offers = db.offers.filter((o) => o.buyerId === buyer.id && o.propertyId === property.id);
      const result = await generateFollowUp({ buyer, property, interactions, offers, mode: m, variant: v });
      setDraft(result);
      setVariant(v);
      setMessage(result.message);
    } finally {
      setBusy(false);
    }
  }

  async function refine(action: RefineAction) {
    if (!buyer || !property || !draft) return;
    setBusy(true);
    try {
      const interactions = interactionsForPair(db, buyer.id, property.id);
      const offers = db.offers.filter((o) => o.buyerId === buyer.id && o.propertyId === property.id);
      const result = await refineFollowUp(
        { buyer, property, interactions, offers, mode, variant },
        { ...draft, message },
        action,
      );
      if (action === "another") setVariant((n) => n + 1);
      setDraft(result);
      setMessage(result.message);
      setCopied(false);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  function schedule() {
    if (!buyer || !property) return;
    createTask({
      buyerId: buyer.id,
      propertyId: property.id,
      taskType: "Send SMS",
      description: `Send follow-up message: "${message.slice(0, 90)}${message.length > 90 ? "…" : ""}"`,
      dueDate: date,
      dueTime: time,
      assignedUserId: session.userId ?? "u_sarah",
      priority: "Medium",
    });
    setScheduled(true);
  }

  const canGenerate = !!buyer && !!property;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate Follow-Up"
      description="A draft built from the full conversation history — review and edit before using it."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          {draft && !draft.blockedReason && (
            <Button onClick={schedule} disabled={scheduled}>
              {scheduled ? "Scheduled" : "Save as Task"}
            </Button>
          )}
          {draft && !draft.blockedReason && (
            <Button onClick={copy} variant="primary">
              {copied ? "Copied" : "Copy Message"}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Buyer">
            <Select
              value={buyerId}
              onChange={(e) => {
                setBuyerId(e.target.value);
                setDraft(null);
              }}
            >
              <option value="">— Select buyer —</option>
              {db.buyers.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.fullName}
                  {b.status === "Do Not Contact" ? " (Do Not Contact)" : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Property">
            <Select
              value={propertyId}
              onChange={(e) => {
                setPropertyId(e.target.value);
                setDraft(null);
              }}
            >
              <option value="">— Select property —</option>
              {db.properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}, {p.city}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Field label="Mode" className="min-w-56 flex-1">
            <Select
              value={mode}
              onChange={(e) => {
                const m = e.target.value as FollowUpMode;
                setMode(m);
                setDraft(null);
              }}
            >
              {FOLLOW_UP_MODES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
          </Field>
          <Button onClick={() => generate(variant)} disabled={!canGenerate || busy}>
            {busy ? "Generating…" : draft ? "Regenerate" : "Generate Follow-Up"}
          </Button>
        </div>

        {!canGenerate && (
          <p className="text-xs text-slate-400">Select both a buyer and a property to generate a message.</p>
        )}

        {busy && <Spinner label="Reading the conversation history…" />}

        {draft && !busy && (
          <>
            {draft.blockedReason ? (
              <div className="rounded-lg bg-rose-50 p-4 text-sm text-rose-700">
                {draft.blockedReason}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Draft message
                    </span>
                    <Badge label={draft.mode} />
                  </div>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    className="min-h-24 w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-800 focus:border-slate-400 focus:outline-none"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => refine("shorter")} disabled={busy}>
                    Make It Shorter
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => refine("direct")} disabled={busy}>
                    Make It More Direct
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => refine("conversational")} disabled={busy}>
                    More Conversational
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => refine("price")} disabled={busy}>
                    Address the Price Concern
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => refine("another")} disabled={busy}>
                    Generate Another Version
                  </Button>
                </div>

                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Why this message
                  </p>
                  <p className="text-sm text-slate-700">{draft.why}</p>
                  <p className="mt-3 mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                    Sources used
                  </p>
                  <ul className="space-y-1">
                    {draft.sources.length === 0 && (
                      <li className="text-xs text-slate-400">No prior messages on this pair.</li>
                    )}
                    {draft.sources.map((s) => (
                      <li key={s} className="flex items-start gap-1.5 text-xs text-slate-600">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="flex flex-wrap items-end gap-3 rounded-lg bg-emerald-50 p-3">
                  <p className="w-full text-xs text-emerald-700">
                    Nothing is sent automatically. Copy the message or schedule it as a task — then send
                    it yourself and log the result.
                  </p>
                  {scheduled ? (
                    <span className="text-xs font-medium text-emerald-700">
                      Follow-up scheduled for {date} at {time}.
                    </span>
                  ) : (
                    <>
                      <Field label="Follow-up date" className="w-40">
                        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                      </Field>
                      <Field label="Time" className="w-28">
                        <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                      </Field>
                    </>
                  )}
                </div>

                {buyer && property && (
                  <p className="text-xs text-slate-400">
                    Context: {isFirst(buyer.fullName)} · {property.address} ·{" "}
                    {interactionsForPair(db, buyer.id, property.id).length} interactions ·{" "}
                    {formatMoney(db.offers.find((o) => o.buyerId === buyer.id && o.propertyId === property.id && o.status !== "Draft")?.amount ?? null)}{" "}
                    on the table
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
