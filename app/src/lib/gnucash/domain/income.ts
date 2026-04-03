import type { MonthlyExpenseByCategory, ExpenseTransaction } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { getAccountPath } from "../shared/accounts";
import { parseGnuCashDate, formatISODate, sqlMonth } from "../shared/dates";

export function computeIncomeBreakdown(
  ctx: ParseContext
): { monthly: MonthlyExpenseByCategory[]; colors: Record<string, string> } {
  const { db, accounts, accountMap, rootAccount, topIncomeGuids } = ctx;

  if (topIncomeGuids.size === 0) return { monthly: [], colors: {} };

  const topLevelChildren = accounts.filter((a) => topIncomeGuids.has(a.parent_guid!));
  const colorPalette = [
    "#3B6B8A", "#4A7A9A", "#5889A9", "#6798B8", "#76A7C7",
    "#85B6D6", "#94C5E5", "#A3D0EE", "#B8DCF3", "#CDE8F8",
  ];
  const colorMap: Record<string, string> = {};
  topLevelChildren.forEach((cat, i) => {
    colorMap[cat.name] = colorPalette[i % colorPalette.length];
  });

  const rows = db
    .prepare(
      `SELECT
        s.account_guid,
        ${sqlMonth("t.post_date")} AS month,
        SUM(CAST(s.value_num AS REAL) / s.value_denom) AS total
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type = 'INCOME'
      GROUP BY s.account_guid, ${sqlMonth("t.post_date")}
      ORDER BY month`
    )
    .all() as { account_guid: string; month: string; total: number }[];

  const monthly: MonthlyExpenseByCategory[] = [];
  for (const row of rows) {
    const amount = -row.total; // Income splits are negative in GNUCash
    if (amount <= 0) continue;
    const account = accountMap.get(row.account_guid);
    if (!account || topIncomeGuids.has(account.guid)) continue;

    const pathParts = getAccountPath(account, accountMap, topIncomeGuids, rootAccount.guid);
    monthly.push({ month: row.month, category: account.name, fullPath: pathParts.join(":"), pathParts, amount });
  }

  return { monthly, colors: colorMap };
}

export function getIncomeTransactions(ctx: ParseContext): ExpenseTransaction[] {
  const { db, accountMap, rootAccount, topIncomeGuids } = ctx;

  if (topIncomeGuids.size === 0) return [];

  const rows = db
    .prepare(
      `SELECT
        s.account_guid,
        t.post_date,
        t.description,
        CAST(s.value_num AS REAL) / s.value_denom AS amount
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type = 'INCOME'
      ORDER BY t.post_date DESC`
    )
    .all() as { account_guid: string; post_date: string; description: string; amount: number }[];

  const transactions: ExpenseTransaction[] = [];
  for (const row of rows) {
    const amount = -row.amount; // Income splits are negative
    if (amount <= 0) continue;
    const account = accountMap.get(row.account_guid);
    if (!account || topIncomeGuids.has(account.guid)) continue;

    const pathParts = getAccountPath(account, accountMap, topIncomeGuids, rootAccount.guid);
    const dateStr = formatISODate(parseGnuCashDate(row.post_date));

    transactions.push({
      date: dateStr,
      description: row.description,
      accountName: account.name,
      fullPath: pathParts.join(":"),
      pathParts,
      amount,
    });
  }

  return transactions;
}
