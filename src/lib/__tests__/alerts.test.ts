import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetAlertCooldown, sendAlert } from "@/lib/server/alerts";

describe("sendAlert", () => {
  const originalUrl = process.env.DATA_ALERT_WEBHOOK_URL;

  beforeEach(() => {
    resetAlertCooldown();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (originalUrl === undefined) delete process.env.DATA_ALERT_WEBHOOK_URL;
    else process.env.DATA_ALERT_WEBHOOK_URL = originalUrl;
  });

  it("always logs to the console even without a webhook configured", async () => {
    delete process.env.DATA_ALERT_WEBHOOK_URL;
    await sendAlert("kind", "something broke");
    expect(fetch).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("something broke"));
  });

  it("posts text and content to the configured webhook", async () => {
    process.env.DATA_ALERT_WEBHOOK_URL = "https://hooks.example/x";
    await sendAlert("kind", "hello");
    expect(fetch).toHaveBeenCalledWith(
      "https://hooks.example/x",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ text: "hello", content: "hello" }),
      }),
    );
  });

  it("rate-limits repeats of the same kind for 10 minutes", async () => {
    process.env.DATA_ALERT_WEBHOOK_URL = "https://hooks.example/x";
    await sendAlert("offers", "first");
    await sendAlert("offers", "second");
    expect(fetch).toHaveBeenCalledTimes(1);

    // a different kind has its own cooldown bucket
    await sendAlert("buyers", "other");
    expect(fetch).toHaveBeenCalledTimes(2);

    vi.advanceTimersByTime(10 * 60_000 + 1);
    await sendAlert("offers", "after window");
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("resolves without throwing when the webhook request fails", async () => {
    process.env.DATA_ALERT_WEBHOOK_URL = "https://hooks.example/x";
    vi.mocked(fetch).mockRejectedValueOnce(new Error("network down"));
    await expect(sendAlert("kind", "boom")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining("webhook delivery failed"),
      expect.any(Error),
    );
  });
});
