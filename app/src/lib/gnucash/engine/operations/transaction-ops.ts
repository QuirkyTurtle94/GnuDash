/**
 * Transaction operations: update, delete, void.
 */

import type { WritableDbAdapter } from "../db/writable-adapter";
import { generateGuid } from "../guid";

/**
 * Format a Date as "YYYY-MM-DD HH:MM:SS" for GNUCash SQLite storage.
 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

interface TransactionUpdate {
  description?: string;
  postDate?: Date;
  num?: string;
}

/**
 * Update a transaction's header fields (description, post_date, num).
 * Split changes require delete + recreate (matching GNUCash behavior).
 */
export function updateTransaction(
  db: WritableDbAdapter,
  txGuid: string,
  updates: TransactionUpdate
): void {
  db.transaction(() => {
    if (updates.description !== undefined) {
      db.run(
        `UPDATE transactions SET description = ? WHERE guid = ?`,
        updates.description,
        txGuid
      );
    }
    if (updates.postDate !== undefined) {
      db.run(
        `UPDATE transactions SET post_date = ? WHERE guid = ?`,
        formatDate(updates.postDate),
        txGuid
      );
    }
    if (updates.num !== undefined) {
      db.run(
        `UPDATE transactions SET num = ? WHERE guid = ?`,
        updates.num,
        txGuid
      );
    }
  });
}

/**
 * Delete a transaction and all its splits.
 * Throws if any split is reconciled (reconcile_state = 'y').
 */
export function deleteTransaction(
  db: WritableDbAdapter,
  txGuid: string
): void {
  // Check for reconciled splits
  const reconciled = db
    .prepare(
      `SELECT COUNT(*) AS cnt FROM splits WHERE tx_guid = ? AND reconcile_state = 'y'`
    )
    .get(txGuid) as { cnt: number } | undefined;

  if (reconciled && reconciled.cnt > 0) {
    throw new Error(
      `Cannot delete transaction ${txGuid}: ${reconciled.cnt} split(s) are reconciled`
    );
  }

  db.transaction(() => {
    db.run(`DELETE FROM splits WHERE tx_guid = ?`, txGuid);
    db.run(`DELETE FROM transactions WHERE guid = ?`, txGuid);
  });
}

/**
 * Void a transaction: zero out all split values/quantities,
 * prefix description with "Voided: ", and store the void reason
 * and original values in the slots table.
 *
 * This matches GNUCash's void behavior.
 */
export function voidTransaction(
  db: WritableDbAdapter,
  txGuid: string,
  reason: string
): void {
  db.transaction(() => {
    // Get current transaction description
    const tx = db
      .prepare(`SELECT description FROM transactions WHERE guid = ?`)
      .get(txGuid) as { description: string } | undefined;

    if (!tx) {
      throw new Error(`Transaction ${txGuid} not found`);
    }

    // Already voided?
    if (tx.description.startsWith("Voided: ")) {
      throw new Error(`Transaction ${txGuid} is already voided`);
    }

    // Update description
    db.run(
      `UPDATE transactions SET description = ? WHERE guid = ?`,
      `Voided: ${tx.description}`,
      txGuid
    );

    // Store void reason in slots
    db.run(
      `INSERT INTO slots (obj_guid, name, slot_type, string_val)
       VALUES (?, 'void-reason', 3, ?)`,
      txGuid,
      reason
    );

    // Get all splits to store original values and zero them out
    const splits = db
      .prepare(
        `SELECT guid, value_num, value_denom, quantity_num, quantity_denom
         FROM splits WHERE tx_guid = ?`
      )
      .all(txGuid) as {
      guid: string;
      value_num: number;
      value_denom: number;
      quantity_num: number;
      quantity_denom: number;
    }[];

    for (const split of splits) {
      // Store original values in slots
      db.run(
        `INSERT INTO slots (obj_guid, name, slot_type, string_val)
         VALUES (?, 'void-former-value', 3, ?)`,
        split.guid,
        `${split.value_num}/${split.value_denom}`
      );
      db.run(
        `INSERT INTO slots (obj_guid, name, slot_type, string_val)
         VALUES (?, 'void-former-quantity', 3, ?)`,
        split.guid,
        `${split.quantity_num}/${split.quantity_denom}`
      );

      // Zero out the split
      db.run(
        `UPDATE splits SET value_num = 0, quantity_num = 0 WHERE guid = ?`,
        split.guid
      );
    }
  });
}
