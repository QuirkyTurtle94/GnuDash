/**
 * Typed message protocol between main thread and DB Web Worker.
 * Messages are at the domain-function level, not raw SQL.
 */

export type WorkerRequest =
  | { type: "init"; fileBuffer: ArrayBuffer; writable?: boolean }
  | { type: "init-opfs"; fileName: string; writable?: boolean }
  | { type: "query"; id: string; fn: DomainFunction }
  | { type: "mutation"; id: string; action: MutationAction; payload: unknown }
  | { type: "export"; id: string }
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

export type MutationAction =
  | "createTransaction" | "deleteTransaction" | "editTransaction"
  | "createAccount" | "updateAccount" | "deleteAccount"
  | "createCommodity";

/**
 * Payload for creating a transaction via the worker.
 * Uses plain numbers (not GncNumeric) for serialization across the worker boundary.
 */
export interface CreateTransactionPayload {
  currencyGuid: string;
  postDate: string; // ISO date string (YYYY-MM-DD)
  description: string;
  num?: string;
  splits: {
    accountGuid: string;
    valueNum: number;
    valueDenom: number;
    quantityNum: number;
    quantityDenom: number;
    memo?: string;
  }[];
}

export interface DeleteTransactionPayload {
  transactionGuid: string;
}

/**
 * Payload for editing a transaction.
 * Deletes the old transaction and creates a new one with updated data.
 */
export interface EditTransactionPayload {
  /** GUID of the existing transaction to replace. */
  originalGuid: string;
  currencyGuid: string;
  postDate: string;
  description: string;
  num?: string;
  splits: {
    accountGuid: string;
    valueNum: number;
    valueDenom: number;
    quantityNum: number;
    quantityDenom: number;
    memo?: string;
  }[];
}

export interface CreateAccountPayload {
  name: string;
  accountType: string;
  commodityGuid: string;
  parentGuid: string;
  code?: string;
  description?: string;
  hidden?: boolean;
  placeholder?: boolean;
}

export interface UpdateAccountPayload {
  accountGuid: string;
  name?: string;
  accountType?: string;
  commodityGuid?: string;
  parentGuid?: string;
  code?: string;
  description?: string;
  hidden?: boolean;
  placeholder?: boolean;
}

export interface DeleteAccountPayload {
  accountGuid: string;
  targetAccountGuid: string;
}

export interface CreateCommodityPayload {
  namespace: string;
  mnemonic: string;
  fullname: string;
  fraction: number;
  cusip?: string;
}

export type WorkerResponse =
  | { type: "ready" }
  | { type: "result"; id: string; data: unknown }
  | { type: "export-result"; id: string; buffer: ArrayBuffer }
  | { type: "error"; id: string; message: string }
  | { type: "init-error"; message: string };
