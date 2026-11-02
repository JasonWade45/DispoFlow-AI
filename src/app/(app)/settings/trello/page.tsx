"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDb, updateDb } from "@/lib/store";
import type { Property, TrelloConnection } from "@/types";
import { formatDate, parseMoney, uid } from "@/lib/format";
import { normalizeAddress, parseAddressParts } from "@/lib/sync";
import { addImportHistory } from "@/lib/actions";
import {
  applyTrelloSiteImport,
  parseTrelloSiteImport,
  type TrelloSiteImportCounts,
  type TrelloSiteImportRow,
} from "@/lib/trello-site-import";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Select,
} from "@/components/ui";

type TrelloBoard = { id: string; name: string; url: string };
type TrelloList = { id: string; name: string; pos: number };
type TrelloAttachment = {
  id: string;
  url: string;
  name: string;
  previews?: { url: string }[];
  type?: string;
  isUpload?: boolean;
};
type TrelloCard = {
  id: string;
  name: string;
  desc: string;
  idList: string;
  shortUrl: string;
  dateLastActivity: string;
  due: string | null;
  labels: { id: string; name: string; color: string | null }[];
  attachments: TrelloAttachment[];
};

const CRED_KEY = "dispoflow_trello_creds";

function loadCreds(): { key: string; token: string } {
  try {
    const raw = window.localStorage.getItem(CRED_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return { key: "", token: "" };
}

function saveCreds(key: string, token: string) {
  window.localStorage.setItem(CRED_KEY, JSON.stringify({ key, token }));
}

function credHeaders(): Record<string, string> {
  const { key, token } = loadCreds();
  if (!key || !token) return {};
  return { "x-trello-key": key, "x-trello-token": token };
}

function extractPrice(desc: string): number | null {
  const m =
    desc.match(/(?:asking|price|offer|arv|list)\s*[:\-]?\s*\$?([\d,]+(?:\.\d+)?)/i) ||
    desc.match(/\$\s?([\d,]+(?:\.\d+)?)/);
  if (m) return parseMoney(m[1]);
  return null;
}

function extractArv(desc: string): number | null {
  const m = desc.match(/arv\s*[:\-]?\s*\$?([\d,]+(?:\.\d+)?)/i);
  if (m) return parseMoney(m[1]);
  return null;
}

function photoUrls(card: TrelloCard): string[] {
  const urls: string[] = [];
  for (const a of card.attachments ?? []) {
    if (a.type === "image" || a.isUpload || /\.(jpe?g|png|webp|gif|avif)$/i.test(a.url)) {
      const preview = a.previews?.[a.previews.length - 1]?.url || a.url;
      if (preview && !urls.includes(preview)) urls.push(preview);
    } else if (/trello\.com/.test(a.url) && /\.(jpe?g|png|webp|gif|avif)/i.test(a.url)) {
      if (!urls.includes(a.url)) urls.push(a.url);
    }
  }
  return urls.slice(0, 20);
}

export default function TrelloPage() {
  const db = useDb();
  const connection = db.trelloConnections[0];

  const [apiKey, setApiKey] = useState(() => (typeof window !== "undefined" ? loadCreds().key : ""));
  const [apiToken, setApiToken] = useState(() => (typeof window !== "undefined" ? loadCreds().token : ""));
  const [credsSaved, setCredsSaved] = useState(() => {
    if (typeof window === "undefined") return false;
    const c = loadCreds();
    return Boolean(c.key && c.token);
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [boards, setBoards] = useState<TrelloBoard[]>([]);
  const [lists, setLists] = useState<TrelloList[]>([]);
  const [cards, setCards] = useState<TrelloCard[]>([]);
  const [selectedBoard, setSelectedBoard] = useState("");
  const [listMappings, setListMappings] = useState<Record<string, string>>({});
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ newCount: number; updatedCount: number; skippedCount: number } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [siteRows, setSiteRows] = useState<TrelloSiteImportRow[] | null>(null);
  const [siteParsing, setSiteParsing] = useState(false);
  const [siteImporting, setSiteImporting] = useState(false);
  const [siteError, setSiteError] = useState<string | null>(null);
  const [siteResult, setSiteResult] = useState<TrelloSiteImportCounts | null>(null);

  const fetchBoards = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/trello/boards", { headers: credHeaders() });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "not_configured") {
          setError("Trello API key/token not set. Enter them below and save.");
        } else {
          setError(data.detail || data.message || data.error || "Failed to load boards");
        }
        return;
      }
      setBoards(data.boards ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (credsSaved) {
      const t = window.setTimeout((): void => void fetchBoards(), 0);
      return () => window.clearTimeout(t);
    }
  }, [credsSaved, fetchBoards]);

  function handleSaveCreds() {
    if (!apiKey.trim() || !apiToken.trim()) {
      setError("Enter both API key and token.");
      return;
    }
    saveCreds(apiKey.trim(), apiToken.trim());
    setCredsSaved(true);
    setError(null);
  }

  async function handleSelectBoard(boardId: string) {
    setSelectedBoard(boardId);
    setLists([]);
    setCards([]);
    setListMappings({});
    setImportResult(null);
    setLoading(true);
    setError(null);
    try {
      const [listsRes, cardsRes] = await Promise.all([
        fetch(`/api/trello/boards/${boardId}/lists`, { headers: credHeaders() }),
        fetch(`/api/trello/boards/${boardId}/cards`, { headers: credHeaders() }),
      ]);
      const listsData = await listsRes.json();
      const cardsData = await cardsRes.json();
      if (!listsRes.ok) {
        setError(listsData.detail || listsData.error || "Failed to load lists");
        return;
      }
      setLists(listsData.lists ?? []);
      setCards(cardsData.cards ?? []);
      const mappings: Record<string, string> = {};
      for (const l of listsData.lists ?? []) {
        const guess =
          /sold|closed|won/i.test(l.name)
            ? "Sold"
            : /contract|pending|escrow/i.test(l.name)
              ? "Under Contract"
              : /offer/i.test(l.name)
                ? "Offer Received"
                : /market|active|live/i.test(l.name)
                  ? "Marketing"
                  : /review|due diligence|inspection/i.test(l.name)
                    ? "Under Contract"
                    : "Available";
        mappings[l.id] = guess;
      }
      setListMappings(mappings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load board");
    } finally {
      setLoading(false);
    }
  }

  function saveConnection() {
    const board = boards.find((b) => b.id === selectedBoard);
    if (!board) return;
    const ts = new Date().toISOString();
    const conn: TrelloConnection = {
      id: connection?.id ?? uid("tc_"),
      orgId: db.organization.id,
      boardId: board.id,
      boardName: board.name,
      isConnected: true,
      lastSyncAt: connection?.lastSyncAt ?? null,
      lastSyncStatus: connection?.lastSyncStatus ?? "never",
      lastSyncError: null,
      listMappings: lists.map((l) => ({
        listId: l.id,
        listName: l.name,
        propertyStatus: listMappings[l.id] || "Available",
      })),
      createdAt: connection?.createdAt ?? ts,
      updatedAt: ts,
    };
    updateDb((d) => ({ ...d, trelloConnections: [conn] }));
  }

  function buildPreview() {
    return cards.slice(0, 50).map((card, i) => {
      const parsed = parseAddressParts(card.name);
      const address = parsed?.address || card.name.trim();
      return {
        _i: i + 1,
        cardId: card.id,
        name: card.name,
        address,
        city: parsed?.city || "",
        state: parsed?.state || "",
        zip: parsed?.zip || "",
        status: listMappings[card.idList] || "Available",
        askingPrice: extractPrice(card.desc),
        arv: extractArv(card.desc),
        notes: card.desc || "",
        photos: photoUrls(card),
        listingUrl: card.shortUrl,
        due: card.due,
      };
    });
  }

  async function handleSiteFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setSiteParsing(true);
    setSiteError(null);
    setSiteResult(null);
    try {
      const text = await file.text();
      setSiteRows(parseTrelloSiteImport(text));
    } catch (err) {
      setSiteRows(null);
      setSiteError(err instanceof Error ? err.message : "Could not read the file.");
    } finally {
      setSiteParsing(false);
    }
  }

  function handleSiteImport() {
    if (!siteRows) return;
    setSiteImporting(true);
    setSiteError(null);
    try {
      const plan = applyTrelloSiteImport(db, siteRows, db.users[0]?.id ?? "u_owner");
      updateDb(() => plan.db);
      addImportHistory({
        source: "trello",
        newCount: plan.counts.created,
        updatedCount: plan.counts.updated,
        skippedCount: plan.counts.skipped,
        errorCount: 0,
        notes: `Trello export matched to elevatereg.com — ${siteRows.length} properties`,
      });
      setSiteResult(plan.counts);
      setSiteRows(null);
    } catch (err) {
      setSiteError(err instanceof Error ? err.message : "Import failed.");
    } finally {
      setSiteImporting(false);
    }
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    try {
      const preview = buildPreview();
      let newCount = 0;
      let updatedCount = 0;
      let skippedCount = 0;

      updateDb((d) => {
        const existingByAddress = new Map(
          d.properties.map((p) => [p.address.toLowerCase().trim(), p]),
        );
        const newProps: Property[] = [];

        for (const row of preview) {
          const addr = row.address?.trim();
          if (!addr) {
            skippedCount++;
            continue;
          }
          const key = addr.toLowerCase().trim();
          const ts = new Date().toISOString();
          const existing = existingByAddress.get(key);
          if (existing) {
            updatedCount++;
            const idx = d.properties.findIndex((p) => p.id === existing.id);
            if (idx >= 0) {
              d.properties[idx] = {
                ...d.properties[idx],
                status: row.status || d.properties[idx].status,
                askingPrice: row.askingPrice ?? d.properties[idx].askingPrice,
                arv: row.arv ?? d.properties[idx].arv,
                notes: row.notes || d.properties[idx].notes,
                listingUrl: row.listingUrl || d.properties[idx].listingUrl,
                photos: row.photos.length ? row.photos : d.properties[idx].photos,
                lastSyncedAt: ts,
                syncStatus: "synced",
              };
            }
          } else {
            newCount++;
            newProps.push({
              id: uid("p_"),
              orgId: d.organization.id,
              address: addr,
              city: row.city,
              state: row.state,
              zip: row.zip,
              accessInfo: "",
              status: row.status || "Available",
              accessType: "",
              askingPrice: row.askingPrice,
              arv: row.arv,
              estimatedRepairs: null,
              assignmentPrice: null,
              marketingStartedAt: null,
              expectedClosingDate: row.due,
              notes: row.notes,
              propertyType: "",
              bedrooms: "",
              bathrooms: "",
              sqft: "",
              lotSize: "",
              yearBuilt: "",
              listingUrl: row.listingUrl,
              photosUrl: row.photos[0] || "",
              photos: row.photos,
              sourceWebsite: "Trello",
              sourcePropertyId: row.cardId,
              sourceRowId: row.cardId,
              firstImportedAt: ts,
              lastSyncedAt: ts,
              syncStatus: "synced",
              createdBy: db.users[0]?.id ?? "u_owner",
              createdAt: ts,
              updatedAt: ts,
            });
          }
        }

        return {
          ...d,
          properties: [...d.properties, ...newProps],
          trelloConnections: d.trelloConnections.map((c) =>
            c.boardId === selectedBoard
              ? { ...c, lastSyncAt: new Date().toISOString(), lastSyncStatus: "synced" as const, lastSyncError: null }
              : c,
          ),
        };
      });

      addImportHistory({
        source: "trello",
        newCount,
        updatedCount,
        skippedCount,
        errorCount: 0,
        notes: `Imported from Trello board "${boards.find((b) => b.id === selectedBoard)?.name ?? selectedBoard}"`,
      });

      setImportResult({ newCount, updatedCount, skippedCount });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  const existingAddrKeys = useMemo(
    () => new Set(db.properties.map((p) => normalizeAddress(p.address))),
    [db.properties],
  );
  const siteStatusCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of siteRows ?? []) acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, [siteRows]);
  const siteNewCount = useMemo(
    () => (siteRows ?? []).filter((r) => !existingAddrKeys.has(normalizeAddress(r.address))).length,
    [siteRows, existingAddrKeys],
  );

  const previewRows = previewOpen ? buildPreview() : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trello Integration"
        subtitle="Import properties from a Trello board or a prepared export file — matched to your company website."
      />

      {connection?.isConnected && (
        <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div className="text-sm text-emerald-800">
            Connected to board <strong>{connection.boardName}</strong>
            {connection.lastSyncAt && (
              <span className="text-emerald-600"> · last sync {formatDate(connection.lastSyncAt)}</span>
            )}
          </div>
          <Badge label="Connected" className="bg-emerald-100 text-emerald-700" />
        </div>
      )}

      <Card>
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">
            Import from a Trello export file — matched to elevatereg.com
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Uses a prepared JSON export that contains only the Trello properties also listed on your
            company website. No API key needed.
          </p>
        </div>
        <div className="px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => void handleSiteFile(e)}
                disabled={siteParsing}
              />
              {siteParsing ? "Reading file…" : "Choose import file"}
            </label>
            <span className="text-xs text-slate-400">e.g. DispoFlow-Import.json</span>
          </div>
          {siteError && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
              {siteError}
            </p>
          )}
          {siteResult && (
            <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
              Imported {siteResult.created} new properties · {siteResult.updated} updated ·{" "}
              {siteResult.skipped} skipped
            </p>
          )}
        </div>
      </Card>

      {siteRows && (
        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">
              Preview — {siteRows.length} properties from the company website
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {siteNewCount} new · {siteRows.length - siteNewCount} already in your database (they
              will be updated, not duplicated).
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5 px-4 py-3">
            {Object.entries(siteStatusCounts).map(([status, count]) => (
              <span
                key={status}
                className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
              >
                {status}: {count}
              </span>
            ))}
          </div>
          <div className="max-h-80 overflow-auto">
            <table className="min-w-full text-xs">
              <thead className="sticky top-0 bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2">City</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Trello list</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {siteRows.slice(0, 100).map((r, i) => (
                  <tr key={`${r.trelloUrl || r.address}-${i}`}>
                    <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                    <td className="px-3 py-2 font-medium text-slate-700">{r.address}</td>
                    <td className="px-3 py-2 text-slate-500">{r.city}</td>
                    <td className="px-3 py-2 text-slate-500">{r.status}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {r.askingPrice ? `$${r.askingPrice.toLocaleString("en-US")}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-400">{r.trelloList}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {siteRows.length > 100 && (
              <p className="px-3 py-2 text-xs text-slate-400">
                …and {siteRows.length - 100} more
              </p>
            )}
          </div>
          <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3">
            <Button onClick={handleSiteImport} disabled={siteImporting}>
              {siteImporting ? "Importing…" : `Import ${siteRows.length} properties`}
            </Button>
            <Button variant="secondary" onClick={() => setSiteRows(null)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      <Card>
        <div className="border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-800">2. API credentials</h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Get your key at{" "}
            <a
              href="https://trello.com/app-key"
              target="_blank"
              rel="noreferrer"
              className="text-blue-600 underline"
            >
              trello.com/app-key
            </a>
            , then generate a token below it. Stored only in this browser.
          </p>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <Field label="API Key">
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="paste API key"
            />
          </Field>
          <Field label="Token">
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="paste token"
              type="password"
            />
          </Field>
        </div>
        <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3">
          <Button onClick={handleSaveCreds}>{credsSaved ? "Update credentials" : "Save credentials"}</Button>
          {credsSaved && <Button variant="secondary" onClick={() => void fetchBoards()}>Refresh boards</Button>}
        </div>
      </Card>

      {error && (
        <p className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800">{error}</p>
      )}

      {credsSaved && (
        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">3. Select board</h2>
            <p className="mt-0.5 text-xs text-slate-400">Pick the board that holds your properties.</p>
          </div>
          {loading && !boards.length ? (
            <p className="px-4 py-6 text-sm text-slate-400">Loading boards…</p>
          ) : boards.length === 0 ? (
            <EmptyState
              title="No boards found"
              body="Make sure your API key and token are correct, then refresh."
            />
          ) : (
            <div className="divide-y divide-slate-100">
              {boards.map((b) => (
                <button
                  key={b.id}
                  onClick={() => void handleSelectBoard(b.id)}
                  className={`flex w-full items-center justify-between px-4 py-3 text-left hover:bg-slate-50 ${
                    selectedBoard === b.id ? "bg-blue-50" : ""
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium text-slate-800">{b.name}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{b.url}</p>
                  </div>
                  {selectedBoard === b.id && <Badge label="Selected" className="bg-blue-100 text-blue-700" />}
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {selectedBoard && lists.length > 0 && (
        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">4. Map pipeline stages</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Match each Trello list (column) to a property status. {cards.length} cards found.
            </p>
          </div>
          <div className="divide-y divide-slate-100">
            {lists.map((l) => (
              <div key={l.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-800">{l.name}</p>
                  <p className="text-xs text-slate-400">
                    {cards.filter((c) => c.idList === l.id).length} cards
                  </p>
                </div>
                <Select
                  value={listMappings[l.id] || "Available"}
                  onChange={(e) =>
                    setListMappings((prev) => ({ ...prev, [l.id]: e.target.value }))
                  }
                  className="w-48"
                >
                  {db.settings.propertyStatuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 border-t border-slate-100 px-4 py-3">
            <Button onClick={saveConnection}>Save mapping</Button>
            <Button variant="secondary" onClick={() => setPreviewOpen((v) => !v)}>
              {previewOpen ? "Hide preview" : "Preview import"}
            </Button>
            <Button onClick={() => void handleImport()} disabled={importing || !connection?.isConnected}>
              {importing ? "Importing…" : `Import ${cards.length} properties`}
            </Button>
          </div>
        </Card>
      )}

      {importResult && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Imported: {importResult.newCount} new · {importResult.updatedCount} updated · {importResult.skippedCount} skipped
        </div>
      )}

      {previewOpen && previewRows.length > 0 && (
        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Preview ({previewRows.length} rows)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 text-left text-slate-500">
                <tr>
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">Card</th>
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2">City</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">ARV</th>
                  <th className="px-3 py-2">Photos</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {previewRows.map((r) => (
                  <tr key={r.cardId}>
                    <td className="px-3 py-2 text-slate-400">{r._i}</td>
                    <td className="max-w-[200px] truncate px-3 py-2">{r.name}</td>
                    <td className="px-3 py-2">{r.address}</td>
                    <td className="px-3 py-2">{r.city}</td>
                    <td className="px-3 py-2">{r.status}</td>
                    <td className="px-3 py-2">{r.askingPrice != null ? `$${r.askingPrice.toLocaleString()}` : "—"}</td>
                    <td className="px-3 py-2">{r.arv != null ? `$${r.arv.toLocaleString()}` : "—"}</td>
                    <td className="px-3 py-2">{r.photos.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
