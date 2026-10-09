# DispoFlow AI — project status

**Updated:** 2026-10-10

**Working branch:** `arena/dac4f10a-dispoflow-ai`

## Current release posture

**Demo-only; not pilot-ready; not safe for real customer data.** The prototype has no authentication or production backend. Demo records live in browser localStorage. No live AI, SMS, email, or Supabase integration is connected. The deployment-preparation work does not make this a secure CRM or authorize use with real buyer, seller, property, or message data.

## Demo deployment preparation

### Implemented

- Expanded `.gitignore` for environment files, dependencies/build output, local service state, logs, and local databases.
- Added a placeholder-only `.env.example`; all values are empty and Demo Mode requires no environment variables.
- Added `noindex`/`nofollow` metadata, a `public/robots.txt` that disallows all crawlers, and `X-Robots-Tag: noindex, nofollow`.
- Added `nosniff`, strict-origin referrer policy, and a Permissions-Policy disabling camera, microphone, and geolocation. `X-Frame-Options: DENY` is returned except for the Arena `*.e2b.app` preview host, which must remain embeddable in the preview.
- Made the persistent Demo Mode banner explicitly warn that data is fictitious, stored only in this browser, no messages are sent, and real data must not be entered.
- Added [`docs/DEPLOY.md`](docs/DEPLOY.md), a private-link-only Vercel guide with a pre-share checklist, no-secret/no-integration prohibitions, the free-plan password-protection caveat, and takedown guidance.

### Verification completed

- Focused credential-pattern scans of tracked source and Git history found **no known credential-pattern matches**. The full working-tree heuristic scan had nine pattern-only matches in ignored dependencies; none were identified as project credentials. Gitleaks and TruffleHog were unavailable. See the task report for scanner limitations.
- Source scan found no demo runtime environment-variable references or external AI/Supabase client, fetch, or API calls. No migration runtime imports were found; the production build exposes only the app and Next.js not-found routes, not the Supabase migration files.
- Clean verification passed: `rm -rf node_modules .next && npm ci && npm run typecheck && npm run build && npm audit`. Typecheck/build succeeded; npm audit reported **0 vulnerabilities**.
- Production-server curl checks returned HTTP 200 for `/` and `/robots.txt`; the HTML included the robots metadata and all required Demo Mode warnings. The response included the expected noindex and security headers. The Arena preview-host match omits `X-Frame-Options` so the preview can render.
- The reset control exists in **Settings → AI & privacy** and its handler removes the localStorage workspace key and resets the React state to seeded demo data. This was verified by source inspection only, not by an interactive browser click.

### Not verified / not done

- No Playwright package or system browser is available; no screenshots were captured at 390px or 1280px. Visual/mobile QA, the full walkthrough, and interactive reset behavior remain unverified.
- No Vercel deployment was created. The deployment guide is preparation only.
- GitHub treats `dispoflow-ai` as the same name as the existing public `JasonWade45/DispoFlow-AI`. Creating the selected alternate private repo, `dispoflow-ai-demo-private`, failed with `Resource not accessible by integration (createRepository)`. After being informed of the public visibility, the user explicitly authorized the push. Only `arena/dac4f10a-dispoflow-ai` was pushed to [the existing public repository](https://github.com/JasonWade45/DispoFlow-AI); GitHub confirmed `isPrivate: false`, and the remote branch hash matched local `HEAD` (`d9c7c94`). No private repository was created and `main` was not pushed.

## Product invariants for future phases

- Isolate every tenant's data and access; test authorization, not just UI filtering.
- Keep property status, buyer status, and buyer–property interest status independent.
- Store occurred time separately from recorded time; retain raw notes.
- Design for US real-estate disposition teams and report honestly which integrations are not implemented.
- Any future AI output is a draft that requires human review; never send messages automatically.

## Roadmap

1. **Phase 1 — Quick Log:** buyer reply logging, CSV handling, and a measured under-60-second logging task. Use fake data and record observed timing rather than inferring it.
2. **Phase 2 — Security re-audit:** review the implementation and threat model, address identified issues, and verify fixes before adding sensitive integrations.
3. **Phase 3 — Backend and identity:** Supabase, authentication, multi-user/tenant isolation, migrations, and tests. Review migration/security behavior before any real data.
4. **Phase 4 — AI:** server-only provider access, least-necessary context, evaluated drafts, explicit human approval, and no automatic sends.
5. **Phase 5 — End-to-end testing:** automated browser coverage for core workflows, reset, tenant boundaries, and responsive behavior.
6. **Phase 6 — Pilot readiness:** complete security, privacy, operational, usability, and customer-data readiness reviews before any pilot or real-data use.

**Do not start these roadmap phases as part of demo deployment preparation.**
