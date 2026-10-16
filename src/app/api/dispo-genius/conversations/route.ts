import { NextRequest, NextResponse } from "next/server";
import { GhlError, fetchDgPayload, ghlGet, resolveLocationId } from "@/lib/dispo-genius-server";

export const maxDuration = 60;

/** Lightweight probe: resolves the location and asks for a single conversation — no message export. */
async function checkDgConnection(token: string, explicitLocation: string): Promise<string> {
  const locationId = await resolveLocationId(token, explicitLocation);
  await ghlGet("/conversations/search", token, ["2021-04-15", "v3"], {
    locationId,
    limit: "1",
    sortBy: "last_message_date",
    sort: "desc",
  });
  return locationId;
}

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
    if (check) {
      const locationId = await checkDgConnection(token, explicitLocation);
      return NextResponse.json({ configured: true, locationId });
    }
    const payload = await fetchDgPayload(token, explicitLocation);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reach DispoGenius";
    console.error("DispoGenius conversations error:", error);
    const status =
      error instanceof GhlError && error.status >= 400 && error.status < 600 ? error.status : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
