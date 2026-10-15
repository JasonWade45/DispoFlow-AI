import { NextRequest, NextResponse } from "next/server";
import { GhlError, fetchDgPayload } from "@/lib/dispo-genius-server";

export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const token = process.env.DISPOGENIUS_PIT_TOKEN;
  if (!token) {
    return NextResponse.json(
      {
        configured: false,
        error: "DispoGenius token is not configured. Set the DISPOGENIUS_PIT_TOKEN env var.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const check = url.searchParams.get("check") === "1";
  const explicitLocation =
    url.searchParams.get("locationId") || process.env.DISPOGENIUS_LOCATION_ID || "";

  try {
    const payload = await fetchDgPayload(token, explicitLocation);
    if (check) return NextResponse.json({ configured: true, locationId: payload.locationId });
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach DispoGenius";
    console.error("DispoGenius conversations error:", error);
    const status =
      error instanceof GhlError && error.status >= 400 && error.status < 600 ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
