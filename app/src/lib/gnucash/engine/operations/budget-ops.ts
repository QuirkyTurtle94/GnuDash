/**
 * Budget operations: create, update, delete for `budgets`, `budget_amounts`,
 * and the attached `recurrences` row.
 *
 * GnuCash models a budget as three cooperating rows/tables:
 *   - `budgets` — guid, name, description, num_periods
 *   - `recurrences` (`obj_guid = budget.guid`) — period type + multiplier +
 *     start date, i.e. "12 monthly periods starting 2026-01-01"
 *   - `budget_amounts` — one row per (budget, account, period) with a
 *     num/denom rational amount, in the account's own commodity
 *
 * These ops keep all three tables in sync. `budget_amounts.id` is assigned
 * by the DB (AUTOINCREMENT via SQLite's PRIMARY KEY); we never pass it in.
 */

import type { WritableDbAdapter } from "../db/writable-adapter";
import type { BudgetPeriodType } from "@/lib/types/gnucash";
import { generateGuid } from "../guid";

/**
 * Convert an ISO YYYY-MM-DD date to GnuCash's compact YYYYMMDD form used by
 * the `recurrences.recurrence_period_start` column. Bare YYYYMMDD inputs are
 * passed through. Any other shape throws — the caller has typed the form.
 */
function toCompactDate(iso: string): string {
  const trimmed = iso.trim();
  if (/^\d{8}$/.test(trimmed)) return trimmed;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!match) throw new Error(`Invalid recurrence start date: ${iso}`);
  return `${match[1]}${match[2]}${match[3]}`;
}

export interface BudgetWriteFields {
  name: string;
  description: string;
  numPeriods: number;
  periodType: BudgetPeriodType;
  recurrenceMult: number;
  /** ISO YYYY-MM-DD. Stored as compact YYYYMMDD in the DB. */
  recurrenceStart: string;
}

/**
 * Create a new budget plus its recurrence row. Returns the new budget's GUID
 * so the caller can immediately navigate to / populate amounts against it.
 */
export function createBudget(
  db: WritableDbAdapter,
  fields: BudgetWriteFields,
): { budgetGuid: string } {
  const budgetGuid = generateGuid();
  db.transaction(() => {
    db.run(
      `INSERT INTO budgets (guid, name, description, num_periods) VALUES (?, ?, ?, ?)`,
      budgetGuid,
      fields.name,
      fields.description,
      fields.numPeriods,
    );
    db.run(
      `INSERT INTO recurrences (obj_guid, recurrence_mult, recurrence_period_type, recurrence_period_start)
       VALUES (?, ?, ?, ?)`,
      budgetGuid,
      fields.recurrenceMult,
      fields.periodType,
      toCompactDate(fields.recurrenceStart),
    );
  });
  return { budgetGuid };
}

/**
 * Replace every field on an existing budget + its recurrence row. If the
 * recurrence row is missing (older files created outside gnudash), it is
 * inserted — so after `updateBudget` the budget is guaranteed to have a
 * recurrence row the read pipeline can attach.
 *
 * Shrinking `numPeriods` also drops any `budget_amounts` rows whose
 * `period_num` is beyond the new range, to keep the periods/amounts
 * relationship consistent — GnuCash desktop silently hides those on read,
 * but we prefer to actually remove them so later widens don't resurrect
 * stale values the user can't see in the editor.
 */
export function updateBudget(
  db: WritableDbAdapter,
  budgetGuid: string,
  fields: BudgetWriteFields,
): void {
  db.transaction(() => {
    db.run(
      `UPDATE budgets SET name = ?, description = ?, num_periods = ? WHERE guid = ?`,
      fields.name,
      fields.description,
      fields.numPeriods,
      budgetGuid,
    );
    const updated = db.run(
      `UPDATE recurrences
         SET recurrence_mult = ?, recurrence_period_type = ?, recurrence_period_start = ?
       WHERE obj_guid = ?`,
      fields.recurrenceMult,
      fields.periodType,
      toCompactDate(fields.recurrenceStart),
      budgetGuid,
    );
    if (updated.changes === 0) {
      db.run(
        `INSERT INTO recurrences (obj_guid, recurrence_mult, recurrence_period_type, recurrence_period_start)
         VALUES (?, ?, ?, ?)`,
        budgetGuid,
        fields.recurrenceMult,
        fields.periodType,
        toCompactDate(fields.recurrenceStart),
      );
    }
    db.run(
      `DELETE FROM budget_amounts WHERE budget_guid = ? AND period_num >= ?`,
      budgetGuid,
      fields.numPeriods,
    );
  });
}

/**
 * Remove a budget and everything hanging off it: its recurrence row and all
 * per-account-per-period amounts. Safe to call for a budget that has no
 * recurrence or amounts rows.
 */
export function deleteBudget(db: WritableDbAdapter, budgetGuid: string): void {
  db.transaction(() => {
    db.run(`DELETE FROM budget_amounts WHERE budget_guid = ?`, budgetGuid);
    db.run(`DELETE FROM recurrences WHERE obj_guid = ?`, budgetGuid);
    db.run(`DELETE FROM budgets WHERE guid = ?`, budgetGuid);
  });
}

/**
 * Upsert a single `budget_amounts` cell. Implemented as delete-then-insert
 * because the GnuCash schema has no unique constraint on
 * (budget_guid, account_guid, period_num); real GnuCash desktop may leave
 * duplicates in place on edit, which we normalise away to exactly one row.
 *
 * `periodNum` is 0-indexed (period 0 = first period).
 */
export function setBudgetAmount(
  db: WritableDbAdapter,
  budgetGuid: string,
  accountGuid: string,
  periodNum: number,
  amountNum: number,
  amountDenom: number,
): void {
  db.transaction(() => {
    db.run(
      `DELETE FROM budget_amounts
       WHERE budget_guid = ? AND account_guid = ? AND period_num = ?`,
      budgetGuid,
      accountGuid,
      periodNum,
    );
    db.run(
      `INSERT INTO budget_amounts (budget_guid, account_guid, period_num, amount_num, amount_denom)
       VALUES (?, ?, ?, ?, ?)`,
      budgetGuid,
      accountGuid,
      periodNum,
      amountNum,
      amountDenom,
    );
  });
}

/**
 * Drop any `budget_amounts` rows for this (budget, account, period).
 * Leaves the parent budget row untouched; the read pipeline will then
 * synthesise the cell from the account's children (auto-rollup).
 */
export function clearBudgetAmount(
  db: WritableDbAdapter,
  budgetGuid: string,
  accountGuid: string,
  periodNum: number,
): void {
  db.run(
    `DELETE FROM budget_amounts
     WHERE budget_guid = ? AND account_guid = ? AND period_num = ?`,
    budgetGuid,
    accountGuid,
    periodNum,
  );
}
