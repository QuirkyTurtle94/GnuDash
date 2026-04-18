/**
 * Web Worker that runs SQLite WASM and executes domain functions synchronously.
 * Communicates with the main thread via typed postMessage protocol.
 */
import sqlite3InitModule, { type Database as WasmDatabase, type Sqlite3Static } from "@sqlite.org/sqlite-wasm";
import { createWasmAdapter } from "../db/wasm-adapter";
import { validateSchema } from "../db/validation";
import { buildParseContext, type ParseContext } from "../context";
import { buildAccountTree } from "../domain/accounts";
import { computeNetWorthSeries, computeCurrentNetWorth } from "../domain/net-worth";
import { computeCashFlowSeries } from "../domain/cash-flow";
import { computeExpenseBreakdown, getExpenseTransactions } from "../domain/expenses";
import { computeIncomeBreakdown, getIncomeTransactions } from "../domain/income";
import { computeInvestments, computeInvestmentValueSeries } from "../domain/investments";
import { computeTopBalances } from "../domain/balances";
import { getLedgerTransactions, getRecentTransactions } from "../domain/ledger";
import { computeBudgetData } from "../domain/budgets";
import { computeCashFlowBudgetData } from "../domain/cash-flow-budget";
import { computeCashFlowByCategory } from "../domain/cash-flow-by-category";
import { getUpcomingBills } from "../domain/bills";
import { hasClosingTransactions } from "../domain/closing";
import { formatMonth } from "../shared/dates";
import { createWritableWasmAdapter } from "../engine/db/writable-wasm-adapter";
import { TransactionBuilder } from "../engine/builders/transaction-builder";
import { GncNumeric } from "../engine/gnc-numeric";
import type { WritableDbAdapter } from "../engine/db/writable-adapter";
import type { DashboardData } from "@/lib/types/gnucash";
import { computeOrphanedPriceGuids } from "@/lib/gnucash/domain/orphan-prices";
import { deleteTransaction } from "../engine/operations/transaction-ops";
import { bulkEditTransactions } from "../engine/operations/bulk-ops";
import { AccountBuilder } from "../engine/builders/account-builder";
import { updateAccount, deleteAccountWithReallocation } from "../engine/operations/account-ops";
import { createCommodity } from "../engine/operations/commodity-ops";
import { addPrice, deletePrice } from "../engine/operations/price-ops";
import type { AccountType } from "../engine/types";
import type { WorkerRequest, WorkerResponse, DomainFunction, CreateTransactionPayload, DeleteTransactionPayload, EditTransactionPayload, BulkEditTransactionsPayload, CreateAccountPayload, UpdateAccountPayload, DeleteAccountPayload, CreateCommodityPayload, AddPricePayload, EditPricePayload, DeletePricePayload, PostgresConnectionInfo, PostgresDumpPayload } from "./messages";
import type { GnuCashXmlData } from "../xml/types";
import { GNUCASH_SCHEMA_DDL } from "../xml/schema";
import { PostgresSyncClient } from "../db/postgres-sync-client";
import { createWritablePostgresAdapter } from "../db/postgres-adapter";

let sqlite3: Sqlite3Static;

const DATE_COLUMNS = [
  ["transactions", "post_date"],
  ["transactions", "enter_date"],
  ["prices", "date"],
  ["schedxactions", "start_date"],
  ["schedxactions", "end_date"],
  ["schedxactions", "last_occur"],
  ["recurrences", "recurrence_period_start"],
] as const;

/** Convert any ISO-format dates (YYYY-MM-DD HH:MM:SS) to compact GnuCash format (YYYYMMDDHHmmss). */
function normaliseDatesToCompact(database: WasmDatabase): void {
  for (const [table, col] of DATE_COLUMNS) {
    try {
      database.exec(
        `UPDATE ${table} SET ${col} = REPLACE(REPLACE(REPLACE(${col}, '-', ''), ' ', ''), ':', '')
         WHERE ${col} LIKE '____-__-%'`
      );
    } catch {
      // Table may not exist in older files
    }
  }
}
let db: WasmDatabase | null = null;
let ctx: ParseContext | null = null;
let isWritable = false;
let writableAdapter: WritableDbAdapter | null = null;
/**
 * Non-null when the currently open book is backed by the Server (Postgres)
 * backend. Set by `initFromPostgresDump`; cleared by `closeDb`. When set,
 * every mutation handler awaits `syncClient.flush()` before responding so
 * the UI only sees the "saved" state after the Postgres round-trip.
 */
let syncClient: PostgresSyncClient | null = null;

const OPFS_DB_NAME = "/gnucash-dashboard.db";

/**
 * DDL for ancillary engine tables (`lots`) that older .gnucash files may be
 * missing. Duplicates the private ENSURE_TABLES_SQL in writable-wasm-adapter
 * so the Postgres-backed local cache can bootstrap the same shape without
 * depending on the writable adapter that we are intentionally NOT using here.
 */
const EXTRA_ENGINE_TABLES_SQL = `
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

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

/**
 * Opens a database from an ArrayBuffer (uploaded file).
 * Writes to OPFS for persistence, then opens from there.
 */
async function initFromBuffer(buffer: ArrayBuffer, writable: boolean): Promise<void> {
  closeDb();
  isWritable = writable;

  const hasOpfs = !!sqlite3.oo1.OpfsDb;

  if (hasOpfs) {
    // Write to OPFS for persistence, then open from there
    await sqlite3.oo1.OpfsDb.importDb(OPFS_DB_NAME, buffer);
    db = new sqlite3.oo1.OpfsDb(OPFS_DB_NAME, writable ? "rw" : "r");
  } else {
    // Fallback: in-memory DB from the buffer
    const bytes = new Uint8Array(buffer);
    const p = sqlite3.wasm.allocFromTypedArray(bytes);
    db = new sqlite3.oo1.DB();
    const rc = sqlite3.capi.sqlite3_deserialize(
      db.pointer!,
      "main",
      p,
      bytes.byteLength,
      bytes.byteLength,
      sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
        sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
    );
    if (rc !== 0) {
      throw new Error(`sqlite3_deserialize failed with code ${rc}`);
    }
  }

  normaliseDatesToCompact(db);

  if (writable) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writableAdapter = createWritableWasmAdapter(db as any);
    validateSchema(writableAdapter);
    ctx = buildParseContext(writableAdapter);
  } else {
    writableAdapter = null;
    const adapter = createWasmAdapter(db);
    validateSchema(adapter);
    ctx = buildParseContext(adapter);
  }
}

/**
 * Opens an existing database from OPFS (session restore).
 */
function initFromOpfs(writable: boolean): void {
  closeDb();
  isWritable = writable;

  if (!sqlite3.oo1.OpfsDb) {
    throw new Error("OPFS not available");
  }

  // This will throw if the file doesn't exist
  db = new sqlite3.oo1.OpfsDb(OPFS_DB_NAME, writable ? "rw" : "r");
  normaliseDatesToCompact(db);

  if (writable) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    writableAdapter = createWritableWasmAdapter(db as any);
    validateSchema(writableAdapter);
    ctx = buildParseContext(writableAdapter);
  } else {
    writableAdapter = null;
    const adapter = createWasmAdapter(db);
    validateSchema(adapter);
    ctx = buildParseContext(adapter);
  }
}

/**
 * Creates an in-memory SQLite DB from parsed GNUCash XML data.
 * Always read-only — no OPFS persistence.
 */
function initFromXmlData(data: GnuCashXmlData): void {
  closeDb();
  isWritable = false;
  writableAdapter = null;

  db = new sqlite3.oo1.DB();
  db.exec({ sql: GNUCASH_SCHEMA_DDL });

  // Books
  db.exec({
    sql: `INSERT INTO books (guid, root_account_guid) VALUES (?, ?)`,
    bind: [data.bookGuid, data.rootAccountGuid],
  });

  // Commodities
  for (const c of data.commodities) {
    db.exec({
      sql: `INSERT INTO commodities (guid, namespace, mnemonic, fullname, cusip, fraction) VALUES (?, ?, ?, ?, ?, ?)`,
      bind: [c.guid, c.namespace, c.mnemonic, c.fullname, c.cusip, c.fraction],
    });
  }

  // Accounts
  for (const a of data.accounts) {
    db.exec({
      sql: `INSERT INTO accounts (guid, name, account_type, commodity_guid, parent_guid, code, description, hidden, placeholder) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [a.guid, a.name, a.accountType, a.commodityGuid, a.parentGuid, a.code, a.description, a.hidden, a.placeholder],
    });
  }

  // Transactions and splits
  for (const t of data.transactions) {
    db.exec({
      sql: `INSERT INTO transactions (guid, currency_guid, num, post_date, enter_date, description) VALUES (?, ?, ?, ?, ?, ?)`,
      bind: [t.guid, t.currencyGuid, t.num, t.postDate, t.enterDate, t.description],
    });

    for (const s of t.splits) {
      // Parse num/denom from the "num/denom" strings
      const valSlash = s.value.indexOf("/");
      const valueNum = valSlash === -1 ? Number(s.value) || 0 : Number(s.value.slice(0, valSlash)) || 0;
      const valueDenom = valSlash === -1 ? 1 : Number(s.value.slice(valSlash + 1)) || 1;

      const qtySlash = s.quantity.indexOf("/");
      const quantityNum = qtySlash === -1 ? Number(s.quantity) || 0 : Number(s.quantity.slice(0, qtySlash)) || 0;
      const quantityDenom = qtySlash === -1 ? 1 : Number(s.quantity.slice(qtySlash + 1)) || 1;

      db.exec({
        sql: `INSERT INTO splits (guid, tx_guid, account_guid, memo, action, reconcile_state, value_num, value_denom, quantity_num, quantity_denom, lot_guid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bind: [s.guid, t.guid, s.accountGuid, s.memo, s.action, s.reconcileState, valueNum, valueDenom, quantityNum, quantityDenom, s.lotGuid],
      });
    }
  }

  // Prices
  for (const p of data.prices) {
    db.exec({
      sql: `INSERT INTO prices (guid, commodity_guid, currency_guid, date, source, type, value_num, value_denom) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [p.guid, p.commodityGuid, p.currencyGuid, p.date, p.source, p.type, p.valueNum, p.valueDenom],
    });
  }

  // Scheduled transactions
  for (const sx of data.schedxactions) {
    db.exec({
      sql: `INSERT INTO schedxactions (guid, name, enabled, start_date, end_date, last_occur, num_occur, rem_occur, auto_create) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      bind: [sx.guid, sx.name, sx.enabled, sx.startDate, sx.endDate, sx.lastOccur, sx.numOccur, sx.remOccur, sx.autoCreate],
    });
  }

  // Recurrences
  for (const r of data.recurrences) {
    db.exec({
      sql: `INSERT INTO recurrences (obj_guid, recurrence_mult, recurrence_period_type, recurrence_period_start) VALUES (?, ?, ?, ?)`,
      bind: [r.objGuid, r.mult, r.periodType, r.periodStart],
    });
  }

  // Budgets
  for (const b of data.budgets) {
    db.exec({
      sql: `INSERT INTO budgets (guid, name, description, num_periods) VALUES (?, ?, ?, ?)`,
      bind: [b.guid, b.name, b.description, b.numPeriods],
    });
  }

  // Budget amounts
  for (const ba of data.budgetAmounts) {
    db.exec({
      sql: `INSERT INTO budget_amounts (budget_guid, account_guid, period_num, amount_num, amount_denom) VALUES (?, ?, ?, ?, ?)`,
      bind: [ba.budgetGuid, ba.accountGuid, ba.periodNum, ba.amountNum, ba.amountDenom],
    });
  }

  // Book-closing slots
  for (const txGuid of data.closingTransactionGuids) {
    db.exec({
      sql: `INSERT INTO slots (obj_guid, name, slot_type, string_val) VALUES (?, 'book-closing', 4, 'true')`,
      bind: [txGuid],
    });
  }

  const adapter = createWasmAdapter(db);
  validateSchema(adapter);
  ctx = buildParseContext(adapter);
}

function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    ctx = null;
    writableAdapter = null;
    isWritable = false;
  }
  syncClient = null;
}

/**
 * Look up the column names declared by the local SQLite schema for `table`.
 * Used to filter dump rows on insert — real GnuCash Postgres schemas (the
 * read-only interop path) carry extra columns like `commodities.quote_flag`
 * that our SQLite DDL doesn't declare, and passing them through would fail
 * the INSERT.
 */
function getLocalTableColumns(database: WasmDatabase, table: string): Set<string> {
  const rows = database.selectObjects(`PRAGMA table_info(${table})`);
  return new Set(rows.map((r) => (r as { name: string }).name));
}

/**
 * Populate an open SQLite WASM cache from a Postgres dump payload. Skips
 * tables that don't exist locally and drops any columns the local DDL
 * doesn't declare. Used by both the writable (gnudash-managed) and
 * read-only (existing GnuCash DB) init paths.
 */
function insertDumpIntoCache(
  database: WasmDatabase,
  dump: PostgresDumpPayload,
): void {
  for (const [table, rows] of Object.entries(dump.tables)) {
    if (rows.length === 0) continue;
    // `gnudash_meta` is a Postgres-only metadata table — the local cache has
    // no schema for it and the engine never reads it.
    if (table === "gnudash_meta") continue;

    const targetColumns = getLocalTableColumns(database, table);
    if (targetColumns.size === 0) continue; // table not in local DDL
    const columns = Object.keys(rows[0]).filter((c) => targetColumns.has(c));
    if (columns.length === 0) continue;

    const placeholders = columns.map(() => "?").join(", ");
    const sql = `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${placeholders})`;
    for (const row of rows) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const values = columns.map((c) => row[c]) as any[];
      database.exec({ sql, bind: values });
    }
  }
}

/**
 * Build an in-memory SQLite WASM cache from a `/api/pg/book/dump` payload and
 * wrap it with a Postgres-backed writable adapter. The local cache uses the
 * engine's existing SQLite DDL (INTEGER / TEXT affinities) — SQLite's type
 * system transparently coerces the BIGINT-as-string values that node-postgres
 * returns into INTEGER for the numeric-pair columns, so no per-column
 * normalisation is required here.
 *
 * Every mutation routed through the resulting adapter will be applied
 * locally first and enqueued on `syncClient`; the mutation handler in the
 * message loop awaits `syncClient.flush()` before posting the result.
 */
function initFromPostgresDump(
  dump: PostgresDumpPayload,
  connection: PostgresConnectionInfo,
  bookId: string,
): void {
  closeDb();
  isWritable = true;

  db = new sqlite3.oo1.DB();
  db.exec({ sql: GNUCASH_SCHEMA_DDL });
  db.exec({ sql: EXTRA_ENGINE_TABLES_SQL });

  insertDumpIntoCache(db, dump);

  syncClient = new PostgresSyncClient(connection, bookId);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  writableAdapter = createWritablePostgresAdapter(db as any, syncClient);
  validateSchema(writableAdapter);
  ctx = buildParseContext(writableAdapter);
}

/**
 * Read-only variant of `initFromPostgresDump` for the existing-GnuCash-DB
 * interop path (#48 follow-up). Populates the local cache from the dump but
 * wires the engine to a NON-writable adapter — every mutation helper in the
 * dashboard context already gates on `isWritable`, so the engine never gets
 * to emit a statement that could end up against a foreign schema we don't
 * control.
 *
 * No sync client is created; the caller's responsibility for subsequent
 * reloads is to fetch a fresh dump via the connection stored in OPFS.
 */
function initFromPostgresDumpReadOnly(dump: PostgresDumpPayload): void {
  closeDb();
  isWritable = false;
  writableAdapter = null;
  syncClient = null;

  db = new sqlite3.oo1.DB();
  db.exec({ sql: GNUCASH_SCHEMA_DDL });
  db.exec({ sql: EXTRA_ENGINE_TABLES_SQL });

  insertDumpIntoCache(db, dump);

  const adapter = createWasmAdapter(db);
  validateSchema(adapter);
  ctx = buildParseContext(adapter);
}

function getFullDashboardData(): DashboardData {
  if (!ctx) throw new Error("No database loaded");

  const accountTree = buildAccountTree(ctx);
  const netWorthSeries = computeNetWorthSeries(ctx);
  const cashFlowSeries = computeCashFlowSeries(ctx);
  const { categories: expenseBreakdown, monthly: monthlyExpensesByCategory, colors: expenseCategoryColors } = computeExpenseBreakdown(ctx);
  const investments = computeInvestments(ctx);
  const investmentValueSeries = computeInvestmentValueSeries(ctx);
  const topBalances = computeTopBalances(ctx);
  const expenseTransactions = getExpenseTransactions(ctx);
  const { monthly: monthlyIncomeByCategory, colors: incomeCategoryColors } = computeIncomeBreakdown(ctx);
  const incomeTransactions = getIncomeTransactions(ctx);
  const recentTransactions = getRecentTransactions(ctx);
  const upcomingBills = getUpcomingBills(ctx);
  const ledgerTransactions = getLedgerTransactions(ctx);
  const budgetData = computeBudgetData(ctx);
  const cashFlowBudgetData = computeCashFlowBudgetData(ctx);
  const { inflow: monthlyCashInflowByCategory, outflow: monthlyCashOutflowByCategory, inflowColors: cashInflowCategoryColors, outflowColors: cashOutflowCategoryColors } = computeCashFlowByCategory(ctx);
  const currentNetWorth = computeCurrentNetWorth(ctx);

  const now = new Date();
  const currentMonth = formatMonth(now);
  const currentCF = cashFlowSeries.find((cf) => cf.month === currentMonth);
  const currentIncome = currentCF?.income ?? 0;
  const currentExpenses = currentCF?.expenses ?? 0;
  const savingsRate =
    currentIncome > 0
      ? ((currentIncome - currentExpenses) / currentIncome) * 100
      : 0;

  const hasClosing = hasClosingTransactions(ctx);

  // If closing transactions exist, also compute versions with them excluded
  let cashFlowSeriesExcludingClosing: typeof cashFlowSeries | undefined;
  let expenseBreakdownExcludingClosing: typeof expenseBreakdown | undefined;
  let monthlyExpensesByCategoryExcludingClosing: typeof monthlyExpensesByCategory | undefined;
  let expenseCategoryColorsExcludingClosing: typeof expenseCategoryColors | undefined;
  let monthlyIncomeByCategoryExcludingClosing: typeof monthlyIncomeByCategory | undefined;
  let incomeCategoryColorsExcludingClosing: typeof incomeCategoryColors | undefined;
  let monthlyCashInflowByCategoryExcludingClosing: typeof monthlyCashInflowByCategory | undefined;
  let monthlyCashOutflowByCategoryExcludingClosing: typeof monthlyCashOutflowByCategory | undefined;
  let cashInflowCategoryColorsExcludingClosing: typeof cashInflowCategoryColors | undefined;
  let cashOutflowCategoryColorsExcludingClosing: typeof cashOutflowCategoryColors | undefined;

  if (hasClosing) {
    cashFlowSeriesExcludingClosing = computeCashFlowSeries(ctx, true);
    const excExpense = computeExpenseBreakdown(ctx, true);
    expenseBreakdownExcludingClosing = excExpense.categories;
    monthlyExpensesByCategoryExcludingClosing = excExpense.monthly;
    expenseCategoryColorsExcludingClosing = excExpense.colors;
    const excIncome = computeIncomeBreakdown(ctx, true);
    monthlyIncomeByCategoryExcludingClosing = excIncome.monthly;
    incomeCategoryColorsExcludingClosing = excIncome.colors;
    const excCashFlow = computeCashFlowByCategory(ctx, true);
    monthlyCashInflowByCategoryExcludingClosing = excCashFlow.inflow;
    monthlyCashOutflowByCategoryExcludingClosing = excCashFlow.outflow;
    cashInflowCategoryColorsExcludingClosing = excCashFlow.inflowColors;
    cashOutflowCategoryColorsExcludingClosing = excCashFlow.outflowColors;
  }

  const baseCommodity = ctx.commodityMap.get(ctx.baseCurrencyGuid);

  return {
    currency: ctx.baseCurrencyMnemonic,
    currencyGuid: ctx.baseCurrencyGuid,
    currencyFraction: baseCommodity?.fraction ?? 100,
    accounts: accountTree,
    netWorthSeries,
    cashFlowSeries,
    expenseBreakdown,
    monthlyExpensesByCategory,
    expenseCategoryColors,
    expenseTransactions,
    monthlyIncomeByCategory,
    incomeCategoryColors,
    incomeTransactions,
    investments,
    investmentValueSeries,
    topBalances,
    recentTransactions,
    upcomingBills,
    currentNetWorth,
    currentMonthIncome: currentIncome,
    currentMonthExpenses: currentExpenses,
    savingsRate,
    budgetData,
    cashFlowBudgetData,
    ledgerTransactions,
    commodities: ctx.commodities.map((c) => ({
      guid: c.guid,
      namespace: c.namespace,
      mnemonic: c.mnemonic,
      fullname: c.fullname,
      fraction: c.fraction,
    })),
    prices: ctx.prices,
    orphanedPriceGuids: Array.from(computeOrphanedPriceGuids(ctx)),
    availableCurrencies: ctx.availableCurrencies,
    hasClosingTransactions: hasClosing,
    cashFlowSeriesExcludingClosing,
    expenseBreakdownExcludingClosing,
    monthlyExpensesByCategoryExcludingClosing,
    expenseCategoryColorsExcludingClosing,
    monthlyIncomeByCategoryExcludingClosing,
    incomeCategoryColorsExcludingClosing,
    monthlyCashInflowByCategory,
    monthlyCashOutflowByCategory,
    cashInflowCategoryColors,
    cashOutflowCategoryColors,
    monthlyCashInflowByCategoryExcludingClosing,
    monthlyCashOutflowByCategoryExcludingClosing,
    cashInflowCategoryColorsExcludingClosing,
    cashOutflowCategoryColorsExcludingClosing,
  };
}

/**
 * After committing a transaction, record implied prices for stock buys/sells
 * and FX conversions in the prices table.
 *
 * A price is implied when a split's value (in tx currency) differs from its
 * quantity (in the account's commodity). Price = value / quantity.
 */
function recordImpliedPrices(
  adapter: WritableDbAdapter,
  context: ParseContext,
  payload: CreateTransactionPayload,
): void {
  const txDate = new Date(payload.postDate + "T12:00:00");

  for (const split of payload.splits) {
    const account = context.accountMap.get(split.accountGuid);
    if (!account) continue;

    // Skip if the account's commodity IS the transaction currency (no conversion)
    if (account.commodity_guid === payload.currencyGuid) continue;

    const valueAbs = Math.abs(split.valueNum / split.valueDenom);
    const quantityAbs = Math.abs(split.quantityNum / split.quantityDenom);
    if (quantityAbs === 0 || valueAbs === 0) continue;

    // Price = value / quantity (e.g., 1 share of AAPL = 135.50 GBP)
    const priceDenom = 1000000;
    const priceNum = Math.round((valueAbs / quantityAbs) * priceDenom);

    addPrice(
      adapter,
      account.commodity_guid,     // commodity being priced (stock or foreign currency)
      payload.currencyGuid,       // priced in transaction currency
      txDate,
      new GncNumeric(priceNum, priceDenom),
      "user:xfer-dialog",         // GnuCash uses this source for transaction-implied prices
      "transaction",
    );
  }
}

/**
 * Handle a createTransaction mutation.
 * Uses the accounting engine to validate and commit, then returns fresh dashboard data.
 */
function handleCreateTransaction(payload: CreateTransactionPayload): DashboardData {
  if (!ctx) throw new Error("No database loaded");
  if (!writableAdapter) throw new Error("Database is not open in read-write mode");

  const builder = new TransactionBuilder(writableAdapter, ctx)
    .currency(payload.currencyGuid)
    .postDate(new Date(payload.postDate + "T00:00:00"))
    .description(payload.description);

  if (payload.num) {
    builder.num(payload.num);
  }

  for (const split of payload.splits) {
    builder.addSplit({
      accountGuid: split.accountGuid,
      value: new GncNumeric(split.valueNum, split.valueDenom),
      quantity: new GncNumeric(split.quantityNum, split.quantityDenom),
      memo: split.memo,
    });
  }

  builder.commit();

  // Record implied prices for stock/FX transactions
  recordImpliedPrices(writableAdapter, ctx, payload);

  // Rebuild context to pick up the new transaction and prices
  ctx = buildParseContext(writableAdapter);

  // Return fully refreshed dashboard data
  return getFullDashboardData();
}

/**
 * Handle a deleteTransaction mutation.
 */
function handleDeleteTransaction(payload: DeleteTransactionPayload): DashboardData {
  if (!ctx) throw new Error("No database loaded");
  if (!writableAdapter) throw new Error("Database is not open in read-write mode");

  deleteTransaction(writableAdapter, payload.transactionGuid);
  ctx = buildParseContext(writableAdapter);
  return getFullDashboardData();
}

/**
 * Handle an editTransaction mutation.
 * Deletes the old transaction and creates a new one with updated data.
 * This matches GNUCash's behavior where split changes require delete + recreate.
 */
function handleEditTransaction(payload: EditTransactionPayload): DashboardData {
  if (!ctx) throw new Error("No database loaded");
  if (!writableAdapter) throw new Error("Database is not open in read-write mode");

  // Delete the original transaction first
  deleteTransaction(writableAdapter, payload.originalGuid);

  // Rebuild context after delete so the builder sees current state
  ctx = buildParseContext(writableAdapter);

  // Create the replacement transaction
  const builder = new TransactionBuilder(writableAdapter, ctx)
    .currency(payload.currencyGuid)
    .postDate(new Date(payload.postDate + "T00:00:00"))
    .description(payload.description);

  if (payload.num) {
    builder.num(payload.num);
  }

  for (const split of payload.splits) {
    builder.addSplit({
      accountGuid: split.accountGuid,
      value: new GncNumeric(split.valueNum, split.valueDenom),
      quantity: new GncNumeric(split.quantityNum, split.quantityDenom),
      memo: split.memo,
    });
  }

  builder.commit();

  // Record implied prices for stock/FX transactions
  recordImpliedPrices(writableAdapter, ctx, payload);

  ctx = buildParseContext(writableAdapter);
  return getFullDashboardData();
}

/**
 * Handle a bulkEditTransactions mutation. Applies rename and/or account
 * reassignment across multiple single-split transactions atomically.
 */
function handleBulkEditTransactions(payload: BulkEditTransactionsPayload): DashboardData {
  if (!ctx) throw new Error("No database loaded");
  if (!writableAdapter) throw new Error("Database is not open in read-write mode");

  bulkEditTransactions(writableAdapter, {
    transactionGuids: payload.transactionGuids,
    newDescription: payload.newDescription,
    newFromAccountGuid: payload.newFromAccountGuid,
    newToAccountGuid: payload.newToAccountGuid,
  });

  ctx = buildParseContext(writableAdapter);
  return getFullDashboardData();
}

function handleCreateAccount(payload: CreateAccountPayload): DashboardData {
  if (!ctx) throw new Error("No database loaded");
  if (!writableAdapter) throw new Error("Database is not open in read-write mode");

  new AccountBuilder(writableAdapter, ctx)
    .name(payload.name)
    .type(payload.accountType as AccountType)
    .commodity(payload.commodityGuid)
    .parent(payload.parentGuid)
    .code(payload.code ?? "")
    .description(payload.description ?? "")
    .hidden(payload.hidden ?? false)
    .placeholder(payload.placeholder ?? false)
    .commit();

  ctx = buildParseContext(writableAdapter);
  return getFullDashboardData();
}

function handleUpdateAccount(payload: UpdateAccountPayload): DashboardData {
  if (!ctx) throw new Error("No database loaded");
  if (!writableAdapter) throw new Error("Database is not open in read-write mode");

  updateAccount(writableAdapter, payload.accountGuid, {
    name: payload.name,
    accountType: payload.accountType,
    commodityGuid: payload.commodityGuid,
    parentGuid: payload.parentGuid,
    code: payload.code,
    description: payload.description,
    hidden: payload.hidden,
    placeholder: payload.placeholder,
  });

  ctx = buildParseContext(writableAdapter);
  return getFullDashboardData();
}

function handleDeleteAccount(payload: DeleteAccountPayload): DashboardData {
  if (!ctx) throw new Error("No database loaded");
  if (!writableAdapter) throw new Error("Database is not open in read-write mode");

  deleteAccountWithReallocation(writableAdapter, payload.accountGuid, payload.targetAccountGuid);
  ctx = buildParseContext(writableAdapter);
  return getFullDashboardData();
}

function handleCreateCommodity(payload: CreateCommodityPayload): DashboardData {
  if (!ctx) throw new Error("No database loaded");
  if (!writableAdapter) throw new Error("Database is not open in read-write mode");

  createCommodity(writableAdapter, {
    namespace: payload.namespace,
    mnemonic: payload.mnemonic,
    fullname: payload.fullname,
    fraction: payload.fraction,
    cusip: payload.cusip,
  });

  ctx = buildParseContext(writableAdapter);
  return getFullDashboardData();
}

/** Handle adding a new price entry. */
function handleAddPrice(payload: AddPricePayload): DashboardData {
  if (!ctx) throw new Error("No database loaded");
  if (!writableAdapter) throw new Error("Database is not open in read-write mode");

  const priceDenom = 1000000;
  const priceNum = Math.round(payload.value * priceDenom);

  addPrice(
    writableAdapter,
    payload.commodityGuid,
    payload.currencyGuid,
    new Date(payload.date + "T12:00:00"),
    new GncNumeric(priceNum, priceDenom),
    payload.source ?? "user:price-editor",
    payload.type ?? "last",
  );

  ctx = buildParseContext(writableAdapter);
  return getFullDashboardData();
}

/** Handle editing an existing price (delete + recreate). */
function handleEditPrice(payload: EditPricePayload): DashboardData {
  if (!ctx) throw new Error("No database loaded");
  if (!writableAdapter) throw new Error("Database is not open in read-write mode");

  deletePrice(writableAdapter, payload.originalGuid);

  const priceDenom = 1000000;
  const priceNum = Math.round(payload.value * priceDenom);

  addPrice(
    writableAdapter,
    payload.commodityGuid,
    payload.currencyGuid,
    new Date(payload.date + "T12:00:00"),
    new GncNumeric(priceNum, priceDenom),
    payload.source ?? "user:price-editor",
    payload.type ?? "last",
  );

  ctx = buildParseContext(writableAdapter);
  return getFullDashboardData();
}

/** Handle deleting a price entry. */
function handleDeletePrice(payload: DeletePricePayload): DashboardData {
  if (!ctx) throw new Error("No database loaded");
  if (!writableAdapter) throw new Error("Database is not open in read-write mode");

  deletePrice(writableAdapter, payload.priceGuid);

  ctx = buildParseContext(writableAdapter);
  return getFullDashboardData();
}

const domainFunctions: Record<DomainFunction, () => unknown> = {
  buildAccountTree: () => buildAccountTree(ctx!),
  computeNetWorthSeries: () => computeNetWorthSeries(ctx!),
  computeCurrentNetWorth: () => computeCurrentNetWorth(ctx!),
  computeCashFlowSeries: () => computeCashFlowSeries(ctx!),
  computeExpenseBreakdown: () => computeExpenseBreakdown(ctx!),
  getExpenseTransactions: () => getExpenseTransactions(ctx!),
  computeIncomeBreakdown: () => computeIncomeBreakdown(ctx!),
  getIncomeTransactions: () => getIncomeTransactions(ctx!),
  computeInvestments: () => computeInvestments(ctx!),
  computeInvestmentValueSeries: () => computeInvestmentValueSeries(ctx!),
  computeTopBalances: () => computeTopBalances(ctx!),
  getLedgerTransactions: () => getLedgerTransactions(ctx!),
  getRecentTransactions: () => getRecentTransactions(ctx!),
  computeBudgetData: () => computeBudgetData(ctx!),
  getUpcomingBills: () => getUpcomingBills(ctx!),
  getFullDashboardData,
};

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  switch (msg.type) {
    case "init": {
      try {
        await initFromBuffer(msg.fileBuffer, msg.writable ?? false);
        console.log("[db-worker] DB opened from uploaded file via SQLite WASM", isWritable ? "(read-write)" : "(read-only)");
        post({ type: "ready" });
      } catch (err) {
        post({ type: "init-error", message: (err as Error).message });
      }
      break;
    }

    case "init-xml": {
      try {
        initFromXmlData(msg.xmlData);
        console.log("[db-worker] DB created from XML data (read-only)");
        post({ type: "ready" });
      } catch (err) {
        post({ type: "init-error", message: (err as Error).message });
      }
      break;
    }

    case "init-opfs": {
      try {
        initFromOpfs(msg.writable ?? false);
        console.log("[db-worker] DB restored from OPFS", isWritable ? "(read-write)" : "(read-only)");
        post({ type: "ready" });
      } catch (err) {
        post({ type: "init-error", message: (err as Error).message });
      }
      break;
    }

    case "init-pg-dump": {
      try {
        initFromPostgresDump(msg.dump, msg.connection, msg.bookId);
        console.log(
          "[db-worker] DB restored from Postgres dump",
          `book=${msg.bookId}`,
          "(read-write, syncing)",
        );
        post({ type: "ready" });
      } catch (err) {
        post({ type: "init-error", message: (err as Error).message });
      }
      break;
    }

    case "init-pg-dump-readonly": {
      try {
        initFromPostgresDumpReadOnly(msg.dump);
        console.log(
          "[db-worker] DB restored from Postgres dump (read-only interop)",
        );
        post({ type: "ready" });
      } catch (err) {
        post({ type: "init-error", message: (err as Error).message });
      }
      break;
    }

    case "query": {
      try {
        if (!ctx) throw new Error("No database loaded");
        const fn = domainFunctions[msg.fn];
        if (!fn) throw new Error(`Unknown domain function: ${msg.fn}`);
        const data = fn();
        post({ type: "result", id: msg.id, data });
      } catch (err) {
        post({ type: "error", id: msg.id, message: (err as Error).message });
      }
      break;
    }

    case "mutation": {
      try {
        if (!ctx) throw new Error("No database loaded");
        let data: unknown;
        switch (msg.action) {
          case "createTransaction":
            data = handleCreateTransaction(msg.payload as CreateTransactionPayload);
            break;
          case "deleteTransaction":
            data = handleDeleteTransaction(msg.payload as DeleteTransactionPayload);
            break;
          case "editTransaction":
            data = handleEditTransaction(msg.payload as EditTransactionPayload);
            break;
          case "bulkEditTransactions":
            data = handleBulkEditTransactions(msg.payload as BulkEditTransactionsPayload);
            break;
          case "createAccount":
            data = handleCreateAccount(msg.payload as CreateAccountPayload);
            break;
          case "updateAccount":
            data = handleUpdateAccount(msg.payload as UpdateAccountPayload);
            break;
          case "deleteAccount":
            data = handleDeleteAccount(msg.payload as DeleteAccountPayload);
            break;
          case "createCommodity":
            data = handleCreateCommodity(msg.payload as CreateCommodityPayload);
            break;
          case "addPrice":
            data = handleAddPrice(msg.payload as AddPricePayload);
            break;
          case "editPrice":
            data = handleEditPrice(msg.payload as EditPricePayload);
            break;
          case "deletePrice":
            data = handleDeletePrice(msg.payload as DeletePricePayload);
            break;
          default:
            throw new Error(`Unknown mutation action: ${msg.action}`);
        }
        // On the Postgres backend, round-trip the pending write batch before
        // telling the UI the mutation succeeded. Sync errors propagate to the
        // catch block and surface as a standard `error` response — the UI is
        // expected to show the message and prompt the user to reload so the
        // local cache can reconcile with authoritative server state.
        if (syncClient) {
          await syncClient.flush();
        }
        post({ type: "result", id: msg.id, data });
      } catch (err) {
        post({ type: "error", id: msg.id, message: (err as Error).message });
      }
      break;
    }

    case "set-currency": {
      try {
        if (!ctx) throw new Error("No database loaded");
        // Rebuild parse context with the new base currency, reusing existing db adapter
        ctx = buildParseContext(ctx.db, msg.currencyGuid);
        const data = getFullDashboardData();
        post({ type: "result", id: msg.id, data });
      } catch (err) {
        post({ type: "error", id: msg.id, message: (err as Error).message });
      }
      break;
    }

    case "export": {
      try {
        if (!db) throw new Error("No database loaded");
        const bytes = sqlite3.capi.sqlite3_js_db_export(db.pointer!);
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        // Use the DedicatedWorkerGlobalScope overload with transfer list
        (self as unknown as { postMessage(msg: unknown, transfer: Transferable[]): void })
          .postMessage({ type: "export-result", id: msg.id, buffer }, [buffer]);
      } catch (err) {
        post({ type: "error", id: msg.id, message: (err as Error).message });
      }
      break;
    }

    case "close": {
      closeDb();
      break;
    }
  }
};

// Initialize SQLite WASM on worker start
sqlite3InitModule().then((s3) => {
  sqlite3 = s3;
  console.log("[db-worker] SQLite WASM initialized", s3.oo1.OpfsDb ? "(OPFS available)" : "(OPFS not available, using in-memory)");
  post({ type: "ready" });
}).catch((err) => {
  post({ type: "init-error", message: `SQLite WASM init failed: ${(err as Error).message}` });
});
