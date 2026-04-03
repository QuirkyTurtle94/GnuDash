import type { MonthlyCashFlow } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { sqlMonth } from "../shared/dates";

export function computeCashFlowSeries(ctx: ParseContext): MonthlyCashFlow[] {
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
      WHERE a.account_type IN ('INCOME', 'EXPENSE')
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
