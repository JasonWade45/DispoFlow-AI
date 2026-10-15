"use client"

import { getDb, updateDb } from "@/lib/store"
import { normalizeAddress } from "@/lib/sync"
import type { Buyer, BuyerProperty, DB, Interaction, Offer, Property, Task } from "@/types"

export interface MergeSummary {
  propertiesMerged: number
  buyersMerged: number
  relationshipsMerged: number
}

function filledStr(v: string | null | undefined): boolean {
  return typeof v === "string" && v.trim().length > 0
}

function filledNum(v: number | null | undefined): boolean {
  return typeof v === "number" && Number.isFinite(v)
}

function mergePropertyField<T extends Property>(keep: T, dup: T): T {
  const out: Property = { ...keep }
  const s = out as unknown as Record<string, unknown>
  const d = dup as unknown as Record<string, unknown>
  const fillStr = (k: string) => {
    if (!filledStr(s[k] as string) && filledStr(d[k] as string)) s[k] = d[k]
  }
  const fillNum = (k: string) => {
    if (!filledNum(s[k] as number) && filledNum(d[k] as number)) s[k] = d[k]
  }
  for (const k of [
    "city", "state", "zip", "accessType", "propertyType", "bedrooms", "bathrooms",
    "sqft", "lotSize", "yearBuilt", "listingUrl", "photosUrl", "notes", "sourceWebsite",
    "sourcePropertyId", "sourceRowId",
  ]) fillStr(k)
  for (const k of ["askingPrice", "arv", "estimatedRepairs", "assignmentPrice"]) fillNum(k)
  if (Array.isArray(d.photos) && Array.isArray(out.photos)) {
    out.photos = [...new Set([...out.photos, ...d.photos])].slice(0, 20)
  }
  if (!out.firstImportedAt && dup.firstImportedAt) out.firstImportedAt = dup.firstImportedAt
  if (!out.lastSyncedAt && dup.lastSyncedAt) out.lastSyncedAt = dup.lastSyncedAt
  if (!out.marketingStartedAt && dup.marketingStartedAt) out.marketingStartedAt = dup.marketingStartedAt
  if (!out.expectedClosingDate && dup.expectedClosingDate) out.expectedClosingDate = dup.expectedClosingDate
  if (!filledStr(out.status) && filledStr(dup.status)) out.status = dup.status
  out.updatedAt = new Date().toISOString()
  return out as T
}

function mergeBuyerField<T extends Buyer>(keep: T, dup: T): T {
  const out: Buyer = { ...keep }
  const s = out as unknown as Record<string, unknown>
  const d = dup as unknown as Record<string, unknown>
  for (const k of ["companyName", "phone", "email", "notes"]) {
    if (!filledStr(s[k] as string) && filledStr(d[k] as string)) s[k] = d[k]
  }
  if (!out.preferredContactMethod && dup.preferredContactMethod) out.preferredContactMethod = dup.preferredContactMethod
  if (Array.isArray(dup.preferredMarkets)) {
    out.preferredMarkets = [...new Set([...out.preferredMarkets, ...dup.preferredMarkets])]
  }
  if (Array.isArray(dup.propertyTypes)) {
    out.propertyTypes = [...new Set([...out.propertyTypes, ...dup.propertyTypes])]
  }
  if (!filledNum(out.budgetMin) && filledNum(dup.budgetMin)) out.budgetMin = dup.budgetMin
  if (!filledNum(out.budgetMax) && filledNum(dup.budgetMax)) out.budgetMax = dup.budgetMax
  out.updatedAt = new Date().toISOString()
  return out as T
}

function computeBuyerConfidence(a: Buyer, b: Buyer): number {
  let score = 0
  const maxScore = 4 // phone, email, companyName, fullName
  if (a.phone && b.phone && a.phone.replace(/[^0-9+]/g, "") === b.phone.replace(/[^0-9+]/g, "")) score += 1
  if (a.email && b.email && a.email.toLowerCase() === b.email.toLowerCase()) score += 1
  if (a.companyName && b.companyName && a.companyName.toLowerCase() === b.companyName.toLowerCase()) score += 1
  if (a.fullName && b.fullName && a.fullName.toLowerCase() === b.fullName.toLowerCase()) score += 1
  return Math.round((score / maxScore) * 100)
}

export function mergeBuyers(buyerIdA: string, buyerIdB: string, threshold: number = 95): { merged: boolean; confidence: number; buyer: Buyer; reason: string } {
  const db = getDb()
  const a = buyerById(db, buyerIdA)
  const b = buyerById(db, buyerIdB)
  if (!a || !b) return { merged: false, confidence: 0, buyer: a || b || { id: "", orgId: "", fullName: "", companyName: "", phone: "", email: "", preferredContactMethod: "", preferredMarkets: [], propertyTypes: [], budgetMin: null, budgetMax: null, status: "Active", notes: "", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: "", } as Buyer, reason: "Buyer not found" }

  const confidence = computeBuyerConfidence(a, b)
  if (confidence < threshold) return { merged: false, confidence, buyer: a, reason: `Confidence ${confidence}% is below threshold ${threshold}%` }

  const merged: Buyer = mergeBuyerField(a, b)
  const dbUpdated = updateDb((db) => {
    const idx = db.buyers.findIndex((b) => b.id === buyerIdB)
    if (idx >= 0) {
      db.buyers[idx] = { ...merged, updatedAt: new Date().toISOString() }
    }
    return db
  })
  return { merged: true, confidence, buyer: dbUpdated.buyers.find((b) => b.id === buyerIdA) || merged, reason: `Merged with confidence ${confidence}%` }
}

function remapIds<T extends { buyerId: string | null; propertyId: string | null }>(
  rows: T[],
  buyerMap: Map<string, string>,
  propertyMap: Map<string, string>,
): T[] {
  return rows.map((r) => ({
    ...r,
    buyerId: r.buyerId ? (buyerMap.get(r.buyerId) ?? r.buyerId) : null,
    propertyId: r.propertyId ? (propertyMap.get(r.propertyId) ?? r.propertyId) : null,
  }))
}

function dedupeRelationships(rels: BuyerProperty[]): BuyerProperty[] {
  const byPair = new Map<string, BuyerProperty>()
  for (const r of rels) {
    const key = `${r.buyerId}::${r.propertyId}`
    const existing = byPair.get(key)
    if (!existing) {
      byPair.set(key, r)
      continue
    }
    const keep = existing.updatedAt >= r.updatedAt ? existing : r
    const other = keep === existing ? r : existing
    const merged: BuyerProperty = {
      ...keep,
      nextFollowUpDate: keep.nextFollowUpDate ?? other.nextFollowUpDate,
      nextAction: keep.nextAction || other.nextAction,
      interestNotes: [keep.interestNotes, other.interestNotes].filter(Boolean).join("\n"),
      lastContactedAt: keep.lastContactedAt ?? other.lastContactedAt,
      lastMessageSentAt: keep.lastMessageSentAt ?? other.lastMessageSentAt,
      lastCallAt: keep.lastCallAt ?? other.lastCallAt,
      lastInteractionDate: keep.lastInteractionDate ?? other.lastInteractionDate,
    }
    byPair.set(key, merged)
  }
  return [...byPair.values()]
}

function propertyGroups(db: DB): Map<string, Property[]> {
  const groups = new Map<string, Property[]>()
  for (const p of db.properties) {
    const key = normalizeAddress(p.address)
    if (!key) continue
    const arr = groups.get(key) ?? []
    arr.push(p)
    groups.set(key, arr)
  }
  return groups
}

function buyerKey(b: Buyer): string | null {
  const phone = b.phone.replace(/[^0-9+]/g, "")
  if (phone.length >= 7) return `phone:${phone}`
  if (filledStr(b.email)) return `email:${b.email.trim().toLowerCase()}`
  if (filledStr(b.fullName)) return `name:${b.fullName.trim().toLowerCase()}`
  return null
}

function filledFieldCount(row: Record<string, unknown>): number {
  let n = 0
  for (const v of Object.values(row)) {
    if (Array.isArray(v)) {
      if (v.length > 0) n += 1
    } else if (typeof v === "string" && v.trim().length > 0) {
      n += 1
    } else if (typeof v === "number" && Number.isFinite(v)) {
      n += 1
    }
  }
  return n
}

function pickKeep<T extends { createdAt: string; id: string }>(list: T[]): T {
  return [...list].sort((a, b) => {
    const scoreDiff = filledFieldCount(b as unknown as Record<string, unknown>) - filledFieldCount(a as unknown as Record<string, unknown>)
    if (scoreDiff !== 0) return scoreDiff
    const createdDiff = a.createdAt.localeCompare(b.createdAt)
    if (createdDiff !== 0) return createdDiff
    return a.id.localeCompare(b.id)
  })[0]
}

export function autoMergeDuplicates(): MergeSummary {
  const summary: MergeSummary = { propertiesMerged: 0, buyersMerged: 0, relationshipsMerged: 0 }

  updateDb((db) => {
    const propertyMap = new Map<string, string>()
    const buyerMap = new Map<string, string>()
    let properties = db.properties
    let buyers = db.buyers

    for (const [, list] of propertyGroups(db)) {
      if (list.length < 2) continue
      let keep = pickKeep(list)
      for (const dup of list) {
        if (dup.id === keep.id) continue
        keep = mergePropertyField(keep, dup)
        propertyMap.set(dup.id, keep.id)
        summary.propertiesMerged += 1
      }
      const keepId = keep.id
      properties = properties.map((p) => (p.id === keepId ? keep : p))
    }
    if (propertyMap.size > 0) {
      properties = properties.filter((p) => !propertyMap.has(p.id))
    }

    const buyerGroups = new Map<string, Buyer[]>()
    for (const b of buyers) {
      const key = buyerKey(b)
      if (!key) continue
      const arr = buyerGroups.get(key) ?? []
      arr.push(b)
      buyerGroups.set(key, arr)
    }
    for (const [, list] of buyerGroups) {
      if (list.length < 2) continue
      let keep = pickKeep(list)
      for (const dup of list) {
        if (dup.id === keep.id) continue
        keep = mergeBuyerField(keep, dup)
        buyerMap.set(dup.id, keep.id)
        summary.buyersMerged += 1
      }
      const keepId = keep.id
      buyers = buyers.map((b) => (b.id === keepId ? keep : b))
    }
    if (buyerMap.size > 0) {
      buyers = buyers.filter((b) => !buyerMap.has(b.id))
    }

    let relationships = remapIds(db.relationships, buyerMap, propertyMap)
    const before = relationships.length
    relationships = dedupeRelationships(relationships)
    summary.relationshipsMerged = before - relationships.length

    const remappedTasks = remapIds(db.tasks, buyerMap, propertyMap)
    const openKeys = new Map<string, string>()
    for (const t of remappedTasks) {
      if (t.status === "Completed" || t.status === "Cancelled") continue
      const key = `${t.buyerId ?? ""}::${t.propertyId ?? ""}::${t.taskType}::${t.dueDate ?? ""}`
      const existing = openKeys.get(key)
      if (!existing || t.id > existing) openKeys.set(key, t.id)
    }
    const tasks: Task[] = remappedTasks.map((t) => {
      if (t.status === "Completed" || t.status === "Cancelled") return t
      const key = `${t.buyerId ?? ""}::${t.propertyId ?? ""}::${t.taskType}::${t.dueDate ?? ""}`
      if (openKeys.get(key) !== t.id) {
        return { ...t, status: "Cancelled" as const, completionNotes: "Auto-cancelled duplicate task." }
      }
      return t
    })

    const offers: Offer[] = remapIds(db.offers, buyerMap, propertyMap)
    const interactions: Interaction[] = remapIds(db.interactions, buyerMap, propertyMap)

    return { ...db, properties, buyers, relationships, tasks, offers, interactions }
  })

  return summary
}

export function duplicateOverview(input?: DB): {
  propertyGroups: number
  buyerGroups: number
  total: number
} {
  const db = input ?? getDb()
  let dupePropGroups = 0
  for (const [, list] of propertyGroups(db)) {
    if (list.length > 1) dupePropGroups += 1
  }
  let dupeBuyerGroups = 0
  const buyerGroupsMap = new Map<string, number>()
  for (const b of db.buyers) {
    const key = buyerKey(b)
    if (!key) continue
    buyerGroupsMap.set(key, (buyerGroupsMap.get(key) ?? 0) + 1)
  }
  for (const [, n] of buyerGroupsMap) {
    if (n > 1) dupeBuyerGroups += 1
  }
  return { propertyGroups: dupePropGroups, buyerGroups: dupeBuyerGroups, total: dupePropGroups + dupeBuyerGroups }
}
