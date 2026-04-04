/**
 * Account operations: rename, reparent, delete, update, delete with reallocation.
 */

import type { ParseContext } from "../../context";
import type { WritableDbAdapter } from "../db/writable-adapter";
import {
  validateAccountDeletion,
  validateReparent,
} from "../validation/account-rules";
import { ValidationFailedError } from "../types";

/**
 * Rename an account.
 */
export function renameAccount(
  db: WritableDbAdapter,
  accountGuid: string,
  newName: string
): void {
  if (!newName || newName.trim().length === 0) {
    throw new Error("Account name cannot be empty");
  }
  db.run(`UPDATE accounts SET name = ? WHERE guid = ?`, newName, accountGuid);
}

/**
 * Reparent an account under a new parent.
 * Validates no circular reference would be created.
 */
export function reparentAccount(
  db: WritableDbAdapter,
  ctx: ParseContext,
  accountGuid: string,
  newParentGuid: string
): void {
  const errors = validateReparent(accountGuid, newParentGuid, ctx.accountMap);
  if (errors.length > 0) {
    throw new ValidationFailedError(errors);
  }

  db.run(
    `UPDATE accounts SET parent_guid = ? WHERE guid = ?`,
    newParentGuid,
    accountGuid
  );
}

/**
 * Delete an account.
 * Validates no splits or child accounts reference it.
 */
export function deleteAccount(
  db: WritableDbAdapter,
  ctx: ParseContext,
  accountGuid: string
): void {
  const errors = validateAccountDeletion(accountGuid, db, ctx.accountMap);
  if (errors.length > 0) {
    throw new ValidationFailedError(errors);
  }

  db.transaction(() => {
    db.run(`DELETE FROM slots WHERE obj_guid = ?`, accountGuid);
    db.run(`DELETE FROM accounts WHERE guid = ?`, accountGuid);
  });
}

/**
 * Update an existing account's fields.
 * Only provided fields are updated; omitted fields remain unchanged.
 */
export function updateAccount(
  db: WritableDbAdapter,
  accountGuid: string,
  updates: {
    name?: string;
    accountType?: string;
    commodityGuid?: string;
    parentGuid?: string;
    code?: string;
    description?: string;
    hidden?: boolean;
    placeholder?: boolean;
  }
): void {
  db.transaction(() => {
    if (updates.name !== undefined) {
      if (!updates.name.trim()) throw new Error("Account name cannot be empty");
      db.run(`UPDATE accounts SET name = ? WHERE guid = ?`, updates.name.trim(), accountGuid);
    }
    if (updates.accountType !== undefined) {
      db.run(`UPDATE accounts SET account_type = ? WHERE guid = ?`, updates.accountType, accountGuid);
    }
    if (updates.commodityGuid !== undefined) {
      db.run(`UPDATE accounts SET commodity_guid = ? WHERE guid = ?`, updates.commodityGuid, accountGuid);
    }
    if (updates.parentGuid !== undefined) {
      db.run(`UPDATE accounts SET parent_guid = ? WHERE guid = ?`, updates.parentGuid, accountGuid);
    }
    if (updates.code !== undefined) {
      db.run(`UPDATE accounts SET code = ? WHERE guid = ?`, updates.code, accountGuid);
    }
    if (updates.description !== undefined) {
      db.run(`UPDATE accounts SET description = ? WHERE guid = ?`, updates.description, accountGuid);
    }
    if (updates.hidden !== undefined) {
      db.run(`UPDATE accounts SET hidden = ? WHERE guid = ?`, updates.hidden ? 1 : 0, accountGuid);
    }
    if (updates.placeholder !== undefined) {
      db.run(`UPDATE accounts SET placeholder = ? WHERE guid = ?`, updates.placeholder ? 1 : 0, accountGuid);
    }
  });
}

/**
 * Delete an account and reallocate all its children and splits to a target account.
 * This ensures no orphaned accounts or splits exist after deletion.
 *
 * The target account receives:
 * 1. All child accounts (reparented)
 * 2. All splits (account_guid updated)
 * 3. All budget_amounts (account_guid updated)
 */
export function deleteAccountWithReallocation(
  db: WritableDbAdapter,
  accountGuid: string,
  targetAccountGuid: string
): void {
  if (accountGuid === targetAccountGuid) {
    throw new Error("Cannot reallocate to the account being deleted");
  }

  // Verify the target account exists
  const target = db.prepare(`SELECT guid FROM accounts WHERE guid = ?`).get(targetAccountGuid);
  if (!target) {
    throw new Error(`Target account ${targetAccountGuid} not found`);
  }

  db.transaction(() => {
    // 1. Reparent all direct child accounts to the target
    db.run(
      `UPDATE accounts SET parent_guid = ? WHERE parent_guid = ?`,
      targetAccountGuid,
      accountGuid
    );

    // 2. Move all splits to the target account
    db.run(
      `UPDATE splits SET account_guid = ? WHERE account_guid = ?`,
      targetAccountGuid,
      accountGuid
    );

    // 3. Move any budget_amounts to the target
    db.run(
      `UPDATE budget_amounts SET account_guid = ? WHERE account_guid = ?`,
      targetAccountGuid,
      accountGuid
    );

    // 4. Remove slots attached to this account
    db.run(`DELETE FROM slots WHERE obj_guid = ?`, accountGuid);

    // 5. Delete the account itself
    db.run(`DELETE FROM accounts WHERE guid = ?`, accountGuid);
  });
}
