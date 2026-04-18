import Database from "better-sqlite3";
import type { DbAdapter, PreparedQuery } from "./adapter";
import { validateSchema } from "./validation";

/**
 * Wrap a better-sqlite3 Database in the DbAdapter interface.
 * The Database's own prepare().all()/.get() satisfy the query surface;
 * we add a dialect tag so domain code can emit dialect-specific SQL.
 */
function wrapBetterSqlite(db: Database.Database): DbAdapter {
  return {
    dialect: "sqlite",
    prepare(sql: string): PreparedQuery {
      const stmt = db.prepare(sql);
      return {
        all(...params: unknown[]): unknown[] {
          return stmt.all(...params) as unknown[];
        },
        get(...params: unknown[]): unknown | undefined {
          return stmt.get(...params);
        },
      };
    },
    close(): void {
      db.close();
    },
  };
}

export function openAndValidate(filePath: string): DbAdapter {
  const db = new Database(filePath, { readonly: true });
  const adapter = wrapBetterSqlite(db);

  try {
    validateSchema(adapter);
  } catch (e) {
    db.close();
    throw e;
  }

  return adapter;
}
