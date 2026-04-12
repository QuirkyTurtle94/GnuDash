/**
 * GNUCash SQLite schema DDL, extracted from create-fixture.ts.
 * Used by the XML-to-SQLite bridge to create an in-memory DB
 * that matches the schema the domain layer expects.
 */
export const GNUCASH_SCHEMA_DDL = `
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
    commodity_scu INTEGER NOT NULL DEFAULT 100,
    non_std_scu INTEGER NOT NULL DEFAULT 0,
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

  CREATE TABLE IF NOT EXISTS slots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    obj_guid TEXT NOT NULL,
    name TEXT NOT NULL,
    slot_type INTEGER NOT NULL DEFAULT 4,
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
