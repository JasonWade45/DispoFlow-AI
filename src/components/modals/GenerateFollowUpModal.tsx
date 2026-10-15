"use client";

import { useEffect, useRef, useState } from "react";
import { useDb, useSession } from "@/lib/store";
import { buyerById, interactionsForPair, propertyById } from "@/lib/selectors";
import {
  FOLLOW_UP_MODES,
  generateFollowUp,
  refineFollowUp,
  type FollowUpContext,
  type FollowUpDraft,
  type FollowUpMode,
  type RefineAction,
} from "@/lib/ai/followup";
import { addDaysIso, formatMoney, isFirst } from "@/lib/format";
import { createTask, logInteraction } from "@/lib/actions";
import { Badge, Button, Field, Input, Modal, Select, Spinner } from "@/components/ui";

type Engine = "ai" | "templates";

function friendlySendError(msg: string): string {
  if (msg.includes("not authorized for this scope")) {
    return "DispoGenius token is missing send permissions. In DispoGenius → Settings → Private Integrations, enable: Send Conversation Messages (conversations/message.write) and Create Contacts (contacts.write), then Save.";
  }
  if (msg.includes("401")) return "DispoGenius rejected the token. Check DISPOGENIUS_PIT_TOKEN.";
  return msg;
}

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
  const [engine, setEngine] = useState<Engine>("ai");
  const [draft, setDraft] = useState<FollowUpDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState(0);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [date, setDate] = useState(addDaysIso(2));
  const [time, setTime] = useState("10:00");
  const [aiError, setAiError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const autoStarted = useRef(false);

  const buyer = buyerById(db, buyerId || null);
  const property = propertyById(db, propertyId || null);

  useEffect(() => {
    if (!open) return;
    if (defaultBuyerId && !buyerId) setBuyerId(defaultBuyerId);
    if (defaultPropertyId && !propertyId) setPropertyId(defaultPropertyId);
  }, [open, defaultBuyerId, defaultPropertyId]);

  useEffect(() => {
    if (!open || !buyerId || propertyId) return;
    const rel = db.relationships.find((r) => r.buyerId === buyerId);
    if (rel) setPropertyId(rel.propertyId);
  }, [open, buyerId, propertyId, db.relationships]);

  useEffect(() => {
    if (!open) {
      autoStarted.current = false;
      return;
    }
    if (autoStarted.current || !buyerId || !propertyId) return;
    autoStarted.current = true;
    void generate();
  }, [open, buyerId, propertyId]);

  function context(): FollowUpContext | null {
    if (!buyer || !property) return null;
    return {
      buyer,
      property,
      interactions: interactionsForPair(db, buyer.id, property.id),
      offers: db.offers.filter((o) => o.buyerId === buyer.id && o.propertyId === property.id),
      tasks: db.tasks.filter((t) => t.buyerId === buyer.id && t.propertyId === property.id),
      mode,
      variant,
    };
  }

  async function generateViaAi(ctx: FollowUpContext): Promise<FollowUpDraft> {
    const res = await fetch("/api/ai/followup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...ctx, variant }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? `AI request failed (${res.status})`);
    }
    return (await res.json()) as FollowUpDraft;
  }

  async function generate(v = 0, m: FollowUpMode = mode) {
    const base = context();
    if (!base) return;
    setBusy(true);
    setCopied(false);
    setSent(false);
    setSendError(null);
    setAiError(null);
    const ctx: FollowUpContext = { ...base, mode: m, variant: v };
    try {
      let result: FollowUpDraft;
      if (engine === "ai") {
        try {
          result = await generateViaAi(ctx);
        } catch (err) {
          setAiError(
            `${err instanceof Error ? err.message : "AI unavailable"} — fell back to the template engine.`,
          );
          result = await generateFollowUp(ctx);
        }
      } else {
        result = await generateFollowUp(ctx);
      }
      setDraft(result);
      setVariant(v);
      setMessage(result.message);
    } finally {
      setBusy(false);
    }
  }

  async function refine(action: RefineAction) {
    const base = context();
    if (!base || !draft) return;
    setBusy(true);
    setAiError(null);
    setSent(false);
    setSendError(null);
    try {
      let result: FollowUpDraft;
      if (engine === "ai") {
        try {
          const res = await fetch("/api/ai/followup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...base, variant, refine: action, currentMessage: message }),
          });
          if (!res.ok) {
            const data = (await res.json().catch(() => null)) as { error?: string } | null;
            throw new Error(data?.error ?? `AI request failed (${res.status})`);
          }
          result = (await res.json()) as FollowUpDraft;
        } catch (err) {
          setAiError(
            `${err instanceof Error ? err.message : "AI unavailable"} — fell back to the template engine.`,
          );
          result = await refineFollowUp(base, { ...draft, message }, action);
        }
      } else {
        result = await refineFollowUp(base, { ...draft, message }, action);
      }
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

  async function send() {
    if (!buyer || !property || !message.trim() || !buyer.phone) return;
    setSending(true);
    setSendError(null);
    try {
      const res = await fetch("/api/dispo-genius/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          phone: buyer.phone,
          name: buyer.fullName,
          email: buyer.email,
          message,
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      if (!res.ok) throw new Error(data?.error ?? `Send failed (${res.status})`);
      const now = new Date().toISOString();
      logInteraction({
        buyerId: buyer.id,
        propertyId: property.id,
        eventType: "Outgoing SMS",
        occurredAt: now,
        recordedAt: now,
        originalContent: message,
        enhanced: null,
        useEnhanced: false,
        userId: session.userId ?? "u_owner",
        outcome: "Sent via DispoGenius",
      });
      setSent(true);
    } catch (e) {
      setSendError(friendlySendError(e instanceof Error ? e.message : "Send failed"));
    } finally {
      setSending(false);
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
            <Button onClick={copy} variant="secondary">
              {copied ? "Copied" : "Copy Message"}
            </Button>
          )}
          {draft && !draft.blockedReason && (
            <Button
              variant="primary"
              onClick={send}
              disabled={sending || sent || busy || !message.trim() || !buyer?.phone}
            >
              {sending ? "Sending…" : sent ? "Sent ✓" : "Send SMS"}
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
          <Field label="Engine" className="w-44">
            <Select
              value={engine}
              onChange={(e) => {
                setEngine(e.target.value as Engine);
                setDraft(null);
              }}
            >
              <option value="ai">AI (Groq)</option>
              <option value="templates">Templates</option>
            </Select>
          </Field>
          <Button onClick={() => generate(draft ? variant + 1 : variant)} disabled={!canGenerate || busy}>
            {busy ? "Generating…" : draft ? "Regenerate" : "Generate Follow-Up"}
          </Button>
        </div>

        {!canGenerate && (
          <p className="text-xs text-slate-400">Select both a buyer and a property to generate a message.</p>
        )}

        {aiError && (
          <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{aiError}</div>
        )}

        {busy && (
          <Spinner label={engine === "ai" ? "Asking the AI writer…" : "Reading the conversation history…"} />
        )}

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
                    <span className="flex items-center gap-1.5">
                      <Badge label={draft.engine === "ai" ? "Groq AI" : "Templates"} />
                      <Badge label={draft.mode} />
                    </span>
                  </div>
                  <textarea
                    value={message}
                    onChange={(e) => {
                      setMessage(e.target.value);
                      setSent(false);
                      setSendError(null);
                    }}
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

                {sendError && (
                  <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700">{sendError}</div>
                )}

                <div className="flex flex-wrap items-end gap-3 rounded-lg bg-emerald-50 p-3">
                  {sent ? (
                    <p className="text-xs font-medium text-emerald-700">
                      Sent to {buyer?.phone} via DispoGenius ✓ — logged to Activity.
                    </p>
                  ) : (
                    <>
                      <p className="w-full text-xs text-emerald-700">
                        Send goes through your DispoGenius SMS line and logs to Activity
                        automatically. {buyer && !buyer.phone && "This buyer has no phone number — add one to send SMS."} Or copy
                        the message / schedule it as a task.
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
