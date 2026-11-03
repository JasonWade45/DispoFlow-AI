/**
 * Dispo Follow-Up Hub — parser.gs
 *
 * Pure functions: parse the grouped "Property Sheet" layout into normalized
 * buyer records. No Google Apps Script services are used here, so these
 * functions can be tested offline with synthetic sheet data.
 *
 * Source layout (read-only, never modified by this project):
 *   Row 1: headers A..J = Status | Source | Offer | Earnest | Type | Name |
 *          Phone Number | Email | Last Touch Date | Notes / Last Update
 *   Then one block per property. Each block starts with a green header row
 *   whose first cell holds the address and a code, e.g.
 *   "3344 Windsor Castle Ct, Decatur, GA 30034 – CODE IS 3344".
 *   Buyer rows follow, then a blank spacer row before the next block.
 *
 * The same buyer can appear under several properties (same phone/email); the
 * caller (dedupeBuyers) merges those into one buyer record.
 */

"use strict";

const SOURCE_TAB_NAME = "Property Sheet";

const STATUS_VALUES = ["Interested", "Undecided", "Not Interested", "Remove Me"];

// Column indexes (A..J) matching the source sheet header order.
const COL_STATUS = 0;
const COL_SOURCE = 1;
const COL_OFFER = 2;
const COL_EARNEST = 3;
const COL_TYPE = 4;
const COL_NAME = 5;
const COL_PHONE = 6;
const COL_EMAIL = 7;
const COL_LAST_TOUCH = 8;
const COL_NOTES = 9;

const CODE_PATTERN = /CODE\s+IS\s+(\d{1,10})\b/i;
const HEADER_SPLIT = /[\u2013\u2014-]\s*CODE\s+IS/i;

function cellText(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function trim(v) {
  return cellText(v).trim();
}

function isEmptyRow(row) {
  for (let c = 0; c < row.length; c++) {
    if (trim(row[c]) !== "") return false;
  }
  return true;
}

/** Heuristic: sheet header rows are filled green (e.g. #70ad47 / #a9d08e). */
function isGreenish(bgCss) {
  if (!bgCss) return false;
  const css = String(bgCss).trim();
  let m;
  if ((m = css.match(/^#([0-9a-fA-F]{6})$/))) {
    const r = parseInt(m[1].slice(0, 2), 16);
    const g = parseInt(m[1].slice(2, 4), 16);
    const b = parseInt(m[1].slice(4, 6), 16);
    return g > r && g > b && g > 110;
  }
  if ((m = css.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i))) {
    const r = +m[1];
    const g = +m[2];
    const b = +m[3];
    return g > r && g > b && g > 110;
  }
  return false;
}

/**
 * Detect a property header row.
 * Returns { address, code } or null.
 */
function detectPropertyHeader(row, bgCss) {
  const first = trim(row[0]);
  let m = first.match(CODE_PATTERN);
  if (m) {
    const split = first.match(HEADER_SPLIT);
    const address = split ? first.slice(0, split.index).trim() : first.trim();
    return { address: address || first.trim(), code: m[1] };
  }
  // Fall back: any cell carries the "CODE IS <digits>" marker.
  for (let c = 1; c < row.length; c++) {
    const t = trim(row[c]);
    if (!t) continue;
    m = t.match(CODE_PATTERN);
    if (m) {
      const split = t.match(HEADER_SPLIT);
      const address = split ? t.slice(0, split.index).trim() : t.trim();
      return { address: address || t.trim(), code: m[1] };
    }
  }
  // Green formatting-only header without readable code text.
  if (bgCss && isGreenish(bgCss)) {
    for (let c = 0; c < row.length; c++) {
      const t = trim(row[c]);
      if (t) return { address: t.trim(), code: "" };
    }
    return { address: "", code: "" };
  }
  return null;
}

/**
 * Parse an offer like "145k", "140K", "110-115K", "$140,000" into a number.
 * Ranges are averaged; a trailing k/K multiplies by 1,000.
 * Returns null when no number can be found. The original text is never
 * altered — callers keep offerText alongside this numeric value.
 */
function parseOfferAmount(text) {
  if (text === null || text === undefined) return null;
  const t = String(text).replace(/,/g, "").trim();
  if (!t) return null;
  const hasK = /k\b/i.test(t);
  const nums = t.match(/\d+(?:\.\d+)?/g);
  if (!nums || nums.length === 0) return null;
  let value;
  if (nums.length >= 2) {
    value = (Number(nums[0]) + Number(nums[1])) / 2;
  } else {
    value = Number(nums[0]);
  }
  if (!isFinite(value)) return null;
  if (hasK) value *= 1000;
  return value;
}

/**
 * Parse a M/D/YYYY date. Returns [rawText, ISO "YYYY-MM-DD"] or null.
 * A lenient Date() fallback accepts other writable date strings.
 */
function parseDateMdy(text) {
  if (text === null || text === undefined) return null;
  const s = String(text).trim();
  if (!s) return null;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const month = +m[1];
    const day = +m[2];
    const year = +m[3];
    const d = new Date(year, month - 1, day);
    if (
      d.getFullYear() === year &&
      d.getMonth() + 1 === month &&
      d.getDate() === day
    ) {
      return [s, d.toISOString().slice(0, 10)];
    }
  }
  const d = new Date(s);
  if (isFinite(d)) return [s, d.toISOString().slice(0, 10)];
  return null;
}

function normalizePhoneForKey(phone) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 7 ? digits : "";
}

/**
 * Stable key used to deduplicate the same buyer across properties:
 * phone digits (>=7), else email, else name.
 */
function buyerKey(name, phone, email) {
  const p = normalizePhoneForKey(phone);
  if (p) return "p:" + p;
  const e = String(email || "").trim().toLowerCase();
  if (e) return "e:" + e;
  const n = String(name || "").trim();
  if (n) return "n:" + n.toLowerCase();
  return null;
}

function normalizeStatus(raw) {
  const s = String(raw || "").trim();
  for (let i = 0; i < STATUS_VALUES.length; i++) {
    if (s.toLowerCase() === STATUS_VALUES[i].toLowerCase()) return STATUS_VALUES[i];
  }
  return s; // keep unknown values as-is
}

/**
 * Map one buyer row beneath a property header to a record.
 * Returns null for rows that carry no buyer identity at all.
 */
function mapBuyerRow(row, current, sourceRow) {
  const status = trim(row[COL_STATUS]);
  const source = trim(row[COL_SOURCE]);
  const offerText = trim(row[COL_OFFER]);
  const earnestText = trim(row[COL_EARNEST]);
  const type = trim(row[COL_TYPE]);
  const name = trim(row[COL_NAME]);
  const phone = trim(row[COL_PHONE]);
  const email = trim(row[COL_EMAIL]);
  const lastTouchRaw = trim(row[COL_LAST_TOUCH]);
  const notes = trim(row[COL_NOTES]);

  if (!name && !phone && !email) return null;

  const dateParts = parseDateMdy(lastTouchRaw);

  return {
    sourceRow: sourceRow, // 1-based sheet row number
    sourceTab: SOURCE_TAB_NAME,
    propertyAddress: current.address || "",
    propertyCode: current.code || "",
    status: status,
    statusNormalized: normalizeStatus(status),
    source: source,
    offerText: offerText,
    offerNumeric: parseOfferAmount(offerText),
    earnestText: earnestText,
    earnestNumeric: parseOfferAmount(earnestText),
    type: type,
    name: name,
    phone: phone,
    email: email,
    lastTouchRaw: lastTouchRaw,
    lastTouchIso: dateParts ? dateParts[1] : null,
    notes: notes,
    buyerKey: buyerKey(name, phone, email) || "u:" + sourceRow,
  };
}

/**
 * Parse all values of the source sheet into buyer records.
 *
 * @param {string[][]} values       getValues() of the whole sheet
 * @param {string[][]} backgrounds  getBackgrounds() of the whole sheet (parallel)
 * @param {Object}   opts           { firstDataRow } (0-based index of the first
 *                                  row below the header row; default 1)
 * @returns {Object} { records, propertyCount, orphanRows }
 */
function parsePropertySheet(values, backgrounds, opts) {
  opts = opts || {};
  const firstDataRow = Number(opts.firstDataRow) || 1; // row 1 = headers
  const records = [];
  let propertyCount = 0;
  let orphanRows = 0;
  let current = null; // { address, code } of the block we are inside

  for (let r = firstDataRow; r < values.length; r++) {
    const row = values[r] || [];
    const bg = backgrounds && backgrounds[r] ? backgrounds[r][0] : "";

    if (isEmptyRow(row)) continue; // blank spacer row between blocks

    const header = detectPropertyHeader(row, bg);
    if (header) {
      current = header;
      propertyCount += 1;
      continue;
    }

    if (!current) {
      orphanRows += 1; // buyer row before any property header — cannot attribute
      continue;
    }

    const rec = mapBuyerRow(row, current, r + 1); // convert to 1-based sheet row
    if (rec) records.push(rec);
  }

  return { records, propertyCount, orphanRows };
}

/**
 * Merge records belonging to the same buyer (phone, then email, then name).
 * Returns buyers sorted by latest touch date (newest first), then name.
 */
function dedupeBuyers(records) {
  const map = new Map();
  const order = [];

  for (const rec of records) {
    let b = map.get(rec.buyerKey);
    if (!b) {
      b = {
        id: makeBuyerId(rec),
        name: rec.name || "",
        phone: rec.phone || "",
        email: rec.email || "",
        source: rec.source || "",
        type: rec.type || "",
        properties: [],
        statuses: [],
        latest: null, // { iso, row, address }
        notes: "",
        doNotContact: false,
        firstSeenRow: rec.sourceRow,
      };
      map.set(rec.buyerKey, b);
      order.push(b);
    }

    if (rec.name && !b.name) b.name = rec.name;
    if (rec.phone && !b.phone) b.phone = rec.phone;
    if (rec.email && !b.email) b.email = rec.email;
    if (rec.source && !b.source) b.source = rec.source;
    if (rec.type && !b.type) b.type = rec.type;
    if (rec.notes && !b.notes) b.notes = rec.notes;
    if (rec.statusNormalized && b.statuses.indexOf(rec.statusNormalized) < 0) {
      b.statuses.push(rec.statusNormalized);
    }
    if (rec.statusNormalized === "Remove Me") b.doNotContact = true;

    b.properties.push({
      address: rec.propertyAddress,
      code: rec.propertyCode,
      status: rec.status,
      statusNormalized: rec.statusNormalized,
      offerText: rec.offerText,
      offerNumeric: rec.offerNumeric,
      earnestText: rec.earnestText,
      earnestNumeric: rec.earnestNumeric,
      lastTouchRaw: rec.lastTouchRaw,
      lastTouchIso: rec.lastTouchIso,
      notes: rec.notes,
      sourceRow: rec.sourceRow,
    });

    if (
      rec.lastTouchIso &&
      (!b.latest || rec.lastTouchIso >= b.latest.iso)
    ) {
      b.latest = { iso: rec.lastTouchIso, row: rec.sourceRow, address: rec.propertyAddress };
    }
  }

  order.sort(function (a, b) {
    const aa = a.latest ? a.latest.iso : "";
    const bb = b.latest ? b.latest.iso : "";
    if (aa !== bb) return bb < aa ? 1 : -1; // newest first
    return (a.name || "").localeCompare(b.name || "");
  });

  return order;
}

function makeBuyerId(rec) {
  const digits = String(rec.phone || "").replace(/\D/g, "");
  if (digits) return "BUYER_" + digits;
  const e = String(rec.email || "").replace(/[^a-z0-9]/gi, "_");
  if (e) return "BUYER_" + e;
  const n = String(rec.name || "buyer").replace(/[^a-z0-9]/gi, "_");
  return "BUYER_" + n + "_" + rec.sourceRow;
}
