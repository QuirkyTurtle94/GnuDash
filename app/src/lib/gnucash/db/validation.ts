/**
 * Schema validation logic shared between server-side (better-sqlite3)
 * and client-side (WASM) DB backends.
 */
import type { DbAdapter } from "./adapter";

export const REQUIRED_TABLES: Record<string, string[]> = {
  accounts: ["guid", "name", "account_type", "commodity_guid", "parent_guid"],
  transactions: ["guid", "currency_guid", "post_date", "description"],
  splits: [
    "guid",
    "tx_guid",
    "account_guid",
    "value_num",
    "value_denom",
    "quantity_num",
    "quantity_denom",
  ],
  commodities: ["guid", "namespace", "mnemonic"],
  books: ["guid", "root_account_guid"],
};

export function validateSchema(db: DbAdapter): void {
  for (const [table, columns] of Object.entries(REQUIRED_TABLES)) {
    const exists = db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`)
      .get(table);
    if (!exists) {
      throw new Error(`Not a valid GNUCash file: missing table "${table}"`);
    }

    const info = db.prepare(`PRAGMA table_info(${table})`).all() as {
      name: string;
    }[];
    const columnNames = new Set(info.map((c) => c.name));
    for (const col of columns) {
      if (!columnNames.has(col)) {
        throw new Error(
          `Not a valid GNUCash file: table "${table}" is missing column "${col}"`
        );
      }
    }
  }
}
