# DispoFlow AI — Setup Guide

AI-powered real estate disposition and follow-up SaaS for US wholesaling teams.

## Quick Start

```bash
npm install
npm run dev
```

Open http://localhost:3000 and log in with a demo account (password: `demo1234`):

| Email | Role |
|---|---|
| `owner@dispoflow.demo` | Owner / Admin |
| `sarah@dispoflow.demo` | Team member |
| `marcus@dispoflow.demo` | Team member |

## Environment Variables

Create a `.env.local` file (already present in local dev). Only Google Sheets integration needs env vars — everything else works without any configuration.

```bash
# Required only for Google Sheets integration (see below)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Optional — defaults to {NEXT_PUBLIC_APP_URL}/api/sheets/oauth/callback
GOOGLE_REDIRECT_URI=
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## Google Sheets Integration

The full integration code is built (OAuth, spreadsheet picker, column auto-mapping, import preview, row import) but shows **"Not connected"** until you provide Google credentials.

### 1. Create a Google Cloud project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select an existing one)
3. Enable the **Google Sheets API** and **Google Drive API**:
   - APIs & Services → Library → search "Google Sheets API" → Enable
   - APIs & Services → Library → search "Google Drive API" → Enable

### 2. Create OAuth credentials

1. APIs & Services → Credentials → Create Credentials → **OAuth client ID**
2. Application type: **Web application**
3. Authorized redirect URI:
   - Local dev: `http://localhost:3000/api/sheets/oauth/callback`
   - Production: `https://your-app.vercel.app/api/sheets/oauth/callback`
4. Copy the **Client ID** and **Client Secret**

### 3. Configure the consent screen

1. APIs & Services → OAuth consent screen
2. User type: **External**
3. Add yourself as a **Test user** (until the app is verified)
4. Scopes used (read-only — the app can never modify your sheet): `spreadsheets.readonly`, `drive.readonly`

### 4. Set env vars and redeploy

Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to your Vercel project (Settings → Environment Variables), then redeploy.

### 5. Connect

Go to **Settings → Integrations → Google Sheets** in the app, click **Connect Google Account**, pick a spreadsheet and worksheet, review the auto-mapped columns, and click **Sync Now**. Save the mapping first if you adjusted any column assignments.

## Google Sheet Auto-Sync (Sheet → App)

After connecting, the app keeps the system in sync with the sheet automatically:

- **Polling:** the sheet is read every **5 minutes** while the app is open in the browser (plus on tab focus and on demand via **Sync sheet now** in the green banner or **Sync Now** on the settings page). Data lives in browser localStorage, so sync runs in the browser — same model as the ElevateReg sync.
- **Read-only:** OAuth is requested with `spreadsheets.readonly` + `drive.readonly` only — the sheet is **never modified**.
- **Merge rules:** non-empty sheet cells win over app values; empty cells leave the app value untouched. Status changes are logged to the Activity Log (and auto-cancel open tasks on Sold/Cancelled, same as manual edits).
- **New rows** create a property, and — when those columns are mapped — a buyer, buyer-property link, offer (from Offer Amount), and follow-up task (from Next Follow-up Date).
- **Matching:** normalized address → listing URL → source row id (resilient to rows moving around).
- **Deleted sheet rows never delete app data** — they are only reported as `missing` in the sync summary.
- **History:** each sync that changed something is written to Import History and `SyncJob`; the last sync status is shown on the settings page.

## Daily Property Sync (ElevateReg)

- The app auto-scrapes [ElevateReg.com](https://elevatereg.com) once every 24 hours on page load (banner at the top of the dashboard).
- You can also trigger **Sync now** from the banner.
- New listings are imported automatically; up to 8 properties per sync are enriched with ARV, comps, specs, and photos from their detail pages.
- Access type (lockbox / appointment / vacant) is **manual** — ElevateReg does not publish it.

## Follow-Up Semantics

- **Mark Sent** (message tasks): records the send timestamp (`sentAt`) and updates the buyer relationship's `lastMessageSentAt` / `lastContactedAt`. Completes the task.
- **Complete**: marks the task done with `completedVia: "complete"`. For call tasks, updates `lastCallAt`.
- Completing an already-completed task is a **no-op** (idempotent).
- Task rows link to `/properties/[id]?buyer=[buyerId]` which focuses that buyer in the property's communication history.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm test` | Vitest (22 tests: parsing, money, task semantics) |

## Data Storage

All data lives in **browser localStorage** (`dispoflow_db_v1`). No backend database is required. Demo data resets via the Settings page. Data schema is versioned (v2) with automatic migration from v1.

## Limitations

- AI features (note enhancement, follow-up drafting) are deterministic stubs — no external AI API is wired.
- Google Sheets integration requires OAuth credentials (see above); without them the UI shows setup instructions.
- ElevateReg scraping runs client-side via Next.js API routes; Vercel serverless functions cap execution at 60s per route.
- No multi-tenant auth — demo login only selects a user session.
