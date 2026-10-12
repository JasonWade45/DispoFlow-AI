"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { isSyncDue, runElevateRegSync, formatSyncSummary, formatLastSync, getLastSync, type SyncProgress } from "@/lib/sync"

const PHASE_LABEL: Record<SyncProgress["phase"], string> = {
  listing: "Fetching listing pages…",
  importing: "Importing new properties…",
  enriching: "Enriching ARV & comps…",
  done: "Done",
}

export default function SyncBanner() {
  const [visible, setVisible] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState("")
  const [progress, setProgress] = useState<SyncProgress | null>(null)
  const [isError, setIsError] = useState(false)
  const started = useRef(false)

  const runSync = useCallback(async () => {
    setSyncing(true)
    setIsError(false)
    try {
      const result = await runElevateRegSync(setProgress)
      setMessage(formatSyncSummary(result))
      if (result.imported > 0) {
        window.dispatchEvent(new Event("dispoflow:synced"))
      }
    } catch (e) {
      setIsError(true)
      setMessage(e instanceof Error ? e.message : "Sync failed")
    } finally {
      setSyncing(false)
      setProgress(null)
    }
  }, [])

  useEffect(() => {
    if (started.current) return
    started.current = true
    const onSyncNow = () => {
      setVisible(true)
      void runSync()
    }
    window.addEventListener("dispoflow:sync-now", onSyncNow)
    const due = isSyncDue()
    if (due) {
      const t = window.setTimeout(() => {
        setVisible(true)
        setMessage(`Last sync: ${formatLastSync(getLastSync())}. Checking for new properties…`)
        void runSync()
      }, 0)
      const interval = window.setInterval(() => {
        if (isSyncDue()) {
          setVisible(true)
          void runSync()
        }
      }, 6 * 60 * 60 * 1000)
      return () => {
        window.clearTimeout(t)
        window.clearInterval(interval)
        window.removeEventListener("dispoflow:sync-now", onSyncNow)
      }
    }
    const interval = window.setInterval(() => {
      if (isSyncDue()) {
        setVisible(true)
        void runSync()
      }
    }, 6 * 60 * 60 * 1000)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener("dispoflow:sync-now", onSyncNow)
    }
  }, [runSync])

  if (!visible) return null

  const pct =
    progress && progress.total > 0 && progress.phase !== "listing" && progress.phase !== "done"
      ? Math.round((progress.done / progress.total) * 100)
      : null

  return (
    <div
      className={
        "mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm " +
        (isError
          ? "border-rose-200 bg-rose-50 text-rose-800"
          : "border-indigo-200 bg-indigo-50 text-indigo-800")
      }
    >
      <div className="flex items-center gap-2">
        {syncing ? (
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-indigo-300 border-t-indigo-600" />
        ) : (
          <svg className="shrink-0" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 11-3-6.7L21 8M21 3v5h-5" />
          </svg>
        )}
        <span>
          {syncing && progress
            ? `${PHASE_LABEL[progress.phase]}${pct !== null ? ` ${progress.done}/${progress.total}` : ""}`
            : message}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {!syncing && (
          <button
            onClick={() => void runSync()}
            className="rounded-lg border border-indigo-200 bg-white px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-50"
          >
            Sync now
          </button>
        )}
        <button
          onClick={() => setVisible(false)}
          className="rounded-md p-1 text-indigo-400 hover:bg-indigo-100 hover:text-indigo-600"
          aria-label="Dismiss"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  )
}
