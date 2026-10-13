"use client";

import { useCallback, useEffect, useState } from "react";
import { useDb } from "@/lib/store";
import { updateDb } from "@/lib/store";
import type { ColumnMapping, SheetConnection } from "@/types";
import { uid } from "@/lib/format";
import { LOGICAL_FIELDS, autoMap } from "@/lib/sheet-mapping";
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
  const [worksheets, setWorksheets] = useState<Array<{ sheetId: number; title: string }>>([]);
  const [selectedSpreadsheet, setSelectedSpreadsheet] = useState("");
  const [selectedWorksheet, setSelectedWorksheet] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncProgress, setSyncProgress] = useState<SheetSyncProgress | null>(null);
  const [importResult, setImportResult] = useState<string | null>(null);

  const connection = db.sheetConnections[0];

  const fetchSpreadsheets = useCallback(async () => {
    setError(null);
    try {
      const res = await fetch("/api/sheets/spreadsheets");
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "not_configured") {
          setError("Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your environment.");
        } else if (data.error === "not_authorized") {
          setError("Not authorized. Click Connect to authorize Google Sheets access.");
        } else {
          setError(data.message || data.error || "Failed to load spreadsheets");
        }
        return;
      }
      setSpreadsheets(data.spreadsheets ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  const isConnected = connection?.isConnected;
  useEffect(() => {
    if (isConnected) {
      const t = window.setTimeout(() => {
        void fetchSpreadsheets();
      }, 0);
      return () => window.clearTimeout(t);
    }
  }, [isConnected, fetchSpreadsheets]);

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
        body: JSON.stringify({ spreadsheetId: selectedSpreadsheet, range: `${title}!A1:Z100` }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || "Failed to read worksheet");
        return;
      }
      setHeaders(data.headers ?? []);
      setRows(data.rows ?? []);
      setMappings(autoMap(data.headers ?? []));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to read worksheet");
    } finally {
      setLoading(false);
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
          columnLetter: String.fromCharCode(65 + columnIndex),
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
    return headers.indexOf(m.headerName);
  }

  function buildConnection(): SheetConnection {
    const ts = new Date().toISOString();
    return {
      id: connection?.id ?? uid("sc_"),
      orgId: db.organization.id,
      spreadsheetId: selectedSpreadsheet,
      spreadsheetName: spreadsheets.find((s) => s.id === selectedSpreadsheet)?.name ?? connection?.spreadsheetName ?? "",
      worksheetName: selectedWorksheet || connection?.worksheetName || "",
      isConnected: true,
      lastSyncAt: connection?.lastSyncAt ?? null,
      lastSyncStatus: connection?.lastSyncStatus ?? "never",
      lastSyncError: connection?.lastSyncError ?? null,
      columnMappings: mappings,
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
    const addrIdx = getColumnIndex("address");
    if (addrIdx < 0) return [];
    return rows.slice(0, 20).map((row, i) => {
      const obj: Record<string, string> = { _row: String(i + 2) };
      for (const field of LOGICAL_FIELDS) {
        const idx = getColumnIndex(field.key);
        obj[field.key] = idx >= 0 ? (row[idx] ?? "") : "";
      }
      return obj;
    });
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

  const previewRows = buildPreviewRows();

  return (
    <div>
      <PageHeader
        title="Google Sheets Integration"
        subtitle="Connect a Google Sheet to import and sync property data"
        actions={
          connection?.isConnected ? (
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

      {!connection?.isConnected ? (
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
                <span className="text-xs text-slate-400">
                  {mappings.length} of {LOGICAL_FIELDS.length} fields mapped
                </span>
              </div>
              <div className="p-4">
                <p className="mb-4 text-sm text-slate-500">
                  Map your spreadsheet columns to DispoFlow fields. Auto-mapping has been applied based on header names — adjust as needed.
                </p>
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
          </Card>
        </div>
      )}
    </div>
  );
}
