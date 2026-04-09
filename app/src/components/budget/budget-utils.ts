import type { BudgetCategoryRow } from "@/lib/types/gnucash";

export const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export type ViewMode = "ytd" | "monthly" | "year";

export function computeFilteredCategories(
  sourceCategories: BudgetCategoryRow[] | undefined,
  viewMode: ViewMode,
  selectedMonth: number,
  selectedYear: number,
  yearStr: string,
  numPeriods: number,
): BudgetCategoryRow[] {
  if (!sourceCategories) return [];
  if (viewMode === "monthly") {
    return sourceCategories.map((cat) => {
      const periodData = cat.periods.find((p) => p.period === selectedMonth);
      const budgeted = periodData?.budgeted ?? 0;
      const actual = periodData?.actual[yearStr] ?? 0;
      const variance = budgeted - actual;

      let childBudgetTotal = cat.childBudgetTotal;
      let imbalance = cat.imbalance;
      if (cat.hasChildren && sourceCategories) {
        const children = sourceCategories.filter((c) => c.parentAccountGuid === cat.accountGuid && !c.isUnbudgeted);
        childBudgetTotal = children.reduce((sum, c) => {
          const cp = c.periods.find((p) => p.period === selectedMonth);
          return sum + (cp?.budgeted ?? 0);
        }, 0);
        imbalance = cat.hasExplicitBudget ? budgeted - childBudgetTotal : 0;
      }

      return {
        ...cat,
        budgeted,
        actual,
        variance,
        variancePct: budgeted > 0 ? (variance / budgeted) * 100 : 0,
        childBudgetTotal,
        imbalance,
      };
    }).filter((cat) => cat.budgeted > 0 || cat.actual > 0);
  }

  const now = new Date();
  const isCurrentYear = selectedYear === now.getFullYear();
  const maxPeriod = viewMode === "year" ? (numPeriods - 1) : (isCurrentYear ? now.getMonth() : 11);
  return sourceCategories.map((cat) => {
    let budgeted = 0;
    let actual = 0;
    for (const p of cat.periods) {
      if (p.period <= maxPeriod) {
        budgeted += p.budgeted;
        actual += p.actual[yearStr] ?? 0;
      }
    }
    const variance = budgeted - actual;

    let childBudgetTotal = cat.childBudgetTotal;
    let imbalance = cat.imbalance;
    if (cat.hasChildren && sourceCategories) {
      const children = sourceCategories.filter((c) => c.parentAccountGuid === cat.accountGuid && !c.isUnbudgeted);
      childBudgetTotal = children.reduce((sum, c) => {
        let cb = 0;
        for (const p of c.periods) {
          if (p.period <= maxPeriod) cb += p.budgeted;
        }
        return sum + cb;
      }, 0);
      imbalance = cat.hasExplicitBudget ? budgeted - childBudgetTotal : 0;
    }

    return {
      ...cat,
      budgeted,
      actual,
      variance,
      variancePct: budgeted > 0 ? (variance / budgeted) * 100 : 0,
      childBudgetTotal,
      imbalance,
    };
  }).filter((cat) => cat.budgeted > 0 || cat.actual > 0);
}
