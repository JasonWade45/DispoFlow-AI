import { type NextRequest, NextResponse } from "next/server";
import { SHEETS_REAUTH_MESSAGE } from "@/lib/sheets-constants";
import { googleTokenResponseSchema } from "@/lib/schemas";

export { SHEETS_REAUTH_MESSAGE };

export type SheetsAuthError = "not_configured" | "not_authorized" | "reauth_required" | "refresh_failed";

const REFRESH_COOKIE_MAX_AGE = 180 * 24 * 3600; // 180 days

function cookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    maxAge,
    path: "/",
  };
}

/**
 * Runs a route handler with a valid Google access token.
 *
 * - Uses the cached `gs_access_token` cookie when present.
 * - Otherwise exchanges `gs_refresh_token` for a new access token and persists it
 *   on the response (so we don't refresh on every single request).
 * - Returns a precise error when re-authorization is required (Google says
 *   `invalid_grant` — the refresh token was expired or revoked), so the UI can
 *   show a Reconnect button instead of a dead end.
 */
export async function withSheetsAuth(
  request: NextRequest,
  handler: (accessToken: string) => Promise<NextResponse>,
): Promise<NextResponse> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "not_configured", message: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not set" },
      { status: 503 },
    );
  }

  const cached = request.cookies.get("gs_access_token")?.value;
  if (cached) return handler(cached);

  const refreshCookie = request.cookies.get("gs_refresh_token");
  if (!refreshCookie?.value) {
    return NextResponse.json(
      { error: "not_authorized", message: "Connect a Google account first" },
      { status: 401 },
    );
  }

  let res: Response;
  try {
    res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshCookie.value,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });
  } catch {
    return NextResponse.json(
      { error: "refresh_failed", message: "Could not reach Google to refresh the session" },
      { status: 503 },
    );
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    const invalidGrant = detail.includes("invalid_grant");
    return NextResponse.json(
      invalidGrant
        ? { error: "reauth_required", message: SHEETS_REAUTH_MESSAGE, detail }
        : { error: "refresh_failed", message: "Could not refresh the Google session", detail },
      { status: invalidGrant ? 401 : 503 },
    );
  }

  let raw: unknown;
  try {
    raw = await res.json();
  } catch {
    return NextResponse.json(
      { error: "refresh_failed", message: "Google returned an unreadable token response" },
      { status: 503 },
    );
  }
  const parsed = googleTokenResponseSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "refresh_failed", message: "Google returned an invalid token response" },
      { status: 503 },
    );
  }
  const token = parsed.data.access_token;
  if (!token) {
    return NextResponse.json(
      { error: "refresh_failed", message: "Google returned no access token" },
      { status: 503 },
    );
  }

  const response = await handler(token);
  response.cookies.set("gs_access_token", token, cookieOptions(parsed.data.expires_in ?? 3600));
  if (parsed.data.refresh_token) {
    response.cookies.set(
      "gs_refresh_token",
      parsed.data.refresh_token,
      cookieOptions(REFRESH_COOKIE_MAX_AGE),
    );
  }
  return response;
}
