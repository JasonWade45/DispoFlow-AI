# Discovery and baseline validation

**Status:** Interview kit only. No manager interviews, baseline collection, or go/no-go decision have been completed yet. Record fake/demo results separately from real operational measurements.

## Guardrails

- Target 5–10 US disposition managers. Ask about a recent real workflow, but do not collect names, phone numbers, addresses, copied messages, or other buyer/seller PII.
- Use the Demo Mode seeded dataset for product interaction. Do not enter customer data; browser `localStorage` is not a production data store.
- Ask neutrally. Do not lead with AI or promise integrations. The prototype has no connected Supabase, CRM, SMS, email, calling, or live AI.
- Separate what a participant said from what the facilitator inferred. Record opt-in for follow-up separately.

## Interview questions

1. **Current tools:** “What tools do you use today to manage properties, buyers, and disposition follow-up? Which one is the source of truth?”
2. **Buyer replies:** “Walk me through how you track a buyer reply today, from receiving it to deciding the next step. Where do you record it, and who else can see it?”
3. **Missed follow-ups:** “In a typical week, how many promised or scheduled buyer follow-ups slip past their due date? How do you know? Can you describe the most recent example without identifying the buyer?”
4. **Current spend:** “What do you pay for your current tools now, approximately per month or year? Which costs are per seat, and which are shared?”
5. **Adding another tool:** “Why would you add another tool to this workflow—or why would you not? What would it need to replace or save before you would consider it?”

Use these neutral follow-ups when useful: “Can you show the steps with fake data?”, “What happens when two teammates update the same buyer?”, “What is the workaround?”, and “How often does that happen?” Do not suggest an answer.

## Baseline metrics sheet

Fill this out for one team and the same seven-day period where possible. Use measured counts/durations when available; label estimates as estimates. For time metrics, observe up to three representative tasks per manager and record the **median**. No real names or record contents belong in this sheet.

### Team and measurement context

| Field | Entry |
|---|---|
| Team identifier (non-identifying) | |
| Interview date | |
| Team size / disposition users | |
| Current tools (product names only) | |
| Baseline period (start–end) | |
| Source (system count, manual log, estimate) | |
| Number of observations for time measures | |
| Facilitator / note taker | |

### Measures

| Metric | Operational definition | Baseline value | Unit / sample count | Measured or estimated? | Notes without PII |
|---|---|---:|---|---|---|
| Missed follow-ups | Buyer follow-ups due in the period but not completed by their due time | | per 7 days | | |
| Time to log a reply | Time from opening the current tracking surface to saving a buyer reply with its occurred time and outcome/next step | | seconds; n = | | |
| Time to draft a follow-up | Time from deciding a follow-up is needed to having human-reviewed copy ready; do not send it | | seconds; n = | | |

After Quick Log exists, repeat the same task definition with fake data. The product target is to log a buyer reply and create its next follow-up in **under 60 seconds**. Record clicks/keystrokes and completion time in the separate Phase 1 timing test; do not infer that result from this interview kit.

## Proposed go/no-go criteria

These are **initial thresholds for discussion, not collected results**. Adjust them before interviews if the intended cohort or workflow differs.

### Go to the next validation/build step when all are true

- At least **5 of 10** managers (or at least half of the completed interviews) describe buyer-reply/follow-up tracking as a recurring weekly problem grounded in a recent example.
- At least **3 participants** agree to try a fake-data timed workflow or give permission for a follow-up research session.
- Interviews identify a common manual workflow and a concrete failure point (for example, reply not logged, owner unclear, or next date missed) that the MVP can address without message automation.
- The next test can remain fake-data-only until backend security and data-handling gates are complete.

### Hold and gather more evidence

- Results are mixed (roughly 3–4 of 10 report a recurring problem), reports are mostly estimates, or the main workflow differs substantially across teams.
- Participants see value but cannot identify what the prototype should replace or what would make them adopt it. Conduct more interviews before adding code.

### No-go / re-scope

- **2 or fewer of 10** report a recurring problem, the current tool/workaround is consistently sufficient, or managers do not want another system even if follow-up tracking improves.
- The dominant request depends on automatic outreach, unsupported integrations, or use of real customer data before security is ready. Do not build those into this MVP.

### Real-team pilot gate (not cleared by Phase 0)

A real-data pilot is **no-go** until the security and Supabase phases are verified, multi-user/tenant tests pass against the real local Supabase stack, a backup restore is tested, pilot permission is written, and baseline metrics are recorded. Begin with fake data. A positive interview result alone is not permission to use customer data.

## Interview results log

| Participant code | Date | Current tools / workflow summary | Missed follow-ups per week (value + source) | Reply-log time (median + n) | Draft time (median + n) | Would add tool? Why/why not? | Concrete pain evidence | Follow-up permission? |
|---|---|---|---:|---:|---:|---|---|---|
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |
| | | | | | | | | |
