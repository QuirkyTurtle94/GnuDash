import type { BudgetData, BudgetDataForBudget, BudgetInfo, BudgetCategoryRow } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { sqlYear, sqlMonthNum } from "../shared/dates";

export function computeBudgetData(ctx: ParseContext): BudgetData | null {
  const { db, accounts, accountMap, rootAccount, topExpenseGuids, topIncomeGuids } = ctx;

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

  // Fetch actuals for all expense/income leaf accounts
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

  // Build account children map (full account tree)
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

  // Build budget amounts map: budgetGuid -> accountGuid -> periodNum -> amount
  const budgetAmountsMap = new Map<string, Map<string, Map<number, number>>>();
  for (const row of amountRows) {
    if (!budgetAmountsMap.has(row.budget_guid)) budgetAmountsMap.set(row.budget_guid, new Map());
    const accountAmounts = budgetAmountsMap.get(row.budget_guid)!;
    if (!accountAmounts.has(row.account_guid)) accountAmounts.set(row.account_guid, new Map());
    accountAmounts.get(row.account_guid)!.set(row.period_num, row.amount);
  }

  /**
   * Walk from an account up to its top-level container (direct child of
   * Expenses or Income root), returning the path of account GUIDs from
   * top-level down to (but not including) the account itself.
   * Returns null if the account is already a top-level container or root.
   */
  function getAncestorPath(accountGuid: string): string[] | null {
    const path: string[] = [];
    let current = accountMap.get(accountGuid);
    if (!current) return null;

    // Walk up, collecting ancestors until we hit a top-level container
    while (current) {
      if (topExpenseGuids.has(current.guid) || topIncomeGuids.has(current.guid)) {
        // current is the top-level category — it's the root of our hierarchy
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
    const topGuids = new Set([...topExpenseGuids, ...topIncomeGuids]);
    while (
      current &&
      !topGuids.has(current.guid) &&
      current.account_type !== "ROOT"
    ) {
      parts.unshift(current.name);
      current = current.parent_guid
        ? accountMap.get(current.parent_guid)
        : undefined;
    }
    return parts.join(":");
  }

  // Compute rolled-up actuals for a given account (including all descendants)
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

  // Build categories for each budget
  const categoriesByBudget: Record<string, BudgetDataForBudget> = {};

  for (const budget of budgets) {
    const budgetAmounts = budgetAmountsMap.get(budget.guid);
    if (!budgetAmounts) {
      categoriesByBudget[budget.guid] = { expenseCategories: [], incomeCategories: [] };
      continue;
    }

    const budgetedAccountGuids = new Set(budgetAmounts.keys());
    const currentYear = new Date().getFullYear().toString();

    // Collect all account GUIDs that need rows: budgeted accounts + all
    // ancestors up to the top-level container. This ensures we always
    // present a hierarchy starting at the top level.
    const allNeededGuids = new Set<string>();
    for (const accGuid of budgetedAccountGuids) {
      const path = getAncestorPath(accGuid);
      if (path) {
        for (const guid of path) allNeededGuids.add(guid);
      }
    }

    // For each needed account, determine its direct parent in the hierarchy
    // (the nearest ancestor that is also in allNeededGuids).
    function findHierarchyParent(accountGuid: string): string | null {
      const account = accountMap.get(accountGuid);
      if (!account || !account.parent_guid) return null;
      let current = accountMap.get(account.parent_guid);
      while (current) {
        if (current.account_type === "ROOT" || current.guid === rootAccount.guid) return null;
        if (topExpenseGuids.has(current.guid) || topIncomeGuids.has(current.guid)) {
          // If the account itself IS a top-level guid, its parent is null
          if (accountGuid === current.guid) return null;
          // Otherwise, the top-level guid is the parent if it's in allNeededGuids
          return allNeededGuids.has(current.guid) ? current.guid : null;
        }
        if (allNeededGuids.has(current.guid)) return current.guid;
        current = current.parent_guid ? accountMap.get(current.parent_guid) : undefined;
      }
      return null;
    }

    // Build a map of direct hierarchy children for each node
    const hierarchyChildrenMap = new Map<string, string[]>();
    for (const guid of allNeededGuids) {
      const parent = findHierarchyParent(guid);
      if (parent) {
        if (!hierarchyChildrenMap.has(parent)) hierarchyChildrenMap.set(parent, []);
        hierarchyChildrenMap.get(parent)!.push(guid);
      }
    }

    // Compute depth in the hierarchy
    function computeDepth(accountGuid: string): number {
      let depth = 0;
      let parent = findHierarchyParent(accountGuid);
      while (parent) {
        depth++;
        parent = findHierarchyParent(parent);
      }
      return depth;
    }

    // Build rows for all needed accounts
    const expenseCategories: BudgetCategoryRow[] = [];
    const incomeCategories: BudgetCategoryRow[] = [];

    for (const accountGuid of allNeededGuids) {
      const account = accountMap.get(accountGuid);
      if (!account) continue;
      if (account.account_type !== "EXPENSE" && account.account_type !== "INCOME") continue;

      const isIncome = account.account_type === "INCOME";
      const rolledUpActuals = getRolledUpActuals(accountGuid);
      const ownBudgetAmounts = budgetAmounts.get(accountGuid);

      // If this account has an explicit budget, use it.
      // Otherwise, sum up all budgeted descendants' amounts (rollup).
      let periodBudgets: Map<number, number>;
      if (ownBudgetAmounts) {
        periodBudgets = ownBudgetAmounts;
      } else {
        // Synthesise budget by summing all budgeted descendants
        periodBudgets = new Map<number, number>();
        const descendants = getDescendants(accountGuid);
        for (const dGuid of descendants) {
          if (dGuid === accountGuid) continue;
          const dBudget = budgetAmounts.get(dGuid);
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
        const rawBudgeted = periodBudgets.get(p) ?? 0;
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

      // Compute child budget totals for imbalance detection
      const directChildren = hierarchyChildrenMap.get(accountGuid) ?? [];
      // Only count children that will actually appear as rows (non-zero budget or actual)
      const hasChildren = directChildren.length > 0;
      let childBudgetTotal = 0;
      if (hasChildren) {
        for (const childGuid of directChildren) {
          const childAccount = accountMap.get(childGuid);
          const childIsIncome = childAccount?.account_type === "INCOME";
          // Child budget: explicit or rolled-up
          const childOwnBudget = budgetAmounts.get(childGuid);
          if (childOwnBudget) {
            for (let p = 0; p < budget.numPeriods; p++) {
              const raw = childOwnBudget.get(p) ?? 0;
              childBudgetTotal += childIsIncome ? Math.abs(raw) : raw;
            }
          } else {
            // Child is a synthesised parent — sum its budgeted descendants
            const childDescendants = getDescendants(childGuid);
            for (const dGuid of childDescendants) {
              if (dGuid === childGuid) continue;
              const dBudget = budgetAmounts.get(dGuid);
              if (dBudget) {
                for (let p = 0; p < budget.numPeriods; p++) {
                  const raw = dBudget.get(p) ?? 0;
                  childBudgetTotal += childIsIncome ? Math.abs(raw) : raw;
                }
              }
            }
          }
        }
      }

      // Only show imbalance when the account has its own explicit budget
      // AND children with budgets. Synthesised parents always balance by definition.
      const hasExplicitBudget = budgetedAccountGuids.has(accountGuid);
      const imbalance = hasExplicitBudget && hasChildren ? totalBudgeted - childBudgetTotal : 0;

      const row: BudgetCategoryRow = {
        accountGuid,
        accountName: account.name,
        fullPath,
        budgeted: totalBudgeted,
        actual: totalActual,
        variance: totalBudgeted - totalActual,
        variancePct: totalBudgeted > 0 ? ((totalBudgeted - totalActual) / totalBudgeted) * 100 : 0,
        periods,
        parentAccountGuid: findHierarchyParent(accountGuid),
        depth: computeDepth(accountGuid),
        hasChildren,
        hasExplicitBudget,
        childBudgetTotal,
        imbalance,
      };

      if (isIncome) incomeCategories.push(row);
      else expenseCategories.push(row);
    }

    addUnbudgetedRows(expenseCategories, currentYear);
    addUnbudgetedRows(incomeCategories, currentYear);

    expenseCategories.sort((a, b) => b.actual - a.actual);
    incomeCategories.sort((a, b) => b.actual - a.actual);

    categoriesByBudget[budget.guid] = { expenseCategories, incomeCategories };
  }

  // Default to first budget for backward compat
  const defaultData = categoriesByBudget[budgets[0].guid] ?? { expenseCategories: [], incomeCategories: [] };

  return {
    budgets,
    categoriesByBudget,
    expenseCategories: defaultData.expenseCategories,
    incomeCategories: defaultData.incomeCategories,
    availableYears,
  };
}

/**
 * Add synthetic "Unbudgeted" rows for parents whose children don't fully
 * account for all actuals or budget. Mutates the array in place.
 */
export function addUnbudgetedRows(categories: BudgetCategoryRow[], currentYear: string) {
  const childrenOf = new Map<string, BudgetCategoryRow[]>();
  for (const cat of categories) {
    if (cat.parentAccountGuid) {
      if (!childrenOf.has(cat.parentAccountGuid)) childrenOf.set(cat.parentAccountGuid, []);
      childrenOf.get(cat.parentAccountGuid)!.push(cat);
    }
  }

  const toAdd: BudgetCategoryRow[] = [];
  for (const parent of categories) {
    if (!parent.hasChildren) continue;
    const children = childrenOf.get(parent.accountGuid) ?? [];
    if (children.length === 0) continue;

    const periods: { period: number; budgeted: number; actual: Record<string, number> }[] = [];
    let totalBudgeted = 0;
    let totalActual = 0;

    for (let p = 0; p < parent.periods.length; p++) {
      const parentPeriod = parent.periods[p];
      let childBudgetSum = 0;
      const childActualByYear: Record<string, number> = {};

      for (const child of children) {
        const cp = child.periods[p];
        if (cp) {
          childBudgetSum += cp.budgeted;
          for (const [yr, amt] of Object.entries(cp.actual)) {
            childActualByYear[yr] = (childActualByYear[yr] ?? 0) + amt;
          }
        }
      }

      const unbudgetedBudget = parentPeriod.budgeted - childBudgetSum;
      const unbudgetedActual: Record<string, number> = {};
      for (const [yr, parentAmt] of Object.entries(parentPeriod.actual)) {
        unbudgetedActual[yr] = parentAmt - (childActualByYear[yr] ?? 0);
      }

      totalBudgeted += unbudgetedBudget;
      totalActual += unbudgetedActual[currentYear] ?? 0;
      periods.push({ period: parentPeriod.period, budgeted: unbudgetedBudget, actual: unbudgetedActual });
    }

    if (totalBudgeted === 0 && totalActual === 0) continue;

    toAdd.push({
      accountGuid: `__unbudgeted__${parent.accountGuid}`,
      accountName: "Unbudgeted",
      fullPath: parent.fullPath ? `${parent.fullPath}:Unbudgeted` : "Unbudgeted",
      budgeted: totalBudgeted,
      actual: totalActual,
      variance: totalBudgeted - totalActual,
      variancePct: totalBudgeted > 0 ? ((totalBudgeted - totalActual) / totalBudgeted) * 100 : 0,
      periods,
      parentAccountGuid: parent.accountGuid,
      depth: parent.depth + 1,
      hasChildren: false,
      hasExplicitBudget: false,
      childBudgetTotal: 0,
      imbalance: 0,
      isUnbudgeted: true,
    });

  }

  categories.push(...toAdd);
}
