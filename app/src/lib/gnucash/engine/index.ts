// Accounting Engine — Public API
//
// All monetary arithmetic uses GncNumeric (rational numbers, no floating point).
// All writes are validated against GNUCash invariants and committed atomically.
//
// IMPORTANT: After any write operation, the ParseContext cache is stale.
// The caller must rebuild it via buildParseContext() if updated data is needed.

// Core types
export { GncNumeric, RoundMode } from "./gnc-numeric";
export { generateGuid } from "./guid";
export type {
  SplitSpec,
  TransactionSpec,
  AccountSpec,
  AccountType,
  ReconcileState,
  ValidationError,
} from "./types";
export {
  ValidationFailedError,
  ACCOUNT_TYPES,
  DEBIT_NORMAL_TYPES,
  CREDIT_NORMAL_TYPES,
} from "./types";

// Database adapters
export type { WritableDbAdapter, RunResult } from "./db/writable-adapter";
export {
  createWritableConnection,
  createWritableMemoryDb,
} from "./db/writable-connection";
export { createWritableWasmAdapter } from "./db/writable-wasm-adapter";

// Builders
export { TransactionBuilder } from "./builders/transaction-builder";
export { AccountBuilder } from "./builders/account-builder";
export { simpleSplit, investmentSplit, fxSplit } from "./builders/split-helpers";

// Operations
export {
  updateTransaction,
  deleteTransaction,
  voidTransaction,
} from "./operations/transaction-ops";
export {
  renameAccount,
  reparentAccount,
  deleteAccount,
  updateAccount,
  deleteAccountWithReallocation,
} from "./operations/account-ops";
export { createCommodity } from "./operations/commodity-ops";
export { addPrice, deletePrice } from "./operations/price-ops";
export {
  createLot,
  assignSplitToLot,
  getLotBalance,
  closeLotIfBalanced,
} from "./operations/lot-ops";

// Validation (exposed for dry-run validation in UI)
export {
  validateTransaction,
  validateSplitsBalance,
  validateSplitDenoms,
  validateMinimumSplits,
  validateAccountReferences,
  validateNotPlaceholder,
} from "./validation/invariants";
export {
  validateAccountCreation,
  validateAccountDeletion,
  validateReparent,
} from "./validation/account-rules";
