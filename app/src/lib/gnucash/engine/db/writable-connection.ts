import Database from "better-sqlite3";
import type { PreparedQuery } from "../../db/adapter";
import type { WritableDbAdapter, RunResult } from "./writable-adapter";
import { validateSchema } from "../../db/validation";

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
 * Open a .gnucash SQLite file for reading AND writing using better-sqlite3.
 * Validates the schema and ensures engine-required tables exist.
 *
 * Used in Node.js environments (tests, CLI tools).
 */
export function createWritableConnection(filePath: string): WritableDbAdapter {
  const db = new Database(filePath);

  // Ensure engine-required tables exist
  db.exec(ENSURE_TABLES_SQL);

  const adapter: WritableDbAdapter = {
    prepare(sql: string): PreparedQuery {
      const stmt = db.prepare(sql);
      return {
        all(...params: unknown[]): unknown[] {
          return stmt.all(...params);
        },
        get(...params: unknown[]): unknown | undefined {
          return stmt.get(...params);
        },
      };
    },

    run(sql: string, ...params: unknown[]): RunResult {
      const stmt = db.prepare(sql);
      const result = stmt.run(...params);
      return { changes: result.changes };
    },

    exec(sql: string): void {
      db.exec(sql);
    },

    transaction<T>(fn: () => T): T {
      const wrapped = db.transaction(fn);
      return wrapped();
    },

    close(): void {
      db.close();
    },
  };

  // Validate the GNUCash schema
  validateSchema(adapter);

  return adapter;
}

/**
 * Create a writable in-memory database with the full GNUCash schema.
 * Used for testing.
 */
export function createWritableMemoryDb(): WritableDbAdapter {
  const db = new Database(":memory:");

  db.exec(`
    CREATE TABLE books (
      guid TEXT PRIMARY KEY,
      root_account_guid TEXT NOT NULL,
      root_template_guid TEXT,
      num_periods INTEGER DEFAULT 0
    );

    CREATE TABLE commodities (
      guid TEXT PRIMARY KEY,
      namespace TEXT NOT NULL,
      mnemonic TEXT NOT NULL,
      fullname TEXT DEFAULT '',
      cusip TEXT DEFAULT '',
      fraction INTEGER DEFAULT 100
    );

    CREATE TABLE accounts (
      guid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      commodity_guid TEXT NOT NULL,
      parent_guid TEXT,
      code TEXT DEFAULT '',
      description TEXT DEFAULT '',
      hidden INTEGER DEFAULT 0,
      placeholder INTEGER DEFAULT 0
    );

    CREATE TABLE transactions (
      guid TEXT PRIMARY KEY,
      currency_guid TEXT NOT NULL,
      num TEXT DEFAULT '',
      post_date TEXT NOT NULL,
      enter_date TEXT DEFAULT '',
      description TEXT DEFAULT ''
    );

    CREATE TABLE splits (
      guid TEXT PRIMARY KEY,
      tx_guid TEXT NOT NULL,
      account_guid TEXT NOT NULL,
      memo TEXT DEFAULT '',
      action TEXT DEFAULT '',
      reconcile_state TEXT DEFAULT 'n',
      value_num INTEGER NOT NULL,
      value_denom INTEGER NOT NULL DEFAULT 100,
      quantity_num INTEGER NOT NULL,
      quantity_denom INTEGER NOT NULL DEFAULT 100,
      lot_guid TEXT
    );

    CREATE TABLE prices (
      guid TEXT PRIMARY KEY,
      commodity_guid TEXT NOT NULL,
      currency_guid TEXT NOT NULL,
      date TEXT NOT NULL,
      source TEXT DEFAULT '',
      type TEXT DEFAULT '',
      value_num INTEGER NOT NULL,
      value_denom INTEGER NOT NULL DEFAULT 100
    );

    CREATE TABLE lots (
      guid TEXT PRIMARY KEY,
      account_guid TEXT NOT NULL,
      is_closed INTEGER DEFAULT 0
    );

    CREATE TABLE slots (
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

    CREATE TABLE schedxactions (
      guid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      start_date TEXT DEFAULT '',
      end_date TEXT,
      last_occur TEXT,
      num_occur INTEGER DEFAULT 0,
      rem_occur INTEGER DEFAULT 0,
      auto_create INTEGER DEFAULT 0
    );

    CREATE TABLE recurrences (
      id INTEGER PRIMARY KEY,
      obj_guid TEXT NOT NULL,
      recurrence_mult INTEGER DEFAULT 1,
      recurrence_period_type TEXT DEFAULT 'month',
      recurrence_period_start TEXT DEFAULT ''
    );

    CREATE TABLE budgets (
      guid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      num_periods INTEGER DEFAULT 12
    );

    CREATE TABLE budget_amounts (
      id INTEGER PRIMARY KEY,
      budget_guid TEXT NOT NULL,
      account_guid TEXT NOT NULL,
      period_num INTEGER NOT NULL,
      amount_num INTEGER NOT NULL,
      amount_denom INTEGER NOT NULL DEFAULT 100
    );
  `);

  return {
    prepare(sql: string): PreparedQuery {
      const stmt = db.prepare(sql);
      return {
        all(...params: unknown[]): unknown[] {
          return stmt.all(...params);
        },
        get(...params: unknown[]): unknown | undefined {
          return stmt.get(...params);
        },
      };
    },

    run(sql: string, ...params: unknown[]): RunResult {
      const stmt = db.prepare(sql);
      const result = stmt.run(...params);
      return { changes: result.changes };
    },

    exec(sql: string): void {
      db.exec(sql);
    },

    transaction<T>(fn: () => T): T {
      const wrapped = db.transaction(fn);
      return wrapped();
    },

    close(): void {
      db.close();
    },
  };
}
