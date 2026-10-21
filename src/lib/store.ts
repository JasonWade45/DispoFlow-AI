'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { AccessInfoEntry, DB, Property, BuyerProperty, Task, Session, User } from '@/types'
import { cloudStateResponseSchema, storedSessionSchema } from '@/lib/schemas'
import { mergeCloudConflict } from '@/lib/cloud-merge'
import { createSeed } from './seed-work'
import { uid } from './format'

const serverDb = createSeed()
const serverSession: Session = { userId: null, user: null }

let db = serverDb
let session: Session = serverSession
let hydrated = false

// Cloud sync bookkeeping. localStorage stays the fast offline cache; Supabase
// is the durable source of truth so data survives cache clears and follows the
// user across devices.
const DB_KEY = 'dispoflow_db_v2'
const SESSION_KEY = 'dispoflow_session_v2'
const SAVED_AT_KEY = 'dispoflow_db_v2_savedAt'
let localSavedAt = ''
let cloudChecked = false
let suppressCloudSave = false
let cloudSaveTimer: ReturnType<typeof setTimeout> | null = null
// Provenance of `db`'s core collections: only a load that actually came from
// the normalized tables may drive delete-sync on the next save.
let cloudSource: 'tables' | 'blob' = 'blob'
// app_state.updated_at we last observed (GET or a successful PUT). Sent as
// `base` so the server can reject a stale write with 409 instead of letting
// this tab clobber another tab/device's newer save.
let cloudBase = ''
// Consecutive 409s in one save chain; caps the merge-and-retry loop.
let conflictRetries = 0

function migrateV1toV2(parsed: Partial<DB> & Record<string, unknown>): DB {
  const base = createSeed()
  return {
    ...base,
    ...parsed,
    version: 2,
    properties: ((parsed.properties as Property[] | undefined) || []).map((p): Property => ({
      ...{
        propertyType: '',
        bedrooms: '',
        bathrooms: '',
        sqft: '',
        lotSize: '',
        yearBuilt: '',
        listingUrl: '',
        photosUrl: '',
        photos: p.photosUrl ? [p.photosUrl] : [],
        sourceWebsite: '',
        sourcePropertyId: '',
        sourceRowId: '',
        firstImportedAt: null,
        lastSyncedAt: null,
        syncStatus: 'never',
        accessInfo: '',
      },
      ...p,
    })),
    relationships: ((parsed.relationships as BuyerProperty[] | undefined) || []).map((r): BuyerProperty => ({
      ...{
        lastContactedAt: null,
        lastMessageSentAt: null,
        lastCallAt: null,
        syncStatus: 'never',
        sourceRowId: '',
      },
      ...r,
    })),
    tasks: ((parsed.tasks as Task[] | undefined) || []).map((t): Task => ({
      ...{
        completedVia: t.status === 'Completed' ? 'complete' : t.status === 'Cancelled' ? 'cancelled' : null,
        sentAt: null,
      },
      ...t,
    })),
    sheetConnections: parsed.sheetConnections || [],
    trelloConnections: parsed.trelloConnections || [],
    importHistory: parsed.importHistory || [],
    syncJobs: parsed.syncJobs || [],
  }
}

function migrateV2toV3(parsed: DB | (Partial<DB> & Record<string, unknown>)): DB {
  const base: Record<string, unknown> = { ...parsed, version: 3 }
  const existing = (parsed.access_infoTable as AccessInfoEntry[] | undefined) || []
  const accessMap = new Map<string, AccessInfoEntry>(existing.map((e) => [e.propertyId, e]))
  const properties = (parsed.properties as Property[] | undefined) || []
  for (const p of properties) {
    const code = typeof p.accessInfo === 'string' ? p.accessInfo.trim() : ''
    if (code && !accessMap.has(p.id)) {
      accessMap.set(p.id, {
        id: uid(`ai_${p.id}`),
        orgId: p.orgId,
        propertyId: p.id,
        accessCode: code,
        createdAt: p.lastSyncedAt || p.updatedAt || new Date().toISOString(),
        updatedAt: p.lastSyncedAt || p.updatedAt || new Date().toISOString(),
      })
    }
  }
  base.access_infoTable = Array.from(accessMap.values())
  return base as unknown as DB
}

export function cleanupAccessInfo() {
  hydrate()
  const db = getDb()
  let changed = false
  for (const p of db.properties) {
    const zipMatch = p.zip.match(/LOCK BOX IS\s+(\d{1,6})/i)
    if (zipMatch) {
      const accessCode = zipMatch[1]
      const numericZip = p.zip.replace(/\s+LOCK BOX IS.*$/i, '').trim()
      // Update property zip and accessInfo
      const idx = db.properties.findIndex((q) => q.id === p.id)
      if (idx >= 0) {
        db.properties[idx] = { ...db.properties[idx], zip: numericZip, accessInfo: accessCode }
        changed = true
      }
      // Also add to access_infoTable if not already there
      const existing = db.access_infoTable.find((a) => a.propertyId === p.id)
      if (!existing) {
        db.access_infoTable.push({
          id: uid(`ai_${p.id}`),
          orgId: p.orgId,
          propertyId: p.id,
          accessCode,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        changed = true
      }
    }
  }
  if (changed) emit()
  return changed
}

function hydrate(): void {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  try {
    const rawDb = window.localStorage.getItem(DB_KEY)
    if (rawDb) {
      const parsed = JSON.parse(rawDb)
      if (parsed && Array.isArray(parsed.properties)) {
        const version = typeof parsed.version === 'number' ? parsed.version : 1
        if (version === 3) {
          db = migrateV2toV3(parsed)
        } else if (version === 2) {
          db = migrateV2toV3({ ...parsed, trelloConnections: parsed.trelloConnections || [] })
        } else {
          db = migrateV2toV3(migrateV1toV2(parsed))
        }
      }
    }
    localSavedAt = window.localStorage.getItem(SAVED_AT_KEY) || ''
    const rawSession = window.localStorage.getItem(SESSION_KEY)
    if (rawSession) {
      const parsed = storedSessionSchema.safeParse(JSON.parse(rawSession))
      if (parsed.success) {
        session = { userId: parsed.data.userId, user: parsed.data.user ?? null }
      }
    }
  } catch {
    // corrupted storage — fall back to seed
  }
  void syncFromCloud()
}

function normalizeCloudDb(parsed: Record<string, unknown>): DB {
  const version = typeof parsed.version === 'number' ? parsed.version : 1
  if (version === 3) return migrateV2toV3(parsed as unknown as DB)
  if (version === 2) {
    return migrateV2toV3({ ...(parsed as object), trelloConnections: parsed.trelloConnections || [] } as unknown as DB)
  }
  return migrateV2toV3(migrateV1toV2(parsed as Partial<DB> & Record<string, unknown>))
}

async function syncFromCloud(): Promise<void> {
  if (cloudChecked || typeof window === 'undefined') return
  cloudChecked = true
  try {
    const res = await fetch('/api/state')
    if (!res.ok) return
    const parsed = cloudStateResponseSchema.safeParse(await res.json())
    if (!parsed.success) return
    const data = parsed.data
    if (!data.configured || !data.found || !data.db) return
    const cloudAt = data.updatedAt || ''
    // Always re-anchor the save base — even when we keep the local copy —
    // otherwise the next PUT would be rejected as stale by our own server.
    cloudBase = cloudAt
    // Only adopt the cloud copy when it is strictly newer than what we last
    // saved locally; otherwise keep local (it may hold unsynced edits).
    if (cloudAt && localSavedAt && cloudAt <= localSavedAt) return
    db = normalizeCloudDb(data.db)
    cloudSource = data.source === 'tables' ? 'tables' : 'blob'
    localSavedAt = cloudAt
    try {
      window.localStorage.setItem(DB_KEY, JSON.stringify(db))
      window.localStorage.setItem(SAVED_AT_KEY, localSavedAt)
    } catch {
      // storage full — in-memory copy is still updated
    }
    suppressCloudSave = true
    emit()
    suppressCloudSave = false
  } catch {
    // offline / endpoint missing — localStorage remains the source of truth
  }
}

function scheduleCloudSave(isRetry = false): void {
  if (suppressCloudSave || typeof window === 'undefined') return
  if (!isRetry) conflictRetries = 0
  if (cloudSaveTimer) clearTimeout(cloudSaveTimer)
  cloudSaveTimer = setTimeout(() => {
    cloudSaveTimer = null
    void (async () => {
      try {
        const res = await fetch('/api/state', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ db, source: cloudSource, base: cloudBase || undefined }),
        })
        if (res.status === 409) {
          await resolveConflict()
          return
        }
        if (res.ok) {
          conflictRetries = 0
          const payload = (await res.json().catch(() => null)) as { updatedAt?: string | null } | null
          if (payload?.updatedAt) cloudBase = payload.updatedAt
          localSavedAt = new Date().toISOString()
          try {
            window.localStorage.setItem(SAVED_AT_KEY, localSavedAt)
          } catch {
            // ignore
          }
        }
      } catch {
        // offline — next successful emit retries
      }
    })()
  }, 1500)
}

// The server rejected our write because someone (another tab, another device,
// the cron job) saved after our last load. Fetch their copy, merge it with
// ours per entity (newer updatedAt wins), re-anchor the base and retry.
async function resolveConflict(): Promise<void> {
  if (conflictRetries >= 2) {
    // Merge budget exhausted (pathological conflict loop): just re-anchor so
    // the next user edit passes the staleness check, and stop retrying now.
    conflictRetries = 0
    try {
      const res = await fetch('/api/state')
      if (res.ok) {
        const parsed = cloudStateResponseSchema.safeParse(await res.json())
        if (parsed.success && parsed.data.updatedAt) cloudBase = parsed.data.updatedAt
      }
    } catch {
      // offline — base stays; next load re-anchors
    }
    return
  }
  conflictRetries += 1
  try {
    const res = await fetch('/api/state')
    if (!res.ok) return
    const parsed = cloudStateResponseSchema.safeParse(await res.json())
    if (!parsed.success) return
    const data = parsed.data
    if (!data.configured || !data.found || !data.db || !data.updatedAt) return
    db = mergeCloudConflict(db, normalizeCloudDb(data.db))
    cloudBase = data.updatedAt
    cloudSource = data.source === 'tables' ? 'tables' : 'blob'
    localSavedAt = data.updatedAt
    try {
      window.localStorage.setItem(DB_KEY, JSON.stringify(db))
      window.localStorage.setItem(SAVED_AT_KEY, localSavedAt)
    } catch {
      // storage full — in-memory copy is still updated
    }
    suppressCloudSave = true
    emit()
    suppressCloudSave = false
    scheduleCloudSave(true)
  } catch {
    // offline — nothing to merge; next successful emit retries
  }
}

const listeners = new Set<() => void>()

function emit(): void {
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(DB_KEY, JSON.stringify(db))
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
    } catch {
      // storage full / unavailable — keep in-memory state
    }
    scheduleCloudSave()
  }
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void): () => void {
  hydrate()
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot() {
  hydrate()
  return db
}

function getSessionSnapshot() {
  hydrate()
  return session
}

function getServerDb() {
  return serverDb
}

function getServerSession() {
  return serverSession
}

export function useDb() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerDb)
}

export const useDB = useDb

export function useSession() {
  return useSyncExternalStore(subscribe, getSessionSnapshot, getServerSession)
}

export function useLoading() {
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    hydrate()
    const t = window.setTimeout(() => setLoading(false), 0)
    return () => window.clearTimeout(t)
  }, [])
  return loading
}

export function useRefresh() {
  return async () => {}
}

export function getDb() {
  hydrate()
  return db
}

function mutate(fn: (draft: DB) => DB) {
  hydrate()
  db = fn(db)
  emit()
}

export function setSession(userId: string | null, user: User | null = null) {
  hydrate()
  session = { userId, user }
  emit()
}

export function resetDemoData() {
  hydrate()
  db = createSeed()
  emit()
}

export function applyDb(next: DB) {
  mutate(() => next)
}

export function updateDb(fn: (draft: DB) => DB) {
  mutate(fn)
}

export function DBProvider({ children }: { children: React.ReactNode }) {
  return children
}