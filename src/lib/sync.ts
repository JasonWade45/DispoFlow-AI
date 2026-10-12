"use client"

import { addImportHistory, importPropertiesBulk, updateProperty } from "@/lib/actions"
import { getDb } from "@/lib/store"
import type { Property } from "@/types"

const SYNC_KEY = "dispoflow_last_sync"
const ENRICH_BATCH = 8

interface ListingCard {
  url: string
  address: string
  price: number | null
  image: string
  statusBadge: string
  propertyType: string
  bedrooms: string
  bathrooms: string
  sqft: string
}

export function getLastSync(): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(SYNC_KEY)
}

export function setLastSync(): string {
  const now = new Date().toISOString()
  if (typeof window !== "undefined") {
    window.localStorage.setItem(SYNC_KEY, now)
  }
  return now
}

export function isSyncDue(): boolean {
  const last = getLastSync()
  if (!last) return true
  return Date.now() - new Date(last).getTime() > 24 * 60 * 60 * 1000
}

export function normalizeAddress(a: string): string {
  return a
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

const STREET_SUFFIXES = new Set([
  "st", "street", "ave", "avenue", "blvd", "boulevard", "rd", "road", "ct", "court",
  "dr", "drive", "ln", "lane", "way", "cv", "cove", "pl", "place", "ter", "terrace",
  "cir", "circle", "hwy", "highway", "pkwy", "parkway", "trl", "trail", "sq", "square",
])
const DIRECTIONALS = new Set(["n", "s", "e", "w", "ne", "nw", "se", "sw", "north", "south", "east", "west"])

export function parseAddressParts(full: string): { address: string; city: string; state: string; zip: string } | null {
  const parts = full.split(",").map((s) => s.trim()).filter(Boolean)
  if (parts.length >= 3) {
    const stateZip = parts[parts.length - 1].split(" ").filter(Boolean)
    return {
      address: parts[0],
      city: parts.slice(1, -1).join(", "),
      state: stateZip[0] ?? "",
      zip: stateZip.slice(1).join(" "),
    }
  }
  const flat = full.replace(/[#,]/g, " ").replace(/\s+/g, " ").trim()
  const tail = flat.match(/^(.*\S)\s+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)$/)
  if (!tail) return null
  const words = tail[1].split(" ")
  const state = tail[2].toUpperCase()
  const zip = tail[3]
  if (words.length < 2) return null
  let cut = -1
  for (let i = words.length - 1; i >= 1; i--) {
    if (STREET_SUFFIXES.has(words[i].toLowerCase().replace(/\.$/, ""))) {
      cut = i
      break
    }
  }
  if (cut === -1) cut = words.length - 2
  while (cut + 1 < words.length - 1) {
    const nxt = words[cut + 1].toLowerCase()
    if (DIRECTIONALS.has(nxt) || /^\d+[a-z]?$/i.test(words[cut + 1])) {
      cut += 1
    } else {
      break
    }
  }
  return {
    address: words.slice(0, cut + 1).join(" "),
    city: words.slice(cut + 1).join(" "),
    state,
    zip,
  }
}

function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.\-]/g, ""))
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null
}

function statusFromBadge(badge: string): string {
  const b = badge.trim().toLowerCase()
  if (!b) return "Available"
  if (b.includes("pending")) return "Pending"
  if (b.includes("sold")) return "Sold"
  if (b.includes("under contract")) return "Under Contract"
  if (b.includes("available") || b.includes("active")) return "Available"
  return "Available"
}

function sourceUrlOf(notes: string | null | undefined): string {
  if (!notes) return ""
  const m = notes.match(/Source:\s*(\S+)/)
  return m?.[1] ?? ""
}

export interface SyncProgress {
  phase: "listing" | "importing" | "enriching" | "done"
  done: number
  total: number
}

export interface SyncResult {
  totalOnSite: number
  imported: number
  enriched: number
  skipped: number
  failed: number
  newAddresses: string[]
}

export async function runElevateRegSync(
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  const result: SyncResult = {
    totalOnSite: 0,
    imported: 0,
    enriched: 0,
    skipped: 0,
    failed: 0,
    newAddresses: [],
  }

  onProgress?.({ phase: "listing", done: 0, total: 0 })
  const listRes = await fetch("/api/sync/elevatereg?pages=36")
  const listData = await listRes.json()
  if (!listRes.ok) throw new Error(listData.error || "Failed to fetch listing")

  const cards: ListingCard[] = listData.properties ?? []
  result.totalOnSite = cards.length

  const db = getDb()
  const existingByUrl = new Map(
    db.properties
      .filter((p) => p.listingUrl)
      .map((p) => [p.listingUrl.replace(/\/$/, "") + "/", p]),
  )
  const existingByAddress = new Map(
    db.properties.map((p) => [normalizeAddress(p.address), p]),
  )

  const newCards: ListingCard[] = []
  const updateCards: Array<{ card: ListingCard; property: Property }> = []

  for (const card of cards) {
    const byUrl = existingByUrl.get(card.url.replace(/\/$/, "") + "/")
    if (byUrl) {
      updateCards.push({ card, property: byUrl })
      continue
    }
    const parts = parseAddressParts(card.address)
    if (parts) {
      const byAddr = existingByAddress.get(normalizeAddress(parts.address))
      if (byAddr) {
        updateCards.push({ card, property: byAddr })
        continue
      }
    }
    newCards.push(card)
  }
  result.skipped = 0

  onProgress?.({ phase: "importing", done: 0, total: newCards.length })
  const rows: Array<Omit<Property, "id" | "orgId" | "createdAt" | "updatedAt" | "createdBy">> = []
  for (const card of newCards) {
    const parts = parseAddressParts(card.address)
    if (!parts) {
      result.failed += 1
      continue
    }
    const ts = new Date().toISOString()
    rows.push({
      address: parts.address,
      city: parts.city,
      state: parts.state,
      zip: parts.zip,
      status: statusFromBadge(card.statusBadge),
      accessType: "",
      askingPrice: card.price,
      arv: null,
      estimatedRepairs: null,
      assignmentPrice: null,
      marketingStartedAt: null,
      expectedClosingDate: null,
      notes: `Source: ${card.url}${card.image ? `\nImage: ${card.image}` : ""}`,
      propertyType: card.propertyType,
      bedrooms: card.bedrooms,
      bathrooms: card.bathrooms,
      sqft: card.sqft,
      lotSize: "",
      yearBuilt: "",
      listingUrl: card.url,
      photosUrl: card.image,
      photos: card.image ? [card.image] : [],
      sourceWebsite: "elevatereg.com",
      sourcePropertyId: card.url.split("/property/")[1]?.replace(/\/$/, "") ?? "",
      sourceRowId: "",
      firstImportedAt: ts,
      lastSyncedAt: ts,
      syncStatus: "synced" as const,
    })
  }
  if (rows.length > 0) {
    importPropertiesBulk(rows, "u_owner")
  }
  result.imported = rows.length
  result.newAddresses = rows.map((r) => `${r.address}, ${r.city}`)
  onProgress?.({ phase: "importing", done: newCards.length, total: newCards.length })

  onProgress?.({ phase: "enriching", done: 0, total: updateCards.length })
  let udone = 0
  for (const { card, property } of updateCards) {
    const ts = new Date().toISOString()
    const newStatus = statusFromBadge(card.statusBadge)
    const patch: Partial<Property> = {
      lastSyncedAt: ts,
      syncStatus: "synced" as const,
    }
    if (card.price && card.price !== property.askingPrice) patch.askingPrice = card.price
    if (card.bedrooms && card.bedrooms !== property.bedrooms) patch.bedrooms = card.bedrooms
    if (card.bathrooms && card.bathrooms !== property.bathrooms) patch.bathrooms = card.bathrooms
    if (card.sqft && card.sqft !== property.sqft) patch.sqft = card.sqft
    if (card.propertyType && card.propertyType !== property.propertyType) patch.propertyType = card.propertyType
    if (newStatus !== property.status && newStatus !== "Available") patch.status = newStatus
    if (card.image && !property.photos.includes(card.image)) {
      patch.photosUrl = card.image
      patch.photos = [card.image, ...property.photos].slice(0, 20)
    }
    if (!property.listingUrl) patch.listingUrl = card.url
    if (!property.sourceWebsite) patch.sourceWebsite = "elevatereg.com"
    updateProperty(property.id, patch)
    result.enriched += 1
    udone += 1
    onProgress?.({ phase: "enriching", done: udone, total: updateCards.length })
  }

  const dbAfter = getDb()
  const needsEnrich = dbAfter.properties.filter((p) => {
    return (
      (p.sourceWebsite === "elevatereg.com" || p.listingUrl?.includes("elevatereg.com")) &&
      (p.arv === null || p.arv === 0)
    )
  })
  const batch = needsEnrich.slice(0, ENRICH_BATCH)

  onProgress?.({ phase: "enriching", done: updateCards.length, total: updateCards.length + batch.length })
  let edone = updateCards.length
  for (const p of batch) {
    const src = p.listingUrl || sourceUrlOf(p.notes)
    try {
      const detailRes = await fetch("/api/scrape/elevatereg", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: src }),
      })
      const detail = await detailRes.json()
      if (detailRes.ok) {
        const d = (detail.property ?? {}) as {
          comps?: Array<{ address?: string; soldPrice?: number | string }>
          arv?: unknown
          estimatedRepairs?: unknown
          askingPrice?: unknown
          accessType?: string
          specs?: { bedrooms?: string; bathrooms?: string; sqft?: string; lotSize?: string; yearBuilt?: string }
          images?: string[]
          financingNote?: string
        }
        const compsLine =
          Array.isArray(d.comps) && d.comps.length > 0
            ? `\nComps: ${d.comps
                .map((c) => `${c.address} — $${Number(c.soldPrice || 0).toLocaleString("en-US")}`)
                .join("; ")}`
            : ""
        updateProperty(p.id, {
          arv: toNumber(d.arv) ?? p.arv,
          estimatedRepairs: toNumber(d.estimatedRepairs) ?? p.estimatedRepairs,
          askingPrice: toNumber(d.askingPrice) ?? p.askingPrice,
          accessType: d.accessType || p.accessType,
          bedrooms: d.specs?.bedrooms || p.bedrooms,
          bathrooms: d.specs?.bathrooms || p.bathrooms,
          sqft: d.specs?.sqft || p.sqft,
          lotSize: d.specs?.lotSize || p.lotSize,
          yearBuilt: d.specs?.yearBuilt || p.yearBuilt,
          photosUrl: d.images?.[0] || p.photosUrl,
          photos: d.images && d.images.length > 0 ? d.images : p.photos.length > 0 ? p.photos : p.photosUrl ? [p.photosUrl] : [],
          lastSyncedAt: new Date().toISOString(),
          syncStatus: "synced" as const,
          notes: [p.notes, d.financingNote ? `Financing: ${d.financingNote}` : "", compsLine]
            .filter(Boolean)
            .join("\n"),
        })
        result.enriched += 1
      } else {
        result.failed += 1
      }
    } catch {
      result.failed += 1
    }
    edone += 1
    onProgress?.({ phase: "enriching", done: edone, total: updateCards.length + batch.length })
  }

  setLastSync()
  addImportHistory({
    source: "elevatereg.com",
    newCount: result.imported,
    updatedCount: result.enriched,
    skippedCount: result.skipped,
    errorCount: result.failed,
    notes: formatSyncSummary(result),
  })
  onProgress?.({ phase: "done", done: 0, total: 0 })
  return result
}

export function formatSyncSummary(r: SyncResult): string {
  const parts: string[] = []
  if (r.imported > 0) parts.push(`+${r.imported} new`)
  if (r.enriched > 0) parts.push(`${r.enriched} enriched (ARV/comps)`)
  if (parts.length === 0) {
    return `Up to date — ${r.totalOnSite} properties on site, none new`
  }
  return `Synced: ${parts.join(" · ")} (site total ${r.totalOnSite})`
}

export function formatLastSync(iso: string | null): string {
  if (!iso) return "Never"
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  })
}
