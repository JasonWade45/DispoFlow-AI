/**
 * Dispo Follow-Up Hub — settings.gs
 *
 * DispoGenius credentials are stored per-user in the script's user properties
 * (never in the sheet, never hard-coded).
 */

"use strict";

var USER_PROPS = PropertiesService.getUserProperties();

function getSetting(key) {
  return USER_PROPS.getProperty(key) || "";
}
function saveSetting(key, value) {
  USER_PROPS.setProperty(key, value);
}

function getSettings() {
  return {
    tokenSet: !!getToken(),
    locationId: getLocationId(),
  };
}

function saveSettings(token, locationId) {
  if (token) {
    saveSetting("DG_TOKEN", token);
  }
  // Location ID may be blank — it is auto-discovered from the token when missing.
  if (locationId !== undefined) {
    saveSetting("DG_LOCATION_ID", locationId);
  }
  return { ok: true };
}

function testConnection() {
  const token = getToken();
  if (!token) {
    throw new Error("No API token saved yet.");
  }
  const locationId = resolveLocationId(token, getLocationId());
  return { ok: true, locationId: locationId };
}

function getToken() {
  return USER_PROPS.getProperty("DG_TOKEN") || "";
}

function getLocationId() {
  return USER_PROPS.getProperty("DG_LOCATION_ID") || "";
}

// Exposed for the settings sidebar (google.script.run calls these directly).
