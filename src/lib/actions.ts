'use client'

import type {
  Buyer,
  BuyerProperty,
  Interaction,
  Offer,
  Property,
  Task,
} from '@/types'
import { updateDb } from '@/lib/store'
import { uid, todayIso } from '@/lib/format'
import { buyerById, propertyById } from '@/lib/selectors'
import type { EnhanceResult } from '@/lib/ai/enhance'

function nowIso(): string {
  return new Date().toISOString()
}

function logSystem(
  draft: { interactions: Interaction[]; organization: { id: string } },
  row: Partial<Interaction> & { eventType: Interaction['eventType']; originalContent: string },
  userId: string,
): void {
  const ts = nowIso()
  draft.interactions.push({
    id: uid('i'),
    orgId: draft.organization.id,
    buyerId: null,
    propertyId: null,
    direction: 'system',
    occurredAt: ts,
    recordedAt: ts,
    enhancedNotes: '',
    outcome: '',
    potentialOfferAmount: null,
    potentialOfferConfirmed: false,
    nextAction: '',
    missingInfo: [],
    isAiSuggestion: false,
    createdBy: userId,
    createdAt: ts,
    updatedAt: ts,
    ...row,
  } as Interaction)
}

export function addProperty(input: {
  address: string
  city: string
  state: string
  zip: string
  status: string
  accessType?: string
  askingPrice: number | null
  arv: number | null
  estimatedRepairs: number | null
  assignmentPrice: number | null
  expectedClosingDate: string | null
  notes: string
  userId: string
  propertyType?: string
  bedrooms?: string
  bathrooms?: string
  sqft?: string
  lotSize?: string
  yearBuilt?: string
  listingUrl?: string
  photosUrl?: string
  sourceWebsite?: string
  sourcePropertyId?: string
  sourceRowId?: string
  firstImportedAt?: string | null
  lastSyncedAt?: string | null
  syncStatus?: string
}): string {
  const id = uid('p')
  const ts = nowIso()
  updateDb((db) => {
    const row: Property = {
      id,
      orgId: db.organization.id,
      address: input.address.trim(),
      city: input.city.trim(),
      state: input.state.trim().toUpperCase(),
      zip: input.zip.trim(),
      status: input.status,
      accessType: input.accessType ?? '',
      askingPrice: input.askingPrice,
      arv: input.arv,
      estimatedRepairs: input.estimatedRepairs,
      assignmentPrice: input.assignmentPrice,
      marketingStartedAt: input.status === 'Marketing' ? ts : null,
      expectedClosingDate: input.expectedClosingDate,
      notes: input.notes,
      createdAt: ts,
      updatedAt: ts,
      createdBy: input.userId,
      propertyType: input.propertyType ?? '',
      bedrooms: input.bedrooms ?? '',
      bathrooms: input.bathrooms ?? '',
      sqft: input.sqft ?? '',
      lotSize: input.lotSize ?? '',
      yearBuilt: input.yearBuilt ?? '',
      listingUrl: input.listingUrl ?? '',
      photosUrl: input.photosUrl ?? '',
      sourceWebsite: input.sourceWebsite ?? '',
      sourcePropertyId: input.sourcePropertyId ?? '',
      sourceRowId: input.sourceRowId ?? '',
      firstImportedAt: input.firstImportedAt ?? ts,
      lastSyncedAt: input.lastSyncedAt ?? null,
      syncStatus: (input.syncStatus ?? 'never') as Property['syncStatus'],
    }
    return { ...db, properties: [row, ...db.properties] }
  })
  return id
}

export function importPropertiesBulk(
  rows: Array<Omit<Property, 'id' | 'orgId' | 'createdAt' | 'updatedAt' | 'createdBy'>>,
  userId: string,
): number {
  const ts = nowIso()
  updateDb((db) => {
    const newRows: Property[] = rows.map((r, i) => ({
      ...r,
      id: uid(`p${i}_`),
      orgId: db.organization.id,
      createdAt: ts,
      updatedAt: ts,
      createdBy: userId,
    }))
    return { ...db, properties: [...db.properties, ...newRows] }
  })
  return rows.length
}

export function updateProperty(id: string, patch: Partial<Property>): void {
  updateDb((db) => ({
    ...db,
    properties: db.properties.map((p) =>
      p.id === id ? { ...p, ...patch, updatedAt: nowIso() } : p,
    ),
  }))
}

export function changePropertyStatus(id: string, status: string, userId: string): void {
  updateDb((db) => {
    const property = db.properties.find((p) => p.id === id)
    if (!property || property.status === status) return db
    const ts = nowIso()
    const properties = db.properties.map((p) =>
      p.id === id
        ? {
            ...p,
            status,
            updatedAt: ts,
            marketingStartedAt:
              status === 'Marketing' && !p.marketingStartedAt ? ts : p.marketingStartedAt,
          }
        : p,
    )
    const interactions = [...db.interactions]
    const draft = { interactions, organization: db.organization }
    logSystem(
      draft,
      {
        propertyId: id,
        eventType: 'Status Changed',
        originalContent: `Property status changed: ${property.status} → ${status}.`,
      },
      userId,
    )

    let tasks = db.tasks
    if (status === 'Sold' || status === 'Cancelled') {
      tasks = tasks.map((t) =>
        t.propertyId === id && t.status !== 'Completed' && t.status !== 'Cancelled'
          ? {
              ...t,
              status: 'Cancelled' as const,
              completionNotes: `Auto-cancelled when property moved to ${status}.`,
            }
          : t,
      )
    }
    return { ...db, properties, interactions, tasks }
  })
}

export function addBuyer(input: {
  fullName: string
  companyName: string
  phone: string
  email: string
  preferredContactMethod: string
  preferredMarkets: string[]
  budgetMin: number | null
  budgetMax: number | null
  status: string
  notes: string
  userId: string
}): string {
  const id = uid('b')
  const ts = nowIso()
  updateDb((db) => {
    const row: Buyer = {
      id,
      orgId: db.organization.id,
      fullName: input.fullName.trim(),
      companyName: input.companyName.trim(),
      phone: input.phone.trim(),
      email: input.email.trim(),
      preferredContactMethod: input.preferredContactMethod as Buyer['preferredContactMethod'],
      preferredMarkets: input.preferredMarkets,
      propertyTypes: [],
      budgetMin: input.budgetMin,
      budgetMax: input.budgetMax,
      status: input.status as Buyer['status'],
      notes: input.notes,
      createdAt: ts,
      updatedAt: ts,
      createdBy: input.userId,
    }
    return { ...db, buyers: [row, ...db.buyers] }
  })
  return id
}

export function updateBuyer(id: string, patch: Partial<Buyer>): void {
  updateDb((db) => ({
    ...db,
    buyers: db.buyers.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: nowIso() } : b)),
  }))
}

export function linkBuyerToProperty(input: {
  buyerId: string
  propertyId: string
  interestStatus: string
  interestNotes: string
  assignedUserId: string | null
  userId: string
}): string | null {
  const id = uid('r')
  let created = false
  updateDb((db) => {
    const exists = db.relationships.find(
      (r) => r.buyerId === input.buyerId && r.propertyId === input.propertyId,
    )
    if (exists) return db
    const ts = nowIso()
    const row: BuyerProperty = {
      id,
      orgId: db.organization.id,
      buyerId: input.buyerId,
      propertyId: input.propertyId,
      interestStatus: input.interestStatus,
      interestNotes: input.interestNotes,
      firstContactDate: todayIso(),
      lastInteractionDate: null,
      nextFollowUpDate: null,
      nextAction: '',
      assignedUserId: input.assignedUserId,
      relationshipStatus: 'Active',
      createdAt: ts,
      updatedAt: ts,
      lastContactedAt: null,
      lastMessageSentAt: null,
      lastCallAt: null,
      syncStatus: 'never',
      sourceRowId: '',
    }
    created = true
    const interactions = [...db.interactions]
    const draft = { interactions, organization: db.organization }
    const buyer = buyerById(db, input.buyerId)
    const property = propertyById(db, input.propertyId)
    logSystem(
      draft,
      {
        buyerId: input.buyerId,
        propertyId: input.propertyId,
        eventType: 'Status Changed',
        originalContent: `${buyer?.fullName ?? 'Buyer'} linked to ${property?.address ?? 'property'} (${input.interestStatus}).`,
      },
      input.userId,
    )
    return { ...db, relationships: [row, ...db.relationships], interactions }
  })
  return created ? id : null
}

export function updateRelationship(id: string, patch: Partial<BuyerProperty>): void {
  updateDb((db) => ({
    ...db,
    relationships: db.relationships.map((r) =>
      r.id === id ? { ...r, ...patch, updatedAt: nowIso() } : r,
    ),
  }))
}

export function logInteraction(input: {
  buyerId: string | null
  propertyId: string | null
  eventType: Interaction['eventType']
  occurredAt: string
  recordedAt: string
  originalContent: string
  enhanced: EnhanceResult | null
  useEnhanced: boolean
  userId: string
}): string {
  const id = uid('i')
  const ts = nowIso()
  updateDb((db) => {
    const direction: Interaction['direction'] =
      input.eventType.startsWith('Incoming')
        ? 'in'
        : input.eventType.startsWith('Outgoing')
          ? 'out'
          : input.eventType === 'Internal Note'
            ? 'internal'
            : 'system'

    const row: Interaction = {
      id,
      orgId: db.organization.id,
      buyerId: input.buyerId,
      propertyId: input.propertyId,
      eventType: input.eventType,
      direction,
      occurredAt: input.occurredAt,
      recordedAt: input.recordedAt,
      originalContent: input.originalContent,
      enhancedNotes: input.useEnhanced && input.enhanced ? input.enhanced.summary : '',
      outcome: input.useEnhanced && input.enhanced ? input.enhanced.outcome : '',
      potentialOfferAmount:
        input.useEnhanced && input.enhanced ? input.enhanced.potentialOfferAmount : null,
      potentialOfferConfirmed: false,
      nextAction: input.useEnhanced && input.enhanced ? input.enhanced.nextAction : '',
      missingInfo: input.useEnhanced && input.enhanced ? input.enhanced.missingInfo : [],
      isAiSuggestion: false,
      createdBy: input.userId,
      createdAt: ts,
      updatedAt: ts,
    }

    const relationships = db.relationships.map((r) => {
      if (input.buyerId && r.buyerId === input.buyerId && r.propertyId === input.propertyId) {
        return {
          ...r,
          lastInteractionDate: input.occurredAt.slice(0, 10),
          updatedAt: ts,
        }
      }
      return r
    })

    return { ...db, interactions: [...db.interactions, row], relationships }
  })
  return id
}

export function createTask(input: {
  buyerId: string | null
  propertyId: string | null
  relatedInteractionId?: string | null
  taskType: string
  description: string
  dueDate: string | null
  dueTime: string | null
  assignedUserId: string
  priority: string
}): string {
  const id = uid('t')
  const ts = nowIso()
  updateDb((db) => {
    const row: Task = {
      id,
      orgId: db.organization.id,
      buyerId: input.buyerId,
      propertyId: input.propertyId,
      relatedInteractionId: input.relatedInteractionId ?? null,
      taskType: input.taskType,
      description: input.description,
      dueDate: input.dueDate,
      dueTime: input.dueTime,
      assignedUserId: input.assignedUserId,
      priority: input.priority as Task['priority'],
      status: 'Scheduled',
      completionNotes: '',
      createdAt: ts,
      completedAt: null,
      completedVia: null,
      sentAt: null,
    }
    const relationships =
      input.buyerId && input.propertyId
        ? db.relationships.map((r) =>
            r.buyerId === input.buyerId && r.propertyId === input.propertyId
              ? {
                  ...r,
                  nextFollowUpDate: input.dueDate ?? r.nextFollowUpDate,
                  nextAction: input.description || r.nextAction,
                  updatedAt: ts,
                }
              : r,
          )
        : db.relationships
    return { ...db, tasks: [row, ...db.tasks], relationships }
  })
  return id
}

export function updateTask(id: string, patch: Partial<Task>): void {
  updateDb((db) => ({
    ...db,
    tasks: db.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
  }))
}

export function completeTask(
  id: string,
  completionNotes: string,
  userId: string,
  via: 'complete' | 'sent' = 'complete',
): void {
  updateDb((db) => {
    const task = db.tasks.find((t) => t.id === id)
    if (!task) return db
    if (task.status === 'Completed' || task.status === 'Cancelled') return db
    const ts = nowIso()
    const isMessageTask = task.taskType.toLowerCase().includes('message')
    const completedVia: Task['completedVia'] = via === 'sent' ? 'sent' : isMessageTask && via === 'complete' ? 'complete' : via
    const sentAt = via === 'sent' ? ts : task.sentAt

    const tasks = db.tasks.map((t) =>
      t.id === id
        ? {
            ...t,
            status: 'Completed' as const,
            completionNotes,
            completedAt: ts,
            completedVia,
            sentAt,
          }
        : t,
    )

    const interactions = [...db.interactions]
    const draft = { interactions, organization: db.organization }
    logSystem(
      draft,
      {
        buyerId: task.buyerId,
        propertyId: task.propertyId,
        eventType: 'Follow-Up Completed',
        originalContent: `Follow-up completed${via === 'sent' ? ' (message sent)' : ''}: ${task.description}${
          completionNotes ? ` — ${completionNotes}` : ''
        }`,
      },
      userId,
    )

    let relationships = db.relationships
    if (task.buyerId && task.propertyId) {
      relationships = relationships.map((r) => {
        if (r.buyerId === task.buyerId && r.propertyId === task.propertyId) {
          const patch: Partial<typeof r> = { updatedAt: ts }
          if (via === 'sent') {
            patch.lastMessageSentAt = ts
            patch.lastContactedAt = ts
          } else if (task.taskType.toLowerCase().includes('call')) {
            patch.lastCallAt = ts
            patch.lastContactedAt = ts
          }
          return { ...r, ...patch }
        }
        return r
      })
    }

    return { ...db, tasks, interactions, relationships }
  })
}

export function markSent(id: string, notes: string, userId: string): void {
  completeTask(id, notes, userId, 'sent')
}

export function cancelTask(id: string, reason: string): void {
  updateDb((db) => ({
    ...db,
    tasks: db.tasks.map((t) =>
      t.id === id
        ? { ...t, status: 'Cancelled' as const, completionNotes: reason, completedAt: nowIso() }
        : t,
    ),
  }))
}

export function addOffer(input: {
  buyerId: string
  propertyId: string
  amount: number
  offerDate: string
  terms: string
  expiresAt: string | null
  status: string
  negotiationNotes: string
  nextAction: string
  userId: string
}): string {
  const id = uid('o')
  const ts = nowIso()
  updateDb((db) => {
    const row: Offer = {
      id,
      orgId: db.organization.id,
      buyerId: input.buyerId,
      propertyId: input.propertyId,
      amount: input.amount,
      offerDate: input.offerDate,
      terms: input.terms,
      expiresAt: input.expiresAt,
      status: input.status as Offer['status'],
      negotiationNotes: input.negotiationNotes,
      nextAction: input.nextAction,
      createdBy: input.userId,
      createdAt: ts,
      updatedAt: ts,
    }
    const interactions = [...db.interactions]
    const draft = { interactions, organization: db.organization }
    const buyer = buyerById(db, input.buyerId)
    logSystem(
      draft,
      {
        buyerId: input.buyerId,
        propertyId: input.propertyId,
        eventType: 'Offer Created',
        originalContent: `Offer created${buyer ? ` by ${buyer.fullName}` : ''}: $${input.amount.toLocaleString('en-US')} — ${input.terms || 'no terms'}.`,
      },
      input.userId,
    )
    const relationships = db.relationships.map((r) =>
      r.buyerId === input.buyerId && r.propertyId === input.propertyId
        ? { ...r, interestStatus: 'Offer Submitted', updatedAt: ts }
        : r,
    )
    return { ...db, offers: [row, ...db.offers], interactions, relationships }
  })
  return id
}

export function updateOffer(id: string, patch: Partial<Offer>, userId: string): void {
  updateDb((db) => {
    const offer = db.offers.find((o) => o.id === id)
    if (!offer) return db
    const ts = nowIso()
    const offers = db.offers.map((o) => (o.id === id ? { ...o, ...patch, updatedAt: ts } : o))
    let interactions = db.interactions
    if (patch.status && patch.status !== offer.status) {
      const list = [...interactions]
      const draft = { interactions: list, organization: db.organization }
      logSystem(
        draft,
        {
          buyerId: offer.buyerId,
          propertyId: offer.propertyId,
          eventType: 'Offer Updated',
          originalContent: `Offer status changed: ${offer.status} → ${patch.status} ($${offer.amount.toLocaleString('en-US')}).`,
        },
        userId,
      )
      interactions = list
    }
    return { ...db, offers, interactions }
  })
}

export function addImportHistory(entry: {
  source: string
  newCount: number
  updatedCount: number
  skippedCount: number
  errorCount: number
  notes: string
}): void {
  updateDb((db) => ({
    ...db,
    importHistory: [
      {
        id: uid('ih_'),
        orgId: db.organization.id,
        source: entry.source,
        importedAt: nowIso(),
        newCount: entry.newCount,
        updatedCount: entry.updatedCount,
        skippedCount: entry.skippedCount,
        errorCount: entry.errorCount,
        notes: entry.notes,
      },
      ...db.importHistory,
    ].slice(0, 100),
  }))
}