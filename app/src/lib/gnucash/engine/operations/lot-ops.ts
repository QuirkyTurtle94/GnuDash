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
export async function createLot(
  db: WritableDbAdapter,
  accountGuid: string
): Promise<{ lotGuid: string }> {
  const lotGuid = generateGuid();

  await db.run(
    `INSERT INTO lots (guid, account_guid, is_closed) VALUES (?, ?, 0)`,
    lotGuid,
    accountGuid
  );

  return { lotGuid };
}

/**
 * Assign a split to a lot by setting its lot_guid.
 */
export async function assignSplitToLot(
  db: WritableDbAdapter,
  splitGuid: string,
  lotGuid: string
): Promise<void> {
  await db.run(`UPDATE splits SET lot_guid = ? WHERE guid = ?`, lotGuid, splitGuid);
}

/**
 * Get the current quantity balance of a lot.
 * A balanced (zero) lot means all shares have been sold.
 */
export async function getLotBalance(
  db: WritableDbAdapter,
  lotGuid: string
): Promise<GncNumeric> {
  const row = (await db
    .prepare(
      `SELECT SUM(quantity_num) AS total_num, quantity_denom
       FROM splits
       WHERE lot_guid = ?
       GROUP BY quantity_denom
       LIMIT 1`
    )
    .get(lotGuid)) as
    | { total_num: number; quantity_denom: number }
    | undefined;

  if (!row) return GncNumeric.zero();
  return new GncNumeric(row.total_num ?? 0, row.quantity_denom);
}

/**
 * Close a lot if its quantity balance is zero.
 * Sets is_closed = 1 in the lots table.
 */
export async function closeLotIfBalanced(
  db: WritableDbAdapter,
  lotGuid: string
): Promise<boolean> {
  const balance = await getLotBalance(db, lotGuid);
  if (balance.isZero()) {
    await db.run(`UPDATE lots SET is_closed = 1 WHERE guid = ?`, lotGuid);
    return true;
  }
  return false;
}
