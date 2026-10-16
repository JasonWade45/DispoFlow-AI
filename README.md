# DispoFlow AI

An AI-powered real-estate dispositions CRM. It pulls motivated-seller leads from a Google Dispo Sheet and from **DispoGenius** (GoHighLevel) conversations, links every buyer to the property they inquired about, tracks offers and follow-ups, and uses AI to draft outreach messages the team can review and send by SMS — all from one dashboard.

**Live:** https://dispo-flow-ai-so4x.vercel.app
**Repo:** https://github.com/JasonWade45/DispoFlow-AI (push to `main` → Vercel auto-deploys)

---

## What the system does

| Area | Capability |
|---|---|
| **Dashboard** | KPIs, sync banner, AI access-info (lockbox codes, showing times) beside property addresses |
| **Properties** | Card grid with photos, detail pages, auto-merge of duplicates, ElevateReg scraping (beds/baths/sqft) |
| **Buyers** | Full profiles, linked properties, communication history with dates, filters by **Source / phone / name / property**, sorted lists |
| **Follow-ups** | AI-drafted SMS queue with **For whom → Which property → Message text → Send button**; overdue/due/scheduled tabs; anti-repetition engine |
| **Offers** | Offer tracking per buyer/property with open/closed states |
| **Board** | Drag-and-drop Kanban pipeline of status columns |
| **Activity** | Unified interaction log (incoming/outgoing SMS, calls, notes) imported from DispoGenius |
| **Reports** | Performance summaries |
| **Settings** | Google Sheets connection + column mapping, DispoGenius connection/SMS, Trello import |

---

## Integrations

### 1. Google Sheets (Dispo Sheet) — read-only
- OAuth connection (scopes limited to `spreadsheets.readonly` + `drive.readonly` — the sheet is **never modified**).
- Handles the **grouped sheet layout**: column B holds both the property address (property rows) and the lead Source (buyer rows: *"Dipo Genuis"*, *"Facebook"*, *"Investorbase"*). The address is carried down onto each buyer row so every buyer gets a property.
- Auto column mapping (AI-assisted via `api/ai/map-columns`), inspect worksheets, reconnect flow when the token expires.
- Sheet sync **first** creates buyers + relationships → DispoGenius sync **second** matches them by phone and adds conversations.

### 2. DispoGenius = GoHighLevel
- Base `https://services.leadconnectorhq.com`, contact/conversation import, scope guidance on permission errors (friendly message listing the 5 required scopes).
- **Send SMS**: upserts the contact and sends a message (`POST /api/dispo-genius/send`), logs the interaction, marks the follow-up task as sent.
- Lightweight connection check (`?check=1`, ~1s instead of ~16s).

### 3. Groq AI
- Follow-up message drafting (`api/ai/followup`) with template fallback when AI is unavailable.
- Access-info extraction (lockbox codes + showing times) and column-mapping assistance.

### 4. Supabase (cloud persistence)
- `app_state` table stores the whole workspace state (`api/state`), so data survives across devices/restarts.
- Store hydrates from the cloud on load and saves debounced on change.

### 5. Trello
- API proxy, board/list/card import for migrating existing pipelines.

### 6. ElevateReg scraper
- Property scraping (beds/baths/sqft/comps) with sync that updates existing properties instead of duplicating.

---

## Key features built in this project

### Data pipeline
1. **Grouped sheet sync fix** — buyers are now created from grouped sheet rows (was 0 buyers → **1,112 buyers with linked properties**), and carried rows populate `relationship.interestNotes` without clobbering property notes.
2. **Name enrichment** — placeholder buyer names (a bare phone number, `-`, `" raquel"`) are auto-filled from DispoGenius conversations matched by phone/email (`enricher` in `dispo-genius.ts`).
3. **Orphan message relinking** — 145 previously imported messages without a buyer/property are re-attached by message-ID → conversation → buyer/property matching (`relinkDgInteractions`).
4. **Buyer matching across sources** — by phone (digits / last 10), then email, then name, so the same person from the sheet and from DispoGenius is one record.

### Buyer filters (page `buyers`)
- **Source** dropdown (Facebook, Dipo Genuis, DispoGenius, …) + Source column.
- **With / without phone number.**
- **With real name / without name (phone only).**
- **Property** filter + Properties column showing up to 2 linked addresses.

### Follow-up drafts (page `follow-ups`)
- Every AI draft shows **who** (buyer name + phone), **which property**, and the **full message text**.
- One-click **Send SMS** → sends via DispoGenius, logs an `Outgoing SMS` interaction, and marks the task sent — with per-task sending/sent/error states.
- Tabs: All · Drafts · Overdue · Due · Scheduled · Needs Scheduling · Completed · Cancelled.

### Automation
- **Daily cron** (`0 6 * * *` on Vercel, protected by `CRON_SECRET`) runs sheet sync → DispoGenius sync → name enrichment → relinking → follow-up draft creation.
- 5-minute Google Sheet polling with full-sheet field merge and upserts.

---

## Tech stack

- **Next.js 16.4** (App Router, `cacheComponents`, Turbopack) + **React 19**
- **TypeScript** + **Tailwind CSS 4**
- **Vitest** + jsdom — **168 tests passing**
- **Supabase** (cloud state), **Groq** (AI), **Google OAuth** (Sheets), **GoHighLevel** (DispoGenius SMS), **Trello**, **Vercel** (hosting + cron)

## Getting started

```bash
npm install
npm run dev      # http://localhost:3000
npm test         # vitest run
npm run lint
npm run build
```

Copy your secrets into `.env.local` (git-ignored):

```bash
# Google (read-only Sheets)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

# DispoGenius (GoHighLevel)
DISPOGENIUS_PIT_TOKEN=...
DISPOGENIUS_LOCATION_ID=...

# AI
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-120b

# Supabase (cloud state)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=...
```

> **Deploying to Vercel:** add the same variables in Project Settings → Environment Variables, set `NEXT_PUBLIC_APP_URL` to your production URL, authorize the production OAuth callback in Google Cloud Console, and put `CRON_SECRET` there too so the daily sync cron works. Publish the Google OAuth app to Production (Testing mode expires sessions after 7 days).

## Project structure

```
src/
├─ app/
│  ├─ (app)/            # Authenticated UI: dashboard, properties, buyers,
│  │                    #   offers, follow-ups, board, activity, reports, settings
│  ├─ api/
│  │  ├─ ai/            # followup drafting, access-info, column mapping
│  │  ├─ cron/          # daily-sync (secured with CRON_SECRET)
│  │  ├─ dispo-genius/  # conversations import, send SMS
│  │  ├─ sheets/        # OAuth, inspect, spreadsheets, worksheets
│  │  ├─ state/         # Supabase cloud persistence
│  │  ├─ sync/          # ElevateReg sync
│  │  └─ trello/        # boards, lists, cards proxy
│  └─ login/
├─ lib/
│  ├─ sheet-sync.ts     # grouped-row sync, buyer/relationship upserts
│  ├─ sheet-mapping.ts  # logical fields, header aliases, carryAddress
│  ├─ dispo-genius.ts   # conversation import, name enrichment, relinking
│  ├─ daily-sync.ts     # orchestration of the daily pipeline
│  ├─ cloud-state.ts    # Supabase load/save
│  ├─ actions.ts        # mutations (tasks, interactions, offers)
│  ├─ selectors.ts      # derived queries
│  ├─ store.ts          # client state
│  └─ merge.ts          # duplicate auto-merge
└─ types/               # shared domain types
```

## Testing

```bash
npm test
```

168 tests across 11 files cover sheet mapping/grouped-row sync, DispoGenius import/enrichment/relinking, the daily sync pipeline, AI follow-up generation, task actions, merging, and scraping parsing.

## Development notes

- `tsconfig` uses `"strict": false` — after `if (!x.ok)` you must check `x.ok === false` to narrow unions.
- `export const runtime = "nodejs"` is forbidden in this Next version; use `maxDuration` instead. Check `node_modules/next/dist/docs/` before writing route code.
- Shell here is PowerShell: no `&&`, no `grep`/`head`.
- Never run `next build` while `next dev` is running.
- The app state is the single source of truth for the UI and is mirrored to Supabase.
