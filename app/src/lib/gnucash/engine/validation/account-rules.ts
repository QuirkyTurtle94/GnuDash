/**
 * Account-level validation rules.
 */

import type { GnuCashAccount, GnuCashCommodity } from "@/lib/types/gnucash";
import type { DbAdapter } from "../../db/adapter";
import { ACCOUNT_TYPES } from "../types";
import type { AccountSpec, ValidationError } from "../types";

/**
 * Validate an account creation request.
 */
export function validateAccountCreation(
  spec: AccountSpec,
  accountMap: Map<string, GnuCashAccount>,
  commodityMap: Map<string, GnuCashCommodity>
): ValidationError[] {
  const errors: ValidationError[] = [];

  if (!spec.name || spec.name.trim().length === 0) {
    errors.push({
      code: "MISSING_NAME",
      message: "Account must have a name",
      field: "name",
    });
  }

  if (!ACCOUNT_TYPES.has(spec.accountType)) {
    errors.push({
      code: "INVALID_ACCOUNT_TYPE",
      message: `Invalid account type: ${spec.accountType}`,
      field: "accountType",
    });
  }

  if (!commodityMap.has(spec.commodityGuid)) {
    errors.push({
      code: "UNKNOWN_COMMODITY",
      message: `Commodity GUID ${spec.commodityGuid} not found`,
      field: "commodityGuid",
    });
  }

  if (!accountMap.has(spec.parentGuid)) {
    errors.push({
      code: "UNKNOWN_PARENT",
      message: `Parent account GUID ${spec.parentGuid} not found`,
      field: "parentGuid",
    });
  }

  // Check for duplicate name under same parent
  for (const [, account] of accountMap) {
    if (
      account.parent_guid === spec.parentGuid &&
      account.name === spec.name
    ) {
      errors.push({
        code: "DUPLICATE_NAME",
        message: `An account named "${spec.name}" already exists under this parent`,
        field: "name",
      });
      break;
    }
  }

  return errors;
}

/**
 * Validate that an account can be safely deleted.
 * Cannot delete if: has splits, has child accounts.
 */
export function validateAccountDeletion(
  accountGuid: string,
  db: DbAdapter,
  accountMap: Map<string, GnuCashAccount>
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check for splits referencing this account
  const splitCount = db
    .prepare(`SELECT COUNT(*) AS cnt FROM splits WHERE account_guid = ?`)
    .get(accountGuid) as { cnt: number } | undefined;

  if (splitCount && splitCount.cnt > 0) {
    errors.push({
      code: "HAS_SPLITS",
      message: `Cannot delete account: ${splitCount.cnt} split(s) reference it`,
    });
  }

  // Check for child accounts
  for (const [, account] of accountMap) {
    if (account.parent_guid === accountGuid) {
      errors.push({
        code: "HAS_CHILDREN",
        message: `Cannot delete account: has child account "${account.name}"`,
      });
      break;
    }
  }

  return errors;
}

/**
 * Validate that reparenting an account won't create a circular reference.
 */
export function validateReparent(
  accountGuid: string,
  newParentGuid: string,
  accountMap: Map<string, GnuCashAccount>
): ValidationError[] {
  if (accountGuid === newParentGuid) {
    return [
      {
        code: "CIRCULAR_REFERENCE",
        message: "Account cannot be its own parent",
        field: "parentGuid",
      },
    ];
  }

  // Walk up from newParentGuid to root; if we encounter accountGuid, it's circular
  let current = newParentGuid;
  const visited = new Set<string>();

  while (current) {
    if (visited.has(current)) break; // safety: stop if we loop
    visited.add(current);

    if (current === accountGuid) {
      return [
        {
          code: "CIRCULAR_REFERENCE",
          message:
            "Cannot reparent: new parent is a descendant of this account",
          field: "parentGuid",
        },
      ];
    }

    const parent = accountMap.get(current);
    if (!parent || !parent.parent_guid) break;
    current = parent.parent_guid;
  }

  return [];
}
