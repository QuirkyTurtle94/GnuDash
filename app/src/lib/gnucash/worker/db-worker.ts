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
import { getUpcomingBills } from "../domain/bills";
import { formatMonth } from "../shared/dates";
import { createWritableWasmAdapter } from "../engine/db/writable-wasm-adapter";
import { TransactionBuilder } from "../engine/builders/transaction-builder";
import { GncNumeric } from "../engine/gnc-numeric";
import type { WritableDbAdapter } from "../engine/db/writable-adapter";
import type { DashboardData } from "@/lib/types/gnucash";
import { deleteTransaction } from "../engine/operations/transaction-ops";
import { AccountBuilder } from "../engine/builders/account-builder";
import { updateAccount, deleteAccountWithReallocation } from "../engine/operations/account-ops";
import { createCommodity } from "../engine/operations/commodity-ops";
import type { AccountType } from "../engine/types";
import type { WorkerRequest, WorkerResponse, DomainFunction, CreateTransactionPayload, DeleteTransactionPayload, EditTransactionPayload, CreateAccountPayload, UpdateAccountPayload, DeleteAccountPayload, CreateCommodityPayload } from "./messages";

let sqlite3: Sqlite3Static;
let db: WasmDatabase | null = null;
let ctx: ParseContext | null = null;
let isWritable = false;
let writableAdapter: WritableDbAdapter | null = null;

const OPFS_DB_NAME = "/gnucash-dashboard.db";

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

function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    ctx = null;
    writableAdapter = null;
    isWritable = false;
  }
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
    ledgerTransactions,
    commodities: ctx.commodities.map((c) => ({
      guid: c.guid,
      namespace: c.namespace,
      mnemonic: c.mnemonic,
      fullname: c.fullname,
      fraction: c.fraction,
    })),
  };
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

  // Rebuild context to pick up the new transaction
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
          default:
            throw new Error(`Unknown mutation action: ${msg.action}`);
        }
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
