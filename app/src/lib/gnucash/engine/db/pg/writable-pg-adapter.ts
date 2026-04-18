import "server-only";
/**
 * WritableDbAdapter backed by a checked-out Postgres client.
 *
 * Always construct via `withBookClient(schema, fn)` — never pass a raw
 * `PoolClient` around the app. The wrapper sets `search_path`, runs the
 * callback, and releases the client with `RESET ALL` in a finally so
 * leftover session state can't bleed between tenants.
 *
 * Uses the SQLite→Postgres placeholder tokenizer to rewrite `?` markers
 * in domain SQL to `$N` at prepare time (see `../pg/rewrite-placeholders.ts`).
 */
import type { PoolClient } from "pg";
import type { PreparedQuery } from "../../../db/adapter";
import type { WritableDbAdapter, RunResult } from "../writable-adapter";
import { rewritePlaceholders } from "./rewrite-placeholders";

/**
 * Wrap a checked-out Postgres client in the WritableDbAdapter interface.
 * The caller is responsible for schema/search_path management — usually
 * via `withBookClient`.
 */
export function createWritablePgAdapter(client: PoolClient): WritableDbAdapter {
  return {
    dialect: "postgres",

    prepare(sql: string): PreparedQuery {
      const rewritten = rewritePlaceholders(sql);
      return {
        async all(...params: unknown[]): Promise<unknown[]> {
          const result = await client.query(rewritten, params);
          return result.rows;
        },
        async get(...params: unknown[]): Promise<unknown | undefined> {
          const result = await client.query(rewritten, params);
          return result.rows[0];
        },
      };
    },

    async run(sql: string, ...params: unknown[]): Promise<RunResult> {
      const rewritten = rewritePlaceholders(sql);
      const result = await client.query(rewritten, params);
      return { changes: result.rowCount ?? 0 };
    },

    async exec(sql: string): Promise<void> {
      // exec is for DDL and batched statements — no placeholder rewrite needed,
      // but still no string interpolation: this is used only for engine-internal
      // DDL, never for user input.
      await client.query(sql);
    },

    async transaction<T>(fn: () => Promise<T>): Promise<T> {
      await client.query("BEGIN");
      try {
        const result = await fn();
        await client.query("COMMIT");
        return result;
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch {
          // If rollback itself fails the connection is in a bad state —
          // withBookClient will destroy the client rather than recycle it.
        }
        throw err;
      }
    },

    close(): void {
      // No-op: the pool client lifecycle belongs to `withBookClient`.
      // Calling close() on an adapter while the pool still owns the client
      // would leak the connection.
    },
  };
}
