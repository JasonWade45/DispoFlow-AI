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
- The 7 core collections (properties, buyers, relationships, interactions, tasks, offers, access_infoTable) can optionally be stored as normalized tables — see [Database schema (normalized tables)](#database-schema-normalized-tables).

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
- **Vitest** + jsdom — **233 tests passing**
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
# Optional: DATA_SOURCE=tables reads/writes the 7 core collections as real
# tables (dual-written with app_state). Default (unset or blob) = blob only.

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
CRON_SECRET=...

# Optional: data-loss alerts (Slack/Discord incoming webhook). Posts a message
# when a guarded collection drops >=50% on save or a blob-mode writer is
# detected; rate-limited to one message per kind per 10 minutes.
DATA_ALERT_WEBHOOK_URL=...
```

> **Deploying to Vercel:** add the same variables in Project Settings → Environment Variables, set `NEXT_PUBLIC_APP_URL` to your production URL, authorize the production OAuth callback in Google Cloud Console, and put `CRON_SECRET` there too so the daily sync cron works. Publish the Google OAuth app to Production (Testing mode expires sessions after 7 days).

## Database schema (normalized tables)

The 7 core collections can live in real Postgres tables instead of the `app_state` JSON blob, selected by the `DATA_SOURCE` env var:

- **unset or `blob` (default)** — everything reads/writes `app_state`, exactly as before.
- **`tables`** — dual write: every save writes **both** `app_state` and the tables; loads read the core collections from the tables and fall back to the blob if the tables are unreachable or still empty. The blob always stays complete, so reverting is just removing the env var.

Integrity rules in `tables` mode:

- Loads are **workspace-scoped** (`workspace_id`), so rows of other workspaces are never returned and never deleted.
- Saves upsert first, then **delete-sync** the rows that are absent from the payload — but only when the payload actually came from a tables load (the client echoes the load's `source`); a blob-fallback payload only upserts, never deletes.
- A row that fails to parse is logged, skipped, and protected from delete-sync instead of failing the whole load.
- Saving to the blob while the tables still hold data logs an error (mixed-mode writer), and a save that drops a guarded collection (offers/properties/buyers/relationships/tasks) by ≥50% logs an alert; every `app_state` update is also snapshotted into `app_state_history` by migration 0002. Set `DATA_ALERT_WEBHOOK_URL` to also post those alerts to Slack/Discord.
- Saves are **optimistic**: the client sends the `app_state.updated_at` it last saw (`base`); if another tab/device/cron wrote first, the server rejects with **409** and writes nothing. The client then merges per entity (newer `updatedAt` wins, ties keep the server copy) and retries — no more silent last-writer-wins overwrites. The daily-sync cron skips its save on conflict instead of clobbering a human edit.
- `GET /api/state/summary` returns counts + `source` + last-write time **without** the full db (exact head-counts against the tables in `tables` mode, blob counts otherwise) — the Settings → Cloud storage card uses it for a cheap health check.

### One-time migration runbook (Supabase SQL editor, in order)

1. `supabase/schema.sql` — already applied in this project (creates `app_state`).
2. `supabase/migrations/0001_normalize_schema.sql` — creates the 7 tables, indexes, and deny-all RLS (service role only); workspace-scoped RLS policies land in Phase 3.
3. `supabase/migrations/0001_normalize_backfill.sql` — copies the blob into the tables. Idempotent: re-running refreshes tables from the blob (rows without `id` are skipped; a cast error means a corrupt value in the blob).
4. `supabase/migrations/0002_state_backups_and_rls.sql` — snapshots every `app_state` update into `app_state_history` (latest 25 per key, restorable by hand — see the comment inside the file) and replaces the deny-all policies with workspace-scoped RLS (inert until Supabase Auth is adopted; the service role is unaffected).
5. Set `DATA_SOURCE=tables` in the deployment env and redeploy.

### Revert

Remove `DATA_SOURCE` (or set it to `blob`) and redeploy — the blob was dual-written the whole time, so no data migration back is needed. To refresh the tables from the blob again later, re-run step 3.

> **Warning before re-running step 3:** the backfill copies the blob *into* the tables. If the blob is stale (e.g. the 2026-10-20 import wiped collections and left `offers = 0` in the blob while the tables held 399), re-running it overwrites good table data. Compare row counts first (`select count(*) from offers;` vs the blob), and prefer restoring the blob from `app_state_history` (migration 0002) instead.

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

233 tests across 16 files cover sheet mapping/grouped-row sync, DispoGenius import/enrichment/relinking, the daily sync pipeline, AI follow-up generation, task actions, merging, overdue queues, scraping parsing, the conflict merge (per-entity newer-wins), the alert webhook (delivery + cooldown), summary counts, and the normalized-table repository (row mapping, workspace scoping, skip-on-parse-failure, delete-sync, save round-trips).

## Development notes

- `tsconfig` uses `"strict": true`. Fallible operations return `Result<T>` from `src/lib/result.ts` — narrow with `if (!r.ok)`.
- `export const runtime = "nodejs"` is forbidden in this Next version; use `maxDuration` instead. Check `node_modules/next/dist/docs/` before writing route code.
- Shell here is PowerShell: no `&&`, no `grep`/`head`.
- Never run `next build` while `next dev` is running.
- The app state is the single source of truth for the UI and is mirrored to Supabase; `DATA_SOURCE=tables` additionally mirrors the 7 core collections to normalized tables (see [Database schema](#database-schema-normalized-tables)).
