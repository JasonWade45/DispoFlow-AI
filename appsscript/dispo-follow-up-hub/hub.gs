/**
 * Dispo Follow-Up Hub — hub.gs
 *
 * Writes the organized buyer data into NEW tabs only:
 *   Buyer Hub        — one row per buyer × property (the actionable follow-up view)
 *   Buyers (Unique)  — one row per buyer, deduplicated by phone/email
 *   Follow-Up Log    — append-only log of every message sent via DispoGenius
 *
 * The source tab ("Property Sheet") is only ever read. assertNotSourceTab()
 * guards every tab we touch so the original data can never be modified by
 * this script.
 */

"use strict";

const SOURCE_TAB = "Property Sheet";
const HUB_TAB = "Buyer Hub";
const BUYERS_TAB = "Buyers (Unique)";
const LOG_TAB = "Follow-Up Log";

const HUB_HEADERS = [
  "Buyer ID",
  "Buyer Name",
  "Phone",
  "Email",
  "Source",
  "Type",
  "Property Address",
  "Property Code",
  "Status",
  "Offer",
  "Offer (Numeric)",
  "Earnest",
  "Last Touch Date",
  "Last Touch (ISO)",
  "Notes / Last Update",
  "Closing",
  "Follow-Up Status",
  "Last Follow-Up At",
  "Next Follow-Up Date",
  "Source Row",
];
const COL_CLOSING = 16; // 1-based column P
const COL_FOLLOW_STATUS = 17; // Q
const COL_LAST_FOLLOW_AT = 18; // R

const BUYERS_HEADERS = [
  "Buyer ID",
  "Name",
  "Phone",
  "Email",
  "Source",
  "Type",
  "# Properties",
  "Properties",
  "Statuses",
  "Latest Last Touch",
  "Latest Property",
  "Notes",
  "Do Not Contact",
];

const LOG_HEADERS = [
  "Time",
  "Buyer",
  "Phone",
  "Email",
  "Property",
  "Property Code",
  "Message",
  "Result",
  "Message Id",
  "Contact Id",
  "Error",
];

const STATUS_STYLE = {
  "Interested": { bg: "#C6EFCE", color: "#006100" },
  "Undecided": { bg: "#FFEB9C", color: "#9C6500" },
  "Not Interested": { bg: "#FFC7CE", color: "#9C0006" },
  "Remove Me": { bg: "#D9D9D9", color: "#595959" },
};

function assertNotSourceTab(sheet) {
  if (sheet && sheet.getSheetName() === SOURCE_TAB) {
    throw new Error(
      "Refusing to write to the source tab '" +
        SOURCE_TAB +
        "' — it is read-only.",
    );
  }
}

function ensureTab(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) sheet = ss.insertSheet(name);
  return sheet;
}

function writeTable(sheet, headers, rows) {
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.setFrozenRows(1);
  if (rows.length) {
    sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
  try {
    sheet.autoResizeColumns(1, headers.length);
  } catch (e) {
    // auto-resize is best-effort only
  }
}

/**
 * Read back user-edited fields from an existing hub/buyers tab so a refresh
 * never wipes them out (Closing, follow-up state, Do Not Contact).
 * @returns {Object} { hub: Map<"buyerId|propertyCode", {...>>, buyers: Map<buyerId, {doNotContact}> }
 */
function readHubPreservation(ss) {
  const out = { hub: {}, buyers: {} };

  const hub = ss.getSheetByName(HUB_TAB);
  if (hub) {
    const data = hub.getDataRange().getValues();
    if (data.length > 1) {
      const headers = data[0];
      const idx = {};
      HUB_HEADERS.forEach(function (h, i) {
        idx[h] = headers.indexOf(h);
      });
      for (let r = 1; r < data.length; r++) {
        const row = data[r];
        const id = String(row[idx["Buyer ID"]] || "");
        const code = String(row[idx["Property Code"]] || "");
        if (!id || !code) continue;
        out.hub[id + "|" + code] = {
          closing: idx["Closing"] >= 0 ? String(row[idx["Closing"]] || "") : "",
          followUpStatus:
            idx["Follow-Up Status"] >= 0 ? String(row[idx["Follow-Up Status"]] || "") : "",
          lastFollowUpAt:
            idx["Last Follow-Up At"] >= 0 ? String(row[idx["Last Follow-Up At"]] || "") : "",
          nextFollowUpDate:
            idx["Next Follow-Up Date"] >= 0 ? String(row[idx["Next Follow-Up Date"]] || "") : "",
        };
      }
    }
  }

  const buyers = ss.getSheetByName(BUYERS_TAB);
  if (buyers) {
    const data = buyers.getDataRange().getValues();
    if (data.length > 1) {
      const headers = data[0];
      const iId = headers.indexOf("Buyer ID");
      const iDnc = headers.indexOf("Do Not Contact");
      if (iId >= 0 && iDnc >= 0) {
        for (let r = 1; r < data.length; r++) {
          const row = data[r];
          const id = String(row[iId] || "");
          if (!id) continue;
          const val = String(row[iDnc] || "").toLowerCase();
          out.buyers[id] = { doNotContact: val === "1" || val === "yes" || val === "true" };
        }
      }
    }
  }

  return out;
}

function buildHubRows(byBuyer, preserved) {
  const rows = [];
  for (let i = 0; i < byBuyer.length; i++) {
    const b = byBuyer[i];
    for (let j = 0; j < b.properties.length; j++) {
      const p = b.properties[j];
      const prev = preserved[b.id + "|" + p.code] || {};
      rows.push([
        b.id,
        b.name,
        b.phone,
        b.email,
        b.source || "",
        b.type || "",
        p.address,
        p.code,
        p.status,
        p.offerText,
        p.offerNumeric === null || p.offerNumeric === undefined ? "" : p.offerNumeric,
        p.earnestText,
        p.lastTouchRaw,
        p.lastTouchIso || "",
        p.notes,
        prev.closing || "",
        prev.followUpStatus || "",
        prev.lastFollowUpAt || "",
        prev.nextFollowUpDate || "",
        p.sourceRow,
      ]);
    }
  }
  return rows;
}

function buildBuyersRows(byBuyer, preserved) {
  const rows = [];
  for (let i = 0; i < byBuyer.length; i++) {
    const b = byBuyer[i];
    const prev = preserved[b.id] || {};
    const dnc = prev.doNotContact || b.doNotContact ? "1" : "";
    rows.push([
      b.id,
      b.name,
      b.phone,
      b.email,
      b.source || "",
      b.type || "",
      b.properties.length,
      b.properties
        .map(function (pp) {
          return pp.address + (pp.code ? " (" + pp.code + ")" : "");
        })
        .join(" · "),
      b.statuses.join(" · "),
      b.latest ? b.latest.iso : "",
      b.latest ? b.latest.address : "",
      b.notes || "",
      dnc,
    ]);
  }
  return rows;
}

function colorStatusColumn(sheet, col, startRow, numRows) {
  if (numRows < 1) return;
  const range = sheet.getRange(startRow, col, numRows, 1);
  const values = range.getValues();
  const bg = [];
  const fc = [];
  for (let i = 0; i < values.length; i++) {
    const style = STATUS_STYLE[String(values[i][0] || "")] || {
      bg: "#FFFFFF",
      color: "#333333",
    };
    bg.push([style.bg]);
    fc.push([style.color]);
  }
  range.setBackgrounds(bg);
  range.setFontColors(fc);
}

/**
 * Refresh all hub tabs from the source sheet.
 * @returns {Object} summary { buyers, hubRows, properties, orphanRows }
 */
function buildAndWriteHub(ss) {
  ss = ss || SpreadsheetApp.getActiveSpreadsheet();

  const source = ss.getSheetByName(SOURCE_TAB);
  if (!source) {
    throw new Error(
      "Source tab '" + SOURCE_TAB + "' not found in this spreadsheet.",
    );
  }
  assertNotSourceTab(source);

  const values = source.getDataRange().getValues();
  const backgrounds = source.getDataRange().getBackgrounds();
  const parsed = parsePropertySheet(values, backgrounds, { firstDataRow: 1 });

  const byBuyer = dedupeBuyers(parsed.records);
  const preserved = readHubPreservation(ss);

  const hub = ensureTab(ss, HUB_TAB);
  assertNotSourceTab(hub);
  const hubRows = buildHubRows(byBuyer, preserved.hub);
  writeTable(hub, HUB_HEADERS, hubRows);
  colorStatusColumn(
    hub,
    HUB_HEADERS.indexOf("Status") + 1,
    2,
    hubRows.length,
  );

  const buyers = ensureTab(ss, BUYERS_TAB);
  assertNotSourceTab(buyers);
  const buyerRows = buildBuyersRows(byBuyer, preserved.buyers);
  writeTable(buyers, BUYERS_HEADERS, buyerRows);
  colorStatusColumn(
    buyers,
    BUYERS_HEADERS.indexOf("Statuses") + 1,
    2,
    buyerRows.length,
  );

  const log = ensureTab(ss, LOG_TAB);
  assertNotSourceTab(log);
  if (log.getLastRow() === 0) {
    writeTable(log, LOG_HEADERS, []);
  }

  return {
    buyers: byBuyer.length,
    hubRows: hubRows.length,
    properties: parsed.propertyCount,
    orphanRows: parsed.orphanRows,
  };
}

/**
 * After a message is sent, mark the matching Buyer Hub row as "Sent".
 */
function markHubSent(ss, buyerId, propertyCode, timestampIso) {
  const hub = ss.getSheetByName(HUB_TAB);
  if (!hub) return;
  const data = hub.getDataRange().getValues();
  const headers = data[0];
  const iId = headers.indexOf("Buyer ID");
  const iCode = headers.indexOf("Property Code");
  if (iId < 0 || iCode < 0) return;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][iId]) === buyerId && String(data[r][iCode]) === propertyCode) {
      hub.getRange(r + 1, COL_FOLLOW_STATUS, 1, 2).setValues([["Sent", timestampIso]]);
      return;
    }
  }
}

/**
 * Find the 1-based row number of a Buyer Hub row (buyerId + propertyCode).
 * Returns -1 when not found.
 */
function findHubRow(ss, buyerId, propertyCode) {
  const hub = ss.getSheetByName(HUB_TAB);
  if (!hub) return -1;
  const data = hub.getDataRange().getValues();
  const headers = data[0];
  const iId = headers.indexOf("Buyer ID");
  const iCode = headers.indexOf("Property Code");
  if (iId < 0 || iCode < 0) return -1;
  for (let r = 1; r < data.length; r++) {
    if (String(data[r][iId]) === buyerId && String(data[r][iCode]) === propertyCode) {
      return r + 1;
    }
  }
  return -1;
}

/**
 * Append one entry to the Follow-Up Log tab.
 */
function appendLog(ss, entry) {
  const log = ensureTab(ss, LOG_TAB);
  assertNotSourceTab(log);
  if (log.getLastRow() === 0) {
    writeTable(log, LOG_HEADERS, []);
  }
  log.appendRow([
    entry.time,
    entry.buyer,
    entry.phone,
    entry.email,
    entry.property,
    entry.propertyCode,
    entry.message,
    entry.result,
    entry.messageId || "",
    entry.contactId || "",
    entry.error || "",
  ]);
}
