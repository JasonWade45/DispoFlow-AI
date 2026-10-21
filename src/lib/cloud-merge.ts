import type { DB } from "@/types";

/**
 * Entity-level merge used when a save is rejected as stale (409): the local
 * copy holds edits made after our last load, the remote copy holds the write
 * that beat us. For every collection we keep the union of both sides and, for
 * ids present in both, prefer whichever copy carries the newer timestamp.
 *
 * Known limitation: without tombstones, an entity deleted on one side is
 * resurrected by the other side — resurrection is preferred over silently
 * discarding the other side's edits.
 */

interface Stamped {
  id: string;
  updatedAt?: string;
  createdAt?: string;
  completedAt?: string | null;
  sentAt?: string | null;
}

// Best-effort "last touched" stamp. updatedAt exists on most entities; tasks
// only track completedAt/sentAt/createdAt; users have none (tie => remote).
function stampOf(e: Stamped): string {
  let best = "";
  for (const v of [e.updatedAt, e.createdAt, e.completedAt, e.sentAt]) {
    if (v && v > best) best = v;
  }
  return best;
}

function unionByStamp<T extends Stamped>(
  remote: T[],
  local: T[],
  stamp: (e: T) => string = stampOf,
): T[] {
  const out = new Map<string, T>();
  for (const e of remote) out.set(e.id, e);
  for (const e of local) {
    const cur = out.get(e.id);
    // Local wins only when strictly newer; ties keep the remote (server) copy.
    if (!cur || stamp(e) > stamp(cur)) out.set(e.id, e);
  }
  return Array.from(out.values());
}

/**
 * Merge the local db with the server copy after a write conflict.
 * Core collections (the 7 workspace tables) merge per entity; users merge by
 * id (remote wins ties); everything else (settings, org, connections, jobs)
 * takes the remote copy whole, since it carries no per-field timestamps.
 */
export function mergeCloudConflict(local: DB, remote: DB): DB {
  const out: DB = { ...remote };
  out.properties = unionByStamp(remote.properties, local.properties);
  out.buyers = unionByStamp(remote.buyers, local.buyers);
  out.relationships = unionByStamp(remote.relationships, local.relationships);
  out.interactions = unionByStamp(remote.interactions, local.interactions);
  out.tasks = unionByStamp(remote.tasks, local.tasks);
  out.offers = unionByStamp(remote.offers, local.offers);
  out.access_infoTable = unionByStamp(remote.access_infoTable, local.access_infoTable);
  out.users = unionByStamp(remote.users, local.users, () => "");
  return out;
}
