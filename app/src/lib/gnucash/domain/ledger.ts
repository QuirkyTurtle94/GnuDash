import type { LedgerTransaction, LedgerSplit, RecentTransaction } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { buildFullPath } from "../shared/accounts";
import { parseGnuCashDate, formatISODate } from "../shared/dates";

export function getLedgerTransactions(ctx: ParseContext): LedgerTransaction[] {
  const { db, accountMap, commodityMap } = ctx;

  const rows = db
    .prepare(
      `SELECT
        t.guid AS tx_guid,
        t.post_date,
        t.description,
        t.num,
        s.account_guid,
        s.memo,
        s.reconcile_state,
        s.value_num,
        s.value_denom,
        s.quantity_num,
        s.quantity_denom
      FROM transactions t
      JOIN splits s ON s.tx_guid = t.guid
      ORDER BY t.post_date DESC, t.guid, s.value_num DESC`
    )
    .all() as {
    tx_guid: string;
    post_date: string;
    description: string;
    num: string;
    account_guid: string;
    memo: string;
    reconcile_state: string;
    value_num: number;
    value_denom: number;
    quantity_num: number;
    quantity_denom: number;
  }[];

  const txMap = new Map<
    string,
    { date: string; description: string; num: string; splits: LedgerSplit[] }
  >();

  for (const row of rows) {
    const account = accountMap.get(row.account_guid);
    const commodity = account ? commodityMap.get(account.commodity_guid) : undefined;

    const split: LedgerSplit = {
      accountGuid: row.account_guid,
      accountName: account?.name ?? "Unknown",
      accountFullPath: account ? buildFullPath(account, accountMap) : "Unknown",
      accountType: account?.account_type ?? "UNKNOWN",
      memo: row.memo ?? "",
      reconcileState: row.reconcile_state ?? "n",
      amount: row.value_denom !== 0 ? row.value_num / row.value_denom : 0,
      quantity: row.quantity_denom !== 0 ? row.quantity_num / row.quantity_denom : 0,
      commodityMnemonic: commodity?.mnemonic ?? "",
    };

    const existing = txMap.get(row.tx_guid);
    if (existing) {
      existing.splits.push(split);
    } else {
      const dateStr = formatISODate(parseGnuCashDate(row.post_date));
      txMap.set(row.tx_guid, {
        date: dateStr,
        description: row.description,
        num: row.num ?? "",
        splits: [split],
      });
    }
  }

  const transactions: LedgerTransaction[] = [];
  for (const [guid, tx] of txMap) {
    transactions.push({ guid, date: tx.date, description: tx.description, num: tx.num, splits: tx.splits });
  }

  return transactions;
}

export function getRecentTransactions(ctx: ParseContext): RecentTransaction[] {
  const { db, accountMap } = ctx;

  // Fix N+1: use subquery for counter-account instead of per-row query
  const rows = db
    .prepare(
      `SELECT
        t.post_date,
        t.description,
        s.value_num,
        s.value_denom,
        s.account_guid,
        s.reconcile_state,
        (SELECT s2.account_guid FROM splits s2
         WHERE s2.tx_guid = t.guid AND s2.account_guid != s.account_guid
         LIMIT 1) AS counter_account_guid
      FROM splits s
      JOIN transactions t ON s.tx_guid = t.guid
      JOIN accounts a ON s.account_guid = a.guid
      WHERE a.account_type IN ('BANK', 'CASH', 'ASSET', 'CREDIT', 'LIABILITY')
      ORDER BY t.post_date DESC
      LIMIT 50`
    )
    .all() as {
    post_date: string;
    description: string;
    value_num: number;
    value_denom: number;
    account_guid: string;
    reconcile_state: string;
    counter_account_guid: string | null;
  }[];

  return rows.map((row) => {
    const account = accountMap.get(row.account_guid);
    const category = row.counter_account_guid
      ? accountMap.get(row.counter_account_guid)
      : null;

    return {
      date: parseGnuCashDate(row.post_date).toISOString(),
      description: row.description,
      amount: row.value_num / row.value_denom,
      accountName: account?.name ?? "Unknown",
      categoryName: category?.name ?? "Split",
      reconciled: row.reconcile_state === "y",
    };
  });
}
