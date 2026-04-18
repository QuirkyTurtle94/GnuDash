import type { MonthlyExpenseByCategory, ExpenseTransaction } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { getAccountPath } from "../shared/accounts";
import { parseGnuCashDate, formatISODate, sqlMonth } from "../shared/dates";
import { EXCLUDE_CLOSING_JOIN, EXCLUDE_CLOSING_WHERE } from "./closing";

/**
 * Compute income breakdown from INCOME account splits.
 * Returns flat monthly rows per leaf account (for drill-down charts) and
 * a stable colour map keyed by top-level income category name.
 * Uses quantity (native commodity) with FX conversion for correct multi-currency support.
 * Amounts are negated to positive (GNUCash stores income as negative values).
 *
 * @param excludeClosing - If true, exclude year-end book-closing transactions.
 */
export function computeIncomeBreakdown(
  ctx: ParseContext,
  excludeClosing = false,
): { monthly: MonthlyExpenseByCategory[]; colors: Record<string, string> } {
  const { db, accounts, accountMap, commodityMap, fxRates, rootAccount, topIncomeGuids } = ctx;

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
      WHERE a.account_type = 'INCOME'
      ${closingWhere}
      GROUP BY s.account_guid, ${sqlMonth("t.post_date", ctx.dialect)}
      ORDER BY month`
    )
    .all() as { account_guid: string; commodity_guid: string; month: string; total: number }[];

  const monthly: MonthlyExpenseByCategory[] = [];
  for (const row of rows) {
    // Convert from account's commodity to base currency
    const commodity = commodityMap.get(row.commodity_guid);
    const rate = commodity?.namespace === "CURRENCY" ? fxRates.rate(row.commodity_guid) : 1;
    const amount = -row.total * rate; // Income splits are negative in GNUCash

    if (amount === 0) continue;
    const account = accountMap.get(row.account_guid);
    if (!account || topIncomeGuids.has(account.guid)) continue;

    const pathParts = getAccountPath(account, accountMap, topIncomeGuids, rootAccount.guid);
    monthly.push({ month: row.month, category: account.name, fullPath: pathParts.join(":"), pathParts, amount });
  }

  return { monthly, colors: colorMap };
}

/**
 * Get all individual income transactions for the income table view.
 * Amounts are negated to positive (GNUCash stores income as negative values).
 */
export function getIncomeTransactions(ctx: ParseContext): ExpenseTransaction[] {
  const { db, accountMap, commodityMap, fxRates, rootAccount, topIncomeGuids } = ctx;

  if (topIncomeGuids.size === 0) return [];

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
      WHERE a.account_type = 'INCOME'
      ORDER BY t.post_date DESC`
    )
    .all() as { account_guid: string; commodity_guid: string; post_date: string; description: string; amount: number }[];

  const transactions: ExpenseTransaction[] = [];
  for (const row of rows) {
    // Convert from account's commodity to base currency
    const commodity = commodityMap.get(row.commodity_guid);
    const rate = commodity?.namespace === "CURRENCY" ? fxRates.rate(row.commodity_guid) : 1;
    const amount = -row.amount * rate; // Income splits are negative

    if (amount === 0) continue;
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
