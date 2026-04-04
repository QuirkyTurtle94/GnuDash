import type { GncNumeric } from "./gnc-numeric";

/** Reconciliation state for a split. */
export type ReconcileState = "n" | "c" | "y" | "f" | "v";

/** Valid GNUCash account types (excluding ROOT which is system-only). */
export type AccountType =
  | "BANK"
  | "CASH"
  | "ASSET"
  | "STOCK"
  | "MUTUAL"
  | "INCOME"
  | "EXPENSE"
  | "EQUITY"
  | "LIABILITY"
  | "CREDIT"
  | "RECEIVABLE"
  | "PAYABLE"
  | "TRADING";

export const ACCOUNT_TYPES: ReadonlySet<string> = new Set<AccountType>([
  "BANK",
  "CASH",
  "ASSET",
  "STOCK",
  "MUTUAL",
  "INCOME",
  "EXPENSE",
  "EQUITY",
  "LIABILITY",
  "CREDIT",
  "RECEIVABLE",
  "PAYABLE",
  "TRADING",
]);

/** Account types where debit (positive) increases the balance. */
export const DEBIT_NORMAL_TYPES: ReadonlySet<string> = new Set([
  "ASSET",
  "BANK",
  "CASH",
  "STOCK",
  "MUTUAL",
  "EXPENSE",
  "RECEIVABLE",
]);

/** Account types where credit (negative) increases the balance. */
export const CREDIT_NORMAL_TYPES: ReadonlySet<string> = new Set([
  "LIABILITY",
  "CREDIT",
  "INCOME",
  "EQUITY",
  "PAYABLE",
  "TRADING",
]);

/**
 * Specification for a single split within a transaction.
 * Used by the TransactionBuilder before GUID assignment.
 */
export interface SplitSpec {
  /** The account this split posts to. */
  accountGuid: string;
  /** Amount in the transaction's currency (num/denom). */
  value: GncNumeric;
  /** Amount in the account's commodity (num/denom). Equals value for same-currency. */
  quantity: GncNumeric;
  /** Optional split-level memo. */
  memo?: string;
  /** Optional action type (e.g., "Buy", "Sell"). */
  action?: string;
  /** Reconciliation state. Defaults to 'n' (not reconciled). */
  reconcileState?: ReconcileState;
  /** Optional lot GUID for investment tracking. */
  lotGuid?: string | null;
}

/**
 * Full specification for creating a transaction.
 */
export interface TransactionSpec {
  /** The transaction's reference currency GUID. */
  currencyGuid: string;
  /** The transaction posting date. */
  postDate: Date;
  /** Description / payee. */
  description: string;
  /** Optional check/reference number. */
  num?: string;
  /** The splits (must be 2+ and balance to zero in value). */
  splits: SplitSpec[];
}

/**
 * Specification for creating an account.
 */
export interface AccountSpec {
  /** Account display name. */
  name: string;
  /** Account type. */
  accountType: AccountType;
  /** The commodity this account tracks (FK to commodities.guid). */
  commodityGuid: string;
  /** Parent account GUID. */
  parentGuid: string;
  /** Optional account code. */
  code?: string;
  /** Optional description. */
  description?: string;
  /** Whether this account is hidden in the UI. */
  hidden?: boolean;
  /** Whether this is a placeholder/grouping account (cannot have transactions). */
  placeholder?: boolean;
}

/**
 * A validation error returned by the validation layer.
 */
export interface ValidationError {
  /** Machine-readable error code. */
  code: string;
  /** Human-readable error message. */
  message: string;
  /** Optional field that caused the error. */
  field?: string;
}

/**
 * Error thrown when transaction/account commit fails validation.
 */
export class ValidationFailedError extends Error {
  readonly errors: ValidationError[];

  constructor(errors: ValidationError[]) {
    const summary = errors.map((e) => e.message).join("; ");
    super(`Validation failed: ${summary}`);
    this.name = "ValidationFailedError";
    this.errors = errors;
  }
}
