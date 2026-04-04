/**
 * Lot operations: create lots, assign splits to lots.
 *
 * Lots group buy/sell splits for capital gains tracking.
 * This is the basic v1 implementation with manual assignment only.
 */

import type { WritableDbAdapter } from "../db/writable-adapter";
import { GncNumeric } from "../gnc-numeric";
import { generateGuid } from "../guid";

/**
 * Create an empty lot for an investment account.
 */
export function createLot(
  db: WritableDbAdapter,
  accountGuid: string
): { lotGuid: string } {
  const lotGuid = generateGuid();

  db.run(
    `INSERT INTO lots (guid, account_guid, is_closed) VALUES (?, ?, 0)`,
    lotGuid,
    accountGuid
  );

  return { lotGuid };
}

/**
 * Assign a split to a lot by setting its lot_guid.
 */
export function assignSplitToLot(
  db: WritableDbAdapter,
  splitGuid: string,
  lotGuid: string
): void {
  db.run(`UPDATE splits SET lot_guid = ? WHERE guid = ?`, lotGuid, splitGuid);
}

/**
 * Get the current quantity balance of a lot.
 * A balanced (zero) lot means all shares have been sold.
 */
export function getLotBalance(
  db: WritableDbAdapter,
  lotGuid: string
): GncNumeric {
  const row = db
    .prepare(
      `SELECT SUM(quantity_num) AS total_num, quantity_denom
       FROM splits
       WHERE lot_guid = ?
       GROUP BY quantity_denom
       LIMIT 1`
    )
    .get(lotGuid) as
    | { total_num: number; quantity_denom: number }
    | undefined;

  if (!row) return GncNumeric.zero();
  return new GncNumeric(row.total_num ?? 0, row.quantity_denom);
}

/**
 * Close a lot if its quantity balance is zero.
 * Sets is_closed = 1 in the lots table.
 */
export function closeLotIfBalanced(
  db: WritableDbAdapter,
  lotGuid: string
): boolean {
  const balance = getLotBalance(db, lotGuid);
  if (balance.isZero()) {
    db.run(`UPDATE lots SET is_closed = 1 WHERE guid = ?`, lotGuid);
    return true;
  }
  return false;
}
