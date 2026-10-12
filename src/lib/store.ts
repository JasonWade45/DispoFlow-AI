'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import type { DB, Property, BuyerProperty, Task, Session, User } from '@/types'
import { createSeed } from './seed-work'

const serverDb = createSeed()
const serverSession: Session = { userId: null, user: null }

let db = serverDb
let session: Session = serverSession
let hydrated = false

interface StoredSession {
  userId: string | null
  user?: User | null
}

function migrateV1toV2(parsed: Partial<DB> & Record<string, unknown>): DB {
  const base = createSeed()
  return {
    ...base,
    ...parsed,
    version: 2,
    properties: ((parsed.properties as Property[] | undefined) || []).map((p) => ({
      propertyType: '',
      bedrooms: '',
      bathrooms: '',
      sqft: '',
      lotSize: '',
      yearBuilt: '',
      listingUrl: '',
      photosUrl: '',
      sourceWebsite: '',
      sourcePropertyId: '',
      sourceRowId: '',
      firstImportedAt: null,
      lastSyncedAt: null,
      syncStatus: 'never',
      ...p,
    })),
    relationships: ((parsed.relationships as BuyerProperty[] | undefined) || []).map((r) => ({
      lastContactedAt: null,
      lastMessageSentAt: null,
      lastCallAt: null,
      syncStatus: 'never',
      sourceRowId: '',
      ...r,
    })),
    tasks: ((parsed.tasks as Task[] | undefined) || []).map((t) => ({
      completedVia: t.status === 'Completed' ? 'complete' : t.status === 'Cancelled' ? 'cancelled' : null,
      sentAt: null,
      ...t,
    })),
    sheetConnections: parsed.sheetConnections || [],
    importHistory: parsed.importHistory || [],
    syncJobs: parsed.syncJobs || [],
  }
}

function hydrate(): void {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  try {
    const rawDb = window.localStorage.getItem('dispoflow_db_v1')
    if (rawDb) {
      const parsed = JSON.parse(rawDb)
      if (parsed && Array.isArray(parsed.properties)) {
        if (parsed.version === 2) {
          db = parsed
        } else {
          db = migrateV1toV2(parsed)
        }
      }
    }
    const rawSession = window.localStorage.getItem('dispoflow_session_v1')
    if (rawSession) {
      const parsed: StoredSession = JSON.parse(rawSession)
      if (parsed && typeof parsed.userId === 'string') {
        session = { userId: parsed.userId, user: parsed.user || null }
      }
    }
  } catch {
    // corrupted storage — fall back to seed
  }
}

const listeners = new Set<() => void>()

function emit(): void {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('dispoflow_db_v1', JSON.stringify(db))
      localStorage.setItem('dispoflow_session_v1', JSON.stringify(session))
    } catch {
      // storage full / unavailable — keep in-memory state
    }
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