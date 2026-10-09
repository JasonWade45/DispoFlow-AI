# DispoFlow AI — five-minute demo script

**Audience:** 5–10 US real-estate disposition managers

**Purpose:** Test whether the workflow is understandable and relevant; this is discovery, not a sales pitch.

**Mode:** Demo Mode only. Use the pre-seeded fictitious records. Do not enter real buyer, seller, or property data.

## Before the meeting

1. Open the app in a clean browser profile or use **Settings → AI & privacy → Reset demo workspace data**.
2. Confirm the top banner says **DEMO MODE**. The data is stored in this browser only. There is no connected Supabase, SMS, email, calling, or live AI service; no messages are sent.
3. Use a desktop/tablet view for the group. Have one facilitator drive and one person capture feedback in `docs/VALIDATION.md` without recording buyer PII.
4. Keep the app at **Overview**. If you changed records during a prior run, reset them first.

## Timed walkthrough

### 0:00–0:25 — Set expectations

**Say:** “This is a local prototype using made-up names and records. It does not connect to your systems, send messages, or use a live AI provider. I’m testing whether the follow-up workflow matches how your team actually works. Please call out anything confusing or unnecessary.”

### 0:25–1:05 — Start with work due

1. Point to **Overdue follow-ups** and **Due today** on the dashboard.
2. Click **Review queue**; briefly switch between **Overdue** and **Due today** in the follow-up view.
3. Point out the buyer, property, task, due time, and assignee together.

**Ask:** “How do you find this list today? What would you expect to see first?”

Do not imply that reminders are sent automatically; the queue is a local demo view.

### 1:05–1:45 — Show the deal context

1. Open **Properties** and select **1842 W 44th St** (a fictitious seeded record).
2. Point out its property status, asking price, ARV, repair estimate, and assignment price.
3. Show the linked buyers without changing the property status.

**Say:** “Property status and each buyer’s interest are separate records.”

### 1:45–2:25 — Show the buyer conversation

1. Open **Marcus Hill** from the property’s linked-buyer list or the Buyers page.
2. Point out the buyer profile and the property-specific **Price Concern** relationship, next action, and follow-up date.
3. Show the activity timeline if time permits.

**Ask:** “Where would your team look to understand the last reply and who owns the next step?”

### 2:25–3:45 — Log a reply and create a next task

1. From the buyer drawer, click **Log interaction**.
2. Keep the selected buyer/property; choose **Incoming SMS**.
3. Paste this clearly fictitious, demo-only text into Original content:

   > `[DEMO-ONLY] Buyer asked for an updated repair estimate; no price or commitment was confirmed.`

4. Set the outcome to: `Asked for repair estimate; no price agreed.`
5. Check **Create a follow-up from this interaction**. Enter `Confirm repair estimate and update Marcus`; choose a due time for tomorrow and save.
6. Point out that the original text remains intact and the app records the occurrence time separately from the local recorded time.

**Ask:** “Would this be faster or slower than your current sheet/CRM? Which field would you remove?”

**Important:** This is the current multi-field modal, not the planned Quick Log. Do not claim it meets the under-60-second goal; that will be measured after the Quick Log phase.

### 3:45–4:30 — Find the saved activity and follow-up

1. Open **Activity log** and show the new incoming interaction and its original note.
2. Return to **Follow-ups** and find the task you just created in the upcoming queue.
3. If showing note enhancement, label it accurately: it is a local deterministic preview, not a connected AI system. Nothing is sent.

### 4:30–5:00 — Close with an open question

**Ask:** “If this existed in your current workflow, what would still make you go back to the spreadsheet? What is the one change that would make this worth testing?”

Capture the answer verbatim without buyer/customer details. Do not pitch a pilot or imply an integration is live.

## After the demo

- Record interview answers and baseline estimates in `docs/VALIDATION.md`.
- Reset with **Settings → AI & privacy → Reset demo workspace data** before the next group.
- Keep all feedback at the workflow level. Never copy real contact details or real message content into this prototype.
