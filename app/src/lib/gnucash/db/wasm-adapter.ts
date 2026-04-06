/**
 * Wraps SQLite WASM's oo1.Database to satisfy the DbAdapter interface.
 * Uses selectObjects/selectObject for a clean mapping.
 */
import type { Database as WasmDatabase, BindingSpec } from "@sqlite.org/sqlite-wasm";
import type { DbAdapter, PreparedQuery } from "./adapter";

function coerceBigInts(obj: Record<string, unknown>): Record<string, unknown> {
  for (const key in obj) {
    if (typeof obj[key] === "bigint") {
      obj[key] = Number(obj[key]);
    }
  }
  return obj;
}

export function createWasmAdapter(db: WasmDatabase): DbAdapter {
  return {
    prepare(sql: string): PreparedQuery {
      return {
        all(...params: unknown[]): unknown[] {
          const bind = params.length > 0 ? (params as BindingSpec) : undefined;
          return db.selectObjects(sql, bind).map((row) => coerceBigInts(row as Record<string, unknown>));
        },
        get(...params: unknown[]): unknown | undefined {
          const bind = params.length > 0 ? (params as BindingSpec) : undefined;
          const row = db.selectObject(sql, bind);
          return row ? coerceBigInts(row as Record<string, unknown>) : undefined;
        },
      };
    },
    close() {
      db.close();
    },
  };
}
