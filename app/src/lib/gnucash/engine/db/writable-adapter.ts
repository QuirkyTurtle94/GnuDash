import type { DbAdapter } from "../../db/adapter";

/**
 * Result of a write operation (INSERT/UPDATE/DELETE).
 */
export interface RunResult {
  /** Number of rows affected. */
  changes: number;
}

/**
 * Extends the read-only DbAdapter with write capabilities.
 *
 * Both better-sqlite3 and SQLite WASM can implement this interface
 * through thin wrappers, keeping the engine backend-agnostic.
 */
export interface WritableDbAdapter extends DbAdapter {
  /**
   * Execute a parameterized write statement (INSERT/UPDATE/DELETE).
   * Returns the number of rows affected.
   */
  run(sql: string, ...params: unknown[]): RunResult;

  /**
   * Execute a batch of raw SQL statements (e.g., CREATE TABLE).
   * No parameter binding — use run() for parameterized queries.
   */
  exec(sql: string): void;

  /**
   * Execute a function within a database transaction.
   * Uses BEGIN IMMEDIATE for write safety.
   * Automatically COMMITs on success, ROLLBACKs on error.
   */
  transaction<T>(fn: () => T): T;
}
