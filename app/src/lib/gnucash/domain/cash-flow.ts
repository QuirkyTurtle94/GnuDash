import type { MonthlyCashFlow } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { sqlMonth } from "../shared/dates";
import { EXCLUDE_CLOSING_JOIN, EXCLUDE_CLOSING_WHERE } from "./closing";

/**
 * Compute monthly income vs expense totals from INCOME and EXPENSE account splits.
 * Income splits are negated (GNUCash stores them as negative values).
 * Note: this is income/expense flow, not true cash flow — it does not track
 * movements through bank accounts or include liability/asset transfers.
 *
 * @param excludeClosing - If true, exclude year-end book-closing transactions.
 */
export function computeCashFlowSeries(ctx: ParseContext, excludeClosing = false): MonthlyCashFlow[] {
  const closingJoin = excludeClosing ? EXCLUDE_CLOSING_JOIN : "";
  const closingWhere = excludeClosing ? `AND ${EXCLUDE_CLOSING_WHERE}` : "";

  const rows = ctx.db
    .prepare(
      `SELECT
        ${sqlMonth("t.post_date")} AS month,
        SUM(CASE WHEN a.account_type = 'INCOME'
            THEN -CAST(s.value_num AS REAL) / s.value_denom ELSE 0 END) AS income,
        SUM(CASE WHEN a.account_type = 'EXPENSE'
            THEN CAST(s.value_num AS REAL) / s.value_denom ELSE 0 END) AS expenses
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      ${closingJoin}
      WHERE a.account_type IN ('INCOME', 'EXPENSE')
      ${closingWhere}
      GROUP BY ${sqlMonth("t.post_date")}
      ORDER BY month`
    )
    .all() as { month: string; income: number; expenses: number }[];

  return rows.map((row) => ({
    month: row.month,
    income: row.income,
    expenses: row.expenses,
    net: row.income - row.expenses,
  }));
}
