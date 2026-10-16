"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  buildInteractionsFromDg,
  ensureBuyersFromConversations,
  relinkDgInteractions,
  type DgPayload,
  type DgSyncSummary,
} from "@/lib/dispo-genius";
import { updateDb, useDb, useSession } from "@/lib/store";
import { Badge, Button, Card, PageHeader } from "@/components/ui";

type Status = "checking" | "connected" | "error";

function friendlyError(msg: string): string {
  if (msg.includes("not authorized for this scope") || msg.includes("not accessible")) {
    return "The token is missing permissions. In DispoGenius go to Settings → Private Integrations, edit the integration and enable: View Conversations, View Conversation Messages, View Locations, Edit Conversation Messages, Edit Contacts, then Save.";
  }
  if (msg.includes("401")) {
    return "DispoGenius rejected the token. Create a new Private Integration token and update DISPOGENIUS_PIT_TOKEN.";
  }
  return msg;
}

export default function DispoGeniusPage() {
  const db = useDb();
  const session = useSession();
  const [status, setStatus] = useState<Status>("checking");
  const [locationId, setLocationId] = useState("");
  const [error, setError] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<DgSyncSummary | null>(null);
  const [buyersCreated, setBuyersCreated] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/dispo-genius/conversations?check=1");
        const data = (await res.json()) as { configured?: boolean; locationId?: string; error?: string };
        if (cancelled) return;
        if (res.ok && data.configured) {
          setStatus("connected");
          setLocationId(data.locationId || "");
        } else {
          setStatus("error");
          setError(friendlyError(data.error || `Check failed (${res.status})`));
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setError("Could not reach the server.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function sync() {
    setSyncing(true);
    setError("");
    setResult(null);
    setBuyersCreated(0);
    try {
      const res = await fetch("/api/dispo-genius/conversations");
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      const payload = data as unknown as DgPayload;
      const now = new Date().toISOString();
      const userId = session.userId ?? "u_owner";
      const withBuyers = ensureBuyersFromConversations(db, payload, userId, now);
      const newBuyers = withBuyers.db.buyers.filter((b) => !db.buyers.some((x) => x.id === b.id));
      const { interactions, summary } = buildInteractionsFromDg(payload, withBuyers.db, userId, now);
      const relink = relinkDgInteractions(withBuyers.db, payload);
      const relinkedById = new Map(relink.interactions.map((i) => [i.id, i]));
      if (newBuyers.length > 0 || interactions.length > 0 || relink.interactions.length > 0) {
        updateDb((d) => ({
          ...d,
          buyers: [...d.buyers, ...newBuyers.filter((nb) => !d.buyers.some((x) => x.id === nb.id))],
          interactions: [
            ...d.interactions.map((i) => relinkedById.get(i.id) ?? i),
            ...interactions.filter((i) => !d.interactions.some((x) => x.id === i.id)),
          ],
        }));
      }
      setResult({ ...summary, relinked: relink.relinked });
      setBuyersCreated(newBuyers.length);
      setStatus("connected");
    } catch (e) {
      setError(friendlyError(e instanceof Error ? e.message : "Sync failed"));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="DispoGenius"
        subtitle="Import customer conversations from your DispoGenius CRM into Activity"
      />

      <div className="space-y-5">
        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-800">Connection</h2>
              <Badge
                label={
                  status === "connected" ? "Connected" : status === "checking" ? "Checking…" : "Not connected"
                }
              />
            </div>
            <p className="mt-0.5 text-xs text-slate-400">
              Uses the private integration token stored on the server (DISPOGENIUS_PIT_TOKEN) — never shown here
            </p>
          </div>
          <div className="space-y-2 px-4 py-4 text-sm text-slate-600">
            {status === "checking" && <p>Checking the DispoGenius connection…</p>}
            {status === "connected" && (
              <p>
                Connected{locationId ? (
                  <>
                    {" "}
                    · location <span className="font-mono text-xs text-slate-500">{locationId}</span>
                  </>
                ) : null}
              </p>
            )}
            {status === "error" && <p className="text-rose-600">{error}</p>}
          </div>
        </Card>

        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Sync conversations</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Pulls the latest SMS, calls, and emails and logs them as activity
            </p>
          </div>
          <div className="space-y-3 px-4 py-4">
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
              <li>Messages are matched to existing buyers by phone, then email, then name.</li>
              <li>Safe to re-run — already imported messages are skipped automatically.</li>
              <li>Unmatched conversations are still imported so no conversation is lost.</li>
            </ul>

            <div className="flex items-center gap-3">
              <Button onClick={sync} disabled={syncing || status === "checking"}>
                {syncing ? "Syncing…" : "Sync conversations now"}
              </Button>
              {result && (
                <Link href="/activity" className="text-xs font-medium text-slate-500 hover:text-slate-800">
                  View activity →
                </Link>
              )}
            </div>

            {error && !result && <p className="text-xs text-rose-600">{error}</p>}

            {result && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                Imported <strong>{result.imported}</strong> new message{result.imported === 1 ? "" : "s"} from{" "}
                <strong>{result.conversations}</strong> conversation{result.conversations === 1 ? "" : "s"} ·
                matched <strong>{result.matched}</strong> to buyers · {result.unmatched} unmatched ·{" "}
                {result.skipped} already imported
                {buyersCreated > 0 && (
                  <>
                    {" "}· created <strong>{buyersCreated}</strong> new buyer{buyersCreated === 1 ? "" : "s"}
                  </>
                )}
                {(result.relinked ?? 0) > 0 && (
                  <>
                    {" "}· relinked <strong>{result.relinked}</strong> old message
                    {result.relinked === 1 ? "" : "s"} to buyers/properties
                  </>
                )}
              </div>
            )}
          </div>
        </Card>

        <Link href="/settings" className="inline-block text-sm font-medium text-slate-500 hover:text-slate-800">
          ← Back to settings
        </Link>
      </div>
    </div>
  );
}
