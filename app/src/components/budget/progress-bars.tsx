"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { Breadcrumb } from "./breadcrumb";
import type { BudgetCategoryRow } from "@/lib/types/gnucash";

export function ProgressBars({
  categories,
  currency,
  isIncome = false,
  ytdVarianceMap,
  onDrillDown,
  drillPath,
  allCategories,
  onBreadcrumbNavigate,
  accentColor = "#6C9B8B",
}: {
  categories: BudgetCategoryRow[];
  currency: string;
  isIncome?: boolean;
  ytdVarianceMap?: Map<string, number>;
  onDrillDown: (accountGuid: string) => void;
  drillPath: string[];
  allCategories: BudgetCategoryRow[];
  onBreadcrumbNavigate: (depth: number) => void;
  accentColor?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-sm font-medium text-[#6F767E]">Category Progress</CardTitle>
          {drillPath.length > 0 && (
            <Breadcrumb path={drillPath} allCategories={allCategories} onNavigate={onBreadcrumbNavigate} accentColor={accentColor} />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          {categories.map((cat) => {
            const pct = cat.budgeted > 0 ? (cat.actual / cat.budgeted) * 100 : (cat.actual > 0 ? 100 : 0);
            const isOver = cat.actual > cat.budgeted;
            const barColor = isIncome
              ? (pct >= 100 ? "#6C9B8B" : pct >= 80 ? "#E8B86B" : "#E87C6B")
              : (pct > 100 ? "#E87C6B" : pct > 80 ? "#E8B86B" : "#6C9B8B");

            const monthVariance = cat.budgeted - cat.actual;
            const monthIsOver = monthVariance < 0;
            const monthColor = isIncome
              ? (monthIsOver ? "#6C9B8B" : "#E87C6B")
              : (monthIsOver ? "#E87C6B" : "#6C9B8B");

            const ytdVariance = ytdVarianceMap?.get(cat.accountGuid);
            const hasYtd = ytdVariance !== undefined;
            const ytdIsOver = hasYtd && ytdVariance < 0;
            const ytdColor = isIncome
              ? (ytdIsOver ? "#6C9B8B" : "#E87C6B")
              : (ytdIsOver ? "#E87C6B" : "#6C9B8B");

            const hasImbalance = cat.hasChildren && cat.imbalance !== 0;

            return (
              <div
                key={cat.accountGuid}
                className={`flex flex-col gap-1 ${cat.hasChildren ? "cursor-pointer rounded-lg px-2 py-1.5 -mx-2 transition-colors hover:bg-[#F4F5F7]" : ""}`}
                onClick={cat.hasChildren ? () => onDrillDown(cat.accountGuid) : undefined}
              >
                <div className="flex items-center justify-between text-xs">
                  <span className={`flex items-center gap-1.5 font-medium ${cat.isUnbudgeted ? "italic text-[#9A9FA5]" : "text-[#1A1D1F]"}`} data-l>
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
                  <span className="text-[#9A9FA5]" data-v>
                    {formatCurrency(cat.actual, currency)} / {formatCurrency(cat.budgeted, currency)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#F4F5F7]">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(pct, 100)}%`,
                      backgroundColor: barColor,
                    }}
                  />
                </div>
                {hasYtd ? (
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium" style={{ color: monthColor }} data-v>
                      {monthIsOver ? "-" : "+"}{formatCurrency(Math.abs(monthVariance), currency)} this month
                    </span>
                    <span className="text-[10px] font-medium" style={{ color: ytdColor }} data-v>
                      {ytdIsOver ? "-" : "+"}{formatCurrency(Math.abs(ytdVariance), currency)} YTD
                    </span>
                  </div>
                ) : isOver && (
                  <span className="text-[10px] font-medium" style={{ color: monthColor }} data-v>
                    {formatCurrency(Math.abs(monthVariance), currency)} {isIncome ? "above target" : "over budget"}
                  </span>
                )}
              </div>
            );
          })}
          {categories.length === 0 && (
            <p className="py-4 text-center text-sm text-[#9A9FA5]">No budgeted categories found</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
