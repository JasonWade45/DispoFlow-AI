# DispoFlow AI

Disposition follow-up workspace for US real-estate investment teams. The current build is an interactive English (US) prototype with sample workspace data and browser-local persistence.

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Next.js. The app binds to `0.0.0.0` for hosted previews.

Run the local database authorization smoke test with:

```bash
npm run test:security
```

## Included in this prototype

- Dashboard with follow-up queue, pipeline snapshot, property activity, and a clearly labeled draft preview.
- Property and buyer directories with search, status filters, and contextual detail drawers.
- Buyer–property relationships that keep interest status separate from buyer and property status.
- Follow-up management with overdue, due-today, upcoming, unscheduled, and completed views.
- Manual interaction logging with separate occurred/recorded timestamps and preserved original notes.
- Offer tracking and an activity timeline that distinguishes incoming, outgoing, and internal events.
- Reports and workspace/team/workflow/AI privacy settings views.
- Create property, buyer, relationship, follow-up, offer, and interaction flows.
- **Demo Mode** is clearly labeled in the app. It uses a seeded fictitious dataset, persists only in this browser's `localStorage`, and can be reset with **Settings → AI & privacy → Reset demo workspace data**.
- Responsive desktop, tablet, and mobile layouts; `⌘/Ctrl + K` opens global search.

## Phase 0 validation kit

- [Five-minute manager demo script](docs/DEMO_SCRIPT.md)
- [Interview questions, baseline metrics, and proposed go/no-go criteria](docs/VALIDATION.md)

## Security and data handling status

A proposed Supabase/PostgreSQL foundation is in `supabase/migrations/0001_disposition_core.sql`. It now includes organization-scoped RLS policies, column-level grants, tenant-scoped relationship constraints, metadata and audit triggers, and client-write-protected interaction/history tables. The migration has **not** been applied to Supabase and is not production-verified. A local PostgreSQL-compatible smoke test passed with stubbed Supabase auth objects; see [`SECURITY_REVIEW.md`](SECURITY_REVIEW.md) for the exact scope and remaining checks.

The prototype itself has no authentication or server-side database. `localStorage` is not a safe store for real buyer/customer data; use fake data only. The draft preview is a local deterministic template, not a connected AI service. There is no SMS, email, calling, DispoGenius, or other live integration, and no messages are sent automatically.

Before entering real customer data or inviting a team, apply and test the migration in an isolated Supabase staging project, verify API schema exposure and role permissions, and complete the security checks listed in `SECURITY_REVIEW.md`. Keep all service-role and AI-provider secrets server-side. Pilot with fake data first; use real team data only with clear permission.
