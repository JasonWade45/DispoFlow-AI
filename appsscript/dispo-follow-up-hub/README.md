# Dispo Follow-Up Hub — Google Apps Script

A stand-alone Google Apps Script project bound to your Dispo Sheet. It reads the
"Property Sheet" tab (read-only), organizes buyers into **new tabs only**, and
adds a "Send Follow-up" sidebar that sends the message straight to the buyer
through the DispoGenius (GoHighLevel / LeadConnector) API.

## Files

| File | Purpose |
|---|---|
| `Code.gs` | Custom menu + server functions called by the sidebars |
| `parser.gs` | Pure sheet parser (no Google services — testable offline) |
| `hub.gs` | Writes/refreshes the new tabs; preserves user-edited fields |
| `ghl.gs` | DispoGenius / GoHighLevel API client (contact upsert + SMS) |
| `send.gs` | Send follow-up → log → mark Buyer Hub row |
| `settings.gs` | Token / location storage in script properties |
| `sidebar.html` | Follow-Up Sender UI (per-buyer "Send" buttons) |
| `settings.html` | API token + Location ID settings UI |

## Hard rule — original data is never touched

The script only **reads** `Property Sheet`. Every write target is asserted at
runtime (`assertNotSourceTab`), so the script cannot modify, delete, re-sort, or
reformat the original tab. All new data lives in new tabs:

- **Buyer Hub** — one row per buyer × property (actionable follow-up view),
  including an editable **Closing** column (free text, e.g. "around end of
  month") that survives refreshes.
- **Buyers (Unique)** — one row per buyer, deduplicated by phone then email then
  name, with aggregated properties, statuses, and latest touch date.
- **Follow-Up Log** — append-only log of every message sent (time, buyer,
  property, message, result, message/contact ids, errors).

## Setup

1. Open your Google Sheet (the one containing the `Property Sheet` tab).
2. **Extensions → Apps Script** → create a new script project.
3. Copy the files above into the project (or clone with [clasp](https://github.com/google/clasp):
   `clasp clone <SCRIPT_ID>`, copy the files in, then `clasp push`).
4. Save, then **reload the spreadsheet**. A "Dispo Follow-Up Hub" menu appears.
5. **DispoFollow-Up Hub → Settings**: paste your DispoGenius PIT token (and
   Location ID if you know it), Save, then Test connection.
   - Get the PIT token from DispoGenius / GoHighLevel → Settings → API tokens.
   - The token is stored per-user in the script's properties, never in the sheet.
6. **Dispo Follow-Up Hub → Refresh Buyer Hub** — this creates the three new tabs
   from `Property Sheet` (offers are parsed to numeric, original text kept;
   dates normalized; "Remove Me" buyers flagged).
7. **Dispo Follow-Up Hub → Open Follow-Up Sender** — pick a buyer, adjust the
   message (placeholders: `{name}` `{property}` `{code}` `{offer}` `{closing}`),
   click **Send**. The message goes out via DispoGenius (`POST /contacts/` upsert
   → `POST /conversations/messages` SMS), the result is logged, and the Buyer Hub
   row is marked "Sent".

## Sending API details

- Contact upsert: `POST https://services.leadconnectorhq.com/contacts/` with
  `locationId`, `phone`, `name`, `email`, `source: "Dispo Follow-Up Hub"`.
- SMS: `POST https://services.leadconnectorhq.com/conversations/messages` with
  `type: "SMS"`, `contactId`, `message`.
- Version headers: `2021-07-28` for contacts, `2021-04-15` for messages.

## Maintenance

- Re-run **Refresh Buyer Hub** whenever you update the source sheet. User-edited
  fields (Closing, Next Follow-Up Date, Do Not Contact, Follow-Up Status) are
  preserved across refreshes.
- "Remove Me" buyers are excluded from the Follow-Up Sender and flagged in the
  Buyers (Unique) tab.
