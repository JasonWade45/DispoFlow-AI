/**
 * Dispo Follow-Up Hub — Code.gs
 *
 * Entry point for the Google Sheets bound script:
 *   - Custom menu "Dispo Follow-Up Hub" (on open / install)
 *   - Refresh Buyer Hub (reads Property Sheet, writes new tabs only)
 *   - Follow-Up Sender sidebar (per-buyer "Send" buttons → DispoGenius SMS)
 *   - Settings sidebar (PIT token + Location ID)
 *
 * Hard rule enforced in code: the source tab "Property Sheet" is read-only;
 * every write target is asserted not to be the source tab.
 */

"use strict";

const SOURCE_TAB = "Property Sheet";
const HUB_TAB = "Buyer Hub";
const BUYERS_TAB = "Buyers (Unique)";
const LOG_TAB = "Follow-Up Log";

function onOpen(e) {
  SpreadsheetApp.getUi()
    .createMenu("Dispo Follow-Up Hub")
    .addItem("Refresh Buyer Hub", "refreshBuyerHub")
    .addSeparator()
    .addItem("Open Follow-Up Sender", "openFollowUpSender")
    .addSeparator()
    .addItem("Settings (API Token)", "openSettings")
    .addItem("Test DispoGenius Connection", "testConnectionMenu")
    .addSeparator()
    .addItem("About / Help", "showAbout")
    .addToUi();
}

function onInstall(e) {
  onOpen(e);
}

/**
 * Menu action: rebuild Buyer Hub / Buyers (Unique) / Follow-Up Log from the
 * source sheet (read-only). Never touches Property Sheet.
 */
function refreshBuyerHub() {
  const ui = SpreadsheetApp.getUi();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  try {
    if (!ss.getSheetByName(SOURCE_TAB)) {
      ui.alert(
        "Source tab '" +
          SOURCE_TAB +
          "' not found in this spreadsheet. Rename your source tab to 'Property Sheet'.",
      );
      return;
    }
    const summary = buildAndWriteHub(ss);
    ss.toast(
      "Buyer Hub refreshed: " +
        summary.buyers +
        " buyers · " +
        summary.hubRows +
        " property interests · " +
        summary.properties +
        " properties.",
      "Dispo Follow-Up Hub",
      5,
    );
  } catch (e) {
    ui.alert(
      "Refresh failed:\n" + (e instanceof Error ? e.message : String(e)),
    );
  }
}

function openFollowUpSender() {
  const ui = SpreadsheetApp.getUi();
  const html = HtmlService.createTemplateFromFile("sidebar")
    .evaluate()
    .setTitle("Send Follow-Up")
    .setWidth(480);
  ui.showSidebar(html);
}

function openSettings() {
  const ui = SpreadsheetApp.getUi();
  const html = HtmlService.createTemplateFromFile("settings")
    .evaluate()
    .setTitle("DispoGenius Settings")
    .setWidth(440);
  ui.showSidebar(html);
}

function testConnectionMenu() {
  const ui = SpreadsheetApp.getUi();
  try {
    const res = testConnection();
    ui.alert(
      "DispoGenius connection OK — location: " + res.locationId,
    );
  } catch (e) {
    ui.alert(
      "Connection test failed:\n" + (e instanceof Error ? e.message : String(e)),
    );
  }
}

function showAbout() {
  const ui = SpreadsheetApp.getUi();
  ui.alert(
    "Dispo Follow-Up Hub\n\n" +
    "Reads the 'Property Sheet' tab (read-only) and organizes buyers into new tabs:\n" +
    "• Buyer Hub — one row per buyer × property, with an editable Closing field.\n" +
    "• Buyers (Unique) — one row per buyer, deduplicated by phone/email.\n" +
    "• Follow-Up Log — every message sent through DispoGenius.\n\n" +
    "Open the Follow-Up Sender sidebar to send a follow-up SMS to any buyer " +
    "through the DispoGenius API. The original Property Sheet is never modified.",
  );
}

// ---------------------------------------------------------------------------
// Exposed to the sidebars via google.script.run
// ---------------------------------------------------------------------------

/**
 * Rows from Buyer Hub that are reachable for follow-up (excludes "Remove Me"
 * and rows without a phone number).
 */
function getBuyersForSending() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const hub = ss.getSheetByName(HUB_TAB);
  if (!hub) return [];
  const data = hub.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  const col = {};
  headers.forEach(function (h, i) {
    col[h] = i;
  });
  const rows = [];
  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    const status = String(row[col["Status"]] || "");
    if (status === "Remove Me") continue;
    const phone = String(row[col["Phone"]] || "").trim();
    if (!phone) continue;
    rows.push({
      buyerId: String(row[col["Buyer ID"]] || ""),
      name: String(row[col["Buyer Name"]] || ""),
      phone: phone,
      email: String(row[col["Email"]] || ""),
      propertyAddress: String(row[col["Property Address"]] || ""),
      propertyCode: String(row[col["Property Code"]] || ""),
      status: status,
      offer: String(row[col["Offer"]] || ""),
      closing: String(row[col["Closing"]] || ""),
      sourceRow: row[col["Source Row"]],
    });
  }
  return rows;
}
