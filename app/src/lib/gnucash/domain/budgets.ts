import type { BudgetData, BudgetInfo, BudgetCategoryRow } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { sqlYear, sqlMonthNum } from "../shared/dates";

export function computeBudgetData(ctx: ParseContext): BudgetData | null {
  const { db, accounts, accountMap, rootAccount } = ctx;

  // Check if budgets table exists
  const tableCheck = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='budgets'`)
    .get() as { name: string } | undefined;

  if (!tableCheck) return null;

  const budgetRows = db
    .prepare(`SELECT guid, name, description, num_periods FROM budgets`)
    .all() as { guid: string; name: string; description: string; num_periods: number }[];

  if (budgetRows.length === 0) return null;

  const budgets: BudgetInfo[] = budgetRows.map((b) => ({
    guid: b.guid,
    name: b.name,
    description: b.description,
    numPeriods: b.num_periods,
  }));

  const amountRows = db
    .prepare(
      `SELECT ba.budget_guid, ba.account_guid, ba.period_num,
              CAST(ba.amount_num AS REAL) / ba.amount_denom AS amount
       FROM budget_amounts ba`
    )
    .all() as { budget_guid: string; account_guid: string; period_num: number; amount: number }[];

  const topContainerGuids = new Set(
    accounts
      .filter(
        (a) =>
          (a.account_type === "EXPENSE" || a.account_type === "INCOME") &&
          a.parent_guid === rootAccount.guid
      )
      .map((a) => a.guid)
  );

  function getAccountPath(accountGuid: string): string {
    const parts: string[] = [];
    let current = accountMap.get(accountGuid);
    while (
      current &&
      !topContainerGuids.has(current.guid) &&
      current.account_type !== "ROOT"
    ) {
      parts.unshift(current.name);
      current = current.parent_guid
        ? accountMap.get(current.parent_guid)
        : undefined;
    }
    return parts.join(":");
  }

  const actualRows = db
    .prepare(
      `SELECT
        s.account_guid,
        ${sqlMonthNum("t.post_date")} AS month_num,
        ${sqlYear("t.post_date")} AS year,
        SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS actual
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type IN ('EXPENSE', 'INCOME')
      GROUP BY s.account_guid, ${sqlYear("t.post_date")}, ${sqlMonthNum("t.post_date")}`
    )
    .all() as { account_guid: string; month_num: string; year: string; actual: number }[];

  const allYears = new Set<number>();
  const actualsMap = new Map<string, Map<string, Map<number, number>>>();
  for (const row of actualRows) {
    allYears.add(parseInt(row.year));
    const period = parseInt(row.month_num) - 1;
    if (!actualsMap.has(row.account_guid)) actualsMap.set(row.account_guid, new Map());
    const yearMap = actualsMap.get(row.account_guid)!;
    if (!yearMap.has(row.year)) yearMap.set(row.year, new Map());
    yearMap.get(row.year)!.set(period, (yearMap.get(row.year)!.get(period) ?? 0) + row.actual);
  }
  const availableYears = [...allYears].sort((a, b) => b - a);

  const childrenMap = new Map<string, string[]>();
  for (const a of accounts) {
    if (a.parent_guid) {
      if (!childrenMap.has(a.parent_guid)) childrenMap.set(a.parent_guid, []);
      childrenMap.get(a.parent_guid)!.push(a.guid);
    }
  }

  function getDescendants(guid: string): string[] {
    const result = [guid];
    const children = childrenMap.get(guid);
    if (children) {
      for (const child of children) result.push(...getDescendants(child));
    }
    return result;
  }

  const budgetAmountsMap = new Map<string, Map<string, Map<number, number>>>();
  for (const row of amountRows) {
    if (!budgetAmountsMap.has(row.budget_guid)) budgetAmountsMap.set(row.budget_guid, new Map());
    const accountAmounts = budgetAmountsMap.get(row.budget_guid)!;
    if (!accountAmounts.has(row.account_guid)) accountAmounts.set(row.account_guid, new Map());
    accountAmounts.get(row.account_guid)!.set(row.period_num, row.amount);
  }

  const defaultBudget = budgets[0];
  const defaultAmounts = budgetAmountsMap.get(defaultBudget.guid);
  const expenseCategories: BudgetCategoryRow[] = [];
  const incomeCategories: BudgetCategoryRow[] = [];

  if (defaultAmounts) {
    for (const [accountGuid, periodAmounts] of defaultAmounts) {
      const account = accountMap.get(accountGuid);
      if (!account) continue;
      if (account.account_type !== "EXPENSE" && account.account_type !== "INCOME") continue;

      const descendantGuids = getDescendants(accountGuid);
      const rolledUpActuals = new Map<string, Map<number, number>>();
      for (const dGuid of descendantGuids) {
        const dYearMap = actualsMap.get(dGuid);
        if (dYearMap) {
          for (const [year, periodMap] of dYearMap) {
            if (!rolledUpActuals.has(year)) rolledUpActuals.set(year, new Map());
            const target = rolledUpActuals.get(year)!;
            for (const [period, amount] of periodMap) {
              target.set(period, (target.get(period) ?? 0) + amount);
            }
          }
        }
      }

      const fullPath = getAccountPath(accountGuid);
      const currentYear = new Date().getFullYear().toString();
      const isIncome = account.account_type === "INCOME";

      let totalBudgeted = 0;
      let totalActual = 0;
      const periods: { period: number; budgeted: number; actual: Record<string, number> }[] = [];

      for (let p = 0; p < defaultBudget.numPeriods; p++) {
        const rawBudgeted = periodAmounts.get(p) ?? 0;
        const budgeted = isIncome ? Math.abs(rawBudgeted) : rawBudgeted;
        const actualByYear: Record<string, number> = {};
        for (const year of allYears) {
          const yearStr = year.toString();
          const raw = rolledUpActuals.get(yearStr)?.get(p) ?? 0;
          actualByYear[yearStr] = isIncome ? Math.abs(raw) : raw;
        }
        totalBudgeted += budgeted;
        totalActual += actualByYear[currentYear] ?? 0;
        periods.push({ period: p, budgeted, actual: actualByYear });
      }

      if (totalBudgeted === 0 && totalActual === 0) continue;

      const row: BudgetCategoryRow = {
        accountGuid,
        accountName: account.name,
        fullPath,
        budgeted: totalBudgeted,
        actual: totalActual,
        variance: totalBudgeted - totalActual,
        variancePct: totalBudgeted > 0 ? ((totalBudgeted - totalActual) / totalBudgeted) * 100 : 0,
        periods,
      };

      if (isIncome) incomeCategories.push(row);
      else expenseCategories.push(row);
    }

    expenseCategories.sort((a, b) => b.actual - a.actual);
    incomeCategories.sort((a, b) => b.actual - a.actual);
  }

  return { budgets, expenseCategories, incomeCategories, availableYears };
}
