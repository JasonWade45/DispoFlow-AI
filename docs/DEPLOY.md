# Demo-only Vercel deployment

This guide is for a **private, unlisted demonstration link only**. DispoFlow AI is a localStorage prototype with no authentication or real backend; it is not production-ready, pilot-ready, or safe for real buyer/customer data.

## Deploy

1. Import the **private** GitHub repository selected for this demo into Vercel.
2. Select the **Next.js** framework preset. Use the repository's default build/start settings.
3. Add **no environment variables** for this demo. Demo Mode does not require any. Do not populate `.env.example`.
4. Deploy and open the resulting URL yourself before sharing it.

The Vercel free plan does not provide password protection for this deployment. Keep the link unlisted and share it only with the disposition managers participating in interviews. An unlisted link is not access control; anyone who obtains it may open the demo.

## Pre-share checklist

- [ ] Open the deployment on a phone and confirm that key pages remain usable.
- [ ] Run the full five-minute [DEMO_SCRIPT.md](DEMO_SCRIPT.md) walkthrough.
- [ ] Create a demo-only change, use **Settings → AI & privacy → Reset demo workspace data**, and confirm the seeded sample records return.
- [ ] Confirm the **DEMO MODE** banner states that data is fictitious, stored only in this browser, no messages are sent, and real data must not be entered.
- [ ] Use **View Page Source** and confirm the document contains `noindex, nofollow` in its robots metadata.
- [ ] Open `/robots.txt` and confirm it disallows crawling.
- [ ] Confirm the response includes `X-Robots-Tag: noindex, nofollow` and the configured security headers.
- [ ] Verify that no real customer data or secrets were added to the repository or Vercel settings.

## Do not do

- Do not enter real buyer, seller, property, or message data.
- Do not add environment variables containing real keys to Vercel or commit them to Git.
- Do not use a `NEXT_PUBLIC_` prefix for any secret. Client-prefixed values are exposed to the browser.
- Do not connect Supabase or an AI provider to this deployment until the required security/backend/AI phases are complete and verified.
- Do not imply that this demo sends SMS/email, uses live AI, or is a secure CRM.

## Take the deployment down

In Vercel, open the project **Settings** and delete the project, or disable/remove the deployment through the project/deployment controls. Confirm the public URL no longer serves the demo. Also remove any shared interview link from invitations or notes where practical.
