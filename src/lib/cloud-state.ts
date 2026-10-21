import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { repository, type CoreWorkspace } from "@/lib/server/repository";
import { sendAlert } from "@/lib/server/alerts";
import type { DB } from "@/types";

const TABLE = "app_state";
const STATE_KEY = "main";

let client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}

/** Which copy of the 7 core collections a load actually came from. */
export type StateSource = "tables" | "blob";

export interface CloudState {
  db: DB;
  updatedAt: string;
  source: StateSource;
}

// DATA_SOURCE=blob (default): everything lives in the app_state JSON blob.
// DATA_SOURCE=tables: the 7 core collections are dual-written to their
// normalized tables; loads read core from the tables and fall back to the
// blob when the tables are unreachable or still empty (pre-backfill).
// The blob is always written complete, so reverting = remove the env var.
function inTablesMode(): boolean {
  return process.env.DATA_SOURCE === "tables";
}

function coreOf(db: DB): CoreWorkspace {
  return {
    properties: db.properties,
    buyers: db.buyers,
    relationships: db.relationships,
    interactions: db.interactions,
    tasks: db.tasks,
    offers: db.offers,
    access_infoTable: db.access_infoTable,
  };
}

// Counts we watch for "the state was wiped on save" anomalies.
const GUARDED = ["offers", "properties", "buyers", "relationships", "tasks"] as const;
const DROP_ALERT_RATIO = 0.5;
const DROP_ALERT_MIN = 20;

async function alertOnMassiveDrop(prev: DB, next: DB): Promise<void> {
  for (const key of GUARDED) {
    const before = Array.isArray(prev[key]) ? prev[key].length : 0;
    const after = Array.isArray(next[key]) ? next[key].length : 0;
    if (before >= DROP_ALERT_MIN && after < before * DROP_ALERT_RATIO) {
      await sendAlert(
        `drop:${key}`,
        `${key} dropped ${before} -> ${after} on save. A snapshot of the ` +
          `previous state is kept in app_state_history (migration 0002). ` +
          `Check for a stale instance writing in blob mode or an import that ` +
          `replaces the whole workspace.`,
      );
    }
  }
}

async function loadBlob(): Promise<CloudState | null> {
  const sb = getClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from(TABLE)
    .select("data, updated_at")
    .eq("key", STATE_KEY)
    .maybeSingle();
  if (error || !data) return null;
  const db = data.data as DB | null;
  if (!db || typeof db !== "object" || !Array.isArray(db.properties)) return null;
  return {
    db,
    updatedAt: (data.updated_at as string) ?? new Date().toISOString(),
    source: "blob",
  };
}

interface BlobWriteResult {
  ok: boolean;
  /** The stored `updated_at` moved past the caller's base — nothing was written. */
  conflict?: boolean;
  /** Server timestamp of the stored (or just-written) row; the client's next base. */
  updatedAt?: string;
}

async function saveBlob(db: DB, base?: string): Promise<BlobWriteResult> {
  const sb = getClient();
  if (!sb) return { ok: false };

  const { data: prevRow } = await sb
    .from(TABLE)
    .select("data, updated_at")
    .eq("key", STATE_KEY)
    .maybeSingle();
  const prev = (prevRow?.data as DB | null) ?? null;
  const currentAt = ((prevRow?.updated_at as string | null) ?? "");

  // Optimistic concurrency: `base` is the updated_at the caller last observed.
  // Reject before writing when another writer got there first (409 upstream).
  if (base && prevRow && currentAt !== base) {
    return { ok: false, conflict: true, updatedAt: currentAt };
  }

  if (prev && typeof prev === "object") await alertOnMassiveDrop(prev, db);

  const now = new Date().toISOString();

  // Conditional update closes the read-then-write race: if another writer
  // slipped in between our read and this update, zero rows match the base.
  if (base && prevRow) {
    const { data: updated, error } = await sb
      .from(TABLE)
      .update({ data: db, updated_at: now })
      .eq("key", STATE_KEY)
      .eq("updated_at", base)
      .select("updated_at");
    if (error) return { ok: false };
    const row = updated?.[0];
    if (!row) {
      const { data: cur } = await sb
        .from(TABLE)
        .select("updated_at")
        .eq("key", STATE_KEY)
        .maybeSingle();
      return { ok: false, conflict: true, updatedAt: (cur?.updated_at as string) ?? "" };
    }
    return { ok: true, updatedAt: row.updated_at as string };
  }

  // No base (legacy client, first save, or row vanished): upsert as before.
  const { data: written, error } = await sb
    .from(TABLE)
    .upsert({ key: STATE_KEY, data: db, updated_at: now }, { onConflict: "key" })
    .select("updated_at");
  if (error || !written?.[0]) return { ok: false };
  return { ok: true, updatedAt: written[0].updated_at as string };
}

// Blob-mode saves bypass the tables entirely. If the tables still hold data,
// this instance is not running with DATA_SOURCE=tables — flag every save so
// a mixed-mode writer (the incident behind offers 399 -> 0) is visible.
async function warnIfTablesHaveData(): Promise<void> {
  const sb = getClient();
  if (!sb) return;
  try {
    const { count } = await sb
      .from("properties")
      .select("id", { count: "exact", head: true });
    if (count && count > 0) {
      await sendAlert(
        "mixed-mode",
        `blob-only save while the properties table still has ${count} row(s) — ` +
          `this instance is NOT using DATA_SOURCE=tables. Set DATA_SOURCE=tables ` +
          `(Vercel env + restart dev) so the tables stay in sync.`,
      );
    }
  } catch {
    // count is best-effort; the save itself must not fail because of it
  }
}

export async function loadCloudState(): Promise<CloudState | null> {
  const base = await loadBlob();
  if (!base) return null;
  if (!inTablesMode()) return base;

  let core: CoreWorkspace | null = null;
  try {
    core = await repository.loadWorkspace(base.db.organization?.id || "default");
  } catch (e) {
    console.error("[cloud-state] tables load threw:", e);
  }
  if (!core) {
    console.warn(
      "[cloud-state] core tables unavailable or empty — serving the blob copy. " +
        "Delete-sync will be skipped for the next save.",
    );
    return base;
  }
  return { db: { ...base.db, ...core }, updatedAt: base.updatedAt, source: "tables" };
}

export type CoreCounts = Record<keyof CoreWorkspace, number>;

/** Row counts of the 7 core collections as they exist in `db` (blob view). */
export function coreCounts(db: DB): CoreCounts {
  return {
    properties: db.properties.length,
    buyers: db.buyers.length,
    relationships: db.relationships.length,
    interactions: db.interactions.length,
    tasks: db.tasks.length,
    offers: db.offers.length,
    access_infoTable: db.access_infoTable.length,
  };
}

const COUNT_TABLES: Array<[keyof CoreCounts, string]> = [
  ["properties", "properties"],
  ["buyers", "buyers"],
  ["relationships", "buyer_properties"],
  ["interactions", "interactions"],
  ["tasks", "tasks"],
  ["offers", "offers"],
  ["access_infoTable", "access_info"],
];

async function countTables(workspaceId: string): Promise<CoreCounts | null> {
  const sb = getClient();
  if (!sb) return null;
  try {
    const results = await Promise.all(
      COUNT_TABLES.map(async ([key, table]) => {
        const { count, error } = await sb
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("workspace_id", workspaceId);
        if (error || count === null) throw new Error(`count failed for ${table}`);
        return [key, count] as const;
      }),
    );
    return Object.fromEntries(results) as CoreCounts;
  } catch (e) {
    console.warn("[cloud-state] table counts unavailable, falling back to blob counts:", e);
    return null;
  }
}

export interface StateSummary {
  found: boolean;
  source: StateSource;
  updatedAt: string;
  counts: CoreCounts;
}

/**
 * Cheap status payload for the Settings card (and anything else that wants
 * health numbers): counts + provenance + last-write time, WITHOUT shipping the
 * multi-megabyte db. In tables mode the counts come from the tables
 * (head-count queries), so a stale blob can't lie about them.
 */
export async function loadCloudSummary(): Promise<StateSummary | null> {
  const base = await loadBlob();
  if (!base) return null;
  let counts = coreCounts(base.db);
  let source: StateSource = "blob";
  if (inTablesMode()) {
    const tableCounts = await countTables(base.db.organization?.id || "default");
    if (tableCounts) {
      counts = tableCounts;
      source = "tables";
    }
  }
  return { found: true, source, updatedAt: base.updatedAt, counts };
}

export interface SaveOptions {
  /**
   * Where the db being saved came from ("tables" = the last load read the
   * normalized tables). Only then may saves delete rows that are absent
   * from the payload — a blob-fallback payload may be stale, and deleting
   * against it would destroy newer table rows.
   */
  source?: StateSource;
  /**
   * `app_state.updated_at` the caller last observed (GET response or a prior
   * PUT response). When set and the stored value has moved, the save is
   * rejected with `conflict` and nothing (blob or tables) is written.
   */
  base?: string;
}

export interface SaveResult {
  ok: boolean;
  conflict?: boolean;
  /** Current (or just-written) app_state.updated_at — caller's next base. */
  updatedAt?: string;
}

export async function saveCloudState(db: DB, opts: SaveOptions = {}): Promise<SaveResult> {
  if (!inTablesMode()) {
    await warnIfTablesHaveData();
    return saveBlob(db, opts.base);
  }

  const allowDelete = opts.source === "tables";
  if (!allowDelete) {
    console.warn(
      "[cloud-state] save payload did not come from a tables load — " +
        "upserting only; delete-sync skipped to protect the tables.",
    );
  }
  // Sequential on purpose: a stale blob write must abort before the tables
  // are touched — delete-sync against a stale payload would drop newer rows.
  const blob = await saveBlob(db, opts.base);
  if (blob.conflict) return blob;
  const coreOk = await repository.saveWorkspace(coreOf(db), { allowDelete });
  return { ok: blob.ok && coreOk, updatedAt: blob.updatedAt };
}

export function isCloudConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
