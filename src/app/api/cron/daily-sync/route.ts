import { NextRequest, NextResponse } from "next/server";
import { loadCloudState, saveCloudState, isCloudConfigured } from "@/lib/cloud-state";
import { fetchDgPayload, isDgConfigured, GhlError } from "@/lib/dispo-genius-server";
import { runDailySync } from "@/lib/daily-sync";
import { createSeed } from "@/lib/seed-work";

export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!isDgConfigured()) {
    return NextResponse.json(
      { configured: false, error: "DISPOGENIUS_PIT_TOKEN is not set." },
      { status: 503 },
    );
  }
  if (!isCloudConfigured()) {
    return NextResponse.json(
      { configured: false, error: "Supabase env vars are not set." },
      { status: 503 },
    );
  }

  const token = process.env.DISPOGENIUS_PIT_TOKEN!;
  const locationId = process.env.DISPOGENIUS_LOCATION_ID || "";
  const userId = process.env.CRON_USER_ID || "u_owner";
  const now = new Date().toISOString();

  try {
    const state = await loadCloudState();
    const db = state?.db ?? createSeed();

    const payload = await fetchDgPayload(token, locationId);
    const { db: nextDb, result } = await runDailySync(db, payload, userId, now, { maxDrafts: 20 });

    const saved = await saveCloudState(nextDb, { source: state?.source });
    return NextResponse.json({ ok: true, saved, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Daily sync failed";
    console.error("Daily sync error:", error);
    const status =
      error instanceof GhlError && error.status >= 400 && error.status < 600 ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
