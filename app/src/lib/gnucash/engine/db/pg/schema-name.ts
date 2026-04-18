/**
 * Schema-name validation for the search_path mechanism.
 *
 * Postgres does not allow identifiers to be parameterised in SQL — `SET
 * LOCAL search_path = $1` is invalid. We use `set_config('search_path', $1, true)`
 * which DOES parameterise the value, but we still validate shape as defence
 * in depth: if any code path ever regresses to string interpolation, the
 * validator keeps the blast radius small.
 *
 * Phase 1 has one fixed schema. Phase 2 uses `book_<uuid>` per book.
 */

/** Phase 1 — the single book's schema. */
export const PHASE_1_SCHEMA = "gnudash_book";

const PHASE_1_RE = /^gnudash_book$/;
const PHASE_2_RE = /^book_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$/;

/**
 * True if `name` is a schema name the app is allowed to target.
 * Rejects anything that isn't an exact match for a known shape — no
 * hyphens, no quoting, no spaces, no injections.
 */
export function isValidSchemaName(name: string): boolean {
  return PHASE_1_RE.test(name) || PHASE_2_RE.test(name);
}

/** Throws if the name is not a valid schema. */
export function assertValidSchemaName(name: string): void {
  if (!isValidSchemaName(name)) {
    throw new Error(`Invalid book schema name: ${JSON.stringify(name)}`);
  }
}
