const BASE = "https://services.leadconnectorhq.com";

export class GhlError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
}

export function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

export function asString(v: unknown): string {
  return typeof v === "string" ? v : "";
}

async function ghlFetch(
  path: string,
  token: string,
  versions: string[],
  params: Record<string, string>,
  init: { method: "GET" | "POST"; body?: string },
): Promise<unknown> {
  let lastError: GhlError | null = null;
  for (const version of versions) {
    const url = new URL(BASE + path);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    const res = await fetch(url, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        Version: version,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body,
      cache: "no-store",
    });
    if (res.ok) return res.json();
    const text = await res.text().catch(() => "");
    lastError = new GhlError(
      res.status,
      `DispoGenius API ${res.status} on ${path}${text ? `: ${text.slice(0, 200)}` : ""}`,
    );
    if (res.status !== 400) throw lastError;
  }
  throw lastError ?? new GhlError(502, `DispoGenius API failed on ${path}`);
}

export async function ghlGet(
  path: string,
  token: string,
  versions: string[],
  params: Record<string, string>,
): Promise<unknown> {
  return ghlFetch(path, token, versions, params, { method: "GET" });
}

export async function ghlPost(
  path: string,
  token: string,
  versions: string[],
  body: unknown,
): Promise<unknown> {
  return ghlFetch(path, token, versions, {}, { method: "POST", body: JSON.stringify(body) });
}

export async function resolveLocationId(token: string, explicit: string): Promise<string> {
  if (explicit) return explicit;
  const res = asRecord(await ghlGet("/locations/search", token, ["2021-07-28"], { limit: "1" }));
  const locations = asArray(res.locations).length
    ? asArray(res.locations)
    : asArray(asRecord(res.data).locations);
  const first = asRecord(locations[0]);
  const id = asString(first.id);
  if (!id) throw new GhlError(404, "Could not discover a DispoGenius location id");
  return id;
}
