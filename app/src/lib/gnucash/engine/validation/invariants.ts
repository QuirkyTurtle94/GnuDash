/**
 * Transaction-level validation functions.
 *
 * Each function returns an array of ValidationError (empty = valid).
 * All invariants are checked at commit time by the TransactionBuilder.
 */

import type { GnuCashAccount, GnuCashCommodity } from "@/lib/types/gnucash";
import type { SplitSpec, ValidationError } from "../types";

/**
 * Verify the fundamental double-entry invariant:
 * SUM(value) across all splits must equal zero.
 *
 * Handles splits with different value denominators by converting to LCD.
 */
export function validateSplitsBalance(
  splits: SplitSpec[]
): ValidationError[] {
  if (splits.length === 0) return [];

  // Sum all values — GncNumeric.add handles different denoms via LCD
  let sum = splits[0].value;
  for (let i = 1; i < splits.length; i++) {
    sum = sum.add(splits[i].value);
  }

  if (!sum.isZero()) {
    return [
      {
        code: "SPLITS_UNBALANCED",
        message: `Transaction splits do not balance: sum of values is ${sum.toString()} (must be 0)`,
        field: "splits",
      },
    ];
  }

  return [];
}

/**
 * Verify that each split's denominators match the expected commodity fractions.
 *
 * - value.denom must match the transaction currency's fraction
 * - quantity.denom must match the account commodity's fraction
 */
export function validateSplitDenoms(
  splits: SplitSpec[],
  txCurrencyGuid: string,
  accountMap: Map<string, GnuCashAccount>,
  commodityMap: Map<string, GnuCashCommodity>
): ValidationError[] {
  const errors: ValidationError[] = [];

  const txCommodity = commodityMap.get(txCurrencyGuid);
  if (!txCommodity) {
    errors.push({
      code: "UNKNOWN_CURRENCY",
      message: `Transaction currency GUID ${txCurrencyGuid} not found in commodities`,
      field: "currencyGuid",
    });
    return errors;
  }

  for (let i = 0; i < splits.length; i++) {
    const split = splits[i];

    // Check value denom matches transaction currency fraction
    if (split.value.denom !== txCommodity.fraction) {
      errors.push({
        code: "VALUE_DENOM_MISMATCH",
        message: `Split ${i}: value denominator ${split.value.denom} does not match transaction currency ${txCommodity.mnemonic} fraction ${txCommodity.fraction}`,
        field: `splits[${i}].value`,
      });
    }

    // Check quantity denom matches account commodity fraction
    const account = accountMap.get(split.accountGuid);
    if (account) {
      const accountCommodity = commodityMap.get(account.commodity_guid);
      if (accountCommodity && split.quantity.denom !== accountCommodity.fraction) {
        errors.push({
          code: "QUANTITY_DENOM_MISMATCH",
          message: `Split ${i}: quantity denominator ${split.quantity.denom} does not match account commodity ${accountCommodity.mnemonic} fraction ${accountCommodity.fraction}`,
          field: `splits[${i}].quantity`,
        });
      }
    }
  }

  return errors;
}

/**
 * Verify at least 2 splits exist (minimum for double-entry).
 */
export function validateMinimumSplits(
  splits: SplitSpec[]
): ValidationError[] {
  if (splits.length < 2) {
    return [
      {
        code: "TOO_FEW_SPLITS",
        message: `Transaction must have at least 2 splits, got ${splits.length}`,
        field: "splits",
      },
    ];
  }
  return [];
}

/**
 * Verify all referenced account GUIDs exist.
 */
export function validateAccountReferences(
  splits: SplitSpec[],
  accountMap: Map<string, GnuCashAccount>
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let i = 0; i < splits.length; i++) {
    if (!accountMap.has(splits[i].accountGuid)) {
      errors.push({
        code: "UNKNOWN_ACCOUNT",
        message: `Split ${i}: account GUID ${splits[i].accountGuid} not found`,
        field: `splits[${i}].accountGuid`,
      });
    }
  }

  return errors;
}

/**
 * Verify no split posts to a placeholder account.
 * Placeholder accounts are grouping nodes that cannot hold transactions.
 */
export function validateNotPlaceholder(
  splits: SplitSpec[],
  accountMap: Map<string, GnuCashAccount>
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (let i = 0; i < splits.length; i++) {
    const account = accountMap.get(splits[i].accountGuid);
    if (account && account.placeholder) {
      errors.push({
        code: "PLACEHOLDER_ACCOUNT",
        message: `Split ${i}: cannot post to placeholder account "${account.name}"`,
        field: `splits[${i}].accountGuid`,
      });
    }
  }

  return errors;
}

/**
 * Verify the transaction has a valid currency.
 */
export function validateCurrency(
  currencyGuid: string,
  commodityMap: Map<string, GnuCashCommodity>
): ValidationError[] {
  if (!currencyGuid) {
    return [
      {
        code: "MISSING_CURRENCY",
        message: "Transaction must have a currency",
        field: "currencyGuid",
      },
    ];
  }

  const commodity = commodityMap.get(currencyGuid);
  if (!commodity) {
    return [
      {
        code: "UNKNOWN_CURRENCY",
        message: `Currency GUID ${currencyGuid} not found in commodities`,
        field: "currencyGuid",
      },
    ];
  }

  return [];
}

/**
 * Verify the transaction has required fields.
 */
export function validateTransactionFields(
  description: string,
  postDate: Date | null
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!description || description.trim().length === 0) {
    errors.push({
      code: "MISSING_DESCRIPTION",
      message: "Transaction must have a description",
      field: "description",
    });
  }

  if (!postDate || isNaN(postDate.getTime())) {
    errors.push({
      code: "INVALID_POST_DATE",
      message: "Transaction must have a valid post date",
      field: "postDate",
    });
  }

  return errors;
}

/**
 * Run all transaction validations and return combined errors.
 */
export function validateTransaction(
  splits: SplitSpec[],
  currencyGuid: string,
  description: string,
  postDate: Date | null,
  accountMap: Map<string, GnuCashAccount>,
  commodityMap: Map<string, GnuCashCommodity>
): ValidationError[] {
  return [
    ...validateTransactionFields(description, postDate),
    ...validateCurrency(currencyGuid, commodityMap),
    ...validateMinimumSplits(splits),
    ...validateAccountReferences(splits, accountMap),
    ...validateNotPlaceholder(splits, accountMap),
    ...validateSplitDenoms(splits, currencyGuid, accountMap, commodityMap),
    ...validateSplitsBalance(splits),
  ];
}
