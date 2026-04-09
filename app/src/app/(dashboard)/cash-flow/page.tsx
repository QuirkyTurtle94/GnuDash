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
import type { BudgetCategoryRow } from "@/lib/types/gnucash";

type CashFlowTab = "outflow" | "inflow";

const CASH_ACCOUNT_TYPES = new Set(["BANK", "CASH"]);

function filterTransfers(categories: BudgetCategoryRow[], accountMap: Map<string, { account_type: string }>, include: boolean): BudgetCategoryRow[] {
  if (include) return categories;
  return categories.filter((cat) => {
    const acc = accountMap.get(cat.accountGuid);
    return !acc || !CASH_ACCOUNT_TYPES.has(acc.account_type);
  });
}

function CashFlowContent({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  const [viewMode, setViewMode] = useState<ViewMode>("year");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedBudget, setSelectedBudget] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CashFlowTab>("outflow");
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [includeTransfers, setIncludeTransfers] = useState(true);

  const cashFlowData = data.cashFlowBudgetData;
  const yearStr = selectedYear.toString();
  const isInflow = activeTab === "inflow";

  const activeBudgetGuid = selectedBudget ?? cashFlowData?.budgets[0]?.guid ?? "";
  const activeBudgetData = cashFlowData?.categoriesByBudget[activeBudgetGuid];

  // Build a simple account type lookup from dashboard data
  const accountTypeMap = useMemo(() => {
    const map = new Map<string, { account_type: string }>();
    function walk(nodes: typeof data.accounts) {
      for (const node of nodes) {
        map.set(node.guid, { account_type: node.type });
        if (node.children) walk(node.children);
      }
    }
    walk(data.accounts);
    return map;
  }, [data.accounts]);

  const allOutflowCategories = useMemo(
    () => {
      const filtered = activeBudgetData
        ? computeFilteredCategories(activeBudgetData.outflowCategories, viewMode, selectedMonth, selectedYear, yearStr, cashFlowData?.budgets[0]?.numPeriods ?? 12)
        : [];
      return filterTransfers(filtered, accountTypeMap, includeTransfers);
    },
    [activeBudgetData, viewMode, selectedMonth, selectedYear, yearStr, cashFlowData, accountTypeMap, includeTransfers],
  );

  const allInflowCategories = useMemo(
    () => {
      const filtered = activeBudgetData
        ? computeFilteredCategories(activeBudgetData.inflowCategories, viewMode, selectedMonth, selectedYear, yearStr, cashFlowData?.budgets[0]?.numPeriods ?? 12)
        : [];
      return filterTransfers(filtered, accountTypeMap, includeTransfers);
    },
    [activeBudgetData, viewMode, selectedMonth, selectedYear, yearStr, cashFlowData, accountTypeMap, includeTransfers],
  );

  const handleBudgetSelect = useCallback((guid: string) => {
    setSelectedBudget(guid);
    setDrillPath([]);
  }, []);

  const handleTabChange = useCallback((tab: CashFlowTab) => {
    setActiveTab(tab);
    setDrillPath([]);
  }, []);

  const allCategories = isInflow ? allInflowCategories : allOutflowCategories;

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

  if (!cashFlowData || cashFlowData.budgets.length === 0) {
    return (
      <div className="flex flex-col gap-4 sm:gap-6">
        <h2 className="text-lg font-semibold text-[#1A1D1F] sm:text-xl">Cash Flow</h2>
        <NoBudgetState message="Create a budget in GNUCash to see your cash flow vs budget here. Go to Actions > Budget > New Budget in GNUCash." />
      </div>
    );
  }

  const ytdVarianceMap = useMemo(() => {
    if (!activeBudgetData || viewMode !== "monthly") return new Map<string, number>();
    const source = isInflow ? activeBudgetData.inflowCategories : activeBudgetData.outflowCategories;
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
  }, [activeBudgetData, viewMode, selectedMonth, yearStr, isInflow]);

  const c = data.currency;
  const hasInflows = allInflowCategories.length > 0;

  const totalBudgeted = parentCategory ? parentCategory.budgeted : visibleCategories.reduce((s, c) => s + c.budgeted, 0);
  const totalActual = parentCategory ? parentCategory.actual : visibleCategories.reduce((s, c) => s + c.actual, 0);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[#1A1D1F] sm:text-xl">Cash Flow</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Include transfers between bank/cash accounts">
            <div
              role="switch"
              aria-checked={includeTransfers}
              onClick={() => setIncludeTransfers(!includeTransfers)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIncludeTransfers(!includeTransfers); } }}
              tabIndex={0}
              className={`relative h-4 w-7 rounded-full transition-colors ${
                includeTransfers ? "bg-[#6C9B8B]" : "bg-[#D0D5DD]"
              }`}
            >
              <div
                className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
                  includeTransfers ? "translate-x-3.5" : "translate-x-0.5"
                }`}
              />
            </div>
            <span className="text-[11px] text-[#6F767E] whitespace-nowrap">Include transfers</span>
          </label>
          <PeriodToggle mode={viewMode} onToggle={setViewMode} />
          <BudgetSelector
            budgets={cashFlowData.budgets}
            selected={activeBudgetGuid}
            onSelect={handleBudgetSelect}
          />
        </div>
      </div>

      <div className="flex gap-1 rounded-lg border border-[#EFEFEF] bg-white self-start">
        <button
          onClick={() => handleTabChange("outflow")}
          className={`px-4 py-1.5 text-sm font-medium transition-colors rounded-lg ${
            activeTab === "outflow"
              ? "bg-[#6C9B8B]/10 text-[#6C9B8B]"
              : "text-[#6F767E] hover:bg-[#F4F5F7]"
          }`}
        >
          Outflows
        </button>
        {hasInflows && (
          <button
            onClick={() => handleTabChange("inflow")}
            className={`px-4 py-1.5 text-sm font-medium transition-colors rounded-lg ${
              activeTab === "inflow"
                ? "bg-[#6C9B8B]/10 text-[#6C9B8B]"
                : "text-[#6F767E] hover:bg-[#F4F5F7]"
            }`}
          >
            Inflows
          </button>
        )}
      </div>

      <YearMonthSelector
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        onSelectMonth={setSelectedMonth}
        onSelectYear={setSelectedYear}
        numPeriods={cashFlowData.budgets[0].numPeriods}
        availableYears={cashFlowData.availableYears}
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
          isIncome={isInflow}
          parentName={parentCategory?.accountName}
          childCount={visibleCategories.length}
          titleLabel={isInflow ? "Inflow Summary" : "Outflow Summary"}
          actualLabel={isInflow ? "Received" : "Spent"}
        />
        <ProgressBars
          categories={visibleCategories}
          currency={c}
          isIncome={isInflow}
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
        isIncome={isInflow}
        onDrillDown={handleDrillDown}
        title="Cash Flow Variance"
      />
    </div>
  );
}

export default function CashFlowPage() {
  const { data } = useDashboard();
  if (!data) return null;
  return <CashFlowContent data={data} />;
}
