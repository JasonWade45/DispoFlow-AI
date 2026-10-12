"use client";

import { useCallback, useEffect, useState } from "react";
import { useDb } from "@/lib/store";
import { updateDb } from "@/lib/store";
import type { ColumnMapping, Property, SheetConnection } from "@/types";
import { formatDate } from "@/lib/format";
import { uid } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  Select,
} from "@/components/ui";

const LOGICAL_FIELDS = [
  { key: "address", label: "Property Address", required: true },
  { key: "status", label: "Property Status" },
  { key: "askingPrice", label: "Asking Price" },
  { key: "arv", label: "ARV" },
  { key: "listingUrl", label: "Property Listing URL" },
  { key: "photosUrl", label: "Property Photos URL" },
  { key: "buyerName", label: "Buyer Name" },
  { key: "buyerPhone", label: "Buyer Phone" },
  { key: "buyerEmail", label: "Buyer Email" },
  { key: "interestStatus", label: "Buyer-Property Interest Status" },
  { key: "offerAmount", label: "Offer Amount" },
  { key: "lastContactDate", label: "Last Contact Date" },
  { key: "lastMessageSentDate", label: "Last Message Sent Date" },
  { key: "nextFollowUpDate", label: "Next Follow-up Date" },
  { key: "followUpStatus", label: "Follow-up Status" },
  { key: "notes", label: "Notes" },
  { key: "sourceRowId", label: "Source Row Identifier" },
  { key: "lastModified", label: "Last Modified Timestamp" },
];

const HEADER_ALIASES: Record<string, string[]> = {
  address: ["address", "property address", "property", "full address", "location"],
  status: ["status", "property status", "stage", "pipeline"],
  askingPrice: ["asking price", "price", "ask", "asking", "list price"],
  arv: ["arv", "after repair value", "after repair", "arv estimate"],
  listingUrl: ["listing url", "listing", "property url", "link", "website"],
  photosUrl: ["photos url", "photos", "pictures", "images", "gallery", "photo"],
  buyerName: ["buyer name", "buyer", "name", "contact name", "full name"],
  buyerPhone: ["buyer phone", "phone", "phone number", "mobile", "cell"],
  buyerEmail: ["buyer email", "email", "email address", "e-mail"],
  interestStatus: ["interest status", "interest", "buyer status", "relationship status"],
  offerAmount: ["offer amount", "offer", "offer price", "submitted offer"],
  lastContactDate: ["last contact date", "last contact", "last touch", "last touch date"],
  lastMessageSentDate: ["last message sent date", "last message", "last message sent", "message date"],
  nextFollowUpDate: ["next follow-up date", "next follow up", "follow up date", "next followup", "due date"],
  followUpStatus: ["follow-up status", "follow up status", "followup status", "task status"],
  notes: ["notes", "notes / last update", "notes/last update", "last update", "comments", "remarks"],
  sourceRowId: ["source row id", "row id", "source id", "id"],
  lastModified: ["last modified", "last modified timestamp", "updated", "modified date"],
};

function autoMap(headers: string[]): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];
  const usedColumns = new Set<number>();

  for (const field of LOGICAL_FIELDS) {
    const aliases = HEADER_ALIASES[field.key] ?? [field.key.toLowerCase()];
    let bestMatch = -1;
    let bestScore = 0;

    headers.forEach((header, idx) => {
      if (usedColumns.has(idx)) return;
      const h = header.toLowerCase().trim();
      for (const alias of aliases) {
        if (h === alias) {
          if (bestScore < 3) {
            bestScore = 3;
            bestMatch = idx;
          }
        } else if (h.includes(alias) || alias.includes(h)) {
          if (bestScore < 2) {
            bestScore = 2;
            bestMatch = idx;
          }
        }
      }
    });

    if (bestMatch >= 0 && bestScore >= 2) {
      usedColumns.add(bestMatch);
      mappings.push({
        logicalField: field.key,
        columnLetter: String.fromCharCode(65 + bestMatch),
        headerName: headers[bestMatch],
        source: "sheet",
      });
    }
  }
  return mappings;
}

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
  const [importResult, setImportResult] = useState<{ newCount: number; updatedCount: number; skippedCount: number } | null>(null);

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

  function saveConnection() {
    const ts = new Date().toISOString();
    const conn: SheetConnection = {
      id: connection?.id ?? uid("sc_"),
      orgId: db.organization.id,
      spreadsheetId: selectedSpreadsheet,
      spreadsheetName: spreadsheets.find((s) => s.id === selectedSpreadsheet)?.name ?? "",
      worksheetName: selectedWorksheet,
      isConnected: true,
      lastSyncAt: connection?.lastSyncAt ?? null,
      lastSyncStatus: connection?.lastSyncStatus ?? "never",
      lastSyncError: null,
      columnMappings: mappings,
      createdAt: connection?.createdAt ?? ts,
      updatedAt: ts,
    };
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
    try {
      const preview = buildPreviewRows();
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
          const existing = existingByAddress.get(key);
          if (existing) {
            updatedCount++;
          } else {
            newCount++;
            const ts = new Date().toISOString();
            newProps.push({
              id: uid("p_"),
              orgId: d.organization.id,
              address: addr,
              city: "",
              state: "",
              zip: "",
              status: row.status || "Available",
              accessType: "",
              askingPrice: row.askingPrice ? Number(String(row.askingPrice).replace(/[^0-9.]/g, "")) || null : null,
              arv: row.arv ? Number(String(row.arv).replace(/[^0-9.]/g, "")) || null : null,
              estimatedRepairs: null,
              assignmentPrice: null,
              marketingStartedAt: null,
              expectedClosingDate: null,
              notes: row.notes || "",
              createdAt: ts,
              updatedAt: ts,
              createdBy: "u_owner",
              propertyType: "",
              bedrooms: "",
              bathrooms: "",
              sqft: "",
              lotSize: "",
              yearBuilt: "",
              listingUrl: row.listingUrl || "",
              photosUrl: row.photosUrl || "",
              photos: row.photosUrl ? [row.photosUrl] : [],
              sourceWebsite: "google-sheets",
              sourcePropertyId: "",
              sourceRowId: row._row,
              firstImportedAt: ts,
              lastSyncedAt: ts,
              syncStatus: "synced",
            });
          }
        }

        return { ...d, properties: [...d.properties, ...newProps] };
      });

      setImportResult({ newCount, updatedCount, skippedCount });
      setPreviewOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
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
          <p className="px-4 py-3 text-sm text-emerald-800">
            Import complete: {importResult.newCount} new, {importResult.updatedCount} updated,{" "}
            {importResult.skippedCount} skipped.
          </p>
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
                    {importing ? "Importing…" : "Import Rows"}
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

          {connection.lastSyncAt && (
            <Card>
              <div className="border-b border-slate-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-slate-800">Sync Status</h2>
              </div>
              <div className="grid gap-4 p-4 sm:grid-cols-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Last Sync</p>
                  <p className="mt-1 text-sm text-slate-700">{formatDate(connection.lastSyncAt)}</p>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Status</p>
                  <div className="mt-1">
                    <Badge label={connection.lastSyncStatus} />
                  </div>
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Connected To</p>
                  <p className="mt-1 text-sm text-slate-700">{connection.spreadsheetName}</p>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
