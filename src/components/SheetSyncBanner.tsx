"use client"

import { useCallback, useEffect, useRef, useState } from "react";
import { getDb, useDb } from "@/lib/store";
import {
  formatSheetLastSync,
  formatSheetSyncSummary,
  isSheetSyncDue,
  runSheetSync,
  type SheetSyncProgress,
} from "@/lib/sheet-sync";

const PHASE_LABEL: Record<SheetSyncProgress["phase"], string> = {
  reading: "Reading Google Sheet…",
  applying: "Applying changes…",
  extracting: "Extracting access info…",
  done: "Done",
};

const CHECK_INTERVAL_MS = 60 * 1000;

export default function SheetSyncBanner() {
  const db = useDb();
  const conn = db.sheetConnections[0];
  const [visible, setVisible] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState<SheetSyncProgress | null>(null);
  const [isError, setIsError] = useState(false);
  const [needsReauth, setNeedsReauth] = useState(false);
  const running = useRef(false);

  const getConn = useCallback(() => getDb().sheetConnections[0], []);

  const runSync = useCallback(async () => {
    const c = getConn();
    if (!c || !c.isConnected || !c.worksheetName || running.current) return;
    running.current = true;
    setSyncing(true);
    setIsError(false);
    setVisible(true);
    try {
      const result = await runSheetSync(c, setProgress);
      if (result.error) {
        setIsError(true);
        setMessage(result.error);
        setNeedsReauth(Boolean(result.reauthRequired));
      } else {
        setMessage(formatSheetSyncSummary(result));
        setNeedsReauth(false);
      }
    } catch (e) {
      setIsError(true);
      setMessage(e instanceof Error ? e.message : "Sheet sync failed");
    } finally {
      setSyncing(false);
      setProgress(null);
      running.current = false;
    }
  }, [getConn]);

  const active = Boolean(conn?.isConnected && conn.worksheetName);

  useEffect(() => {
    if (!active) return;

    const onSyncNow = () => {
      void runSync();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && isSheetSyncDue(getConn())) {
        void runSync();
      }
    };

    window.addEventListener("dispoflow:sheet-sync-now", onSyncNow);
    document.addEventListener("visibilitychange", onVisible);

    const timeout = window.setTimeout(() => {
      if (isSheetSyncDue(getConn())) {
        setMessage(`Last sheet sync: ${formatSheetLastSync(getConn()?.lastSyncAt ?? null)}. Checking for changes…`);
        void runSync();
      }
    }, 0);

    const interval = window.setInterval(() => {
      if (isSheetSyncDue(getConn())) {
        void runSync();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      window.removeEventListener("dispoflow:sheet-sync-now", onSyncNow);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [active, runSync, getConn]);

  if (!active || !visible) return null;

  const pct =
    progress && progress.total > 0 && progress.phase !== "done"
      ? Math.round((progress.done / progress.total) * 100)
      : null;

  return (
    <div
      className={
        "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm " +
        (isError
          ? needsReauth
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : "border-rose-200 bg-rose-50 text-rose-800"
          : "border-emerald-200 bg-emerald-50 text-emerald-800")
      }
    >
      <div className="flex items-center gap-2">
        {syncing ? (
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-emerald-300 border-t-emerald-600" />
        ) : (
          <svg
            className="shrink-0"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M18 20V10M12 20V4M6 20v-6" />
          </svg>
        )}
        <span>
          {syncing && progress
            ? `${PHASE_LABEL[progress.phase]}${pct !== null ? ` ${progress.done}/${progress.total}` : ""}`
            : message}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {!syncing && needsReauth && (
          <button
            onClick={() => {
              window.location.href = "/settings/sheets";
            }}
            className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-50"
          >
            Reconnect Google
          </button>
        )}
        {!syncing && (
          <button
            onClick={() => void runSync()}
            className="rounded-lg border border-emerald-200 bg-white px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
          >
            Sync sheet now
          </button>
        )}
        <button
          onClick={() => setVisible(false)}
          className="rounded-md p-1 text-emerald-400 hover:bg-emerald-100 hover:text-emerald-600"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
