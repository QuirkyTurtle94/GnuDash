"use client";

import { useState, useMemo, useEffect } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodSelector } from "@/components/ui/period-selector";
import { DepthSlider, CategoryFilter, LinkColorControl } from "@/components/sankey/sankey-controls";
import { useDashboard } from "@/lib/dashboard-context";
import { type CustomRange, getDataRange } from "@/lib/period-utils";
import {
  buildSankeyData,
  toEChartsFormat,
  getTopLevelCategories,
  SANKEY_PERIOD_LABELS,
  type SankeyPeriod,
  type LinkColorMode,
} from "@/lib/sankey-utils";

const SankeyECharts = dynamic(
  () => import("@/components/sankey/sankey-echarts").then((m) => ({ default: m.SankeyECharts })),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

function ChartSkeleton() {
  return (
    <div className="flex h-[500px] items-center justify-center text-sm text-[#9A9FA5]">
      Loading chart…
    </div>
  );
}

export default function SankeyPage() {
  const { data } = useDashboard();

  const [period, setPeriod] = useState<SankeyPeriod>("last-6m");
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);
  const [depth, setDepth] = useState(1);
  const [linkColorMode, setLinkColorMode] = useState<LinkColorMode>("source");
  const [greyColor, setGreyColor] = useState("#9A9FA5");

  const incomeCategories = useMemo(
    () => (data ? getTopLevelCategories(data.monthlyIncomeByCategory) : []),
    [data],
  );
  const expenseCategories = useMemo(
    () => (data ? getTopLevelCategories(data.monthlyExpensesByCategory) : []),
    [data],
  );

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
    () => getDataRange(data?.cashFlowSeries ?? []) ?? { min: "2020-01", max: "2026-01" },
    [data],
  );

  const sankeyData = useMemo(() => {
    if (!data || !initialized) return null;
    return buildSankeyData({
      incomeByCategory: data.monthlyIncomeByCategory,
      expenseByCategory: data.monthlyExpensesByCategory,
      cashFlowSeries: data.cashFlowSeries,
      incomeCategoryColors: data.incomeCategoryColors,
      expenseCategoryColors: data.expenseCategoryColors,
      period,
      depth,
      selectedIncomeCategories: selectedIncome,
      selectedExpenseCategories: selectedExpense,
      customRange: customRange ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, period, customRange, depth, incomeKey, expenseKey, initialized]);

  const echartsData = useMemo(
    () => (sankeyData ? toEChartsFormat(sankeyData, linkColorMode, greyColor) : null),
    [sankeyData, linkColorMode, greyColor],
  );

  if (!data) return null;

  const hasData = echartsData && echartsData.links.length > 0;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <Card className="shadow-sm border-[#EFEFEF]">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
            Cash Flow Sankey
          </CardTitle>

          <div className="flex items-center gap-3">
            <DepthSlider depth={depth} onChange={setDepth} />
            <LinkColorControl
              mode={linkColorMode}
              greyColor={greyColor}
              onModeChange={setLinkColorMode}
              onGreyColorChange={setGreyColor}
            />
            <PeriodSelector
              period={period}
              labels={SANKEY_PERIOD_LABELS}
              onChange={setPeriod}
              customRange={customRange}
              onCustomRangeChange={setCustomRange}
              dataRange={dataRange}
            />
          </div>
        </CardHeader>

        <CardContent>
          {/* Category filters */}
          <div className="mb-4 flex items-center gap-4">
            <CategoryFilter
              label="Income"
              categories={incomeCategories}
              selected={selectedIncome}
              onChange={setSelectedIncome}
              colors={data.incomeCategoryColors}
            />
            <CategoryFilter
              label="Expenses"
              categories={expenseCategories}
              selected={selectedExpense}
              onChange={setSelectedExpense}
              colors={data.expenseCategoryColors}
            />
          </div>

          {/* Chart */}
          {!hasData ? (
            <div className="flex h-[500px] items-center justify-center text-sm text-[#9A9FA5]">
              No data for the selected period and categories.
            </div>
          ) : (
            <SankeyECharts data={echartsData} currency={data.currency} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
