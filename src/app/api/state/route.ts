import { NextRequest, NextResponse } from "next/server";
import { isCloudConfigured, loadCloudState, saveCloudState } from "@/lib/cloud-state";

export const maxDuration = 30;

export async function GET() {
  if (!isCloudConfigured()) {
    return NextResponse.json({ configured: false }, { status: 503 });
  }
  const state = await loadCloudState();
  if (!state) {
    return NextResponse.json({ configured: true, found: false }, { status: 200 });
  }
  return NextResponse.json({ configured: true, found: true, ...state });
}

export async function PUT(request: NextRequest) {
  if (!isCloudConfigured()) {
    return NextResponse.json({ error: "Cloud storage is not configured." }, { status: 503 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const db = (body as { db?: unknown } | null)?.db;
  if (!db || typeof db !== "object" || !Array.isArray((db as { properties?: unknown[] }).properties)) {
    return NextResponse.json({ error: "Missing db payload" }, { status: 400 });
  }
  const ok = await saveCloudState(db as never);
  if (!ok) {
    return NextResponse.json({ error: "Failed to save to Supabase" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
