"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodSelector } from "@/components/ui/period-selector";
import { DepthSlider, CategoryFilter } from "@/components/sankey/sankey-controls";
import { SpendingFilterProvider, useSpendingFilter } from "@/lib/spending-filter-context";
import { useDashboard } from "@/lib/dashboard-context";
import { useClosing } from "@/lib/closing-context";
import { PERIOD_LABELS, type TimePeriod } from "@/lib/spending-utils";
import { type CustomRange, getDataRange } from "@/lib/period-utils";
import { SpendingPieCard } from "@/components/spending/spending-pie-card";
import { MonthlyExpenseBarCard } from "@/components/spending/monthly-expense-bar-card";
import { ExpenseTableCard } from "@/components/spending/expense-table-card";
import { BudgetSelector } from "@/components/budget/budget-selector";
import { PeriodToggle } from "@/components/budget/period-toggle";
import { YearMonthSelector } from "@/components/budget/year-month-selector";
import { ImbalanceBanner } from "@/components/budget/imbalance-banner";
import { SummaryCard } from "@/components/budget/summary-card";
import { ProgressBars } from "@/components/budget/progress-bars";
import { VarianceTable } from "@/components/budget/variance-table";
import { NoBudgetState } from "@/components/budget/no-budget-state";
import { computeFilteredCategories, type ViewMode } from "@/components/budget/budget-utils";
import {
  buildSankeyData,
  toEChartsFormat,
  getTopLevelCategories,
  SANKEY_PERIOD_LABELS,
  type SankeyPeriod,
} from "@/lib/sankey-utils";

const SankeyECharts = dynamic(
  () => import("@/components/sankey/sankey-echarts").then((m) => ({ default: m.SankeyECharts })),
  { ssr: false, loading: () => <SankeySkeleton /> },
);

function SankeySkeleton() {
  return (
    <div className="flex h-[500px] items-center justify-center text-sm text-[#9A9FA5]">
      Loading chart…
    </div>
  );
}

// ── Shared period selector ──────────────────────────────────────────

function SharedPeriodSelector({
  period,
  setPeriod,
  customRange,
  setCustomRange,
}: {
  period: TimePeriod;
  setPeriod: (p: TimePeriod) => void;
  customRange: CustomRange | null;
  setCustomRange: (r: CustomRange) => void;
}) {
  const { data } = useDashboard();
  const dataRange = useMemo(
    () => getDataRange(data?.cashFlowSeries ?? []) ?? { min: "2020-01", max: "2026-01" },
    [data],
  );

  return (
    <PeriodSelector
      period={period}
      labels={PERIOD_LABELS}
      onChange={setPeriod}
      customRange={customRange}
      onCustomRangeChange={setCustomRange}
      dataRange={dataRange}
    />
  );
}

// ── Active filter breadcrumbs ───────────────────────────────────────

function ActiveFilters({ accentColor = "#6C9B8B" }: { accentColor?: string }) {
  const { selectedCategory, setSelectedCategory, selectedMonth, setSelectedMonth, selectedAccount, setSelectedAccount } = useSpendingFilter();
  if (!selectedCategory && !selectedMonth && !selectedAccount) return null;

  const parts = selectedCategory ? selectedCategory.split(":") : [];
  const monthLabel = selectedMonth
    ? new Date(selectedMonth + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" })
    : null;

  return (
    <div className="flex items-center gap-3 text-sm text-[#9A9FA5]">
      {selectedCategory && (
        <div className="flex items-center gap-1">
          <button onClick={() => setSelectedCategory(null)} className="hover:underline" style={{ color: accentColor }}>
            All
          </button>
          {parts.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {i < parts.length - 1 ? (
                <button onClick={() => setSelectedCategory(parts.slice(0, i + 1).join(":"))} className="hover:underline" style={{ color: accentColor }}>
                  {part}
                </button>
              ) : (
                <span className="font-medium text-[#1A1D1F]">{part}</span>
              )}
            </span>
          ))}
        </div>
      )}
      {selectedMonth && (
        <button
          onClick={() => setSelectedMonth(null)}
          className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
          style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
        >
          {monthLabel}
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
      {selectedAccount && (
        <button
          onClick={() => setSelectedAccount(null)}
          className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors"
          style={{ backgroundColor: `${accentColor}15`, color: accentColor }}
        >
          {selectedAccount.split(":").slice(-1)[0]}
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

// ── Budget panel (reusable for income or expense side) ──────────────

function BudgetPanel({ isIncome }: { isIncome: boolean }) {
  const { data } = useDashboard();
  const { selectedCategory } = useSpendingFilter();
  const [viewMode, setViewMode] = useState<ViewMode>("year");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedBudget, setSelectedBudget] = useState<string | null>(null);
  const [manualDrillPath, setManualDrillPath] = useState<string[]>([]);

  if (!data) return null;

  const budgetData = data.budgetData;
  if (!budgetData || budgetData.budgets.length === 0) {
    return <NoBudgetState />;
  }

  const yearStr = selectedYear.toString();
  const activeBudgetGuid = selectedBudget ?? budgetData.budgets[0]?.guid ?? "";
  const activeBudgetData = budgetData.categoriesByBudget[activeBudgetGuid];

  const sourceCategories = isIncome
    ? activeBudgetData?.incomeCategories
    : activeBudgetData?.expenseCategories;

  // Check if there are categories for this side
  if (!sourceCategories || sourceCategories.length === 0) {
    return (
      <div className="rounded-xl border border-[#EFEFEF] bg-white p-6 text-center text-sm text-[#9A9FA5]">
        No {isIncome ? "income" : "expense"} budget categories found.
      </div>
    );
  }

  // Sync pie chart's selectedCategory to the budget's drillPath.
  // Convert "Food:Groceries" name path → [guid1, guid2] by matching accountName at each level.
  let drillPath = manualDrillPath;
  if (selectedCategory && sourceCategories) {
    const nameParts = selectedCategory.split(":");
    const synced: string[] = [];
    let parentGuid: string | null = null;
    for (const name of nameParts) {
      const match = sourceCategories.find(
        (c) => c.accountName === name && c.parentAccountGuid === parentGuid,
      );
      if (match) {
        synced.push(match.accountGuid);
        parentGuid = match.accountGuid;
      } else {
        break;
      }
    }
    if (synced.length > 0) drillPath = synced;
  } else if (!selectedCategory) {
    drillPath = [];
  }

  return (
    <BudgetPanelInner
      isIncome={isIncome}
      budgetData={budgetData}
      activeBudgetGuid={activeBudgetGuid}
      activeBudgetData={activeBudgetData}
      sourceCategories={sourceCategories}
      viewMode={viewMode}
      setViewMode={setViewMode}
      selectedMonth={selectedMonth}
      setSelectedMonth={setSelectedMonth}
      selectedYear={selectedYear}
      setSelectedYear={setSelectedYear}
      selectedBudget={selectedBudget}
      setSelectedBudget={setSelectedBudget}
      drillPath={drillPath}
      setDrillPath={setManualDrillPath}
      currency={data.currency}
    />
  );
}

function BudgetPanelInner({
  isIncome,
  budgetData,
  activeBudgetGuid,
  activeBudgetData,
  sourceCategories,
  viewMode,
  setViewMode,
  selectedMonth,
  setSelectedMonth,
  selectedYear,
  setSelectedYear,
  selectedBudget,
  setSelectedBudget,
  drillPath,
  setDrillPath,
  currency,
}: {
  isIncome: boolean;
  budgetData: NonNullable<ReturnType<typeof useDashboard>["data"]>["budgetData"] & {};
  activeBudgetGuid: string;
  activeBudgetData: typeof budgetData extends null ? never : NonNullable<typeof budgetData>["categoriesByBudget"][string];
  sourceCategories: import("@/lib/types/gnucash").BudgetCategoryRow[];
  viewMode: ViewMode;
  setViewMode: (v: ViewMode) => void;
  selectedMonth: number;
  setSelectedMonth: (m: number) => void;
  selectedYear: number;
  setSelectedYear: (y: number) => void;
  selectedBudget: string | null;
  setSelectedBudget: (g: string | null) => void;
  drillPath: string[];
  setDrillPath: React.Dispatch<React.SetStateAction<string[]>>;
  currency: string;
}) {
  const yearStr = selectedYear.toString();

  const allCategories = useMemo(
    () => computeFilteredCategories(sourceCategories, viewMode, selectedMonth, selectedYear, yearStr, budgetData.budgets[0]?.numPeriods ?? 12),
    [sourceCategories, viewMode, selectedMonth, selectedYear, yearStr, budgetData],
  );

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
  }, [setDrillPath]);

  const handleBreadcrumbNavigate = useCallback((depth: number) => {
    if (depth < 0) {
      setDrillPath([]);
    } else {
      setDrillPath((prev) => prev.slice(0, depth + 1));
    }
  }, [setDrillPath]);

  const handleBudgetSelect = useCallback((guid: string) => {
    setSelectedBudget(guid);
    setDrillPath([]);
  }, [setSelectedBudget, setDrillPath]);

  const ytdVarianceMap = useMemo(() => {
    if (!activeBudgetData || viewMode !== "monthly") return new Map<string, number>();
    const map = new Map<string, number>();
    for (const cat of sourceCategories) {
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
  }, [activeBudgetData, viewMode, selectedMonth, yearStr, sourceCategories]);

  const totalBudgeted = parentCategory ? parentCategory.budgeted : visibleCategories.reduce((s, c) => s + c.budgeted, 0);
  const totalActual = parentCategory ? parentCategory.actual : visibleCategories.reduce((s, c) => s + c.actual, 0);

  return (
    <div className="flex flex-col gap-3 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-[#1A1D1F]">
          {isIncome ? "Income" : "Expense"} Budget
        </h3>
        <div className="flex flex-wrap items-center gap-1.5">
          <PeriodToggle mode={viewMode} onToggle={setViewMode} />
          <BudgetSelector
            budgets={budgetData.budgets}
            selected={activeBudgetGuid}
            onSelect={handleBudgetSelect}
          />
        </div>
      </div>

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
        <ImbalanceBanner parentCategory={parentCategory} currency={currency} />
      )}

      <SummaryCard
        totalBudgeted={totalBudgeted}
        totalActual={totalActual}
        currency={currency}
        isIncome={isIncome}
        parentName={parentCategory?.accountName}
        childCount={visibleCategories.length}
      />
      <ProgressBars
        categories={visibleCategories}
        currency={currency}
        isIncome={isIncome}
        ytdVarianceMap={viewMode === "monthly" ? ytdVarianceMap : undefined}
        onDrillDown={handleDrillDown}
        drillPath={drillPath}
        allCategories={allCategories}
        onBreadcrumbNavigate={handleBreadcrumbNavigate}
      />
      <VarianceTable
        categories={visibleCategories}
        currency={currency}
        isIncome={isIncome}
        onDrillDown={handleDrillDown}
      />
    </div>
  );
}

// ── Sankey section ──────────────────────────────────────────────────

function SankeySection() {
  const { data } = useDashboard();
  const { excludeClosing } = useClosing();

  const [period, setPeriod] = useState<SankeyPeriod>("last-6m");
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);
  const [depth, setDepth] = useState(1);

  const activeIncome = excludeClosing && data?.monthlyIncomeByCategoryExcludingClosing
    ? data.monthlyIncomeByCategoryExcludingClosing : data?.monthlyIncomeByCategory ?? [];
  const activeExpenses = excludeClosing && data?.monthlyExpensesByCategoryExcludingClosing
    ? data.monthlyExpensesByCategoryExcludingClosing : data?.monthlyExpensesByCategory ?? [];
  const activeCashFlow = excludeClosing && data?.cashFlowSeriesExcludingClosing
    ? data.cashFlowSeriesExcludingClosing : data?.cashFlowSeries ?? [];
  const activeIncomeColors = excludeClosing && data?.incomeCategoryColorsExcludingClosing
    ? data.incomeCategoryColorsExcludingClosing : data?.incomeCategoryColors ?? {};
  const activeExpenseColors = excludeClosing && data?.expenseCategoryColorsExcludingClosing
    ? data.expenseCategoryColorsExcludingClosing : data?.expenseCategoryColors ?? {};

  const incomeCategories = useMemo(() => getTopLevelCategories(activeIncome), [activeIncome]);
  const expenseCategories = useMemo(() => getTopLevelCategories(activeExpenses), [activeExpenses]);

  const [selectedIncome, setSelectedIncome] = useState<Set<string>>(new Set());
  const [selectedExpense, setSelectedExpense] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && incomeCategories.length > 0) {
      setSelectedIncome(new Set(incomeCategories));
      setSelectedExpense(new Set(expenseCategories));
      setInitialized(true);
    }
  }, [incomeCategories, expenseCategories, initialized]);

  const incomeKey = Array.from(selectedIncome).sort().join(",");
  const expenseKey = Array.from(selectedExpense).sort().join(",");

  const dataRange = useMemo(
    () => getDataRange(activeCashFlow) ?? { min: "2020-01", max: "2026-01" },
    [activeCashFlow],
  );

  const sankeyData = useMemo(() => {
    if (!data || !initialized) return null;
    return buildSankeyData({
      incomeByCategory: activeIncome,
      expenseByCategory: activeExpenses,
      cashFlowSeries: activeCashFlow,
      incomeCategoryColors: activeIncomeColors,
      expenseCategoryColors: activeExpenseColors,
      period,
      depth,
      selectedIncomeCategories: selectedIncome,
      selectedExpenseCategories: selectedExpense,
      customRange: customRange ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, period, customRange, depth, incomeKey, expenseKey, initialized, excludeClosing]);

  const echartsData = useMemo(
    () => (sankeyData ? toEChartsFormat(sankeyData, "source", "#9A9FA5") : null),
    [sankeyData],
  );

  if (!data) return null;
  const hasData = echartsData && echartsData.links.length > 0;

  return (
    <Card className="shadow-sm border-[#EFEFEF]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
          Income / Expense Flow
        </CardTitle>
        <PeriodSelector
          period={period}
          labels={SANKEY_PERIOD_LABELS}
          onChange={setPeriod}
          customRange={customRange}
          onCustomRangeChange={setCustomRange}
          dataRange={dataRange}
        />
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-4">
          <CategoryFilter label="Income" categories={incomeCategories} selected={selectedIncome} onChange={setSelectedIncome} colors={activeIncomeColors} />
          <CategoryFilter label="Expenses" categories={expenseCategories} selected={selectedExpense} onChange={setSelectedExpense} colors={activeExpenseColors} />
        </div>
        {!hasData ? (
          <div className="flex h-[500px] items-center justify-center text-sm text-[#9A9FA5]">
            No data for the selected period and categories.
          </div>
        ) : (
          <SankeyECharts
            data={echartsData}
            currency={data.currency}
            bottomBarLeft={<DepthSlider depth={depth} onChange={setDepth} />}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ── Side column (single SpendingFilterProvider per side) ─────────────

interface SelectionState {
  selectedCategory: string | null;
  setSelectedCategory: (path: string | null) => void;
  selectedMonth: string | null;
  setSelectedMonth: (month: string | null) => void;
  selectedAccount: string | null;
  setSelectedAccount: (path: string | null) => void;
  excluded: Set<string>;
  toggleExcluded: (fullPath: string) => void;
  clearExcluded: () => void;
}

function SideColumn({ isIncome, period, setPeriod, customRange, setCustomRange, selection }: {
  isIncome: boolean;
  period: TimePeriod;
  setPeriod: (p: TimePeriod) => void;
  customRange: CustomRange | null;
  setCustomRange: (r: CustomRange) => void;
  selection: SelectionState;
}) {
  const { data } = useDashboard();
  const { excludeClosing } = useClosing();
  if (!data) return null;

  const c = data.currency;

  const monthlyData = isIncome
    ? (excludeClosing && data.monthlyIncomeByCategoryExcludingClosing
        ? data.monthlyIncomeByCategoryExcludingClosing : data.monthlyIncomeByCategory)
    : (excludeClosing && data.monthlyExpensesByCategoryExcludingClosing
        ? data.monthlyExpensesByCategoryExcludingClosing : data.monthlyExpensesByCategory);
  const colors = isIncome
    ? (excludeClosing && data.incomeCategoryColorsExcludingClosing
        ? data.incomeCategoryColorsExcludingClosing : data.incomeCategoryColors)
    : (excludeClosing && data.expenseCategoryColorsExcludingClosing
        ? data.expenseCategoryColorsExcludingClosing : data.expenseCategoryColors);

  const accentColor = isIncome ? "#3B6B8A" : "#6C9B8B";

  return (
    <SpendingFilterProvider
      externalPeriod={period}
      externalSetPeriod={setPeriod}
      externalCustomRange={customRange}
      externalSetCustomRange={setCustomRange}
      externalSelectedCategory={selection.selectedCategory}
      externalSetSelectedCategory={selection.setSelectedCategory}
      externalSelectedMonth={selection.selectedMonth}
      externalSetSelectedMonth={selection.setSelectedMonth}
      externalSelectedAccount={selection.selectedAccount}
      externalSetSelectedAccount={selection.setSelectedAccount}
      externalExcluded={selection.excluded}
      externalToggleExcluded={selection.toggleExcluded}
      externalClearExcluded={selection.clearExcluded}
    >
      {/* On lg: subgrid so row heights are shared with the sibling column */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-rows-subgrid lg:row-span-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="text-base font-semibold text-[#1A1D1F]">{isIncome ? "Income" : "Expenses"}</h3>
          <ActiveFilters accentColor={accentColor} />
        </div>
        <SpendingPieCard
          monthlyExpenses={monthlyData}
          categoryColors={colors}
          currency={c}
          title={isIncome ? "Income Breakdown" : "Spending Breakdown"}
          accentColor={accentColor}
        />
        <MonthlyExpenseBarCard
          monthlyExpenses={monthlyData}
          currency={c}
          title={isIncome ? "Monthly Income" : "Monthly Spending"}
          {...(isIncome ? { barColor: "#3B6B8A", selectedBarColor: "#2A5070", fadedBarColor: "#CDE8F8" } : {})}
        />
        <BudgetPanel isIncome={isIncome} />
      </div>
    </SpendingFilterProvider>
  );
}

// ── Two-column layout ───────────────────────────────────────────────

function ChartColumns({ period, setPeriod, customRange, setCustomRange, incomeSelection, expenseSelection }: {
  period: TimePeriod;
  setPeriod: (p: TimePeriod) => void;
  customRange: CustomRange | null;
  setCustomRange: (r: CustomRange) => void;
  incomeSelection: SelectionState;
  expenseSelection: SelectionState;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:grid-rows-[repeat(4,auto)] lg:gap-5">
      <SideColumn isIncome period={period} setPeriod={setPeriod} customRange={customRange} setCustomRange={setCustomRange} selection={incomeSelection} />
      <SideColumn isIncome={false} period={period} setPeriod={setPeriod} customRange={customRange} setCustomRange={setCustomRange} selection={expenseSelection} />
    </div>
  );
}

// ── Tabbed transaction table ────────────────────────────────────────

function TransactionTabs({ period, customRange, incomeSelection, expenseSelection }: {
  period: TimePeriod;
  customRange: CustomRange | null;
  incomeSelection: SelectionState;
  expenseSelection: SelectionState;
}) {
  const { data } = useDashboard();
  const [activeTab, setActiveTab] = useState<"income" | "expense">("expense");
  if (!data) return null;

  const sel = activeTab === "income" ? incomeSelection : expenseSelection;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1 rounded-lg border border-[#EFEFEF] bg-white self-start">
        <button
          onClick={() => setActiveTab("income")}
          className={`px-4 py-1.5 text-sm font-medium transition-colors rounded-lg ${
            activeTab === "income"
              ? "bg-[#3B6B8A]/10 text-[#3B6B8A]"
              : "text-[#6F767E] hover:bg-[#F4F5F7]"
          }`}
        >
          Income
        </button>
        <button
          onClick={() => setActiveTab("expense")}
          className={`px-4 py-1.5 text-sm font-medium transition-colors rounded-lg ${
            activeTab === "expense"
              ? "bg-[#6C9B8B]/10 text-[#6C9B8B]"
              : "text-[#6F767E] hover:bg-[#F4F5F7]"
          }`}
        >
          Expenses
        </button>
      </div>
      <SpendingFilterProvider
        externalPeriod={period}
        externalCustomRange={customRange}
        externalSelectedCategory={sel.selectedCategory}
        externalSetSelectedCategory={sel.setSelectedCategory}
        externalSelectedMonth={sel.selectedMonth}
        externalSetSelectedMonth={sel.setSelectedMonth}
        externalSelectedAccount={sel.selectedAccount}
        externalSetSelectedAccount={sel.setSelectedAccount}
        externalExcluded={sel.excluded}
        externalToggleExcluded={sel.toggleExcluded}
        externalClearExcluded={sel.clearExcluded}
      >
        {activeTab === "income" ? (
          <ExpenseTableCard transactions={data.incomeTransactions} currency={data.currency} title="Income" />
        ) : (
          <ExpenseTableCard transactions={data.expenseTransactions} currency={data.currency} />
        )}
      </SpendingFilterProvider>
    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────

function IncomeExpensesContent() {
  const { data } = useDashboard();
  const [period, setPeriod] = useState<TimePeriod>("last-12m");
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);

  // Lifted selection state so pie charts and transaction table share it
  const [incomeCategory, setIncomeCategory] = useState<string | null>(null);
  const [incomeMonth, setIncomeMonth] = useState<string | null>(null);
  const [incomeAccount, setIncomeAccount] = useState<string | null>(null);
  const [incomeExcluded, setIncomeExcluded] = useState<Set<string>>(new Set());
  const [expenseCategory, setExpenseCategory] = useState<string | null>(null);
  const [expenseMonth, setExpenseMonth] = useState<string | null>(null);
  const [expenseAccount, setExpenseAccount] = useState<string | null>(null);
  const [expenseExcluded, setExpenseExcluded] = useState<Set<string>>(new Set());

  const toggleIncomeExcluded = useCallback((fp: string) => setIncomeExcluded((prev) => { const n = new Set(prev); n.has(fp) ? n.delete(fp) : n.add(fp); return n; }), []);
  const clearIncomeExcluded = useCallback(() => setIncomeExcluded(new Set()), []);
  const toggleExpenseExcluded = useCallback((fp: string) => setExpenseExcluded((prev) => { const n = new Set(prev); n.has(fp) ? n.delete(fp) : n.add(fp); return n; }), []);
  const clearExpenseExcluded = useCallback(() => setExpenseExcluded(new Set()), []);

  const incomeSelection: SelectionState = {
    selectedCategory: incomeCategory, setSelectedCategory: setIncomeCategory,
    selectedMonth: incomeMonth, setSelectedMonth: setIncomeMonth,
    selectedAccount: incomeAccount, setSelectedAccount: setIncomeAccount,
    excluded: incomeExcluded, toggleExcluded: toggleIncomeExcluded, clearExcluded: clearIncomeExcluded,
  };
  const expenseSelection: SelectionState = {
    selectedCategory: expenseCategory, setSelectedCategory: setExpenseCategory,
    selectedMonth: expenseMonth, setSelectedMonth: setExpenseMonth,
    selectedAccount: expenseAccount, setSelectedAccount: setExpenseAccount,
    excluded: expenseExcluded, toggleExcluded: toggleExpenseExcluded, clearExcluded: clearExpenseExcluded,
  };

  if (!data) return null;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Sankey diagram at top */}
      <SankeySection />

      {/* Page header with shared period selector */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[#1A1D1F] sm:text-xl">Income / Expenses</h2>
        <SharedPeriodSelector
          period={period}
          setPeriod={setPeriod}
          customRange={customRange}
          setCustomRange={setCustomRange}
        />
      </div>

      {/* Two-column layout: income left, expenses right */}
      <ChartColumns
        period={period}
        setPeriod={setPeriod}
        customRange={customRange}
        setCustomRange={setCustomRange}
        incomeSelection={incomeSelection}
        expenseSelection={expenseSelection}
      />

      {/* Tabbed transaction table — shares selection state with pie charts */}
      <TransactionTabs
        period={period}
        customRange={customRange}
        incomeSelection={incomeSelection}
        expenseSelection={expenseSelection}
      />
    </div>
  );
}

export default function IncomeExpensesPage() {
  return <IncomeExpensesContent />;
}
