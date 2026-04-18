/**
 * Minimal database adapter interface matching the API surface
 * used by domain modules: prepare(sql).all() and prepare(sql).get().
 *
 * Both better-sqlite3 and SQLite WASM (oo1.DB) can satisfy this
 * through thin wrappers, so domain logic stays backend-agnostic.
 */

/**
 * All adapter I/O is async. SQLite-backed adapters (WASM, better-sqlite3)
 * wrap their sync results in Promise.resolve; Postgres is async natively.
 * This uniform shape lets domain code use `await` regardless of backend.
 */
export interface PreparedQuery {
  all(...params: unknown[]): Promise<unknown[]>;
  get(...params: unknown[]): Promise<unknown | undefined>;
}

/**
 * Which SQL dialect this adapter speaks. The domain layer uses this to
 * pick dialect-specific SQL fragments (e.g. `to_char(...)` on Postgres
 * vs `strftime(...)` on SQLite). Add new dialects here only when a new
 * concrete adapter lands.
 */
export type SqlDialect = "sqlite" | "postgres";

export interface DbAdapter {
  readonly dialect: SqlDialect;
  prepare(sql: string): PreparedQuery;
  /** Fire-and-forget cleanup — callers may ignore the return value. */
  close(): void | Promise<void>;
}
