import Database from "better-sqlite3";
import type { DbAdapter } from "./adapter";
import { validateSchema } from "./validation";

export function openAndValidate(filePath: string): DbAdapter {
  const db = new Database(filePath, { readonly: true });

  // better-sqlite3's Database already satisfies DbAdapter
  const adapter = db as unknown as DbAdapter;

  try {
    validateSchema(adapter);
  } catch (e) {
    db.close();
    throw e;
  }

  return adapter;
}
