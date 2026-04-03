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
import type { DashboardData } from "@/lib/types/gnucash";
import type { WorkerRequest, WorkerResponse, DomainFunction } from "./messages";

let sqlite3: Sqlite3Static;
let db: WasmDatabase | null = null;
let ctx: ParseContext | null = null;

const OPFS_DB_NAME = "/gnucash-dashboard.db";

function post(msg: WorkerResponse) {
  self.postMessage(msg);
}

/**
 * Opens a database from an ArrayBuffer (uploaded file).
 * Writes to OPFS for persistence, then opens from there.
 */
async function initFromBuffer(buffer: ArrayBuffer): Promise<void> {
  closeDb();

  const hasOpfs = !!sqlite3.oo1.OpfsDb;

  if (hasOpfs) {
    // Write to OPFS for persistence, then open from there
    await sqlite3.oo1.OpfsDb.importDb(OPFS_DB_NAME, buffer);
    db = new sqlite3.oo1.OpfsDb(OPFS_DB_NAME, "r");
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

  const adapter = createWasmAdapter(db);
  validateSchema(adapter);
  ctx = buildParseContext(adapter);
}

/**
 * Opens an existing database from OPFS (session restore).
 */
function initFromOpfs(): void {
  closeDb();

  if (!sqlite3.oo1.OpfsDb) {
    throw new Error("OPFS not available");
  }

  // This will throw if the file doesn't exist
  db = new sqlite3.oo1.OpfsDb(OPFS_DB_NAME, "r");
  const adapter = createWasmAdapter(db);
  validateSchema(adapter);
  ctx = buildParseContext(adapter);
}

function closeDb(): void {
  if (db) {
    db.close();
    db = null;
    ctx = null;
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

  return {
    currency: ctx.baseCurrencyMnemonic,
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
  };
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
        await initFromBuffer(msg.fileBuffer);
        console.log("[db-worker] DB opened from uploaded file via SQLite WASM");
        post({ type: "ready" });
      } catch (err) {
        post({ type: "init-error", message: (err as Error).message });
      }
      break;
    }

    case "init-opfs": {
      try {
        initFromOpfs();
        console.log("[db-worker] DB restored from OPFS");
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
