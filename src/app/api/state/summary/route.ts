import { NextResponse } from "next/server";
import { isCloudConfigured, loadCloudSummary } from "@/lib/cloud-state";

export const maxDuration = 30;

/**
 * Lightweight health payload: counts + source + last-write time without the
 * full db (GET /api/state ships every record). Used by the Settings card.
 */
export async function GET() {
  if (!isCloudConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 });
  }
  const summary = await loadCloudSummary();
  if (!summary) {
    return NextResponse.json({ configured: true, found: false }, { status: 200 });
  }
  return NextResponse.json({ configured: true, ...summary });
}
