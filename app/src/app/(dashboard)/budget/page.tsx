"use client";

import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDashboard } from "@/lib/dashboard-context";
import { formatCurrency } from "@/lib/format";
import type { BudgetCategoryRow } from "@/lib/types/gnucash";

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function BudgetSelector({
  budgets,
  selected,
  onSelect,
}: {
  budgets: { guid: string; name: string }[];
  selected: string;
  onSelect: (guid: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = budgets.find((b) => b.guid === selected);

  if (budgets.length <= 1) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-[#EFEFEF] bg-white px-4 py-2 transition-colors hover:bg-[#F4F5F7]"
      >
        <span className="text-sm font-medium text-[#6F767E]">{current?.name ?? "Budget"}</span>
        <svg className="h-4 w-4 text-[#9A9FA5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-lg border border-[#EFEFEF] bg-white py-1 shadow-lg">
          {budgets.map((b) => (
            <button
              key={b.guid}
              onClick={() => { onSelect(b.guid); setOpen(false); }}
              className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-[#F4F5F7] ${
                selected === b.guid ? "font-medium text-[#6C9B8B]" : "text-[#6F767E]"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type ViewMode = "ytd" | "monthly" | "year";

function PeriodToggle({
  mode,
  onToggle,
}: {
  mode: ViewMode;
  onToggle: (mode: ViewMode) => void;
}) {
  const options: { value: ViewMode; label: string }[] = [
    { value: "ytd", label: "Year to Date" },
    { value: "monthly", label: "Monthly" },
    { value: "year", label: "Full Year" },
  ];
  return (
    <div className="flex rounded-lg border border-[#EFEFEF] bg-white">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onToggle(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === opt.value
              ? "bg-[#6C9B8B]/10 text-[#6C9B8B]"
              : "text-[#6F767E] hover:bg-[#F4F5F7]"
          } ${i === 0 ? "rounded-l-lg" : ""} ${i === options.length - 1 ? "rounded-r-lg" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function YearMonthSelector({
  selectedMonth,
  selectedYear,
  onSelectMonth,
  onSelectYear,
  numPeriods,
  availableYears,
  showMonths,
}: {
  selectedMonth: number;
  selectedYear: number;
  onSelectMonth: (m: number) => void;
  onSelectYear: (y: number) => void;
  numPeriods: number;
  availableYears: number[];
  showMonths: boolean;
}) {
  const months = MONTH_LABELS.slice(0, numPeriods);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Year selector */}
      <div className="flex gap-1">
        {availableYears.map((year) => (
          <button
            key={year}
            onClick={() => onSelectYear(year)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              selectedYear === year
                ? "bg-[#1A1D1F] text-white"
                : "bg-white text-[#6F767E] hover:bg-[#F4F5F7]"
            }`}
          >
            {year}
          </button>
        ))}
      </div>
      {/* Month selector */}
      {showMonths && (
        <>
          <div className="h-4 w-px bg-[#EFEFEF]" />
          <div className="flex flex-wrap gap-1">
            {months.map((label, i) => (
              <button
                key={i}
                onClick={() => onSelectMonth(i)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedMonth === i
                    ? "bg-[#6C9B8B] text-white"
                    : "bg-white text-[#6F767E] hover:bg-[#F4F5F7]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Breadcrumb({
  path,
  allCategories,
  onNavigate,
}: {
  path: string[];
  allCategories: BudgetCategoryRow[];
  onNavigate: (depth: number) => void;
}) {
  if (path.length === 0) return null;

  const categoryMap = new Map(allCategories.map((c) => [c.accountGuid, c]));

  return (
    <nav className="flex items-center gap-1 text-sm">
      <button
        onClick={() => onNavigate(-1)}
        className="font-medium text-[#6C9B8B] hover:underline"
      >
        All Categories
      </button>
      {path.map((guid, i) => {
        const cat = categoryMap.get(guid);
        const isLast = i === path.length - 1;
        return (
          <span key={guid} className="flex items-center gap-1">
            <svg className="h-3 w-3 text-[#9A9FA5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {isLast ? (
              <span className="font-medium text-[#1A1D1F]">{cat?.accountName ?? guid}</span>
            ) : (
              <button
                onClick={() => onNavigate(i)}
                className="font-medium text-[#6C9B8B] hover:underline"
              >
                {cat?.accountName ?? guid}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}

function ImbalanceBanner({
  parentCategory,
  currency,
  isIncome,
}: {
  parentCategory: BudgetCategoryRow;
  currency: string;
  isIncome: boolean;
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

function SummaryCard({
  totalBudgeted,
  totalActual,
  currency,
  isIncome = false,
  parentName,
  childCount,
}: {
  totalBudgeted: number;
  totalActual: number;
  currency: string;
  isIncome?: boolean;
  parentName?: string;
  childCount?: number;
}) {
  const remaining = totalBudgeted - totalActual;
  const pct = totalBudgeted > 0 ? (totalActual / totalBudgeted) * 100 : 0;
  const isOver = totalActual > totalBudgeted;
  const overColor = isIncome ? "#6C9B8B" : "#E87C6B";
  const underColor = isIncome ? "#E87C6B" : "#6C9B8B";
  const ringColor = isOver ? overColor : underColor;
  const statusColor = isOver ? overColor : underColor;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-[#6F767E]">
          {parentName ? (
            <span>{parentName} <span className="text-[#9A9FA5]">— {childCount} sub-budget{childCount !== 1 ? "s" : ""}</span></span>
          ) : (
            isIncome ? "Income Summary" : "Budget Summary"
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-6">
            <div className="relative h-28 w-28 shrink-0">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle
                  cx="50" cy="50" r="40"
                  fill="none"
                  stroke="#F4F5F7"
                  strokeWidth="10"
                />
                <circle
                  cx="50" cy="50" r="40"
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="10"
                  strokeDasharray={`${Math.min(pct, 100) * 2.51327} ${251.327}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-[#1A1D1F]" data-v>
                  {Math.round(pct)}%
                </span>
                <span className="text-[10px] text-[#9A9FA5]">{isIncome ? "earned" : "used"}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <div>
                <span className="text-[#9A9FA5]">{isIncome ? "Target" : "Budgeted"}</span>
                <p className="font-semibold text-[#1A1D1F]" data-v>{formatCurrency(totalBudgeted, currency)}</p>
              </div>
              <div>
                <span className="text-[#9A9FA5]">{isIncome ? "Earned" : "Spent"}</span>
                <p className="font-semibold text-[#1A1D1F]" data-v>{formatCurrency(totalActual, currency)}</p>
              </div>
              <div>
                <span className="text-[#9A9FA5]">
                  {isIncome
                    ? (isOver ? "Above target" : "Below target")
                    : (isOver ? "Over budget" : "Remaining")}
                </span>
                <p className="font-semibold" style={{ color: statusColor }} data-v>
                  {formatCurrency(Math.abs(remaining), currency)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ProgressBars({
  categories,
  currency,
  isIncome = false,
  ytdVarianceMap,
  onDrillDown,
  drillPath,
  allCategories,
  onBreadcrumbNavigate,
}: {
  categories: BudgetCategoryRow[];
  currency: string;
  isIncome?: boolean;
  ytdVarianceMap?: Map<string, number>;
  onDrillDown: (accountGuid: string) => void;
  drillPath: string[];
  allCategories: BudgetCategoryRow[];
  onBreadcrumbNavigate: (depth: number) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-1.5">
          <CardTitle className="text-sm font-medium text-[#6F767E]">Category Progress</CardTitle>
          {drillPath.length > 0 && (
            <Breadcrumb path={drillPath} allCategories={allCategories} onNavigate={onBreadcrumbNavigate} />
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

function VarianceTable({
  categories,
  currency,
  isIncome = false,
  onDrillDown,
}: {
  categories: BudgetCategoryRow[];
  currency: string;
  isIncome?: boolean;
  onDrillDown: (accountGuid: string) => void;
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
        <CardTitle className="text-sm font-medium text-[#6F767E]">Budget Variance</CardTitle>
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

function NoBudgetState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <div className="rounded-full bg-[#F4F5F7] p-4">
        <svg className="h-8 w-8 text-[#9A9FA5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      </div>
      <h3 className="text-sm font-medium text-[#1A1D1F]">No budgets found</h3>
      <p className="max-w-sm text-xs text-[#9A9FA5]">
        Create a budget in GNUCash to see your budget vs actual spending here.
        Go to Actions &gt; Budget &gt; New Budget in GNUCash.
      </p>
    </div>
  );
}

function computeFilteredCategories(
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

      // Recompute childBudgetTotal for this period
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

    // Recompute childBudgetTotal for this period range
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

type BudgetTab = "expense" | "income";

function BudgetContent({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  const [viewMode, setViewMode] = useState<ViewMode>("year");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedBudget, setSelectedBudget] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<BudgetTab>("expense");
  const [drillPath, setDrillPath] = useState<string[]>([]);

  const budgetData = data.budgetData;
  const yearStr = selectedYear.toString();
  const isIncome = activeTab === "income";

  const activeBudgetGuid = selectedBudget ?? budgetData?.budgets[0]?.guid ?? "";

  // Get categories for the selected budget
  const activeBudgetData = budgetData?.categoriesByBudget[activeBudgetGuid];

  const allExpenseCategories = useMemo(
    () => activeBudgetData
      ? computeFilteredCategories(activeBudgetData.expenseCategories, viewMode, selectedMonth, selectedYear, yearStr, budgetData?.budgets[0]?.numPeriods ?? 12)
      : [],
    [activeBudgetData, viewMode, selectedMonth, selectedYear, yearStr, budgetData],
  );

  const allIncomeCategories = useMemo(
    () => activeBudgetData
      ? computeFilteredCategories(activeBudgetData.incomeCategories, viewMode, selectedMonth, selectedYear, yearStr, budgetData?.budgets[0]?.numPeriods ?? 12)
      : [],
    [activeBudgetData, viewMode, selectedMonth, selectedYear, yearStr, budgetData],
  );

  // Reset drill path when switching budget or tab
  const handleBudgetSelect = useCallback((guid: string) => {
    setSelectedBudget(guid);
    setDrillPath([]);
  }, []);

  const handleTabChange = useCallback((tab: BudgetTab) => {
    setActiveTab(tab);
    setDrillPath([]);
  }, []);

  // All categories for the active tab (used for breadcrumb lookups)
  const allCategories = isIncome ? allIncomeCategories : allExpenseCategories;

  // Filter categories based on drill path
  const visibleCategories = useMemo(() => {
    if (drillPath.length === 0) {
      // Top level: show categories with no budgeted parent
      return allCategories.filter((c) => c.parentAccountGuid === null);
    }
    const currentParent = drillPath[drillPath.length - 1];
    return allCategories.filter((c) => c.parentAccountGuid === currentParent);
  }, [allCategories, drillPath]);

  // Get the parent category when drilled in (for imbalance banner and summary)
  const parentCategory = drillPath.length > 0
    ? allCategories.find((c) => c.accountGuid === drillPath[drillPath.length - 1])
    : undefined;

  const handleDrillDown = useCallback((accountGuid: string) => {
    setDrillPath((prev) => [...prev, accountGuid]);
  }, []);

  const handleBreadcrumbNavigate = useCallback((depth: number) => {
    if (depth < 0) {
      setDrillPath([]);
    } else {
      setDrillPath((prev) => prev.slice(0, depth + 1));
    }
  }, []);

  if (!budgetData || budgetData.budgets.length === 0) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6">
        <h2 className="text-lg font-semibold text-[#1A1D1F] sm:text-xl">Budget</h2>
        <NoBudgetState />
      </div>
    );
  }

  // Compute YTD variance per category (used in monthly view)
  const ytdVarianceMap = useMemo(() => {
    if (!activeBudgetData || viewMode !== "monthly") return new Map<string, number>();
    const source = isIncome ? activeBudgetData.incomeCategories : activeBudgetData.expenseCategories;
    const map = new Map<string, number>();
    for (const cat of source) {
      let ytdBudgeted = 0;
      let ytdActual = 0;
      for (const p of cat.periods) {
        if (p.period <= selectedMonth) {
          ytdBudgeted += p.budgeted;
          ytdActual += p.actual[yearStr] ?? 0;
        }
      }
      map.set(cat.accountGuid, ytdBudgeted - ytdActual);
    }
    return map;
  }, [activeBudgetData, viewMode, selectedMonth, yearStr, isIncome]);

  const c = data.currency;
  const hasIncome = (activeBudgetData?.incomeCategories.length ?? 0) > 0;

  // Use parent's budget/actual when drilled in, otherwise sum visible categories
  const totalBudgeted = parentCategory ? parentCategory.budgeted : visibleCategories.reduce((s, c) => s + c.budgeted, 0);
  const totalActual = parentCategory ? parentCategory.actual : visibleCategories.reduce((s, c) => s + c.actual, 0);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Page header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[#1A1D1F] sm:text-xl">Budget</h2>
        <div className="flex items-center gap-2">
          <PeriodToggle mode={viewMode} onToggle={setViewMode} />
          <BudgetSelector
            budgets={budgetData.budgets}
            selected={activeBudgetGuid}
            onSelect={handleBudgetSelect}
          />
        </div>
      </div>

      {/* Expense / Income tab */}
      {hasIncome && (
        <div className="flex gap-1 rounded-lg border border-[#EFEFEF] bg-white self-start">
          <button
            onClick={() => handleTabChange("expense")}
            className={`px-4 py-1.5 text-sm font-medium transition-colors rounded-lg ${
              activeTab === "expense"
                ? "bg-[#6C9B8B]/10 text-[#6C9B8B]"
                : "text-[#6F767E] hover:bg-[#F4F5F7]"
            }`}
          >
            Expenses
          </button>
          <button
            onClick={() => handleTabChange("income")}
            className={`px-4 py-1.5 text-sm font-medium transition-colors rounded-lg ${
              activeTab === "income"
                ? "bg-[#6C9B8B]/10 text-[#6C9B8B]"
                : "text-[#6F767E] hover:bg-[#F4F5F7]"
            }`}
          >
            Income
          </button>
        </div>
      )}

      {/* Year and month selectors */}
      <YearMonthSelector
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        onSelectMonth={setSelectedMonth}
        onSelectYear={setSelectedYear}
        numPeriods={budgetData.budgets[0].numPeriods}
        availableYears={budgetData.availableYears}
        showMonths={viewMode === "monthly"}
      />

      {/* Imbalance banner when drilled in */}
      {parentCategory && parentCategory.imbalance !== 0 && (
        <ImbalanceBanner parentCategory={parentCategory} currency={c} isIncome={isIncome} />
      )}

      {/* Row 1: Summary + Progress bars */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        <SummaryCard
          totalBudgeted={totalBudgeted}
          totalActual={totalActual}
          currency={c}
          isIncome={isIncome}
          parentName={parentCategory?.accountName}
          childCount={visibleCategories.length}
        />
        <ProgressBars
          categories={visibleCategories}
          currency={c}
          isIncome={isIncome}
          ytdVarianceMap={viewMode === "monthly" ? ytdVarianceMap : undefined}
          onDrillDown={handleDrillDown}
          drillPath={drillPath}
          allCategories={allCategories}
          onBreadcrumbNavigate={handleBreadcrumbNavigate}
        />
      </div>

      {/* Row 2: Variance table */}
      <VarianceTable
        categories={visibleCategories}
        currency={c}
        isIncome={isIncome}
        onDrillDown={handleDrillDown}
      />
    </div>
  );
}

export default function BudgetPage() {
  const { data } = useDashboard();
  if (!data) return null;
  return <BudgetContent data={data} />;
}
