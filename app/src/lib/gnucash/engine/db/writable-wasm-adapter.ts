import type { PreparedQuery } from "../../db/adapter";
import type { WritableDbAdapter, RunResult } from "./writable-adapter";

/**
 * Minimal interface for the SQLite WASM oo1.Database object.
 * Matches the API surface we actually use from @sqlite.org/sqlite-wasm.
 */
interface WasmDatabase {
  selectObjects(sql: string, bind?: unknown[]): unknown[];
  selectObject(sql: string, bind?: unknown[]): unknown | undefined;
  exec(opts: { sql: string; bind?: unknown[]; returnValue?: string }): number;
  close(): void;
  changes(): number;
}

/** Additional tables the engine may need that older .gnucash files lack. */
const ENSURE_TABLES_SQL = `
  CREATE TABLE IF NOT EXISTS lots (
    guid TEXT PRIMARY KEY,
    account_guid TEXT NOT NULL,
    is_closed INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    obj_guid TEXT NOT NULL,
    name TEXT NOT NULL,
    slot_type INTEGER NOT NULL,
    int64_val INTEGER,
    string_val TEXT,
    double_val REAL,
    timespec_val TEXT,
    guid_val TEXT,
    numeric_val_num INTEGER,
    numeric_val_denom INTEGER,
    gdate_val TEXT
  );
`;

/**
 * Create a WritableDbAdapter wrapping a SQLite WASM oo1.Database.
 * Used in browser environments (Web Worker with OPFS).
 */
export function createWritableWasmAdapter(
  db: WasmDatabase
): WritableDbAdapter {
  // Ensure engine-required tables exist
  db.exec({ sql: ENSURE_TABLES_SQL });

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
      db.exec({ sql, bind });
      return { changes: db.changes() };
    },

    exec(sql: string): void {
      db.exec({ sql });
    },

    transaction<T>(fn: () => T): T {
      db.exec({ sql: "BEGIN IMMEDIATE" });
      try {
        const result = fn();
        db.exec({ sql: "COMMIT" });
        return result;
      } catch (err) {
        db.exec({ sql: "ROLLBACK" });
        throw err;
      }
    },

    close(): void {
      db.close();
    },
  };
}
