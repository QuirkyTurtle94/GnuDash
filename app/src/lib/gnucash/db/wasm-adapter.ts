/**
 * Wraps SQLite WASM's oo1.Database to satisfy the DbAdapter interface.
 * Uses selectObjects/selectObject for a clean mapping.
 */
import type { Database as WasmDatabase, BindingSpec } from "@sqlite.org/sqlite-wasm";
import type { DbAdapter, PreparedQuery } from "./adapter";

export function createWasmAdapter(db: WasmDatabase): DbAdapter {
  return {
    prepare(sql: string): PreparedQuery {
      return {
        all(...params: unknown[]): unknown[] {
          const bind = params.length > 0 ? (params as BindingSpec) : undefined;
          return db.selectObjects(sql, bind);
        },
        get(...params: unknown[]): unknown | undefined {
          const bind = params.length > 0 ? (params as BindingSpec) : undefined;
          return db.selectObject(sql, bind);
        },
      };
    },
    close() {
      db.close();
    },
  };
}
