'use client'

import { useSyncExternalStore, useState, useEffect } from 'react'
import type { DB, Session, User } from '@/types'
import { createSeed } from './seed-work'

const serverDb = createSeed()
const serverSession: Session = { userId: null, user: null }

let db = serverDb
let session: Session = serverSession
let hydrated = false

function hydrate(): void {
  if (hydrated || typeof window === 'undefined') return
  hydrated = true
  try {
    const rawDb = window.localStorage.getItem('dispoflow_db_v1')
    if (rawDb) {
      const parsed = JSON.parse(rawDb)
      if (parsed && parsed.version === 1 && Array.isArray(parsed.properties)) {
        db = parsed
      }
    }
    const rawSession = window.localStorage.getItem('dispoflow_session_v1')
    if (rawSession) {
      const parsed = JSON.parse(rawSession)
      if (parsed && typeof parsed.userId === 'string') {
        // Find user in db
        const user = (parsed as any).user || null
        session = { userId: parsed.userId, user }
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
  const { useSyncExternalStore } = require('react')
  return useSyncExternalStore(subscribe, getSnapshot, getServerDb)
}

export const useDB = useDb

export function useSession() {
  const { useSyncExternalStore } = require('react')
  return useSyncExternalStore(subscribe, getSessionSnapshot, getServerSession)
}

export function useLoading() {
  const [loading, setLoading] = require('react').useState(true)
  require('react').useEffect(() => {
    hydrate()
    setLoading(false)
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

function mutate(fn: (draft: any) => any) {
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
  db = require('./seed-work').createSeed()
  emit()
}

export function applyDb(next: any) {
  mutate(() => next)
}

export function updateDb(fn: (draft: any) => any) {
  mutate(fn)
}

export function DBProvider({ children }: { children: React.ReactNode }) {
  return children
}