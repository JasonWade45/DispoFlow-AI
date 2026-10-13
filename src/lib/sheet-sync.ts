"use client"

import {
  addBuyer,
  addImportHistory,
  addOffer,
  addProperty,
  cancelTask,
  changePropertyStatus,
  completeTask,
  createTask,
  linkBuyerToProperty,
  updateBuyer,
  updateOffer,
  updateProperty,
  updateRelationship,
  updateTask,
} from "@/lib/actions"
import { parseMoney, todayIso, uid } from "@/lib/format"
import { OPEN_OFFER_STATUSES } from "@/lib/selectors"
import { normalizeAddress, parseAddressParts } from "@/lib/sync"
import { getDb, updateDb } from "@/lib/store"
import {
  buildRecords,
  columnLetterToIndex,
  indexToColumnLetter,
  type SheetRecord,
} from "@/lib/sheet-mapping"
import type { Buyer, ColumnMapping, Property, SheetConnection } from "@/types"

export const SHEET_SYNC_INTERVAL_MS = 5 * 60 * 1000

export interface SheetSyncProgress {
  phase: "reading" | "applying" | "done"
  done: number
  total: number
}

export interface SheetApplyStats {
  created: number
  updated: number
  unchanged: number
  skipped: number
  missing: number
  buyersTouched: number
  offersTouched: number
  tasksTouched: number
}

export interface SheetSyncResult extends SheetApplyStats {
  rowsRead: number
  error: string | null
}

const EMPTY_STATS: SheetApplyStats = {
  created: 0,
  updated: 0,
  unchanged: 0,
  skipped: 0,
  missing: 0,
  buyersTouched: 0,
  offersTouched: 0,
  tasksTouched: 0,
}

function resolveUserId(): string {
  if (typeof window === "undefined") return "u_owner"
  try {
    const raw = window.localStorage.getItem("dispoflow_session_v2")
    if (raw) {
      const parsed = JSON.parse(raw) as { userId?: string | null }
      if (parsed?.userId) return parsed.userId
    }
  } catch {
    // fall through
  }
  return "u_owner"
}

function mappedSet(mappings: ColumnMapping[]): Set<string> {
  return new Set(mappings.map((m) => m.logicalField))
}

function cell(record: SheetRecord, field: string, mapped: Set<string>): string {
  if (!mapped.has(field)) return ""
  const v = (record as unknown as Record<string, string>)[field]
  return typeof v === "string" ? v.trim() : ""
}

export function parseSheetDate(raw: string): string | null {
  const s = (raw || "").trim()
  if (!s) return null
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/)
  if (dmy) {
    const first = Number(dmy[1])
    const second = Number(dmy[2])
    const year = dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]
    let day: number
    let month: number
    if (first > 12) {
      day = first
      month = second
    } else if (second > 12) {
      month = first
      day = second
    } else {
      month = first
      day = second
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) return null
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
  }
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function parseSheetTimestamp(raw: string): string | null {
  const dateOnly = parseSheetDate(raw)
  if (!dateOnly) return null
  const s = (raw || "").trim()
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    const d = new Date(s)
    if (!Number.isNaN(d.getTime())) return d.toISOString()
  }
  return `${dateOnly}T00:00:00.000Z`
}

function normalizedPhone(v: string): string {
  return (v || "").replace(/[^0-9+]/g, "")
}

function findBuyerFor(
  buyers: Buyer[],
  name: string,
  phone: string,
  email: string,
): Buyer | undefined {
  const np = normalizedPhone(phone)
  if (np) {
    const byPhone = buyers.find((b) => normalizedPhone(b.phone) === np)
    if (byPhone) return byPhone
  }
  if (email) {
    const byEmail = buyers.find((b) => b.email.toLowerCase() === email.toLowerCase())
    if (byEmail) return byEmail
  }
  if (name) {
    const byName = buyers.find((b) => b.fullName.toLowerCase() === name.toLowerCase())
    if (byName) return byName
  }
  return undefined
}

const FOLLOW_UP_STATUSES = new Set(["needs scheduling", "scheduled"])

export function applySheetRecords(
  records: SheetRecord[],
  mappings: ColumnMapping[],
  userId: string,
): SheetApplyStats {
  const mapped = mappedSet(mappings)
  const stats: SheetApplyStats = { ...EMPTY_STATS }

  for (const record of records) {
    const addressRaw = cell(record, "address", mapped)
    if (!addressRaw) {
      stats.skipped += 1
      continue
    }

    const parts = parseAddressParts(addressRaw)
    const normAddr = normalizeAddress(parts?.address ?? addressRaw)

    let db = getDb()
    let property: Property | undefined = db.properties.find(
      (p) => normalizeAddress(p.address) === normAddr,
    )

    const listingUrl = cell(record, "listingUrl", mapped)
    if (!property && listingUrl) {
      const target = listingUrl.replace(/\/$/, "")
      property = db.properties.find(
        (p) => p.listingUrl && p.listingUrl.replace(/\/$/, "") === target,
      )
    }

    const rowIdRaw = cell(record, "sourceRowId", mapped) || String(record._row)
    if (!property && /^-?\d+$/.test(rowIdRaw)) {
      property = db.properties.find(
        (p) =>
          p.sourceRowId === rowIdRaw &&
          (p.sourceWebsite === "google-sheets" || p.sourceWebsite === ""),
      )
    }

    if (!property) {
      createPropertyFromRecord(record, parts, addressRaw, userId)
      stats.created += 1
      db = getDb()
      property =
        db.properties.find((p) => p.sourceRowId === String(record._row)) ??
        db.properties.find((p) => normalizeAddress(p.address) === normAddr)
      if (!property) continue
    } else {
      const changed = updatePropertyFromRecord(property, record, addressRaw, parts, mapped, userId)
      if (changed) stats.updated += 1
      else stats.unchanged += 1
    }

    db = getDb()
    const buyerId = syncBuyerFromRecord(db, record, mapped, userId, stats)
    if (buyerId) {
      syncOffer(db, property.id, buyerId, record, mapped, userId, stats)
      syncRelationship(db, property.id, buyerId, record, mapped, userId, stats)
    }
    syncFollowUpTask(db, property.id, buyerId, record, addressRaw, mapped, userId, stats)
  }

  stats.missing = countMissingFromSheet(getDb(), records)
  return stats
}

function createPropertyFromRecord(
  record: SheetRecord,
  parts: { address: string; city: string; state: string; zip: string } | null,
  addressRaw: string,
  userId: string,
): void {
  const ts = new Date().toISOString()
  addProperty({
    address: parts?.address ?? addressRaw,
    city: parts?.city ?? "",
    state: parts?.state ?? "",
    zip: parts?.zip ?? "",
    status: record.status?.trim() || "Available",
    askingPrice: parseMoney(record.askingPrice || ""),
    arv: parseMoney(record.arv || ""),
    estimatedRepairs: null,
    assignmentPrice: null,
    expectedClosingDate: null,
    notes: record.notes?.trim() || "",
    userId,
    listingUrl: record.listingUrl?.trim() || "",
    photosUrl: record.photosUrl?.trim() || "",
    photos: record.photosUrl?.trim() ? [record.photosUrl.trim()] : [],
    sourceWebsite: "google-sheets",
    sourceRowId: String(record._row),
    firstImportedAt: ts,
    lastSyncedAt: ts,
    syncStatus: "synced",
  })
}

function updatePropertyFromRecord(
  property: Property,
  record: SheetRecord,
  addressRaw: string,
  parts: { address: string; city: string; state: string; zip: string } | null,
  mapped: Set<string>,
  userId: string,
): boolean {
  const ts = new Date().toISOString()
  const patch: Partial<Property> = {
    lastSyncedAt: ts,
    syncStatus: "synced",
  }
  let changed = false
  let statusChange: string | null = null

  if (parts) {
    if (
      parts.address !== property.address ||
      parts.city !== property.city ||
      parts.state !== property.state ||
      parts.zip !== property.zip
    ) {
      patch.address = parts.address
      patch.city = parts.city
      patch.state = parts.state
      patch.zip = parts.zip
      changed = true
    }
  } else if (mapped.has("address") && addressRaw !== property.address) {
    patch.address = addressRaw
    changed = true
  }

  const statusVal = cell(record, "status", mapped)
  if (statusVal && statusVal !== property.status) {
    statusChange = statusVal
    changed = true
  }

  const asking = cell(record, "askingPrice", mapped)
  if (asking) {
    const v = parseMoney(asking)
    if (v !== null && v !== property.askingPrice) {
      patch.askingPrice = v
      changed = true
    }
  }

  const arv = cell(record, "arv", mapped)
  if (arv) {
    const v = parseMoney(arv)
    if (v !== null && v !== property.arv) {
      patch.arv = v
      changed = true
    }
  }

  const listingUrl = cell(record, "listingUrl", mapped)
  if (listingUrl && listingUrl !== property.listingUrl) {
    patch.listingUrl = listingUrl
    changed = true
  }

  const photosUrl = cell(record, "photosUrl", mapped)
  if (photosUrl && photosUrl !== property.photosUrl) {
    patch.photosUrl = photosUrl
    if (!property.photos.includes(photosUrl)) {
      patch.photos = [photosUrl, ...property.photos].slice(0, 20)
    }
    changed = true
  }

  const notes = cell(record, "notes", mapped)
  if (notes && notes !== property.notes) {
    patch.notes = notes
    changed = true
  }

  if (property.sourceRowId !== String(record._row)) {
    patch.sourceRowId = String(record._row)
    changed = true
  }
  if (!property.sourceWebsite) {
    patch.sourceWebsite = "google-sheets"
    changed = true
  }

  if (changed) {
    updateProperty(property.id, patch)
    if (statusChange) changePropertyStatus(property.id, statusChange, userId)
  }
  return changed
}

function syncBuyerFromRecord(
  db: ReturnType<typeof getDb>,
  record: SheetRecord,
  mapped: Set<string>,
  userId: string,
  stats: SheetApplyStats,
): string | null {
  const name = cell(record, "buyerName", mapped)
  const phone = cell(record, "buyerPhone", mapped)
  const email = cell(record, "buyerEmail", mapped)
  if (!name && !phone && !email) return null

  const existing = findBuyerFor(db.buyers, name, phone, email)
  if (existing) {
    const patch: Partial<Buyer> = {}
    if (name && name !== existing.fullName) patch.fullName = name
    if (phone && phone !== existing.phone) patch.phone = phone
    if (email && email !== existing.email) patch.email = email
    if (Object.keys(patch).length > 0) {
      updateBuyer(existing.id, patch)
      stats.buyersTouched += 1
    }
    return existing.id
  }

  if (!name) return null
  const id = addBuyer({
    fullName: name,
    companyName: "",
    phone,
    email,
    preferredContactMethod: "",
    preferredMarkets: [],
    budgetMin: null,
    budgetMax: null,
    status: "Active",
    notes: "",
    userId,
  })
  stats.buyersTouched += 1
  return id
}

function syncRelationship(
  db: ReturnType<typeof getDb>,
  propertyId: string,
  buyerId: string,
  record: SheetRecord,
  mapped: Set<string>,
  userId: string,
  stats: SheetApplyStats,
): void {
  const interestStatus = cell(record, "interestStatus", mapped)
  const lastContact = cell(record, "lastContactDate", mapped)
  const lastMessage = cell(record, "lastMessageSentDate", mapped)
  const nextFollowUp = cell(record, "nextFollowUpDate", mapped)

  const existing = db.relationships.find(
    (r) => r.buyerId === buyerId && r.propertyId === propertyId,
  )

  if (!existing) {
    linkBuyerToProperty({
      buyerId,
      propertyId,
      interestStatus: interestStatus || "New",
      interestNotes: "",
      assignedUserId: null,
      userId,
    })
    stats.buyersTouched += 1
    const created = getDb().relationships.find(
      (r) => r.buyerId === buyerId && r.propertyId === propertyId,
    )
    if (created) {
      const patch: Record<string, string | null> = {}
      const lc = lastContact ? parseSheetTimestamp(lastContact) : null
      const lm = lastMessage ? parseSheetTimestamp(lastMessage) : null
      const nf = nextFollowUp ? parseSheetDate(nextFollowUp) : null
      if (lc && lc !== created.lastContactedAt) patch.lastContactedAt = lc
      if (lm && lm !== created.lastMessageSentAt) patch.lastMessageSentAt = lm
      if (nf && nf !== created.nextFollowUpDate) patch.nextFollowUpDate = nf
      if (Object.keys(patch).length > 0) updateRelationship(created.id, patch)
    }
    return
  }

  const patch: Record<string, string | null> = {}
  if (interestStatus && interestStatus !== existing.interestStatus) {
    patch.interestStatus = interestStatus
  }
  if (lastContact) {
    const iso = parseSheetTimestamp(lastContact)
    if (iso && iso !== existing.lastContactedAt) patch.lastContactedAt = iso
  }
  if (lastMessage) {
    const iso = parseSheetTimestamp(lastMessage)
    if (iso && iso !== existing.lastMessageSentAt) patch.lastMessageSentAt = iso
  }
  if (nextFollowUp) {
    const iso = parseSheetDate(nextFollowUp)
    if (iso && iso !== existing.nextFollowUpDate) patch.nextFollowUpDate = iso
  }
  if (Object.keys(patch).length > 0) {
    updateRelationship(existing.id, patch)
    stats.buyersTouched += 1
  }
}

function syncOffer(
  db: ReturnType<typeof getDb>,
  propertyId: string,
  buyerId: string | null,
  record: SheetRecord,
  mapped: Set<string>,
  userId: string,
  stats: SheetApplyStats,
): void {
  const raw = cell(record, "offerAmount", mapped)
  if (!raw || !buyerId) return
  const amount = parseMoney(raw)
  if (amount === null || amount <= 0) return

  const open = db.offers.find(
    (o) =>
      o.buyerId === buyerId &&
      o.propertyId === propertyId &&
      OPEN_OFFER_STATUSES.includes(o.status),
  )
  if (open) {
    if (open.amount !== amount) {
      updateOffer(open.id, { amount }, userId)
      stats.offersTouched += 1
    }
    return
  }
  addOffer({
    buyerId,
    propertyId,
    amount,
    offerDate: todayIso(),
    terms: "",
    expiresAt: null,
    status: "Submitted",
    negotiationNotes: "",
    nextAction: "",
    userId,
  })
  stats.offersTouched += 1
}

function syncFollowUpTask(
  db: ReturnType<typeof getDb>,
  propertyId: string,
  buyerId: string | null,
  record: SheetRecord,
  addressRaw: string,
  mapped: Set<string>,
  userId: string,
  stats: SheetApplyStats,
): void {
  const rawDate = cell(record, "nextFollowUpDate", mapped)
  const rawStatus = cell(record, "followUpStatus", mapped)
  if (!rawDate && !rawStatus) return

  const dueDate = rawDate ? parseSheetDate(rawDate) : null
  const openTasks = db.tasks.filter(
    (t) =>
      t.propertyId === propertyId &&
      t.status !== "Completed" &&
      t.status !== "Cancelled" &&
      (!buyerId || !t.buyerId || t.buyerId === buyerId),
  )
  const task =
    openTasks.find((t) => t.taskType.toLowerCase().includes("follow")) ?? openTasks[0]

  if (task) {
    const statusLower = rawStatus.toLowerCase()
    if (["completed", "complete", "done"].includes(statusLower)) {
      completeTask(task.id, "Marked complete via Google Sheet sync.", userId)
      stats.tasksTouched += 1
      return
    }
    if (["cancelled", "canceled"].includes(statusLower)) {
      cancelTask(task.id, "Cancelled via Google Sheet sync.")
      stats.tasksTouched += 1
      return
    }
    const patch: Record<string, string> = {}
    if (dueDate && dueDate !== task.dueDate) patch.dueDate = dueDate
    if (FOLLOW_UP_STATUSES.has(statusLower) && rawStatus !== task.status) {
      patch.status = rawStatus
    }
    if (Object.keys(patch).length > 0) {
      updateTask(task.id, patch)
      stats.tasksTouched += 1
    }
    return
  }

  if (!dueDate) return
  createTask({
    buyerId,
    propertyId,
    taskType: "Follow-Up",
    description: `Follow up — ${addressRaw}`,
    dueDate,
    dueTime: null,
    assignedUserId: userId,
    priority: "Medium",
  })
  stats.tasksTouched += 1
}

function countMissingFromSheet(db: ReturnType<typeof getDb>, records: SheetRecord[]): number {
  const addrSet = new Set(
    records.map((r) => {
      const parts = parseAddressParts(r.address)
      return normalizeAddress(parts?.address ?? r.address)
    }),
  )
  const rowSet = new Set(records.map((r) => String(r._row)))
  let missing = 0
  for (const p of db.properties) {
    if (p.sourceWebsite !== "google-sheets") continue
    const inSheet =
      addrSet.has(normalizeAddress(p.address)) ||
      (p.sourceRowId && rowSet.has(p.sourceRowId))
    if (!inSheet) missing += 1
  }
  return missing
}

export async function runSheetSync(
  conn: SheetConnection,
  onProgress?: (p: SheetSyncProgress) => void,
): Promise<SheetSyncResult> {
  const startedAt = new Date().toISOString()
  const result: SheetSyncResult = { ...EMPTY_STATS, rowsRead: 0, error: null }

  try {
    onProgress?.({ phase: "reading", done: 0, total: 0 })

    let rowCount = 1000
    try {
      const metaRes = await fetch(
        `/api/sheets/worksheets/${encodeURIComponent(conn.spreadsheetId)}`,
      )
      const meta = await metaRes.json()
      if (metaRes.ok) {
        const ws = (meta.worksheets ?? []).find(
          (w: { title: string; rowCount?: number }) => w.title === conn.worksheetName,
        )
        if (ws?.rowCount) {
          rowCount = Math.min(Math.max(Number(ws.rowCount) || 1000, 50), 5000)
        }
      }
    } catch {
      // fall back to default rowCount
    }

    const maxColIdx = conn.columnMappings.reduce(
      (max, m) => Math.max(max, columnLetterToIndex(m.columnLetter)),
      25,
    )
    const endCol = indexToColumnLetter(Math.min(Math.max(maxColIdx, 25), 51))
    const range = `${conn.worksheetName}!A1:${endCol}${rowCount}`

    const res = await fetch("/api/sheets/inspect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spreadsheetId: conn.spreadsheetId, range }),
    })
    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.detail || data.error || "Failed to read worksheet")
    }

    const records = buildRecords(data.headers ?? [], data.rows ?? [], conn.columnMappings)
    result.rowsRead = records.length

    onProgress?.({ phase: "applying", done: 0, total: records.length })
    const stats = applySheetRecords(records, conn.columnMappings, resolveUserId())
    Object.assign(result, stats)
    onProgress?.({ phase: "done", done: records.length, total: records.length })
  } catch (e) {
    result.error = e instanceof Error ? e.message : "Sheet sync failed"
  }

  finalizeSheetSync(conn, result, startedAt)
  return result
}

function changedCount(r: SheetApplyStats): number {
  return r.created + r.updated + r.buyersTouched + r.offersTouched + r.tasksTouched
}

function finalizeSheetSync(
  conn: SheetConnection,
  result: SheetSyncResult,
  startedAt: string,
): void {
  const now = new Date().toISOString()
  const changed = changedCount(result)

  updateDb((d) => ({
    ...d,
    sheetConnections: d.sheetConnections.map((c) =>
      c.id === conn.id
        ? {
            ...c,
            lastSyncAt: now,
            lastSyncStatus: result.error ? ("error" as const) : ("synced" as const),
            lastSyncError: result.error,
            updatedAt: now,
          }
        : c,
    ),
    syncJobs: [
      {
        id: uid("sj_"),
        orgId: d.organization.id,
        connectionId: conn.id,
        startedAt,
        completedAt: now,
        status: result.error ? ("error" as const) : ("success" as const),
        pulledCount: result.rowsRead,
        pushedCount: changed,
        errorCount: result.error ? 1 : 0,
        errorMessage: result.error,
      },
      ...d.syncJobs,
    ].slice(0, 50),
  }))

  if (changed > 0 || result.error) {
    addImportHistory({
      source: "google-sheets",
      newCount: result.created,
      updatedCount: result.updated + result.buyersTouched + result.offersTouched + result.tasksTouched,
      skippedCount: result.skipped + result.missing,
      errorCount: result.error ? 1 : 0,
      notes: formatSheetSyncSummary(result),
    })
  }

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("dispoflow:sheet-synced", { detail: result }))
  }
}

export function formatSheetSyncSummary(r: SheetSyncResult): string {
  if (r.error) return `Sheet sync failed: ${r.error}`
  const parts: string[] = []
  if (r.created > 0) parts.push(`+${r.created} new`)
  if (r.updated > 0) parts.push(`${r.updated} updated`)
  if (r.buyersTouched > 0) parts.push(`${r.buyersTouched} buyer/links`)
  if (r.offersTouched > 0) parts.push(`${r.offersTouched} offers`)
  if (r.tasksTouched > 0) parts.push(`${r.tasksTouched} follow-ups`)
  if (parts.length === 0) return `Sheet up to date — ${r.rowsRead} rows checked`
  return `Sheet sync: ${parts.join(" · ")} (${r.rowsRead} rows)`
}

export function formatSheetLastSync(iso: string | null): string {
  if (!iso) return "Never"
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}

export function isSheetSyncDue(conn: SheetConnection | undefined): boolean {
  if (!conn || !conn.isConnected || !conn.spreadsheetId || !conn.worksheetName) return false
  if (!conn.lastSyncAt) return true
  return Date.now() - new Date(conn.lastSyncAt).getTime() > SHEET_SYNC_INTERVAL_MS
}
