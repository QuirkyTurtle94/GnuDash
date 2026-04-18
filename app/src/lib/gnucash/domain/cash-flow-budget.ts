import type { CashFlowBudgetData, CashFlowBudgetForBudget, BudgetInfo, BudgetCategoryRow } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { sqlYear, sqlMonthNum } from "../shared/dates";
import { addUnbudgetedRows } from "./budgets";

export function computeCashFlowBudgetData(ctx: ParseContext): CashFlowBudgetData | null {
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

  // Query actuals: for every split on a BANK/CASH account, find counterpart splits.
  // The counterpart's negated value is the cash flow amount.
  // Exclude EQUITY counterparts (opening balances).
  const actualRows = db
    .prepare(
      `SELECT
        cp.account_guid AS counterpart_guid,
        ${sqlMonthNum("t.post_date", ctx.dialect)} AS month_num,
        ${sqlYear("t.post_date", ctx.dialect)} AS year,
        SUM(-CAST(cp.value_num AS REAL) / cp.value_denom) AS cash_amount
      FROM splits cs
      JOIN accounts ca ON cs.account_guid = ca.guid
      JOIN transactions t ON cs.tx_guid = t.guid
      JOIN splits cp ON cp.tx_guid = t.guid AND cp.guid != cs.guid
      JOIN accounts cpa ON cp.account_guid = cpa.guid
      WHERE ca.account_type IN ('BANK', 'CASH')
        AND cpa.account_type != 'EQUITY'
      GROUP BY cp.account_guid, ${sqlYear("t.post_date", ctx.dialect)}, ${sqlMonthNum("t.post_date", ctx.dialect)}`
    )
    .all() as { counterpart_guid: string; month_num: string; year: string; cash_amount: number }[];

  const allYears = new Set<number>();
  // actualsMap: counterpart_guid -> year -> period -> amount
  const actualsMap = new Map<string, Map<string, Map<number, number>>>();
  for (const row of actualRows) {
    allYears.add(parseInt(row.year));
    const period = parseInt(row.month_num) - 1;
    if (!actualsMap.has(row.counterpart_guid)) actualsMap.set(row.counterpart_guid, new Map());
    const yearMap = actualsMap.get(row.counterpart_guid)!;
    if (!yearMap.has(row.year)) yearMap.set(row.year, new Map());
    yearMap.get(row.year)!.set(period, (yearMap.get(row.year)!.get(period) ?? 0) + row.cash_amount);
  }
  const availableYears = [...allYears].sort((a, b) => b - a);

  // Build account children map
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

  // Budget amounts map: budgetGuid -> accountGuid -> periodNum -> amount
  const budgetAmountsMap = new Map<string, Map<string, Map<number, number>>>();
  for (const row of amountRows) {
    if (!budgetAmountsMap.has(row.budget_guid)) budgetAmountsMap.set(row.budget_guid, new Map());
    const accountAmounts = budgetAmountsMap.get(row.budget_guid)!;
    if (!accountAmounts.has(row.account_guid)) accountAmounts.set(row.account_guid, new Map());
    accountAmounts.get(row.account_guid)!.set(row.period_num, row.amount);
  }

  // Find the top-level container GUIDs for ALL account types (not just expense/income).
  // These are direct children of ROOT.
  const topLevelGuids = new Set(
    accounts
      .filter((a) => a.parent_guid === rootAccount.guid && a.account_type !== "ROOT")
      .map((a) => a.guid)
  );

  function getAncestorPath(accountGuid: string): string[] | null {
    const path: string[] = [];
    let current = accountMap.get(accountGuid);
    if (!current) return null;

    while (current) {
      if (topLevelGuids.has(current.guid)) {
        path.unshift(current.guid);
        return path;
      }
      if (current.account_type === "ROOT" || current.guid === rootAccount.guid) return null;
      path.unshift(current.guid);
      current = current.parent_guid ? accountMap.get(current.parent_guid) : undefined;
    }
    return null;
  }

  function getAccountPath(accountGuid: string): string {
    const parts: string[] = [];
    let current = accountMap.get(accountGuid);
    while (
      current &&
      !topLevelGuids.has(current.guid) &&
      current.account_type !== "ROOT"
    ) {
      parts.unshift(current.name);
      current = current.parent_guid
        ? accountMap.get(current.parent_guid)
        : undefined;
    }
    return parts.join(":");
  }

  function getRolledUpActuals(accountGuid: string): Map<string, Map<number, number>> {
    const descendantGuids = getDescendants(accountGuid);
    const rolledUp = new Map<string, Map<number, number>>();
    for (const dGuid of descendantGuids) {
      const dYearMap = actualsMap.get(dGuid);
      if (dYearMap) {
        for (const [year, periodMap] of dYearMap) {
          if (!rolledUp.has(year)) rolledUp.set(year, new Map());
          const target = rolledUp.get(year)!;
          for (const [period, amount] of periodMap) {
            target.set(period, (target.get(period) ?? 0) + amount);
          }
        }
      }
    }
    return rolledUp;
  }

  const categoriesByBudget: Record<string, CashFlowBudgetForBudget> = {};

  for (const budget of budgets) {
    const budgetAmounts = budgetAmountsMap.get(budget.guid);

    // Collect all counterpart account GUIDs that have actuals
    const counterpartGuids = new Set(actualsMap.keys());

    // Also include accounts that have budget amounts (they might not have actuals yet)
    if (budgetAmounts) {
      for (const accGuid of budgetAmounts.keys()) {
        // Only include if the account is NOT a BANK/CASH/ROOT account
        const acc = accountMap.get(accGuid);
        if (acc && acc.account_type !== "BANK" && acc.account_type !== "CASH" && acc.account_type !== "ROOT") {
          counterpartGuids.add(accGuid);
        }
      }
    }

    // Build the set of all needed GUIDs (counterparts + ancestors)
    const allNeededGuids = new Set<string>();
    for (const accGuid of counterpartGuids) {
      const path = getAncestorPath(accGuid);
      if (path) {
        for (const guid of path) allNeededGuids.add(guid);
      }
    }

    function findHierarchyParent(accountGuid: string): string | null {
      const account = accountMap.get(accountGuid);
      if (!account || !account.parent_guid) return null;
      let current = accountMap.get(account.parent_guid);
      while (current) {
        if (current.account_type === "ROOT" || current.guid === rootAccount.guid) return null;
        if (topLevelGuids.has(current.guid)) {
          if (accountGuid === current.guid) return null;
          return allNeededGuids.has(current.guid) ? current.guid : null;
        }
        if (allNeededGuids.has(current.guid)) return current.guid;
        current = current.parent_guid ? accountMap.get(current.parent_guid) : undefined;
      }
      return null;
    }

    const hierarchyChildrenMap = new Map<string, string[]>();
    for (const guid of allNeededGuids) {
      const parent = findHierarchyParent(guid);
      if (parent) {
        if (!hierarchyChildrenMap.has(parent)) hierarchyChildrenMap.set(parent, []);
        hierarchyChildrenMap.get(parent)!.push(guid);
      }
    }

    function computeDepth(accountGuid: string): number {
      let depth = 0;
      let parent = findHierarchyParent(accountGuid);
      while (parent) {
        depth++;
        parent = findHierarchyParent(parent);
      }
      return depth;
    }

    const budgetedAccountGuids = budgetAmounts ? new Set(budgetAmounts.keys()) : new Set<string>();
    const currentYear = new Date().getFullYear().toString();

    const outflowCategories: BudgetCategoryRow[] = [];
    const inflowCategories: BudgetCategoryRow[] = [];

    for (const accountGuid of allNeededGuids) {
      const account = accountMap.get(accountGuid);
      if (!account) continue;

      const rolledUpActuals = getRolledUpActuals(accountGuid);
      const ownBudgetAmounts = budgetAmounts?.get(accountGuid);

      // Build period budgets: use own budget if explicit, otherwise sum descendants
      let periodBudgets: Map<number, number>;
      if (ownBudgetAmounts) {
        periodBudgets = ownBudgetAmounts;
      } else {
        periodBudgets = new Map<number, number>();
        const descendants = getDescendants(accountGuid);
        for (const dGuid of descendants) {
          if (dGuid === accountGuid) continue;
          const dBudget = budgetAmounts?.get(dGuid);
          if (dBudget) {
            for (const [p, amt] of dBudget) {
              periodBudgets.set(p, (periodBudgets.get(p) ?? 0) + amt);
            }
          }
        }
      }

      const fullPath = getAccountPath(accountGuid);

      let totalBudgeted = 0;
      let totalActual = 0;
      const periods: { period: number; budgeted: number; actual: Record<string, number> }[] = [];

      for (let p = 0; p < budget.numPeriods; p++) {
        const budgeted = Math.abs(periodBudgets.get(p) ?? 0);
        const actualByYear: Record<string, number> = {};
        for (const year of allYears) {
          const yearStr = year.toString();
          actualByYear[yearStr] = rolledUpActuals.get(yearStr)?.get(p) ?? 0;
        }
        totalBudgeted += budgeted;
        totalActual += actualByYear[currentYear] ?? 0;
        periods.push({ period: p, budgeted, actual: actualByYear });
      }

      if (totalBudgeted === 0 && totalActual === 0) continue;

      // Compute child budget totals for imbalance detection
      const directChildren = hierarchyChildrenMap.get(accountGuid) ?? [];
      const hasChildren = directChildren.length > 0;
      let childBudgetTotal = 0;
      if (hasChildren) {
        for (const childGuid of directChildren) {
          const childOwnBudget = budgetAmounts?.get(childGuid);
          if (childOwnBudget) {
            for (let p = 0; p < budget.numPeriods; p++) {
              childBudgetTotal += Math.abs(childOwnBudget.get(p) ?? 0);
            }
          } else {
            const childDescendants = getDescendants(childGuid);
            for (const dGuid of childDescendants) {
              if (dGuid === childGuid) continue;
              const dBudget = budgetAmounts?.get(dGuid);
              if (dBudget) {
                for (let p = 0; p < budget.numPeriods; p++) {
                  childBudgetTotal += Math.abs(dBudget.get(p) ?? 0);
                }
              }
            }
          }
        }
      }

      const hasExplicitBudget = budgetedAccountGuids.has(accountGuid);
      const imbalance = hasExplicitBudget && hasChildren ? totalBudgeted - childBudgetTotal : 0;

      const row: BudgetCategoryRow = {
        accountGuid,
        accountName: account.name,
        fullPath,
        budgeted: totalBudgeted,
        actual: Math.abs(totalActual),
        variance: totalBudgeted - Math.abs(totalActual),
        variancePct: totalBudgeted > 0 ? ((totalBudgeted - Math.abs(totalActual)) / totalBudgeted) * 100 : 0,
        periods: periods.map((p) => ({
          ...p,
          actual: Object.fromEntries(
            Object.entries(p.actual).map(([yr, val]) => [yr, Math.abs(val)])
          ),
        })),
        parentAccountGuid: findHierarchyParent(accountGuid),
        depth: computeDepth(accountGuid),
        hasChildren,
        hasExplicitBudget,
        childBudgetTotal,
        imbalance,
      };

      // Classify as inflow or outflow based on the sign of total actual cash movement.
      // Positive = cash came IN (e.g. income), Negative = cash went OUT (e.g. expenses, liability payments).
      if (totalActual >= 0) {
        inflowCategories.push(row);
      } else {
        outflowCategories.push(row);
      }
    }

    addUnbudgetedRows(outflowCategories, currentYear);
    addUnbudgetedRows(inflowCategories, currentYear);

    outflowCategories.sort((a, b) => b.actual - a.actual);
    inflowCategories.sort((a, b) => b.actual - a.actual);

    categoriesByBudget[budget.guid] = { outflowCategories, inflowCategories };
  }

  return {
    budgets,
    categoriesByBudget,
    availableYears,
  };
}
