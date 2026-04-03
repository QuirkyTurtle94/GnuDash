import type { ExpenseCategory, MonthlyExpenseByCategory, ExpenseTransaction } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { getAccountPath } from "../shared/accounts";
import { parseGnuCashDate, formatISODate, sqlMonth } from "../shared/dates";

export function computeExpenseBreakdown(
  ctx: ParseContext
): { categories: ExpenseCategory[]; monthly: MonthlyExpenseByCategory[]; colors: Record<string, string> } {
  const { db, accounts, accountMap, rootAccount, topExpenseGuids } = ctx;

  if (topExpenseGuids.size === 0) return { categories: [], monthly: [], colors: {} };

  // Assign colors to top-level children of expense containers
  const topLevelChildren = accounts.filter((a) => topExpenseGuids.has(a.parent_guid!));
  const colorPalette = [
    "#4A7A6B", "#5C8C7C", "#6C9B8B", "#7DAA9A", "#8FB9A9",
    "#A0C8B8", "#B2D7C8", "#C3E5D7", "#D5F0E4", "#E0F5EC",
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
      WHERE a.account_type = 'EXPENSE'
      GROUP BY s.account_guid, ${sqlMonth("t.post_date")}
      ORDER BY month`
    )
    .all() as { account_guid: string; month: string; total: number }[];

  const monthly: MonthlyExpenseByCategory[] = [];
  const allTimeTotals = new Map<string, number>();

  for (const row of rows) {
    if (row.total <= 0) continue;
    const account = accountMap.get(row.account_guid);
    if (!account || topExpenseGuids.has(account.guid)) continue;

    const pathParts = getAccountPath(account, accountMap, topExpenseGuids, rootAccount.guid);
    const fullPath = pathParts.join(":");

    monthly.push({ month: row.month, category: account.name, fullPath, pathParts, amount: row.total });
    allTimeTotals.set(pathParts[0], (allTimeTotals.get(pathParts[0]) ?? 0) + row.total);
  }

  const categories: ExpenseCategory[] = [...allTimeTotals.entries()]
    .map(([name, amount]) => ({ name, fullPath: name, amount, color: colorMap[name] }))
    .sort((a, b) => b.amount - a.amount);

  return { categories, monthly, colors: colorMap };
}

export function getExpenseTransactions(ctx: ParseContext): ExpenseTransaction[] {
  const { db, accountMap, rootAccount, topExpenseGuids } = ctx;

  if (topExpenseGuids.size === 0) return [];

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
      WHERE a.account_type = 'EXPENSE'
      ORDER BY t.post_date DESC`
    )
    .all() as { account_guid: string; post_date: string; description: string; amount: number }[];

  const transactions: ExpenseTransaction[] = [];
  for (const row of rows) {
    if (row.amount <= 0) continue;
    const account = accountMap.get(row.account_guid);
    if (!account || topExpenseGuids.has(account.guid)) continue;

    const pathParts = getAccountPath(account, accountMap, topExpenseGuids, rootAccount.guid);
    const dateStr = formatISODate(parseGnuCashDate(row.post_date));

    transactions.push({
      date: dateStr,
      description: row.description,
      accountName: account.name,
      fullPath: pathParts.join(":"),
      pathParts,
      amount: row.amount,
    });
  }

  return transactions;
}
