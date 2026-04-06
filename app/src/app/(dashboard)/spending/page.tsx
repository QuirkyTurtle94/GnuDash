"use client";

import { useMemo } from "react";
import { useDashboard } from "@/lib/dashboard-context";
import { SpendingFilterProvider, useSpendingFilter } from "@/lib/spending-filter-context";
import { PERIOD_LABELS } from "@/lib/spending-utils";
import { PeriodSelector } from "@/components/ui/period-selector";
import { getDataRange } from "@/lib/period-utils";
import { SpendingPieCard } from "@/components/spending/spending-pie-card";
import { MonthlyExpenseBarCard } from "@/components/spending/monthly-expense-bar-card";
import { ExpenseTableCard } from "@/components/spending/expense-table-card";

function SpendingPeriodSelector() {
  const { period, setPeriod, customRange, setCustomRange, setSelectedMonth } = useSpendingFilter();
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
      onPeriodSideEffect={() => setSelectedMonth(null)}
    />
  );
}

function ActiveFilters() {
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
          <button
            onClick={() => setSelectedCategory(null)}
            className="text-[#6C9B8B] hover:underline"
          >
            All
          </button>
          {parts.map((part, i) => (
            <span key={i} className="flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {i < parts.length - 1 ? (
                <button
                  onClick={() => setSelectedCategory(parts.slice(0, i + 1).join(":"))}
                  className="text-[#6C9B8B] hover:underline"
                >
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
          className="flex items-center gap-1 rounded-full bg-[#6C9B8B]/10 px-2.5 py-0.5 text-xs font-medium text-[#6C9B8B] transition-colors hover:bg-[#6C9B8B]/20"
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
          className="flex items-center gap-1 rounded-full bg-[#6C9B8B]/10 px-2.5 py-0.5 text-xs font-medium text-[#6C9B8B] transition-colors hover:bg-[#6C9B8B]/20"
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

function SpendingContent() {
  const { data } = useDashboard();
  if (!data) return null;

  const c = data.currency;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Page header with period selector */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-lg font-semibold text-[#1A1D1F] sm:text-xl">Spending</h2>
          <ActiveFilters />
        </div>
        <SpendingPeriodSelector />
      </div>

      {/* Row 1: Pie + Bar chart */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        <SpendingPieCard
          monthlyExpenses={data.monthlyExpensesByCategory}
          categoryColors={data.expenseCategoryColors}
          currency={c}
        />
        <MonthlyExpenseBarCard
          monthlyExpenses={data.monthlyExpensesByCategory}
          currency={c}
        />
      </div>

      {/* Row 2: Expense transactions table */}
      <ExpenseTableCard
        transactions={data.expenseTransactions}
        currency={c}
      />
    </div>
  );
}

export default function SpendingPage() {
  return (
    <SpendingFilterProvider>
      <SpendingContent />
    </SpendingFilterProvider>
  );
}
