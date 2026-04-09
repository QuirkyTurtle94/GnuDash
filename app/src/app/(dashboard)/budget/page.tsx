"use client";

import { useState, useMemo, useCallback } from "react";
import { useDashboard } from "@/lib/dashboard-context";
import { BudgetSelector } from "@/components/budget/budget-selector";
import { PeriodToggle } from "@/components/budget/period-toggle";
import { YearMonthSelector } from "@/components/budget/year-month-selector";
import { ImbalanceBanner } from "@/components/budget/imbalance-banner";
import { SummaryCard } from "@/components/budget/summary-card";
import { ProgressBars } from "@/components/budget/progress-bars";
import { VarianceTable } from "@/components/budget/variance-table";
import { NoBudgetState } from "@/components/budget/no-budget-state";
import { computeFilteredCategories, type ViewMode } from "@/components/budget/budget-utils";

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

  const handleBudgetSelect = useCallback((guid: string) => {
    setSelectedBudget(guid);
    setDrillPath([]);
  }, []);

  const handleTabChange = useCallback((tab: BudgetTab) => {
    setActiveTab(tab);
    setDrillPath([]);
  }, []);

  const allCategories = isIncome ? allIncomeCategories : allExpenseCategories;

  const visibleCategories = useMemo(() => {
    if (drillPath.length === 0) {
      return allCategories.filter((c) => c.parentAccountGuid === null);
    }
    const currentParent = drillPath[drillPath.length - 1];
    return allCategories.filter((c) => c.parentAccountGuid === currentParent);
  }, [allCategories, drillPath]);

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

  const totalBudgeted = parentCategory ? parentCategory.budgeted : visibleCategories.reduce((s, c) => s + c.budgeted, 0);
  const totalActual = parentCategory ? parentCategory.actual : visibleCategories.reduce((s, c) => s + c.actual, 0);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
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

      <YearMonthSelector
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        onSelectMonth={setSelectedMonth}
        onSelectYear={setSelectedYear}
        numPeriods={budgetData.budgets[0].numPeriods}
        availableYears={budgetData.availableYears}
        showMonths={viewMode === "monthly"}
      />

      {parentCategory && parentCategory.imbalance !== 0 && (
        <ImbalanceBanner parentCategory={parentCategory} currency={c} />
      )}

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
