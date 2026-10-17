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

export interface CloudState {
  db: DB;
  updatedAt: string;
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
  return { db, updatedAt: (data.updated_at as string) ?? new Date().toISOString() };
}

async function saveBlob(db: DB): Promise<boolean> {
  const sb = getClient();
  if (!sb) return false;
  const now = new Date().toISOString();
  const { error } = await sb
    .from(TABLE)
    .upsert({ key: STATE_KEY, data: db, updated_at: now }, { onConflict: "key" });
  return !error;
}

export async function loadCloudState(): Promise<CloudState | null> {
  const base = await loadBlob();
  if (!base) return null;
  if (!inTablesMode()) return base;
  const core = await repository.loadWorkspace();
  if (!core) return base;
  return { db: { ...base.db, ...core }, updatedAt: base.updatedAt };
}

export async function saveCloudState(db: DB): Promise<boolean> {
  if (!inTablesMode()) return saveBlob(db);
  const [blobOk, coreOk] = await Promise.all([
    saveBlob(db),
    repository.saveWorkspace(coreOf(db)),
  ]);
  return blobOk && coreOk;
}

export function isCloudConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
