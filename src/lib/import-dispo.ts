"use client";

import type { Buyer, BuyerProperty, Offer, Property } from "@/types";
import { updateDb } from "@/lib/store";
import { uid } from "@/lib/format";

export interface DispoImportContact {
  name: string | null;
  phone: string | null;
  email: string | null;
  last_touch: string | null;
  notes: string | null;
}

export interface DispoImportInterest {
  status: string;
  source: string;
  offer: number | null;
  earnest: string | null;
  type: string | null;
  contact: DispoImportContact | null;
}

export interface DispoImportProperty {
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  status: string;
  interests: DispoImportInterest[];
}

export interface DispoImportPayload {
  properties: DispoImportProperty[];
}

export interface DispoImportResult {
  properties: number;
  buyers: number;
  relationships: number;
  offers: number;
  purged: boolean;
}

const STATUS_MAP: Record<string, string> = {
  sold: "Sold",
  pending: "Pending",
  undercontract: "Under Contract",
};

function mapPropertyStatus(raw: string): string {
  const key = raw.trim().toLowerCase().replace(/\s+/g, "");
  return STATUS_MAP[key] ?? "Available";
}

function normPhone(s: string | null): string {
  return (s ?? "").replace(/[^0-9]/g, "");
}

function normEmail(s: string | null): string {
  return (s ?? "").trim().toLowerCase();
}

function buyerKey(name: string | null, phone: string | null, email: string | null): string | null {
  const p = normPhone(phone);
  if (p.length >= 7) return `p:${p}`;
  const e = normEmail(email);
  if (e) return `e:${e}`;
  const n = (name ?? "").trim().toLowerCase();
  if (n) return `n:${n}`;
  return null;
}

export function importDispoData(
  payload: DispoImportPayload,
  opts: { replace?: boolean } = {},
): DispoImportResult {
  const ts = new Date().toISOString();
  const result: DispoImportResult = {
    properties: 0,
    buyers: 0,
    relationships: 0,
    offers: 0,
    purged: Boolean(opts.replace),
  };

  updateDb((db) => {
    const orgId = db.organization.id;
    const userId = db.users.find((u) => u.role === "owner")?.id ?? db.users[0]?.id ?? "u_owner";

    let properties: Property[] = opts.replace ? [] : [...db.properties];
    let buyers: Buyer[] = opts.replace ? [] : [...db.buyers];
    let relationships: BuyerProperty[] = opts.replace ? [] : [...db.relationships];
    let offers: Offer[] = opts.replace ? [] : [...db.offers];

    const buyerIdByKey = new Map<string, string>();
    if (!opts.replace) {
      for (const b of buyers) {
        const k = buyerKey(b.fullName, b.phone, b.email);
        if (k && !buyerIdByKey.has(k)) buyerIdByKey.set(k, b.id);
      }
    }
    const propertyIdByAddress = new Map<string, string>();
    if (!opts.replace) {
      for (const p of properties) {
        const k = `${p.address.trim().toLowerCase()}|${p.zip.trim()}`;
        if (!propertyIdByAddress.has(k)) propertyIdByAddress.set(k, p.id);
      }
    }

    for (const ip of payload.properties) {
      const addrKey = `${ip.address.trim().toLowerCase()}|${ip.zip.trim()}`;
      let propertyId = propertyIdByAddress.get(addrKey);
      if (!propertyId) {
        propertyId = uid("p");
        const row: Property = {
          id: propertyId,
          orgId,
          address: ip.address.trim(),
          city: ip.city.trim(),
          state: (ip.state || "GA").trim().toUpperCase(),
          zip: ip.zip.trim(),
          accessInfo: "",
          status: mapPropertyStatus(ip.status),
          accessType: "",
          askingPrice: null,
          arv: null,
          estimatedRepairs: null,
          assignmentPrice: null,
          marketingStartedAt: null,
          expectedClosingDate: null,
          notes: ip.notes?.trim() ?? "",
          createdAt: ts,
          updatedAt: ts,
          createdBy: userId,
          propertyType: "",
          bedrooms: "",
          bathrooms: "",
          sqft: "",
          lotSize: "",
          yearBuilt: "",
          listingUrl: "",
          photosUrl: "",
          photos: [],
          sourceWebsite: "dispo-sheet",
          sourcePropertyId: "",
          sourceRowId: "",
          firstImportedAt: ts,
          lastSyncedAt: ts,
          syncStatus: "synced",
        };
        properties = [row, ...properties];
        propertyIdByAddress.set(addrKey, propertyId);
        result.properties += 1;
      }

      for (const it of ip.interests) {
        const ct = it.contact;
        const key = buyerKey(ct?.name ?? null, ct?.phone ?? null, ct?.email ?? null);
        if (!key) continue;
        let buyerId = buyerIdByKey.get(key);
        if (!buyerId) {
          buyerId = uid("b");
          const row: Buyer = {
            id: buyerId,
            orgId,
            fullName: (ct?.name ?? "").trim() || "Unknown Buyer",
            companyName: "",
            phone: (ct?.phone ?? "").trim(),
            email: (ct?.email ?? "").trim(),
            preferredContactMethod: "",
            preferredMarkets: [],
            propertyTypes: [],
            budgetMin: null,
            budgetMax: null,
            status: "Active",
            notes: [ct?.notes, ct?.last_touch ? `Last touch: ${ct.last_touch}` : ""]
              .filter(Boolean)
              .join(" · "),
            createdAt: ts,
            updatedAt: ts,
            createdBy: userId,
          };
          buyers = [row, ...buyers];
          buyerIdByKey.set(key, buyerId);
          result.buyers += 1;
        }

        const relExists = relationships.some(
          (r) => r.buyerId === buyerId && r.propertyId === propertyId,
        );
        if (!relExists) {
          const rel: BuyerProperty = {
            id: uid("r"),
            orgId,
            buyerId,
            propertyId,
            interestStatus: it.status.trim() || "Undecided",
            interestNotes: [it.source, it.type].filter(Boolean).join(" · "),
            firstContactDate: ts.slice(0, 10),
            lastInteractionDate: null,
            nextFollowUpDate: null,
            nextAction: "",
            assignedUserId: null,
            relationshipStatus: "Active",
            createdAt: ts,
            updatedAt: ts,
            lastContactedAt: null,
            lastMessageSentAt: null,
            lastCallAt: null,
            syncStatus: "synced",
            sourceRowId: "",
          };
          relationships = [rel, ...relationships];
          result.relationships += 1;
        }

        if (typeof it.offer === "number" && it.offer > 0) {
          const offerExists = offers.some(
            (o) => o.buyerId === buyerId && o.propertyId === propertyId && o.amount === it.offer,
          );
          if (!offerExists) {
            const offer: Offer = {
              id: uid("of"),
              orgId,
              buyerId,
              propertyId,
              amount: it.offer,
              offerDate: ts.slice(0, 10),
              terms: [it.earnest ? `Earnest: ${it.earnest}` : "", it.type ?? ""].filter(Boolean).join(" · "),
              expiresAt: null,
              status: "Submitted",
              negotiationNotes: it.source ?? "",
              nextAction: "",
              createdBy: userId,
              createdAt: ts,
              updatedAt: ts,
            };
            offers = [offer, ...offers];
            result.offers += 1;
          }
        }
      }
    }

    return { ...db, properties, buyers, relationships, offers };
  });

  return result;
}
