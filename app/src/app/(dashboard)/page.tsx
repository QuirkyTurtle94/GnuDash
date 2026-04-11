"use client";

import { useState, useMemo } from "react";
import { useDashboard } from "@/lib/dashboard-context";
import { useClosing } from "@/lib/closing-context";
import { type CustomRange, getDataRange } from "@/lib/period-utils";
import { NetWorthChart } from "@/components/dashboard/charts/net-worth-chart";
import { CashFlowChart } from "@/components/dashboard/charts/cash-flow-chart";
import { SpendingOverview } from "@/components/dashboard/charts/spending-overview";
import { IncomeOverview } from "@/components/dashboard/charts/income-overview";
import { BalancePie } from "@/components/dashboard/charts/balance-pie";
import { TopBalances } from "@/components/dashboard/charts/top-balances";

const ASSET_TYPES = new Set(["ASSET", "BANK", "CASH", "STOCK", "MUTUAL", "RECEIVABLE"]);
const LIABILITY_TYPES = new Set(["LIABILITY", "CREDIT", "PAYABLE"]);

const ASSET_COLORS = [
  "#4A7A6B", "#5C8C7C", "#6C9B8B", "#7DAA9A", "#8FB9A9",
  "#A0C8B8", "#B2D7C8", "#C3E5D7", "#D5F0E4", "#E0F5EC",
];

const LIABILITY_COLORS = [
  "#8B4A4A", "#9C5C5C", "#AD6E6E", "#BE8080", "#CF9292",
  "#E0A4A4", "#F1B6B6", "#F5C8C8", "#F9DADA", "#FDECEC",
];

export default function DashboardPage() {
  const { data } = useDashboard();
  const { excludeClosing } = useClosing();
  const [selectedAssetType, setSelectedAssetType] = useState<string | null>(null);
  const [period, setPeriod] = useState<string>("last-6m");
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);

  const dataRange = useMemo(
    () => getDataRange(data?.cashFlowSeries ?? []) ?? { min: "2020-01", max: "2026-01" },
    [data],
  );

  if (!data) return null;

  const c = data.currency;
  const activeIncome = excludeClosing && data.monthlyIncomeByCategoryExcludingClosing
    ? data.monthlyIncomeByCategoryExcludingClosing : data.monthlyIncomeByCategory;
  const activeIncomeColors = excludeClosing && data.incomeCategoryColorsExcludingClosing
    ? data.incomeCategoryColorsExcludingClosing : data.incomeCategoryColors;
  const activeExpenses = excludeClosing && data.monthlyExpensesByCategoryExcludingClosing
    ? data.monthlyExpensesByCategoryExcludingClosing : data.monthlyExpensesByCategory;
  const activeExpenseColors = excludeClosing && data.expenseCategoryColorsExcludingClosing
    ? data.expenseCategoryColorsExcludingClosing : data.expenseCategoryColors;
  const activeCashFlow = excludeClosing && data.cashFlowSeriesExcludingClosing
    ? data.cashFlowSeriesExcludingClosing : data.cashFlowSeries;
  const assetBalances = data.topBalances?.filter((b) => ASSET_TYPES.has(b.type)) ?? [];
  const liabilityBalances = data.topBalances?.filter((b) => LIABILITY_TYPES.has(b.type)) ?? [];

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      {/* Row 1: Net Worth (own period selector, defaults to all-time) */}
      <NetWorthChart
        series={data.netWorthSeries}
        currentNetWorth={data.currentNetWorth}
        currency={c}
      />

      {/* Row 2: Income Overview + Spending Overview (synced period) */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        <IncomeOverview
          monthlyIncome={activeIncome}
          categoryColors={activeIncomeColors}
          currency={c}
          linkTo="/income-expenses"
          externalPeriod={period}
          externalCustomRange={customRange}
          onExternalPeriodChange={setPeriod}
          onExternalCustomRangeChange={setCustomRange}
          externalDataRange={dataRange}
        />
        <SpendingOverview
          monthlyExpenses={activeExpenses}
          categoryColors={activeExpenseColors}
          currency={c}
          linkTo="/income-expenses"
          externalPeriod={period}
          externalCustomRange={customRange}
          onExternalPeriodChange={setPeriod}
          onExternalCustomRangeChange={setCustomRange}
          externalDataRange={dataRange}
        />
      </div>

      {/* Row 3: Net Income */}
      <CashFlowChart
        series={activeCashFlow}
        currentIncome={data.currentMonthIncome}
        currentExpenses={data.currentMonthExpenses}
        currency={c}
        externalPeriod={period}
        externalCustomRange={customRange}
        onExternalPeriodChange={setPeriod}
        onExternalCustomRangeChange={setCustomRange}
        externalDataRange={dataRange}
      />

      {/* Row 4: Assets + Liabilities */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
        <BalancePie
          balances={assetBalances}
          currency={c}
          title="Assets"
          accentColor="#6C9B8B"
          colorPalette={ASSET_COLORS}
          groupByType
          selectedSlice={selectedAssetType}
          onSelectSlice={setSelectedAssetType}
        />
        <BalancePie
          balances={liabilityBalances}
          currency={c}
          title="Liabilities"
          accentColor="#8B4A4A"
          colorPalette={LIABILITY_COLORS}
        />
      </div>

      {/* Row 5: Account Balances table */}
      {data.topBalances?.length > 0 && (
        <TopBalances balances={data.topBalances} currency={c} filterType={selectedAssetType} />
      )}
    </div>
  );
}
