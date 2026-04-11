"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { BudgetCategoryRow } from "@/lib/types/gnucash";

export function VarianceTable({
  categories,
  currency,
  isIncome = false,
  onDrillDown,
  title = "Budget Variance",
}: {
  categories: BudgetCategoryRow[];
  currency: string;
  isIncome?: boolean;
  onDrillDown: (accountGuid: string) => void;
  title?: string;
}) {
  const [sortKey, setSortKey] = useState<"name" | "budgeted" | "actual" | "variance">("actual");
  const [sortAsc, setSortAsc] = useState(false);

  const sorted = useMemo(() => {
    const arr = [...categories];
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = (a.fullPath || a.accountName).localeCompare(b.fullPath || b.accountName);
          break;
        case "budgeted":
          cmp = a.budgeted - b.budgeted;
          break;
        case "actual":
          cmp = a.actual - b.actual;
          break;
        case "variance":
          cmp = a.variance - b.variance;
          break;
      }
      return sortAsc ? cmp : -cmp;
    });
    return arr;
  }, [categories, sortKey, sortAsc]);

  function toggleSort(key: typeof sortKey) {
    if (sortKey === key) {
      setSortAsc(!sortAsc);
    } else {
      setSortKey(key);
      setSortAsc(key === "name");
    }
  }

  const SortIcon = ({ active }: { active: boolean }) => (
    <svg className={`ml-1 inline h-3 w-3 ${active ? "text-[#6C9B8B]" : "text-[#9A9FA5]"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={sortAsc ? "M5 15l7-7 7 7" : "M19 9l-7 7-7-7"} />
    </svg>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-[#6F767E]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#EFEFEF] text-left text-xs text-[#9A9FA5]">
              <th className="cursor-pointer pb-2 pr-4 font-medium" onClick={() => toggleSort("name")}>
                Category<SortIcon active={sortKey === "name"} />
              </th>
              <th className="cursor-pointer pb-2 pr-4 text-right font-medium" onClick={() => toggleSort("budgeted")}>
                {isIncome ? "Target" : "Budgeted"}<SortIcon active={sortKey === "budgeted"} />
              </th>
              <th className="cursor-pointer pb-2 pr-4 text-right font-medium" onClick={() => toggleSort("actual")}>
                Actual<SortIcon active={sortKey === "actual"} />
              </th>
              <th className="cursor-pointer pb-2 pr-4 text-right font-medium" onClick={() => toggleSort("variance")}>
                Variance<SortIcon active={sortKey === "variance"} />
              </th>
              <th className="pb-2 text-right font-medium">%</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((cat) => {
              const exceeded = cat.variance < 0;
              const varColor = isIncome
                ? (exceeded ? "#6C9B8B" : "#E87C6B")
                : (exceeded ? "#E87C6B" : "#6C9B8B");
              const hasImbalance = cat.hasChildren && cat.imbalance !== 0;
              return (
                <tr
                  key={cat.accountGuid}
                  className={`border-b border-[#EFEFEF]/50 last:border-0 ${cat.hasChildren ? "cursor-pointer transition-colors hover:bg-[#F4F5F7]" : ""}`}
                  onClick={cat.hasChildren ? () => onDrillDown(cat.accountGuid) : undefined}
                >
                  <td className={`py-2.5 pr-4 font-medium ${cat.isUnbudgeted ? "italic text-[#9A9FA5]" : "text-[#1A1D1F]"}`} data-l>
                    <span className="flex items-center gap-1.5">
                      {cat.accountName}
                      {cat.hasChildren && (
                        <svg className="h-3 w-3 text-[#9A9FA5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      )}
                      {hasImbalance && (
                        <span
                          className="inline-flex items-center rounded px-1 py-0.5 text-[10px] font-medium"
                          style={{
                            backgroundColor: cat.imbalance > 0 ? "#E8B86B20" : "#E87C6B20",
                            color: cat.imbalance > 0 ? "#E8B86B" : "#E87C6B",
                          }}
                        >
                          {cat.imbalance > 0 ? "unallocated" : "over-allocated"}
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-[#6F767E]" data-v>{formatCurrency(cat.budgeted, currency)}</td>
                  <td className="py-2.5 pr-4 text-right text-[#1A1D1F]" data-v>{formatCurrency(cat.actual, currency)}</td>
                  <td className="py-2.5 pr-4 text-right font-medium" style={{ color: varColor }} data-v>
                    {exceeded ? "-" : "+"}{formatCurrency(Math.abs(cat.variance), currency)}
                  </td>
                  <td className="py-2.5 text-right text-xs" style={{ color: varColor }}>
                    {cat.budgeted > 0 ? `${Math.round(cat.variancePct)}%` : "—"}
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-[#9A9FA5]">No budgeted categories found</td>
              </tr>
            )}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr className="border-t border-[#EFEFEF] font-semibold">
                <td className="pt-2.5 pr-4 text-[#1A1D1F]">Total</td>
                <td className="pt-2.5 pr-4 text-right text-[#6F767E]" data-v>
                  {formatCurrency(sorted.reduce((s, c) => s + c.budgeted, 0), currency)}
                </td>
                <td className="pt-2.5 pr-4 text-right text-[#1A1D1F]" data-v>
                  {formatCurrency(sorted.reduce((s, c) => s + c.actual, 0), currency)}
                </td>
                {(() => {
                  const totalVar = sorted.reduce((s, c) => s + c.variance, 0);
                  const exceeded = totalVar < 0;
                  const color = isIncome
                    ? (exceeded ? "#6C9B8B" : "#E87C6B")
                    : (exceeded ? "#E87C6B" : "#6C9B8B");
                  return (
                    <>
                      <td className="pt-2.5 pr-4 text-right" style={{ color }} data-v>
                        {exceeded ? "-" : "+"}{formatCurrency(Math.abs(totalVar), currency)}
                      </td>
                      <td />
                    </>
                  );
                })()}
              </tr>
            </tfoot>
          )}
        </table>
      </CardContent>
    </Card>
  );
}
