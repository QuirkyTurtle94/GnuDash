"use client";

import type { BudgetCategoryRow } from "@/lib/types/gnucash";
import { formatCurrency } from "@/lib/format";

export function ImbalanceBanner({
  parentCategory,
  currency,
}: {
  parentCategory: BudgetCategoryRow;
  currency: string;
}) {
  const { imbalance, budgeted, childBudgetTotal } = parentCategory;
  if (imbalance === 0) return null;

  const isUnderAllocated = imbalance > 0;
  const color = isUnderAllocated ? "#E8B86B" : "#E87C6B";
  const label = isUnderAllocated ? "Unallocated" : "Over-allocated";

  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm"
      style={{ borderColor: color + "40", backgroundColor: color + "08" }}
    >
      <svg className="h-4 w-4 shrink-0" style={{ color }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
      </svg>
      <span style={{ color }}>
        <span className="font-medium">{label}:</span>{" "}
        {parentCategory.accountName} is budgeted at{" "}
        <span className="font-semibold" data-v>{formatCurrency(budgeted, currency)}</span>{" "}
        but sub-budgets total{" "}
        <span className="font-semibold" data-v>{formatCurrency(childBudgetTotal, currency)}</span>{" "}
        ({formatCurrency(Math.abs(imbalance), currency)} {isUnderAllocated ? "unallocated" : "over-allocated"})
      </span>
    </div>
  );
}
