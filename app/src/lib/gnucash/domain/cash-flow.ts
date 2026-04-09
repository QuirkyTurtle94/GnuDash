import type { MonthlyCashFlow } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { sqlMonth } from "../shared/dates";
import { EXCLUDE_CLOSING_JOIN, EXCLUDE_CLOSING_WHERE } from "./closing";

/**
 * Compute monthly income vs expense totals from INCOME and EXPENSE account splits.
 * Income splits are negated (GNUCash stores them as negative values).
 * Uses quantity (native commodity) with FX conversion for correct multi-currency support.
 * Note: this is income/expense flow, not true cash flow — it does not track
 * movements through bank accounts or include liability/asset transfers.
 *
 * @param excludeClosing - If true, exclude year-end book-closing transactions.
 */
export function computeCashFlowSeries(ctx: ParseContext, excludeClosing = false): MonthlyCashFlow[] {
  const { db, fxRates, commodityMap } = ctx;

  const closingJoin = excludeClosing ? EXCLUDE_CLOSING_JOIN : "";
  const closingWhere = excludeClosing ? `AND ${EXCLUDE_CLOSING_WHERE}` : "";

  const rows = db
    .prepare(
      `SELECT
        ${sqlMonth("t.post_date")} AS month,
        a.account_type,
        a.commodity_guid,
        SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS total
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      ${closingJoin}
      WHERE a.account_type IN ('INCOME', 'EXPENSE')
      ${closingWhere}
      GROUP BY ${sqlMonth("t.post_date")}, a.account_type, a.commodity_guid
      ORDER BY month`
    )
    .all() as { month: string; account_type: string; commodity_guid: string; total: number }[];

  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const row of rows) {
    const commodity = commodityMap.get(row.commodity_guid);
    const rate = commodity?.namespace === "CURRENCY" ? fxRates.rate(row.commodity_guid) : 1;
    const converted = row.total * rate;

    const existing = byMonth.get(row.month) ?? { income: 0, expenses: 0 };
    if (row.account_type === "INCOME") {
      existing.income += -converted; // Income splits are negative in GNUCash
    } else {
      existing.expenses += converted;
    }
    byMonth.set(row.month, existing);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, { income, expenses }]) => ({
      month,
      income,
      expenses,
      net: income - expenses,
    }));
}
