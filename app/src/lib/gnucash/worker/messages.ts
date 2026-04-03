/**
 * Typed message protocol between main thread and DB Web Worker.
 * Messages are at the domain-function level, not raw SQL.
 */

export type WorkerRequest =
  | { type: "init"; fileBuffer: ArrayBuffer }
  | { type: "init-opfs"; fileName: string }
  | { type: "query"; id: string; fn: DomainFunction }
  | { type: "close" };

export type DomainFunction =
  | "buildAccountTree"
  | "computeNetWorthSeries"
  | "computeCurrentNetWorth"
  | "computeCashFlowSeries"
  | "computeExpenseBreakdown"
  | "getExpenseTransactions"
  | "computeIncomeBreakdown"
  | "getIncomeTransactions"
  | "computeInvestments"
  | "computeInvestmentValueSeries"
  | "computeTopBalances"
  | "getLedgerTransactions"
  | "getRecentTransactions"
  | "computeBudgetData"
  | "getUpcomingBills"
  | "getFullDashboardData";

export type WorkerResponse =
  | { type: "ready" }
  | { type: "result"; id: string; data: unknown }
  | { type: "error"; id: string; message: string }
  | { type: "init-error"; message: string };
