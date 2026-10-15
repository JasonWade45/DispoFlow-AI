"use client"

import {
  addImportHistory,
} from "@/lib/actions"
import { autoMergeDuplicates } from "@/lib/merge"
import { parseMoney, todayIso, uid } from "@/lib/format"
import { OPEN_OFFER_STATUSES } from "@/lib/selectors"
import { normalizeAddress, parseAddressParts } from "@/lib/sync"
import { updateDb } from "@/lib/store"
import {
  buildRecords,
  columnLetterToIndex,
  indexToColumnLetter,
  type SheetRecord,
} from "@/lib/sheet-mapping"
import type {
  Buyer,
  BuyerProperty,
  ColumnMapping,
  DB,
  Interaction,
  Offer,
  Property,
  SheetConnection,
  Task,
} from "@/types"

export const SHEET_SYNC_INTERVAL_MS = 5 * 60 * 1000

export const PROPERTY_STATUS_VALUES = [
  "Available",
  "Marketing",
  "Offer Received",
  "Under Contract",
  "Pending",
  "Sold",
  "On Hold",
  "Cancelled",
] as const

export function normalizePropertyStatus(raw: string): string | null {
  if (PROPERTY_STATUS_VALUES.includes(raw as any)) return raw
  return null
}

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

function cloneDraft(db: DB): DB {
  return {
    ...db,
    properties: [...db.properties],
    buyers: [...db.buyers],
    relationships: [...db.relationships],
    interactions: [...db.interactions],
    tasks: [...db.tasks],
    offers: [...db.offers],
  }
}

function pushSystemInteraction(
  draft: DB,
  row: Partial<Interaction> & { eventType: Interaction["eventType"]; originalContent: string },
  ts: string,
  userId: string,
): void {
  draft.interactions.push({
    id: uid("i"),
    orgId: draft.organization.id,
    buyerId: null,
    propertyId: null,
    direction: "system",
    occurredAt: ts,
    recordedAt: ts,
    enhancedNotes: "",
    outcome: "",
    potentialOfferAmount: null,
    potentialOfferConfirmed: false,
    nextAction: "",
    missingInfo: [],
    isAiSuggestion: false,
    createdBy: userId,
    createdAt: ts,
    updatedAt: ts,
    ...row,
  })
}

function looksLikeStreetAddress(raw: string): boolean {
  return /^\d+\s+\S/.test(raw.trim())
}

export function applySheetRecordsImpl(
  input: DB,
  records: SheetRecord[],
  mappings: ColumnMapping[],
  userId: string,
): { db: DB; stats: SheetApplyStats } {
  const mapped = mappedSet(mappings)
  const stats: SheetApplyStats = { ...EMPTY_STATS }
  const ts = new Date().toISOString()
  const draft = cloneDraft(input)
  const orgId = draft.organization.id

  for (const record of records) {
    const addressRaw = cell(record, "address", mapped)
    if (!addressRaw || !looksLikeStreetAddress(addressRaw)) {
      stats.skipped += 1
      continue
    }

    const parts = parseAddressParts(addressRaw)
    const normAddr = normalizeAddress(parts?.address ?? addressRaw)

    let pIdx = draft.properties.findIndex((p) => normalizeAddress(p.address) === normAddr)

    const listingUrl = cell(record, "listingUrl", mapped)
    if (pIdx < 0 && listingUrl) {
      const target = listingUrl.replace(/\/$/, "")
      pIdx = draft.properties.findIndex(
        (p) => p.listingUrl && p.listingUrl.replace(/\/$/, "") === target,
      )
    }

    const rowIdRaw = cell(record, "sourceRowId", mapped) || String(record._row)
    if (pIdx < 0 && /^-?\d+$/.test(rowIdRaw)) {
      pIdx = draft.properties.findIndex(
        (p) =>
          p.sourceRowId === rowIdRaw &&
          (p.sourceWebsite === "google-sheets" || p.sourceWebsite === ""),
      )
    }

    let property: Property

    if (pIdx < 0) {
      const status = normalizePropertyStatus(record.status?.trim()) || "Available"
      const photosUrl = record.photosUrl?.trim() || ""
      property = {
        id: uid("p_"),
        orgId,
        address: parts?.address ?? addressRaw,
        city: parts?.city ?? "",
        state: parts?.state ?? "",
        zip: parts?.zip ?? "",
        status,
        accessType: "",
        askingPrice: parseMoney(record.askingPrice || ""),
        arv: parseMoney(record.arv || ""),
        estimatedRepairs: null,
        assignmentPrice: null,
        marketingStartedAt: status === "Marketing" ? ts : null,
        expectedClosingDate: null,
        notes: record.notes?.trim() || "",
        createdAt: ts,
        updatedAt: ts,
        createdBy: userId,
        propertyType: "",
        bedrooms: "",
        bathrooms: "",
        sqft: "",
        lotSize: "",
        yearBuilt: "",
        listingUrl: record.listingUrl?.trim() || "",
        photosUrl,
        photos: photosUrl ? [photosUrl] : [],
        sourceWebsite: "google-sheets",
        sourcePropertyId: "",
        sourceRowId: String(record._row),
        firstImportedAt: ts,
        lastSyncedAt: ts,
        syncStatus: "synced",
      }
      draft.properties.unshift(property)
      stats.created += 1
    } else {
      const existing = draft.properties[pIdx]
      const patch: Partial<Property> = { lastSyncedAt: ts, syncStatus: "synced" }
      let changed = false
      let statusVal: string | null = null

      if (parts) {
        if (
          parts.address !== existing.address ||
          parts.city !== existing.city ||
          parts.state !== existing.state ||
          parts.zip !== existing.zip
        ) {
          patch.address = parts.address
          patch.city = parts.city
          patch.state = parts.state
          patch.zip = parts.zip
          changed = true
        }
      } else if (mapped.has("address") && addressRaw !== existing.address) {
        patch.address = addressRaw
        changed = true
      }

      const sheetStatus = cell(record, "status", mapped)
      const normalizedStatus = normalizePropertyStatus(sheetStatus)
      if (normalizedStatus && normalizedStatus !== existing.status) {
        statusVal = normalizedStatus
        patch.status = normalizedStatus
        patch.marketingStartedAt =
          normalizedStatus === "Marketing" && !existing.marketingStartedAt
            ? ts
            : existing.marketingStartedAt
        changed = true
      }

      const asking = cell(record, "askingPrice", mapped)
      if (asking) {
        const v = parseMoney(asking)
        if (v !== null && v !== existing.askingPrice) {
          patch.askingPrice = v
          changed = true
        }
      }

      const arv = cell(record, "arv", mapped)
      if (arv) {
        const v = parseMoney(arv)
        if (v !== null && v !== existing.arv) {
          patch.arv = v
          changed = true
        }
      }

      const listing = cell(record, "listingUrl", mapped)
      if (listing && listing !== existing.listingUrl) {
        patch.listingUrl = listing
        changed = true
      }

      const photos = cell(record, "photosUrl", mapped)
      if (photos && photos !== existing.photosUrl) {
        patch.photosUrl = photos
        if (!existing.photos.includes(photos)) {
          patch.photos = [photos, ...existing.photos].slice(0, 20)
        }
        changed = true
      }

      const notes = cell(record, "notes", mapped)
      if (notes && notes !== existing.notes) {
        patch.notes = notes
        changed = true
      }

      if (existing.sourceRowId !== String(record._row)) {
        patch.sourceRowId = String(record._row)
        changed = true
      }
      if (!existing.sourceWebsite) {
        patch.sourceWebsite = "google-sheets"
        changed = true
      }

      if (changed) {
        property = { ...existing, ...patch, updatedAt: ts }
        draft.properties[pIdx] = property
        stats.updated += 1

        if (statusVal) {
          pushSystemInteraction(
            draft,
            {
              propertyId: property.id,
              eventType: "Status Changed",
              originalContent: `Property status changed: ${existing.status} → ${statusVal}.`,
            },
            ts,
            userId,
          )
          if (statusVal === "Sold" || statusVal === "Cancelled") {
            draft.tasks = draft.tasks.map((t) =>
              t.propertyId === property.id &&
              t.status !== "Completed" &&
              t.status !== "Cancelled"
                ? {
                    ...t,
                    status: "Cancelled" as const,
                    completionNotes: `Auto-cancelled when property moved to ${statusVal}.`,
                  }
                : t,
            )
          }
        }
      } else {
        property = existing
        stats.unchanged += 1
      }
    }

    const name = cell(record, "buyerName", mapped)
    const phone = cell(record, "buyerPhone", mapped)
    const email = cell(record, "buyerEmail", mapped)
    let buyerId: string | null = null

    if (name || phone || email) {
      const found = findBuyerFor(draft.buyers, name, phone, email)
      if (found) {
        const patch: Partial<Buyer> = {}
        if (name && name !== found.fullName) patch.fullName = name
        if (phone && phone !== found.phone) patch.phone = phone
        if (email && email !== found.email) patch.email = email
        if (Object.keys(patch).length > 0) {
          const idx = draft.buyers.findIndex((b) => b.id === found.id)
          draft.buyers[idx] = { ...found, ...patch, updatedAt: ts }
          stats.buyersTouched += 1
        }
        buyerId = found.id
      } else if (name) {
        const created: Buyer = {
          id: uid("b_"),
          orgId,
          fullName: name,
          companyName: "",
          phone,
          email,
          preferredContactMethod: "",
          preferredMarkets: [],
          propertyTypes: [],
          budgetMin: null,
          budgetMax: null,
          status: "Active",
          notes: "",
          createdAt: ts,
          updatedAt: ts,
          createdBy: userId,
        }
        draft.buyers.unshift(created)
        buyerId = created.id
        stats.buyersTouched += 1
      }
    }

    if (buyerId) {
      const offerRaw = cell(record, "offerAmount", mapped)
      if (offerRaw) {
        const amount = parseMoney(offerRaw)
        if (amount !== null && amount > 0) {
          const openIdx = draft.offers.findIndex(
            (o) =>
              o.buyerId === buyerId &&
              o.propertyId === property.id &&
              OPEN_OFFER_STATUSES.includes(o.status),
          )
          if (openIdx >= 0) {
            const open = draft.offers[openIdx]
            if (open.amount !== amount) {
              draft.offers[openIdx] = { ...open, amount, updatedAt: ts }
              stats.offersTouched += 1
            }
          } else {
            const offer: Offer = {
              id: uid("o_"),
              orgId,
              buyerId,
              propertyId: property.id,
              amount,
              offerDate: todayIso(),
              terms: "",
              expiresAt: null,
              status: "Submitted",
              negotiationNotes: "",
              nextAction: "",
              createdBy: userId,
              createdAt: ts,
              updatedAt: ts,
            }
            draft.offers.unshift(offer)
            const buyer = draft.buyers.find((b) => b.id === buyerId)
            pushSystemInteraction(
              draft,
              {
                buyerId,
                propertyId: property.id,
                eventType: "Offer Created",
                originalContent: `Offer created${buyer ? ` by ${buyer.fullName}` : ""}: $${amount.toLocaleString("en-US")} — no terms.`,
              },
              ts,
              userId,
            )
            stats.offersTouched += 1
          }
        }
      }

      const interestStatus = cell(record, "interestStatus", mapped)
      const lastContact = cell(record, "lastContactDate", mapped)
      const lastMessage = cell(record, "lastMessageSentDate", mapped)
      const nextFollowUp = cell(record, "nextFollowUpDate", mapped)
      const lc = lastContact ? parseSheetTimestamp(lastContact) : null
      const lm = lastMessage ? parseSheetTimestamp(lastMessage) : null
      const nf = nextFollowUp ? parseSheetDate(nextFollowUp) : null

      const relIdx = draft.relationships.findIndex(
        (r) => r.buyerId === buyerId && r.propertyId === property.id,
      )

      if (relIdx < 0) {
        const rel: BuyerProperty = {
          id: uid("r_"),
          orgId,
          buyerId,
          propertyId: property.id,
          interestStatus: interestStatus || "New",
          interestNotes: "",
          firstContactDate: todayIso(),
          lastInteractionDate: null,
          nextFollowUpDate: nf,
          nextAction: "",
          assignedUserId: null,
          relationshipStatus: "Active",
          createdAt: ts,
          updatedAt: ts,
          lastContactedAt: lc,
          lastMessageSentAt: lm,
          lastCallAt: null,
          syncStatus: "never",
          sourceRowId: "",
        }
        draft.relationships.unshift(rel)
        const buyer = draft.buyers.find((b) => b.id === buyerId)
        pushSystemInteraction(
          draft,
          {
            buyerId,
            propertyId: property.id,
            eventType: "Status Changed",
            originalContent: `${buyer?.fullName ?? "Buyer"} linked to ${property.address} (${rel.interestStatus}).`,
          },
          ts,
          userId,
        )
        stats.buyersTouched += 1
      } else {
        const rel = draft.relationships[relIdx]
        const patch: Partial<BuyerProperty> = {}
        if (interestStatus && interestStatus !== rel.interestStatus) {
          patch.interestStatus = interestStatus
        }
        if (lc && lc !== rel.lastContactedAt) patch.lastContactedAt = lc
        if (lm && lm !== rel.lastMessageSentAt) patch.lastMessageSentAt = lm
        if (nf && nf !== rel.nextFollowUpDate) patch.nextFollowUpDate = nf
        if (Object.keys(patch).length > 0) {
          draft.relationships[relIdx] = { ...rel, ...patch, updatedAt: ts }
          stats.buyersTouched += 1
        }
      }
    }

    const rawDate = cell(record, "nextFollowUpDate", mapped)
    const rawStatus = cell(record, "followUpStatus", mapped)
    if (rawDate || rawStatus) {
      const dueDate = rawDate ? parseSheetDate(rawDate) : null
      const openTasks = draft.tasks.filter(
        (t) =>
          t.propertyId === property.id &&
          t.status !== "Completed" &&
          t.status !== "Cancelled" &&
          (!buyerId || !t.buyerId || t.buyerId === buyerId),
      )
      const task =
        openTasks.find((t) => t.taskType.toLowerCase().includes("follow")) ?? openTasks[0]

      if (task) {
        const tIdx = draft.tasks.findIndex((t) => t.id === task.id)
        const statusLower = rawStatus.toLowerCase()
        if (["completed", "complete", "done"].includes(statusLower)) {
          draft.tasks[tIdx] = {
            ...task,
            status: "Completed" as const,
            completionNotes: "Marked complete via Google Sheet sync.",
            completedAt: ts,
            completedVia: "complete" as const,
          }
          pushSystemInteraction(
            draft,
            {
              buyerId: task.buyerId,
              propertyId: task.propertyId,
              eventType: "Follow-Up Completed",
              originalContent: `Follow-up completed: ${task.description} — Marked complete via Google Sheet sync.`,
            },
            ts,
            userId,
          )
          stats.tasksTouched += 1
        } else if (["cancelled", "canceled"].includes(statusLower)) {
          draft.tasks[tIdx] = {
            ...task,
            status: "Cancelled" as const,
            completionNotes: "Cancelled via Google Sheet sync.",
            completedAt: ts,
          }
          stats.tasksTouched += 1
        } else {
          const patch: Partial<Task> = {}
          if (dueDate && dueDate !== task.dueDate) patch.dueDate = dueDate
          if (FOLLOW_UP_STATUSES.has(statusLower) && rawStatus !== task.status) {
            patch.status = rawStatus as Task["status"]
          }
          if (Object.keys(patch).length > 0) {
            draft.tasks[tIdx] = { ...task, ...patch }
            stats.tasksTouched += 1
          }
        }
      } else if (dueDate) {
        draft.tasks.unshift({
          id: uid("t_"),
          orgId,
          buyerId,
          propertyId: property.id,
          relatedInteractionId: null,
          taskType: "Follow-Up",
          description: `Follow up — ${addressRaw}`,
          dueDate,
          dueTime: null,
          assignedUserId: userId,
          priority: "Medium",
          status: "Scheduled",
          completionNotes: "",
          createdAt: ts,
          completedAt: null,
          completedVia: null,
          sentAt: null,
        })
        if (buyerId) {
          draft.relationships = draft.relationships.map((r) =>
            r.buyerId === buyerId && r.propertyId === property.id
              ? { ...r, nextFollowUpDate: dueDate, updatedAt: ts }
              : r,
          )
        }
        stats.tasksTouched += 1
      }
    }
  }

  stats.missing = countMissingFromSheet(draft, records)
  return { db: draft, stats }
}

function countMissingFromSheet(db: DB, records: SheetRecord[]): number {
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

export function applySheetRecords(
  records: SheetRecord[],
  mappings: ColumnMapping[],
  userId: string,
): SheetApplyStats {
  let stats: SheetApplyStats = { ...EMPTY_STATS }
  updateDb((d) => {
    const result = applySheetRecordsImpl(d, records, mappings, userId)
    stats = result.stats
    return result.db
  })
  return stats
}

let inFlight: Promise<SheetSyncResult> | null = null

export function runSheetSync(
  conn: SheetConnection,
  onProgress?: (p: SheetSyncProgress) => void,
): Promise<SheetSyncResult> {
  if (inFlight) return inFlight
  inFlight = executeSheetSync(conn, onProgress).finally(() => {
    inFlight = null
  })
  return inFlight
}

async function executeSheetSync(
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
    autoMergeDuplicates()
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
