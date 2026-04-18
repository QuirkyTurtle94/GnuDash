/**
 * Typed message protocol between main thread and DB Web Worker.
 * Messages are at the domain-function level, not raw SQL.
 */

import type { GnuCashXmlData } from "../xml/types";

/** Connection params for the Postgres backend (#48). Mirrors `PgConnection`
 *  in `lib/pg/connect.ts` but lives here so worker modules never need to
 *  import from the server-only `pg/connect` module. */
export interface PostgresConnectionInfo {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: boolean;
}

/** Shape of the payload `/api/pg/book/dump` returns (after gunzip). */
export interface PostgresDumpPayload {
  version: 1;
  tables: Record<string, Record<string, unknown>[]>;
}

export type WorkerRequest =
  | { type: "init"; fileBuffer: ArrayBuffer; writable?: boolean }
  | { type: "init-xml"; xmlData: GnuCashXmlData }
  | { type: "init-opfs"; fileName: string; writable?: boolean }
  | {
      type: "init-pg-dump";
      dump: PostgresDumpPayload;
      connection: PostgresConnectionInfo;
      bookId: string;
    }
  | {
      type: "init-pg-dump-readonly";
      dump: PostgresDumpPayload;
    }
  | { type: "query"; id: string; fn: DomainFunction }
  | { type: "mutation"; id: string; action: MutationAction; payload: unknown }
  | { type: "set-currency"; id: string; currencyGuid: string }
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
  | "bulkEditTransactions"
  | "createAccount" | "updateAccount" | "deleteAccount"
  | "createCommodity"
  | "addPrice" | "editPrice" | "deletePrice";

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

/**
 * Payload for a grouped bulk edit across multiple single-split transactions.
 * Applies any combination of: description rename, from-account reassign,
 * to-account reassign. All changes commit atomically in one DB transaction.
 */
export interface BulkEditTransactionsPayload {
  /** GUIDs of the transactions to edit. Must all be 2-split transactions. */
  transactionGuids: string[];
  /** If set, every transaction's description is replaced with this value. */
  newDescription?: string;
  /** If set, the negative-value (source) split is moved to this account. */
  newFromAccountGuid?: string;
  /** If set, the positive-value (destination) split is moved to this account. */
  newToAccountGuid?: string;
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

/** Payload for adding a price entry. */
export interface AddPricePayload {
  commodityGuid: string;
  currencyGuid: string;
  date: string; // YYYY-MM-DD
  /** Price as a decimal number (e.g. 135.50) */
  value: number;
  /** Source identifier (e.g. "user:price-editor", "user:xfer-dialog", "Finance::Quote") */
  source?: string;
  /** Price type (e.g. "last", "nav", "transaction") */
  type?: string;
}

/** Payload for editing an existing price entry (delete old + add new). */
export interface EditPricePayload {
  /** GUID of the price to replace */
  originalGuid: string;
  commodityGuid: string;
  currencyGuid: string;
  date: string;
  value: number;
  source?: string;
  type?: string;
}

/** Payload for deleting a price entry. */
export interface DeletePricePayload {
  priceGuid: string;
}

export type WorkerResponse =
  | { type: "ready" }
  | { type: "result"; id: string; data: unknown }
  | { type: "export-result"; id: string; buffer: ArrayBuffer }
  | { type: "error"; id: string; message: string }
  | { type: "init-error"; message: string };
