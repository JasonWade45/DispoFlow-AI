/**
 * Shared Result type for fallible operations (validation, external calls,
 * persistence). Prefer this over throwing for expected failures so callers
 * narrow with `if (!r.ok)` instead of try/catch.
 */
export type Result<T, E = string> =
  | { ok: true; data: T }
  | { ok: false; error: E };
