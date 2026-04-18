import type { ExpenseCategory, MonthlyExpenseByCategory, ExpenseTransaction } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { getAccountPath } from "../shared/accounts";
import { parseGnuCashDate, formatISODate, sqlMonth } from "../shared/dates";
import { EXCLUDE_CLOSING_JOIN, EXCLUDE_CLOSING_WHERE } from "./closing";

/**
 * Compute expense breakdown from EXPENSE account splits.
 * Returns three outputs:
 * - `categories`: hierarchical tree for nested pie charts
 * - `monthly`: flat rows per leaf account per month (used for drill-down pie/bar charts)
 * - `colors`: stable colour map keyed by top-level expense category name
 *
 * Uses quantity (native commodity) with FX conversion for accurate
 * multi-currency support. Amounts are always positive.
 *
 * @param excludeClosing - If true, exclude year-end book-closing transactions.
 */
export function computeExpenseBreakdown(
  ctx: ParseContext,
  excludeClosing = false,
): { categories: ExpenseCategory[]; monthly: MonthlyExpenseByCategory[]; colors: Record<string, string> } {
  const { db, accounts, accountMap, commodityMap, fxRates, rootAccount, topExpenseGuids } = ctx;

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

  const closingJoin = excludeClosing ? EXCLUDE_CLOSING_JOIN : "";
  const closingWhere = excludeClosing ? `AND ${EXCLUDE_CLOSING_WHERE}` : "";

  const rows = db
    .prepare(
      `SELECT
        s.account_guid,
        a.commodity_guid,
        ${sqlMonth("t.post_date", ctx.dialect)} AS month,
        SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS total
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      ${closingJoin}
      WHERE a.account_type = 'EXPENSE'
      ${closingWhere}
      GROUP BY s.account_guid, ${sqlMonth("t.post_date", ctx.dialect)}
      ORDER BY month`
    )
    .all() as { account_guid: string; commodity_guid: string; month: string; total: number }[];

  const monthly: MonthlyExpenseByCategory[] = [];
  const allTimeTotals = new Map<string, number>();

  for (const row of rows) {
    if (row.total === 0) continue;
    const account = accountMap.get(row.account_guid);
    if (!account || topExpenseGuids.has(account.guid)) continue;

    // Convert from account's commodity to base currency
    const commodity = commodityMap.get(row.commodity_guid);
    const rate = commodity?.namespace === "CURRENCY" ? fxRates.rate(row.commodity_guid) : 1;
    const amount = row.total * rate;

    const pathParts = getAccountPath(account, accountMap, topExpenseGuids, rootAccount.guid);
    const fullPath = pathParts.join(":");

    monthly.push({ month: row.month, category: account.name, fullPath, pathParts, amount });
    allTimeTotals.set(pathParts[0], (allTimeTotals.get(pathParts[0]) ?? 0) + amount);
  }

  const categories: ExpenseCategory[] = [...allTimeTotals.entries()]
    .map(([name, amount]) => ({ name, fullPath: name, amount, color: colorMap[name] }))
    .sort((a, b) => b.amount - a.amount);

  return { categories, monthly, colors: colorMap };
}

/**
 * Get all individual expense transactions for the expense table view.
 * Each row represents one split on an EXPENSE account, with the full
 * category path and amount in base currency.
 */
export function getExpenseTransactions(ctx: ParseContext): ExpenseTransaction[] {
  const { db, accountMap, commodityMap, fxRates, rootAccount, topExpenseGuids } = ctx;

  if (topExpenseGuids.size === 0) return [];

  const rows = db
    .prepare(
      `SELECT
        s.account_guid,
        a.commodity_guid,
        t.post_date,
        t.description,
        CAST(s.quantity_num AS REAL) / s.quantity_denom AS amount
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type = 'EXPENSE'
      ORDER BY t.post_date DESC`
    )
    .all() as { account_guid: string; commodity_guid: string; post_date: string; description: string; amount: number }[];

  const transactions: ExpenseTransaction[] = [];
  for (const row of rows) {
    if (row.amount === 0) continue;
    const account = accountMap.get(row.account_guid);
    if (!account || topExpenseGuids.has(account.guid)) continue;

    // Convert from account's commodity to base currency
    const commodity = commodityMap.get(row.commodity_guid);
    const rate = commodity?.namespace === "CURRENCY" ? fxRates.rate(row.commodity_guid) : 1;
    const amount = row.amount * rate;

    const pathParts = getAccountPath(account, accountMap, topExpenseGuids, rootAccount.guid);
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
