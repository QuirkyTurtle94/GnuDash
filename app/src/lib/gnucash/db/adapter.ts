/**
 * Minimal database adapter interface matching the API surface
 * used by domain modules: prepare(sql).all() and prepare(sql).get().
 *
 * Both better-sqlite3 and SQLite WASM (oo1.DB) can satisfy this
 * through thin wrappers, so domain logic stays backend-agnostic.
 */

export interface PreparedQuery {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown | undefined;
}

export interface DbAdapter {
  prepare(sql: string): PreparedQuery;
  close(): void;
}
