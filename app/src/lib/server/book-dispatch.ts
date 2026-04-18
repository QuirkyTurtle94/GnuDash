import "server-only";
/**
 * Whitelisted dispatch for /api/book/query and /api/book/mutation.
 *
 * Both routes accept a shape like { fn: DomainFunction } or { action: MutationAction,
 * payload }. Dispatch is via two explicit maps here — adding a new function
 * or action requires a code change here, which forces the schema registration
 * (security review §1.1).
 *
 * Every handler receives a ParseContext built fresh for the request against
 * the scoped WritableDbAdapter from withBookClient. That keeps reads cheap
 * (no second round-trip) and makes the same domain code path work on
 * Postgres as on SQLite WASM.
 */
import type { WritableDbAdapter } from "../gnucash/engine/db/writable-adapter";
import { buildParseContext } from "../gnucash/context";
import { buildAccountTree } from "../gnucash/domain/accounts";
import {
  computeCurrentNetWorth,
  computeNetWorthSeries,
} from "../gnucash/domain/net-worth";
import { computeCashFlowSeries } from "../gnucash/domain/cash-flow";
import {
  computeExpenseBreakdown,
  getExpenseTransactions,
} from "../gnucash/domain/expenses";
import {
  computeIncomeBreakdown,
  getIncomeTransactions,
} from "../gnucash/domain/income";
import {
  computeInvestments,
  computeInvestmentValueSeries,
} from "../gnucash/domain/investments";
import { computeTopBalances } from "../gnucash/domain/balances";
import {
  getLedgerTransactions,
  getRecentTransactions,
} from "../gnucash/domain/ledger";
import { computeBudgetData } from "../gnucash/domain/budgets";
import { getUpcomingBills } from "../gnucash/domain/bills";
import type { DomainFunction } from "../gnucash/worker/messages";

export async function dispatchQuery(
  db: WritableDbAdapter,
  fn: DomainFunction
): Promise<unknown> {
  const ctx = await buildParseContext(db);
  switch (fn) {
    case "buildAccountTree":
      return buildAccountTree(ctx);
    case "computeNetWorthSeries":
      return computeNetWorthSeries(ctx);
    case "computeCurrentNetWorth":
      return computeCurrentNetWorth(ctx);
    case "computeCashFlowSeries":
      return computeCashFlowSeries(ctx);
    case "computeExpenseBreakdown":
      return computeExpenseBreakdown(ctx);
    case "getExpenseTransactions":
      return getExpenseTransactions(ctx);
    case "computeIncomeBreakdown":
      return computeIncomeBreakdown(ctx);
    case "getIncomeTransactions":
      return getIncomeTransactions(ctx);
    case "computeInvestments":
      return computeInvestments(ctx);
    case "computeInvestmentValueSeries":
      return computeInvestmentValueSeries(ctx);
    case "computeTopBalances":
      return computeTopBalances(ctx);
    case "getLedgerTransactions":
      return getLedgerTransactions(ctx);
    case "getRecentTransactions":
      return getRecentTransactions(ctx);
    case "computeBudgetData":
      return computeBudgetData(ctx);
    case "getUpcomingBills":
      return getUpcomingBills(ctx);
    case "getFullDashboardData":
      // getFullDashboardData is the worker's aggregator. For server mode,
      // run the aggregate via a direct computation (Phase 2 can split per
      // panel). For now, compose the subset the dashboard reads on mount.
      return {
        accountTree: await buildAccountTree(ctx),
        netWorthSeries: await computeNetWorthSeries(ctx),
        currentNetWorth: await computeCurrentNetWorth(ctx),
        cashFlowSeries: await computeCashFlowSeries(ctx),
        expenseBreakdown: await computeExpenseBreakdown(ctx),
        incomeBreakdown: await computeIncomeBreakdown(ctx),
        investments: await computeInvestments(ctx),
        investmentValueSeries: await computeInvestmentValueSeries(ctx),
        topBalances: await computeTopBalances(ctx),
        ledgerTransactions: await getLedgerTransactions(ctx),
        recentTransactions: await getRecentTransactions(ctx),
        budgetData: await computeBudgetData(ctx),
        upcomingBills: await getUpcomingBills(ctx),
        expenseTransactions: await getExpenseTransactions(ctx),
        incomeTransactions: await getIncomeTransactions(ctx),
      };
    default: {
      const _exhaustive: never = fn;
      throw new Error(`Unknown domain function: ${_exhaustive as string}`);
    }
  }
}
