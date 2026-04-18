/**
 * WritableDbAdapter backed by a local SQLite WASM cache and a PostgresSyncClient.
 *
 * Reads go straight to the local WASM DB — domain queries stay synchronous
 * and cheap. Writes are applied locally first (so the engine's post-write
 * `getFullDashboardData()` sees the change immediately) and enqueued on the
 * sync client; the worker awaits `syncClient.flush()` once per UI mutation
 * before responding so the round-trip to Postgres completes before the user
 * sees the "saved" state.
 *
 * ## What this adapter does NOT do
 *
 * - No snapshot/restore on sync failure. If the server rejects a batch, the
 *   local cache already contains the write. The caller surfaces the error
 *   to the UI and a reload re-fetches the authoritative server state. A
 *   richer recovery flow is out of scope for the MVP (see issue #48's
 *   §10.6).
 * - `exec(sql)` is local-only. The engine only uses `exec` for schema
 *   bootstrap (BEGIN IMMEDIATE / CREATE TABLE IF NOT EXISTS), and the
 *   server schema is already provisioned by the import route — we don't
 *   want to ship BEGINs to the sync path.
 */

import type { PreparedQuery } from "./adapter";
import type {
  WritableDbAdapter,
  RunResult,
} from "../engine/db/writable-adapter";
import type { PostgresSyncClient } from "./postgres-sync-client";

/**
 * Minimal interface for the SQLite WASM oo1.Database object; matches the
 * subset `createWritableWasmAdapter` uses so we can reuse the same WASM
 * instance behind either adapter.
 */
interface WasmDatabase {
  selectObjects(sql: string, bind?: unknown[]): unknown[];
  selectObject(sql: string, bind?: unknown[]): unknown | undefined;
  exec(opts: { sql: string; bind?: unknown[]; returnValue?: string }): number;
  close(): void;
  changes(): number;
}

export function createWritablePostgresAdapter(
  db: WasmDatabase,
  syncClient: PostgresSyncClient,
): WritableDbAdapter {
  return {
    prepare(sql: string): PreparedQuery {
      return {
        all(...params: unknown[]): unknown[] {
          const bind = params.length > 0 ? (params as unknown[]) : undefined;
          return db.selectObjects(sql, bind);
        },
        get(...params: unknown[]): unknown | undefined {
          const bind = params.length > 0 ? (params as unknown[]) : undefined;
          return db.selectObject(sql, bind);
        },
      };
    },

    run(sql: string, ...params: unknown[]): RunResult {
      const bind = params.length > 0 ? (params as unknown[]) : undefined;
      // Local write first — keeps the engine sync and means domain reads
      // that follow this call immediately reflect the change.
      db.exec({ sql, bind });
      const changes = db.changes();
      // Server sync: queue now, flush at the worker boundary.
      syncClient.enqueue(sql, [...params]);
      return { changes };
    },

    exec(sql: string): void {
      // Local-only (see header note). The engine doesn't call this with
      // parameterised SQL; it only uses it for BEGIN/COMMIT/ROLLBACK wrapping
      // and the schema bootstrap DDL in writable-wasm-adapter, and neither of
      // those should reach the server through this adapter.
      db.exec({ sql });
    },

    transaction<T>(fn: () => T): T {
      db.exec({ sql: "BEGIN IMMEDIATE" });
      syncClient.beginTx();
      try {
        const result = fn();
        db.exec({ sql: "COMMIT" });
        syncClient.commitTx();
        return result;
      } catch (err) {
        db.exec({ sql: "ROLLBACK" });
        syncClient.rollbackTx();
        throw err;
      }
    },

    close(): void {
      db.close();
    },
  };
}
