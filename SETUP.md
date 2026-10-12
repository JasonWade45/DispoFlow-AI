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
4. Scopes used: `spreadsheets.readonly`, `spreadsheets`, `drive.readonly`

### 4. Set env vars and redeploy

Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to your Vercel project (Settings → Environment Variables), then redeploy.

### 5. Connect

Go to **Settings → Integrations → Google Sheets** in the app, click **Connect Google Account**, pick a spreadsheet and worksheet, review the auto-mapped columns, and import.

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
