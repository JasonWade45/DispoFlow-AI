# Security review status

**Review date:** 2026-10-09

**Status:** Candidate database safeguards have been implemented and smoke-tested locally. The Supabase migration has **not** been applied to a real Supabase/PostgreSQL project, so production tenant isolation is not yet verified.

## Scope

This pass reviewed the prototype boundary and `supabase/migrations/0001_disposition_core.sql` for row-level security, tenant isolation, permissions, input constraints, and client-side audit/history tampering. It is not a penetration test, a review of a live Supabase project, or approval to use real customer data.

## Safeguards now in the migration

- RLS is enabled for all ten organization-scoped tables. Member access is scoped by organization; deletes are admin-only on operational records; interactions are client-append-only.
- Membership helper functions are in a `private` schema rather than the default `public` schema. The migration grants authenticated-role access needed by RLS. **Keep `private` out of Supabase/PostgREST's exposed API schemas.**
- Composite foreign keys bind buyer/property relationships, interactions, offers, tasks, and assignees to the same organization. A unique constraint prevents duplicate buyer–property relationships; a normalized-address index prevents common duplicate-property entries within an organization.
- Column-level grants omit surrogate row IDs and actor/timestamp metadata; tenant ownership and relationship endpoints cannot be reassigned on updates. Tenant IDs needed on inserts are still checked by RLS and composite FKs. Database triggers stamp actor/recording metadata. Organization membership identity cannot be reassigned, and a transaction-scoped lock plus trigger protects the last active owner from concurrent demotion/deactivation.
- Database checks bound key text/array sizes and numeric ranges and validate basic email/phone shape. These are input guards, not complete business validation or full RFC phone/email validation.
- Authenticated clients cannot insert, update, or delete `audit_events` or status-history rows. Interactions cannot be updated or deleted through client grants. Relationship status changes append to a history table, and the history survives deletion of its relationship row (the buyer/property UUIDs remain for context). Members may mark a buyer Do Not Contact; clearing that status is admin/owner-only, and the audit event records the from/to status.
- Audit trigger details record changed field names rather than copying buyer PII or message bodies. A small draft-template wording issue that assumed a buyer had a partner was also removed.

## Validation performed

- `pglast` parsed the migration: **153 SQL statements**.
- `npm run test:security` applied the migration in local PGlite with minimal `auth.users`, `auth.uid()`, `anon`, and `authenticated` stubs. **42 behavior/denial assertions passed**, covering anonymous denial, organization isolation, cross-tenant and non-member foreign keys, role behavior, metadata stamping, invalid input and duplicate properties, task constraints, append-only interactions, audit/history write denial, status-history retention, last-owner protection, and Do Not Contact permissions/audit.
- `npm run typecheck` and `npm run build` passed.
- `npm audit --audit-level=moderate` reported zero known vulnerabilities in its configured dependency database/scope. This is not a security proof.

PGlite is an embedded PostgreSQL-compatible test engine, not Supabase. The test does not validate Supabase's actual JWT claims, API schema exposure, project-level grants/configuration, backups, or production concurrency. The smoke test is reproducible with `npm run test:security`, but it is not a substitute for applying the migration to an isolated Supabase staging project and testing through the actual API.

## Important limits and remaining work

1. **No live backend/auth:** The UI still stores demo data in browser `localStorage`; there is no authentication or server-side persistence. Do not enter real buyer/customer data.
2. **Audit is client-immutable, not cryptographically immutable:** Ordinary authenticated API users have no audit-table DML privileges. A database owner, Supabase `service_role`, or compromised server secret can bypass RLS and alter/delete data. The schema does not provide WORM storage, signed events, or an external audit sink. Never put a service-role key in browser code.
3. **RLS owner/bypass roles:** RLS is enabled but not forced against table owners; Supabase service/bypass roles can also bypass RLS by design. Production code must use the authenticated user context for ordinary requests and tightly protect elevated credentials.
4. **Do Not Contact is not operationally enforced yet:** The demo UI blocks message-draft controls for a DNC buyer and no messages are sent. The candidate migration prevents ordinary members from clearing DNC, but it is unapplied; a server endpoint must reload current status and fail closed before generation. Because buyer contact deduplication is not implemented, the endpoint must also resolve duplicate phone/email records and suppress a draft if a matching contact is marked DNC. Recheck immediately before any future manual-send integration. Do not rely on the UI guard.
5. **Duplicate buyer records are not fully prevented:** Property and buyer–property duplicates have database constraints, but buyers with the same phone/email may still be entered. Phase 2 needs an explicit normalization/matching policy that handles shared contact details and human review.
6. **Migration compatibility/application:** The migration is a first-pass schema script; it has not been applied or rollback-tested against the target Supabase version. `private` must remain unexposed, and deployed grants/policies must be inspected after application.
7. **Workspace creation has no quota/rate limit:** `create_workspace(text)` is authenticated-only and validates names, but an authenticated account can create many workspaces. Add server-side throttling or a product quota before exposing this RPC broadly.
8. **No complete workflow test yet:** Buyer response → follow-up → due-today → next response, DNC, and multi-user behavior remain acceptance tests for the later backend/workflow phase. Build/typecheck passing does not establish these behaviors.

## Required staging checks before connection or pilot

- Apply only to an isolated, disposable Supabase staging project first; inspect function owners, grants, RLS policies, and the PostgREST exposed-schema list.
- Test anon, member, admin, owner, inactive member, and two-organization accounts through Supabase's actual API. Confirm cross-tenant reads/writes and cross-tenant FKs fail, while intended same-tenant operations work.
- Try to spoof `created_by`, recorded timestamps, tenant IDs, assignment IDs, relationship endpoints, status history, and audit rows. Confirm audit/status triggers still fire for permitted writes and ordinary clients cannot edit/delete their history.
- Test membership invite/removal/role changes, last-owner protection (including concurrent attempts), and task assignment to inactive/non-member users.
- Before AI work, test DNC checks server-side, human review, factual grounding, retention/data-processing terms, and that no API key reaches the browser. Keep communication manual; do not add automatic sending.
- Pilot with fake data first. Use a real team only with clear permission and a completed privacy/security review.
