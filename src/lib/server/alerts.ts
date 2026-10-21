/**
 * Server-side operational alerts: always logged to the console (Vercel logs),
 * optionally posted to DATA_ALERT_WEBHOOK_URL (Slack incoming webhook `{text}`
 * or Discord webhook `{content}` — both are sent). One alert per `kind` per
 * cooldown window so a save loop cannot spam the channel.
 */

const COOLDOWN_MS = 10 * 60_000;
const lastSentAt = new Map<string, number>();

export async function sendAlert(kind: string, message: string): Promise<void> {
  console.error(`[dispo-alert:${kind}] ${message}`);
  const url = process.env.DATA_ALERT_WEBHOOK_URL;
  if (!url) return;
  const now = Date.now();
  const prev = lastSentAt.get(kind);
  if (prev !== undefined && now - prev < COOLDOWN_MS) return;
  lastSentAt.set(kind, now);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message, content: message }),
      signal: controller.signal,
    });
  } catch (e) {
    console.error(`[dispo-alert] webhook delivery failed for ${kind}:`, e);
  } finally {
    clearTimeout(timer);
  }
}

/** Test hook: forget cooldown state between assertions. */
export function resetAlertCooldown(): void {
  lastSentAt.clear();
}
