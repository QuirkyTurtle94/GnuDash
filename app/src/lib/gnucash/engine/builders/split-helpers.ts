/**
 * Factory functions for constructing SplitSpec objects.
 * These cover the common cases and reduce boilerplate.
 */

import { GncNumeric } from "../gnc-numeric";
import type { SplitSpec, ReconcileState } from "../types";

/**
 * Create a same-currency split where value == quantity.
 * Used for the vast majority of transactions (bank ↔ expense, bank ↔ income, etc.).
 */
export function simpleSplit(
  accountGuid: string,
  amount: GncNumeric,
  memo?: string,
  reconcileState?: ReconcileState
): SplitSpec {
  return {
    accountGuid,
    value: amount,
    quantity: amount,
    memo,
    reconcileState,
  };
}

/**
 * Create an investment split where value and quantity differ.
 * value = cost in the transaction's currency (e.g., 1200 GBP)
 * shares = number of shares in the account's commodity (e.g., 10 AAPL)
 */
export function investmentSplit(
  accountGuid: string,
  cost: GncNumeric,
  shares: GncNumeric,
  memo?: string,
  action?: string
): SplitSpec {
  return {
    accountGuid,
    value: cost,
    quantity: shares,
    memo,
    action,
  };
}

/**
 * Create a foreign currency split where value and quantity differ.
 * value = amount in the transaction's currency (e.g., 400 GBP)
 * quantity = amount in the account's currency (e.g., 500 USD)
 */
export function fxSplit(
  accountGuid: string,
  valueInTxCurrency: GncNumeric,
  quantityInAccountCurrency: GncNumeric,
  memo?: string
): SplitSpec {
  return {
    accountGuid,
    value: valueInTxCurrency,
    quantity: quantityInAccountCurrency,
    memo,
  };
}
