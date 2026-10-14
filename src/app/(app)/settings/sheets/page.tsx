"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDb } from "@/lib/store";
import { updateDb } from "@/lib/store";
import { purgeSheetImport } from "@/lib/actions";
import { detectPotentialDuplicates, type DB } from "@/lib/actions";
import { importDispoData, type DispoImportPayload } from "@/lib/import-dispo";
import type { ColumnMapping, SheetConnection } from "@/types";
import { uid } from "@/lib/format";
import { LOGICAL_FIELDS, autoMap, buildRecords, detectGroupedRows, indexToColumnLetter, looksLikeStreetAddress, mappingColumnIndex } from "@/lib/sheet-mapping";
import { toColumnMappings, pickSampleRows, mergeMappings } from "@/lib/ai/column-map";
import {
  formatSheetLastSync,
  formatSheetSyncSummary,
  runSheetSync,
  type SheetSyncProgress,
} from "@/lib/sheet-sync";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Select,
} from "@/components/ui";

export default function GoogleSheetsPage() {
  const db = useDb();
  const [connecting, setConnecting] = useState(false);
  const [, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [spreadsheets, setSpreadsheets] = useState<Array<{ id: string; name: string }>>([]);
  const [worksheets, setWorksheets] = useState<Array<{ sheetId: number; title: string; rowCount?: number; columnCount?: number }>>([]);
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState("");
  const [selectedWorksheet, setSelectedWorksheet] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SheetSyncProgress | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [purgeResult, setPurgeResult] = useState<string | null>(null);
  const [dispoResult, setDispoResult] = useState<string | null>(null);
  const [importingDispo, setImportingDispo] = useState(false);
  const [aiMapping, setAiMapping] = useState(false);
  const [aiMapNote, setAiMapNote] = useState<string | null>(null);
  const [dataQualityReview, setDataQualityReview] = useState(false);
  const [potentialDuplicates, setPotentialDuplicates] = useState<
    Array<{
      buyerId: string
      candidateBuyerId: string
      confidence: number
      evidence: Array<{ field: string; existing: string; candidate: string }>
    }>
  >([]);

  const connection = db.sheetConnections[0];
  const showPicker = authorized || Boolean(connection?.isConnected);

  function buildInspectRange(
    title: string,
    wsList: Array<{ title: string; rowCount?: number; columnCount?: number }> = worksheets,
  ): string {
    const ws = wsList.find((w) => w.title === title);
    const colCount = Math.min(Math.max(ws?.columnCount ?? 26, 26), 60);
    const rowCount = Math.min(Math.max(ws?.rowCount ?? 100, 100), 500);
    return `${title}!A1:${indexToColumnLetter(colCount - 1)}${rowCount}`;
  }

  const fetchSpreadsheets = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/sheets/spreadsheets");
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "not_configured") {
          setError("Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment.");
        } else if (data.error === "not_authorized") {
          setAuthorized(false);
        } else {
          setError(data.message || data.error || "Failed to load spreadsheets");
        }
        return;
      }
      setSpreadsheets(data.spreadsheets ?? []);
      setAuthorized(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  const hydratedConn = useRef(false);
  useEffect(() => {
    const t = window.setTimeout(() => {
      void fetchSpreadsheets();
    }, 0);
    return () => window.clearTimeout(t);
  }, [fetchSpreadsheets]);

  useEffect(() => {
    const c = db.sheetConnections[0];
    if (!c?.spreadsheetId || hydratedConn.current) return;
    hydratedConn.current = true;
    const t = window.setTimeout(() => {
      setSelectedSpreadsheet(c.spreadsheetId);
      if (!c.worksheetName) return;
      setSelectedWorksheet(c.worksheetName);
      if (c.columnMappings.length > 0) setMappings(c.columnMappings);
      void (async () => {
        try {
          const res = await fetch(`/api/sheets/worksheets/${encodeURIComponent(c.spreadsheetId)}`);
          const data = await res.json();
          const wsList = data.worksheets ?? [];
          if (res.ok) setWorksheets(wsList);
          const insp = await fetch("/api/sheets/inspect", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              spreadsheetId: c.spreadsheetId,
              range: buildInspectRange(c.worksheetName, wsList),
            }),
          });
          const inspData = await insp.json();
          if (insp.ok) {
            const h = inspData.headers ?? [];
            const r = inspData.rows ?? [];
            setHeaders(h);
            setRows(r);
            if (c.columnMappings.length === 0) {
              setMappings(await runAiMapping(h, r));
            }
          }
        } catch {
          // ignore hydration errors — user can reselect manually
        }
      })();
    }, 0);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection?.id]);

  const groupedRows = useMemo(() => {
    if (headers.length === 0 || rows.length === 0) return false;
    return detectGroupedRows(headers, rows, mappings);
  }, [headers, rows, mappings]);

  useEffect(() => {
    if (db.buyers.length > 1) {
      const duplicates = detectPotentialDuplicates(db);
      setPotentialDuplicates(
        duplicates.filter((d) => d.confidence >= 50)
      );
    }
  }, [db.buyers]);

  async function handleConnect() {
    setConnecting(true);
    try {
      const res = await fetch("/api/sheets/oauth/start?state=settings");
      const data = await res.json();
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setError(data.message || "Failed to start OAuth");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to connect");
    } finally {
      setConnecting(false);
    }
  }

  async function handleSelectSpreadsheet(id: string) {
    setSelectedSpreadsheet(id);
    setSelectedWorksheet("");
    setHeaders([]);
    setRows([]);
    setMappings([]);
    setLoading(true);
    try {
      const res = await fetch(`/api/sheets/worksheets/${id}`);
      const data = await res.json();
      if (res.ok) {
        setWorksheets(data.worksheets ?? []);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectWorksheet(title: string) {
    setSelectedWorksheet(title);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sheets/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetId: selectedSpreadsheet, range: buildInspectRange(title) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || "Failed to read worksheet");
        return;
      }
      setHeaders(data.headers ?? []);
      setRows(data.rows ?? []);
      const h = data.headers ?? [];
      const r = data.rows ?? [];
      setMappings(await runAiMapping(h, r));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read worksheet");
    } finally {
      setLoading(false);
    }
  }

  async function runAiMapping(h: string[], r: string[][]): Promise<ColumnMapping[]> {
    setAiMapping(true);
    setAiMapNote(null);
    try {
      const res = await fetch("/api/ai/map-columns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ headers: h, sampleRows: pickSampleRows(r) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAiMapNote(
          res.status === 503
            ? "AI mapping unavailable (no GROQ_API_KEY) — used header-name matching instead."
            : `AI mapping failed: ${data.error || res.status} — used header-name matching instead.`,
        );
        return autoMap(h);
      }
      const aiMappings = toColumnMappings(data.mapping ?? {}, h);
      if (aiMappings.length === 0) {
        setAiMapNote(`AI returned no usable columns — used header-name matching instead.${data.notes ? ` ${data.notes}` : ""}`);
        return autoMap(h);
      }
      if (data.addressValid) {
        setAiMapNote(
          `AI mapped ${aiMappings.length} fields from sample rows${data.notes ? ` — ${data.notes}` : ""}.`,
        );
        return aiMappings;
      }
      const merged = mergeMappings(autoMap(h), aiMappings);
      setAiMapNote(
        `AI mapped ${aiMappings.length} fields but could NOT find a street-address column — ${data.notes || "no column contained addresses like '123 Main St'."} Pick "Property Address" manually below (header-name matches were kept for the rest).`,
      );
      return merged;
    } catch (e) {
      setAiMapNote(
        `AI mapping failed: ${e instanceof Error ? e.message : "network error"} — used header-name matching instead.`,
      );
      return autoMap(h);
    } finally {
      setAiMapping(false);
    }
  }

  function updateMapping(logicalField: string, columnIndex: number | null) {
    setMappings((prev) => {
      const filtered = prev.filter((m) => m.logicalField !== logicalField);
      if (columnIndex === null) return filtered;
      return [
        ...filtered,
        {
          logicalField,
          columnLetter: indexToColumnLetter(columnIndex),
          headerName: headers[columnIndex],
          source: "sheet",
        },
      ];
    });
  }

  function getMapping(logicalField: string): ColumnMapping | undefined {
    return mappings.find((m) => m.logicalField === logicalField);
  }

  function getColumnIndex(logicalField: string): number {
    const m = getMapping(logicalField);
    if (!m) return -1;
    return mappingColumnIndex(headers, m);
  }

  function buildConnection(): SheetConnection {
    const ts = new Date().toISOString();
    return {
      id: connection?.id ?? uid("sc_"),
      orgId: db.organization.id,
      spreadsheetId: selectedSpreadsheet || connection?.spreadsheetId || "",
      spreadsheetName: spreadsheets.find((s) => s.id === selectedSpreadsheet)?.name ?? connection?.spreadsheetName ?? "",
      worksheetName: selectedWorksheet || connection?.worksheetName || "",
      isConnected: true,
      lastSyncAt: connection?.lastSyncAt ?? null,
      lastSyncStatus: connection?.lastSyncStatus ?? "never",
      lastSyncError: connection?.lastSyncError ?? null,
      columnMappings: mappings,
      groupedRows,
      createdAt: connection?.createdAt ?? ts,
      updatedAt: ts,
    };
  }

  function saveConnection() {
    const conn = buildConnection();
    updateDb((d) => ({
      ...d,
      sheetConnections: [conn],
    }));
  }

  function buildPreviewRows() {
    if (getColumnIndex("address") < 0) return [];
    const recs = buildRecords(headers, rows, mappings, 2, { carryAddress: groupedRows });
    return recs
      .filter((r) => {
        if (!looksLikeStreetAddress(r.address)) return false;
        if (!r.carried) return true;
        return Object.entries(r).some(
          ([k, v]) => k !== "_row" && k !== "address" && k !== "carried" && v,
        );
      })
      .slice(0, 20);
  }

  async function handleImport() {
    setImporting(true);
    setError(null);
    setImportResult(null);
    try {
      const conn = buildConnection();
      updateDb((d) => ({
        ...d,
        sheetConnections: [conn],
      }));
      const result = await runSheetSync(conn, setSyncProgress);
      if (result.error) {
        setError(result.error);
      } else {
        setImportResult(formatSheetSyncSummary(result));
      }
      setPreviewOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setImporting(false);
      setSyncProgress(null);
    }
  }

  function handlePurge() {
    if (!window.confirm("Remove all properties, buyers, and links that were imported from Google Sheets? This cannot be undone.")) {
      return;
    }
    const counts = purgeSheetImport();
    setPurgeResult(
      `Removed ${counts.properties} properties, ${counts.buyers} buyers, ${counts.relationships} links, ${counts.tasks} tasks, ${counts.offers} offers.`,
    );
    setImportResult(null);
  }

  async function handleDispoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (
      !window.confirm(
        "Replace ALL existing properties, buyers, links, and offers with this Dispo Sheet export? This cannot be undone.",
      )
    ) {
      return;
    }
    setImportingDispo(true);
    setDispoResult(null);
    try {
      const text = await file.text();
      const payload = JSON.parse(text) as DispoImportPayload;
      if (!Array.isArray(payload.properties)) {
        throw new Error("File does not look like a Dispo Sheet export (missing properties array).");
      }
      const r = importDispoData(payload, { replace: true });
      setDispoResult(
        `Imported ${r.properties} properties, ${r.buyers} buyers, ${r.relationships} links, ${r.offers} offers. Old data was replaced.`,
      );
    } catch (err) {
      setDispoResult(`Import failed: ${err instanceof Error ? err.message : "unknown error"}`);
    } finally {
      setImportingDispo(false);
    }
  }

  const previewRows = buildPreviewRows();

  return (
    <div>
      <PageHeader
        title="Google Sheets Integration"
        subtitle="Connect a Google Sheet to import and sync property data"
        actions={
          showPicker ? (
            <Button variant="secondary" onClick={() => void fetchSpreadsheets()}>
              Refresh
            </Button>
          ) : (
            <Button onClick={handleConnect} disabled={connecting}>
              {connecting ? "Connecting…" : "Connect Google Account"}
            </Button>
          )
        }
      />

      {error && (
        <Card className="mb-5 border-rose-200 bg-rose-50">
          <p className="px-4 py-3 text-sm text-rose-800">{error}</p>
        </Card>
      )}

      {importResult && (
        <Card className="mb-5 border-emerald-200 bg-emerald-50">
          <p className="px-4 py-3 text-sm text-emerald-800">{importResult}</p>
        </Card>
      )}

      {purgeResult && (
        <Card className="mb-5 border-amber-200 bg-amber-50">
          <p className="px-4 py-3 text-sm text-amber-800">{purgeResult}</p>
        </Card>
      )}

      {!showPicker ? (
        <Card>
          <EmptyState
            title="Google Sheets not connected"
            body="Connect your Google account to import properties from a spreadsheet. You'll need GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET set in your environment. See SETUP.md for instructions."
            action={<Button onClick={handleConnect}>Connect Google Account</Button>}
          />
        </Card>
      ) : (
        <div className="space-y-5">
          <Card>
            <div className="border-b border-slate-100 px-4 py-3">
              <h2 className="text-sm font-semibold text-slate-800">Select Spreadsheet & Worksheet</h2>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <Field label="Spreadsheet">
                <Select
                  value={selectedSpreadsheet}
                  onChange={(e) => void handleSelectSpreadsheet(e.target.value)}
                >
                  <option value="">— Select a spreadsheet —</option>
                  {spreadsheets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Worksheet">
                <Select
                  value={selectedWorksheet}
                  onChange={(e) => void handleSelectWorksheet(e.target.value)}
                  disabled={!selectedSpreadsheet}
                >
                  <option value="">— Select a worksheet —</option>
                  {worksheets.map((w) => (
                    <option key={w.sheetId} value={w.title}>
                      {w.title}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          {headers.length > 0 && (
            <Card>
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-800">Column Mapping</h2>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">
                    {mappings.length} of {LOGICAL_FIELDS.length} fields mapped
                  </span>
                  <Button
                    variant="secondary"
                    disabled={aiMapping}
                    onClick={() => {
                      void runAiMapping(headers, rows).then(setMappings);
                    }}
                  >
                    {aiMapping ? "AI mapping…" : "Map with AI"}
                  </Button>
                </div>
              </div>
              <div className="p-4">
                <p className="mb-4 text-sm text-slate-500">
                  Map your spreadsheet columns to DispoFlow fields. The AI reads a sample of the actual
                  rows to tell property addresses apart from status/text columns — adjust anything it
                  gets wrong.
                </p>
                {aiMapNote && (
                  <p className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-800">
                    {aiMapNote}
                  </p>
                )}
                {groupedRows && (
                  <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                    Grouped layout detected: rows that don&apos;t have their own street address will
                    inherit the address from the property row above them (each property header row is
                    followed by its buyer rows).
                  </p>
                )}
                {dataQualityReview && (
                  <Card>
                    <div className="p-4">
                      <h3 className="font-semibold mb-3">Data Quality Review</h3>
                      <p className="text-sm text-slate-500 mb-3">
                        Potential buyer duplicates detected. Review and merge or keep separate.
                      </p>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-200">
                              <th className="px-2 py-2">Existing Buyer</th>
                              <th className="px-2 py-2">Candidate</th>
                              <th className="px-2 py-2">Confidence</th>
                              <th className="px-2 py-2">Evidence</th>
                              <th className="px-2 py-2">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {potentialDuplicates.map((dup) => (
                              <tr key={`${dup.buyerId}-${dup.candidateBuyerId}`} className="border-b border-slate-100">
                                <td className="px-2 py-2">
                                  {db.buyers.map((b) => b.id === dup.buyerId ? b.fullName : "").filter((x) => x)[0] || "—"}
                                </td>
                                <td className="px-2 py-2">
                                  {db.buyers.map((b) => b.id === dup.candidateBuyerId ? b.fullName : "").filter((x) => x)[0] || "—"}
                                </td>
                                <td className="px-2 py-2">
                                  {dup.confidence}%
                                </td>
                                <td className="px-2 py-2">
                                  {dup.evidence.map((e) => `${e.field}: ${e.existing} → ${e.candidate}`).join(" | ")}
                                </td>
                                <td className="px-2 py-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => mergeBuyers(dup.buyerId, dup.candidateBuyerId)}
                                  >
                                    Merge
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setDataQualityReview(false)}
                                  >
                                    Close
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <Button
                        onClick={() => setDataQualityReview(false)}
                        className="mt-3 w-full"
                        disabled={potentialDuplicates.length === 0}
                      >
                        Close Review
                      </Button>
                    </div>
                  </Card>
                )}
                <div className="grid gap-3 sm:grid-cols-2">
                  {LOGICAL_FIELDS.map((field) => {
                    const mappedIdx = getColumnIndex(field.key);
                    return (
                      <div key={field.key} className="flex items-center gap-2">
                        <span className="w-48 shrink-0 text-sm text-slate-700">
                          {field.label}
                          {field.required && <span className="ml-1 text-rose-500">*</span>}
                        </span>
                        <Select
                          value={mappedIdx >= 0 ? String(mappedIdx) : ""}
                          onChange={(e) =>
                            updateMapping(field.key, e.target.value === "" ? null : Number(e.target.value))
                          }
                          className="flex-1"
                        >
                          <option value="">— Not mapped —</option>
                          {headers.map((h, idx) => (
                            <option key={idx} value={idx}>
                              {h || `Column ${idx + 1}`}
                            </option>
                          ))}
                        </Select>
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
          )}

          {headers.length > 0 && (
            <Card>
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-800">Preview ({rows.length} rows)</h2>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setPreviewOpen(!previewOpen)}>
                    {previewOpen ? "Hide Preview" : "Show Preview"}
                  </Button>
                  <Button onClick={saveConnection}>Save Mapping</Button>
                  <Button onClick={() => void handleImport()} disabled={importing || getColumnIndex("address") < 0}>
                    {importing
                      ? syncProgress && syncProgress.phase !== "done"
                        ? syncProgress.phase === "reading"
                          ? "Reading sheet…"
                          : `Applying ${syncProgress.done}/${syncProgress.total}…`
                        : "Syncing…"
                      : "Sync Now"}
                  </Button>
                </div>
              </div>
              {previewOpen && (
                <div className="overflow-x-auto p-4">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-left uppercase tracking-wide text-slate-500">
                        <th className="px-2 py-2">Row</th>
                        <th className="px-2 py-2">Address</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Price</th>
                        <th className="px-2 py-2">ARV</th>
                        <th className="px-2 py-2">Buyer</th>
                        <th className="px-2 py-2">Notes</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {previewRows.map((r) => (
                        <tr key={r._row}>
                          <td className="px-2 py-2 text-slate-400">{r._row}</td>
                          <td className="px-2 py-2 text-slate-800">{r.address || "—"}</td>
                          <td className="px-2 py-2 text-slate-600">{r.status || "—"}</td>
                          <td className="px-2 py-2 text-slate-600">{r.askingPrice || "—"}</td>
                          <td className="px-2 py-2 text-slate-600">{r.arv || "—"}</td>
                          <td className="px-2 py-2 text-slate-600">{r.buyerName || "—"}</td>
                          <td className="max-w-[200px] truncate px-2 py-2 text-slate-500">{r.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}

          {connection && (
            <Card>
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-800">Sync Status</h2>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last Sync</p>
                  <p className="mt-1 text-sm text-slate-700">{formatSheetLastSync(connection.lastSyncAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</p>
                  <div className="mt-1">
                    <Badge label={connection.lastSyncStatus} />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Connected To</p>
                  <p className="mt-1 text-sm text-slate-700">
                    {connection.spreadsheetName}
                    {connection.worksheetName ? ` · ${connection.worksheetName}` : ""}
                  </p>
                </div>
              </div>
              {connection.lastSyncError && (
                <p className="border-t border-rose-100 px-4 py-3 text-sm text-rose-700">
                  {connection.lastSyncError}
                </p>
              )}
              <p className="border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
                Auto-sync runs every 5 minutes while the app is open — changes in the Google Sheet are applied to the system automatically. The sheet itself is never modified (read-only access).
              </p>
              <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3">
                <p className="text-xs text-slate-500">Imported bad rows? Remove everything that came from this sheet.</p>
                <Button variant="secondary" onClick={handlePurge}>
                  Remove Imported Data
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      <div className="mt-6">
        <Card>
          <div className="border-b border-slate-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-slate-800">Import Dispo Sheet (JSON export)</h2>
          </div>
          <div className="px-4 py-3">
            <p className="text-xs text-slate-500">
              Upload the JSON export of the Dispo Sheet property sheet. This replaces all existing
              properties, buyers, links, and offers.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
                <input type="file" accept=".json" className="hidden" onChange={(e) => void handleDispoFile(e)} disabled={importingDispo} />
                {importingDispo ? "Importing…" : "Choose JSON file"}
              </label>
              {dispoResult && (
                <p className="text-xs text-slate-600">{dispoResult}</p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
