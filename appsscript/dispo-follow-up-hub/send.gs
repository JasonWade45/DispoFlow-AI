/**
 * Dispo Follow-Up Hub — send.gs
 *
 * Send a follow-up SMS to a buyer through the DispoGenius (GoHighLevel)
 * API, then log the outcome and mark the Buyer Hub row.
 */

"use strict";

const USER_PROPS = PropertiesService.getUserProperties();

function getSetting(key) {
  return USER_PROPS.getProperty(key) || "";
}
function saveSetting(key, value) {
  USER_PROPS.setProperty(key, value);
}
function getToken() {
  return getSetting("DG_TOKEN");
}
function getLocationId() {
  return getSetting("DG_LOCATION_ID");
}

/**
 * Send one follow-up message.
 * @param {Object} payload
 *   { buyerId, name, phone, email, propertyAddress, propertyCode, message }
 * @returns {Object} { result, contactId, messageId, timeLabel, error }
 */
function sendFollowUp(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const now = new Date();
  const timeIso = now.toISOString();
  const timeLabel = now.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  const entry = {
    time: timeIso,
    buyer: payload.name || "",
    phone: payload.phone || "",
    email: payload.email || "",
    property: payload.propertyAddress || "",
    propertyCode: payload.propertyCode || "",
    message: payload.message || "",
    result: "Error",
    messageId: "",
    contactId: "",
    error: "",
  };

  try {
    const token = getToken();
    if (!token) {
      throw new Error(
        "DispoGenius API token is not configured. Open Dispo Follow-Up Hub → " +
          "Settings, save your PIT token (and Location ID), then try again.",
      );
    }

    const phone = String(payload.phone || "").trim();
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) {
      throw new Error(
        "Invalid phone number for " + (payload.name || "this buyer") + ": " + phone,
      );
    }

    let locationId = getLocationId();
    if (!locationId) {
      locationId = resolveLocationId(token);
      saveSetting("DG_LOCATION_ID", locationId); // remember for next time
    }

    const contactId = upsertContact(
      token,
      locationId,
      phone,
      payload.name || "",
      payload.email || "",
    );
    entry.contactId = contactId;

    const sent = sendSms(token, contactId, payload.message);
    entry.messageId = sent.messageId;
    entry.result = "Sent";

    // Mark the Buyer Hub row so the hub shows follow-up state.
    markHubSent(ss, payload.buyerId, payload.propertyCode, timeIso);

    return {
      result: entry.result,
      contactId: entry.contactId,
      messageId: entry.messageId,
      timeLabel: timeLabel,
      error: "",
    };
  } catch (e) {
    entry.error = e instanceof Error ? e.message : String(e);
    throw e; // surface in the sidebar; the entry is still logged below
  } finally {
    // Best-effort: never let a logging failure mask the real result.
    try {
      appendLog(ss, entry);
    } catch (logErr) {
      console.error("Follow-Up Log write failed:", logErr);
    }
  }
}
