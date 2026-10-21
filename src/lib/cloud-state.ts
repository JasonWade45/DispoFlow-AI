import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { repository, type CoreWorkspace } from "@/lib/server/repository";
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

function alertOnMassiveDrop(prev: DB, next: DB): void {
  for (const key of GUARDED) {
    const before = Array.isArray(prev[key]) ? prev[key].length : 0;
    const after = Array.isArray(next[key]) ? next[key].length : 0;
    if (before >= DROP_ALERT_MIN && after < before * DROP_ALERT_RATIO) {
      console.error(
        `[cloud-state] ALERT: ${key} dropped ${before} -> ${after} on save. ` +
          `A snapshot of the previous state is kept in app_state_history ` +
          `(migration 0002). Check for a stale instance writing in blob mode ` +
          `or an import that replaces the whole workspace.`,
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

async function saveBlob(db: DB): Promise<boolean> {
  const sb = getClient();
  if (!sb) return false;

  const { data: prevRow } = await sb
    .from(TABLE)
    .select("data")
    .eq("key", STATE_KEY)
    .maybeSingle();
  const prev = prevRow?.data as DB | null;
  if (prev && typeof prev === "object") alertOnMassiveDrop(prev, db);

  const now = new Date().toISOString();
  const { error } = await sb
    .from(TABLE)
    .upsert({ key: STATE_KEY, data: db, updated_at: now }, { onConflict: "key" });
  return !error;
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
      console.error(
        `[cloud-state] blob-only save while the properties table still has ${count} row(s) ` +
          `— this instance is NOT using DATA_SOURCE=tables. Set DATA_SOURCE=tables ` +
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

export interface SaveOptions {
  /**
   * Where the db being saved came from ("tables" = the last load read the
   * normalized tables). Only then may saves delete rows that are absent
   * from the payload — a blob-fallback payload may be stale, and deleting
   * against it would destroy newer table rows.
   */
  source?: StateSource;
}

export async function saveCloudState(db: DB, opts: SaveOptions = {}): Promise<boolean> {
  if (!inTablesMode()) {
    await warnIfTablesHaveData();
    return saveBlob(db);
  }

  const allowDelete = opts.source === "tables";
  if (!allowDelete) {
    console.warn(
      "[cloud-state] save payload did not come from a tables load — " +
        "upserting only; delete-sync skipped to protect the tables.",
    );
  }
  const [blobOk, coreOk] = await Promise.all([
    saveBlob(db),
    repository.saveWorkspace(coreOf(db), { allowDelete }),
  ]);
  return blobOk && coreOk;
}

export function isCloudConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
