import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

export async function loadCloudState(): Promise<CloudState | null> {
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

export async function saveCloudState(db: DB): Promise<boolean> {
  const sb = getClient();
  if (!sb) return false;
  const now = new Date().toISOString();
  const { error } = await sb
    .from(TABLE)
    .upsert({ key: STATE_KEY, data: db, updated_at: now }, { onConflict: "key" });
  return !error;
}

export function isCloudConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
