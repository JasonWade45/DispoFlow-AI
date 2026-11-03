/**
 * Dispo Follow-Up Hub — ghl.gs
 *
 * Thin client for the DispoGenius / GoHighLevel (LeadConnector) REST API:
 *   https://services.leadconnectorhq.com
 *
 * Used for:
 *   1. Contact upsert   POST /contacts/        (creates or finds the buyer contact)
 *   2. Outbound SMS     POST /conversations/messages (sends the follow-up)
 *
 * All requests bear the DispoGenius Private Integration Token as a Bearer
 * token and a GHL Version header, mirroring the DispoFlow Next.js app.
 */

"use strict";

const GHL_BASE = "https://services.leadconnectorhq.com";

/**
 * @param {string} token   DispoGenius PIT token
 * @param {string} path    API path, e.g. "/contacts/"
 * @param {string} version GHL Version header value, e.g. "2021-07-28"
 * @param {Object|null} body  JSON body for POST; null/undefined for GET
 * @returns {Object} parsed JSON response
 */
function ghlFetch(token, path, version, body) {
  const url = GHL_BASE + path;
  const options = {
    method: body === undefined || body === null ? "get" : "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    headers: {
      Authorization: "Bearer " + token,
      Version: version,
      Accept: "application/json",
    },
  };
  if (body !== undefined && body !== null) {
    options.payload = JSON.stringify(body);
  }

  const response = UrlFetchApp.fetch(url, options);
  const code = response.getResponseCode();
  const text = response.getContentText() || "";
  let data = {};
  try {
    data = JSON.parse(text);
  } catch (e) {
    data = { _raw: text };
  }

  if (code >= 400) {
    const msg =
      data && data.message ? data.message : JSON.stringify(data).slice(0, 500);
    throw new Error(
      "DispoGenius API " + code + " on " + path + ": " + msg,
    );
  }
  return data;
}

/**
 * Resolve the location ID: use the saved one, or discover the first location
 * attached to the token via /locations/search.
 */
function resolveLocationId(token, explicit) {
  if (explicit) return String(explicit);
  const data = ghlFetch(token, "/locations/search", "2021-07-28", null);
  let locations = [];
  if (data && Array.isArray(data.locations)) {
    locations = data.locations;
  } else if (data && Array.isArray(data.data)) {
    locations = data.data;
  }
  if (!locations || locations.length === 0) {
    throw new Error("No DispoGenius locations found for this token.");
  }
  return String(locations[0].id);
}

/**
 * Upsert the buyer as a DispoGenius contact and return the contact id.
 */
function upsertContact(token, locationId, phone, name, email) {
  const body = {
    locationId: locationId,
    phone: phone,
    source: "Dispo Follow-Up Hub",
  };
  if (name) body.name = name;
  if (email) body.email = email;

  const data = ghlFetch(token, "/contacts/", "2021-07-28", body);
  const contact = data && data.contact ? data.contact : data;
  const id =
    (contact && contact.id) ||
    (contact && contact.contactId) ||
    (data && data.id) ||
    null;
  if (!id) {
    throw new Error("DispoGenius did not return a contact id for this phone number.");
  }
  return String(id);
}

/**
 * Send an outbound SMS to an existing contact.
 * @returns {Object} { messageId, conversationId, raw }
 */
function sendSms(token, contactId, message) {
  const data = ghlFetch(token, "/conversations/messages", "2021-04-15", {
    type: "SMS",
    contactId: contactId,
    message: message,
  });
  const rawId =
    (data && data.id) ||
    (data && data.messageId) ||
    (data && data.message && data.message.id) ||
    "";
  return {
    messageId: String(rawId),
    conversationId: (data && data.conversationId) ? String(data.conversationId) : "",
    raw: data,
  };
}
