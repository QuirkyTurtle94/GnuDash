/**
 * Bulk transaction operations.
 *
 * Apply the same description rename and/or account reassignment across many
 * simple (single-split, i.e. 2-posting) transactions in one atomic DB write.
 * Restricted to 2-posting transactions so the "from" and "to" legs are
 * unambiguous: the negative-value split is the source, the positive-value
 * split is the destination.
 */

import type { WritableDbAdapter } from "../db/writable-adapter";

export interface BulkEditTransactionsInput {
  /** GUIDs of the transactions to edit. */
  transactionGuids: string[];
  /** If set, every transaction's description is replaced with this value. */
  newDescription?: string;
  /** If set, the negative-value (source) split moves to this account. */
  newFromAccountGuid?: string;
  /** If set, the positive-value (destination) split moves to this account. */
  newToAccountGuid?: string;
}

export interface BulkEditTransactionsResult {
  /** Number of transactions whose description was updated. */
  descriptionsUpdated: number;
  /** Number of source (from) splits reassigned. */
  fromSplitsUpdated: number;
  /** Number of destination (to) splits reassigned. */
  toSplitsUpdated: number;
}

/**
 * Apply a bulk edit to a set of single-split transactions.
 *
 * Validation is strict: if any transaction fails a precondition the whole
 * batch rolls back. Preconditions:
 *   - transactionGuids is non-empty
 *   - at least one of newDescription / newFromAccountGuid / newToAccountGuid is set
 *   - every referenced transaction exists and has exactly 2 splits
 *   - no split in any referenced transaction is reconciled
 *   - any target account exists and its commodity matches the transaction's currency
 */
export async function bulkEditTransactions(
  db: WritableDbAdapter,
  input: BulkEditTransactionsInput,
): Promise<BulkEditTransactionsResult> {
  const { transactionGuids, newDescription, newFromAccountGuid, newToAccountGuid } = input;

  if (transactionGuids.length === 0) {
    throw new Error("bulkEditTransactions: transactionGuids is empty");
  }
  if (
    newDescription === undefined &&
    newFromAccountGuid === undefined &&
    newToAccountGuid === undefined
  ) {
    throw new Error("bulkEditTransactions: no changes requested");
  }

  return db.transaction(async () => {
    // 1. Validate every referenced transaction is a simple 2-split transaction
    //    with no reconciled splits, and gather its currency for commodity checks.
    const txRows = (await db
      .prepare(
        `SELECT t.guid AS tx_guid,
                t.currency_guid AS currency_guid,
                (SELECT COUNT(*) FROM splits s WHERE s.tx_guid = t.guid) AS split_count,
                (SELECT COUNT(*) FROM splits s WHERE s.tx_guid = t.guid AND s.reconcile_state = 'y') AS reconciled_count
         FROM transactions t
         WHERE t.guid IN (${placeholders(transactionGuids.length)})`,
      )
      .all(...transactionGuids)) as {
        tx_guid: string;
        currency_guid: string;
        split_count: number;
        reconciled_count: number;
      }[];

    if (txRows.length !== transactionGuids.length) {
      const found = new Set(txRows.map((r) => r.tx_guid));
      const missing = transactionGuids.filter((g) => !found.has(g));
      throw new Error(
        `bulkEditTransactions: ${missing.length} transaction(s) not found: ${missing.slice(0, 3).join(", ")}`,
      );
    }

    for (const row of txRows) {
      if (row.split_count !== 2) {
        throw new Error(
          `bulkEditTransactions: transaction ${row.tx_guid} has ${row.split_count} splits; bulk edit requires exactly 2`,
        );
      }
      if (row.reconciled_count > 0) {
        throw new Error(
          `bulkEditTransactions: transaction ${row.tx_guid} has a reconciled split and cannot be edited`,
        );
      }
    }

    // 2. For any account reassignment, verify the target account exists and
    //    that its commodity matches every affected transaction's currency.
    if (newFromAccountGuid !== undefined) {
      await assertAccountMatchesCurrencies(db, newFromAccountGuid, txRows, "newFromAccountGuid");
    }
    if (newToAccountGuid !== undefined) {
      await assertAccountMatchesCurrencies(db, newToAccountGuid, txRows, "newToAccountGuid");
    }

    // 3. Apply the updates. All of these are pure SQL and safe to do in bulk
    //    because we've already validated every precondition above.
    let descriptionsUpdated = 0;
    let fromSplitsUpdated = 0;
    let toSplitsUpdated = 0;

    if (newDescription !== undefined) {
      const res = await db.run(
        `UPDATE transactions SET description = ? WHERE guid IN (${placeholders(transactionGuids.length)})`,
        newDescription,
        ...transactionGuids,
      );
      descriptionsUpdated = res.changes;
    }

    if (newFromAccountGuid !== undefined) {
      // "From" = the split with negative value (money leaving the source account).
      const res = await db.run(
        `UPDATE splits SET account_guid = ?
         WHERE tx_guid IN (${placeholders(transactionGuids.length)})
           AND value_num < 0`,
        newFromAccountGuid,
        ...transactionGuids,
      );
      fromSplitsUpdated = res.changes;
    }

    if (newToAccountGuid !== undefined) {
      // "To" = the split with positive value (money arriving at the destination).
      const res = await db.run(
        `UPDATE splits SET account_guid = ?
         WHERE tx_guid IN (${placeholders(transactionGuids.length)})
           AND value_num > 0`,
        newToAccountGuid,
        ...transactionGuids,
      );
      toSplitsUpdated = res.changes;
    }

    return { descriptionsUpdated, fromSplitsUpdated, toSplitsUpdated };
  });
}

/**
 * Build a comma-separated list of `?` placeholders of the given length for
 * use with SQL IN clauses.
 */
function placeholders(n: number): string {
  return new Array(n).fill("?").join(",");
}

/**
 * Verify that `accountGuid` exists and its commodity matches the currency
 * of every affected transaction. Throws with a descriptive message if not.
 */
async function assertAccountMatchesCurrencies(
  db: WritableDbAdapter,
  accountGuid: string,
  txRows: { tx_guid: string; currency_guid: string }[],
  fieldName: string,
): Promise<void> {
  const account = (await db
    .prepare(`SELECT commodity_guid FROM accounts WHERE guid = ?`)
    .get(accountGuid)) as { commodity_guid: string } | undefined;

  if (!account) {
    throw new Error(`bulkEditTransactions: ${fieldName} account ${accountGuid} not found`);
  }

  const mismatches = txRows.filter((r) => r.currency_guid !== account.commodity_guid);
  if (mismatches.length > 0) {
    throw new Error(
      `bulkEditTransactions: ${fieldName} commodity does not match ${mismatches.length} transaction(s); cross-currency reassignment is not supported`,
    );
  }
}
