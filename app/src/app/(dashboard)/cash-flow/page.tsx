"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import dynamic from "next/dynamic";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodSelector } from "@/components/ui/period-selector";
import { DepthSlider, CategoryFilter } from "@/components/sankey/sankey-controls";
import { useDashboard } from "@/lib/dashboard-context";
import { useClosing } from "@/lib/closing-context";
import { type CustomRange, getDataRange } from "@/lib/period-utils";
import { BudgetSelector } from "@/components/budget/budget-selector";
import { PeriodToggle } from "@/components/budget/period-toggle";
import { YearMonthSelector } from "@/components/budget/year-month-selector";
import { ImbalanceBanner } from "@/components/budget/imbalance-banner";
import { SummaryCard } from "@/components/budget/summary-card";
import { ProgressBars } from "@/components/budget/progress-bars";
import { NoBudgetState } from "@/components/budget/no-budget-state";
import { computeFilteredCategories, type ViewMode } from "@/components/budget/budget-utils";
import {
  buildCashFlowSankeyData,
  toEChartsFormat,
  getTopLevelCategories,
  getMonthsForPeriod,
  SANKEY_PERIOD_LABELS,
  type SankeyPeriod,
} from "@/lib/sankey-utils";
import { formatCurrency, formatCurrencyShort } from "@/lib/format";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { BudgetCategoryRow, LedgerTransaction } from "@/lib/types/gnucash";

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

// ── Cash Flow Sankey (controlled — state lives in parent) ───────────

interface SankeyFilterState {
  period: SankeyPeriod;
  setPeriod: (p: SankeyPeriod) => void;
  customRange: CustomRange | null;
  setCustomRange: (r: CustomRange) => void;
  selectedInflow: Set<string>;
  setSelectedInflow: (s: Set<string>) => void;
  selectedOutflow: Set<string>;
  setSelectedOutflow: (s: Set<string>) => void;
}

function CashFlowSankeySection({ filters }: { filters: SankeyFilterState }) {
  const { data } = useDashboard();
  const { excludeClosing } = useClosing();
  const [depth, setDepth] = useState(1);

  const { period, setPeriod, customRange, setCustomRange, selectedInflow, setSelectedInflow, selectedOutflow, setSelectedOutflow } = filters;

  const activeInflow = excludeClosing && data?.monthlyCashInflowByCategoryExcludingClosing
    ? data.monthlyCashInflowByCategoryExcludingClosing : data?.monthlyCashInflowByCategory ?? [];
  const activeOutflow = excludeClosing && data?.monthlyCashOutflowByCategoryExcludingClosing
    ? data.monthlyCashOutflowByCategoryExcludingClosing : data?.monthlyCashOutflowByCategory ?? [];
  const activeCashFlow = excludeClosing && data?.cashFlowSeriesExcludingClosing
    ? data.cashFlowSeriesExcludingClosing : data?.cashFlowSeries ?? [];
  const activeInflowColors = excludeClosing && data?.cashInflowCategoryColorsExcludingClosing
    ? data.cashInflowCategoryColorsExcludingClosing : data?.cashInflowCategoryColors ?? {};
  const activeOutflowColors = excludeClosing && data?.cashOutflowCategoryColorsExcludingClosing
    ? data.cashOutflowCategoryColorsExcludingClosing : data?.cashOutflowCategoryColors ?? {};

  const inflowCategories = useMemo(() => getTopLevelCategories(activeInflow), [activeInflow]);
  const outflowCategories = useMemo(() => getTopLevelCategories(activeOutflow), [activeOutflow]);

  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized && inflowCategories.length > 0) {
      setSelectedInflow(new Set(inflowCategories));
      setSelectedOutflow(new Set(outflowCategories));
      setInitialized(true);
    }
  }, [inflowCategories, outflowCategories, initialized, setSelectedInflow, setSelectedOutflow]);

  const inflowKey = Array.from(selectedInflow).sort().join(",");
  const outflowKey = Array.from(selectedOutflow).sort().join(",");

  const sankeyData = useMemo(() => {
    if (!data || !initialized) return null;
    return buildCashFlowSankeyData({
      inflowByCategory: activeInflow,
      outflowByCategory: activeOutflow,
      cashFlowSeries: activeCashFlow,
      inflowCategoryColors: activeInflowColors,
      outflowCategoryColors: activeOutflowColors,
      period,
      depth,
      selectedInflowCategories: selectedInflow,
      selectedOutflowCategories: selectedOutflow,
      customRange: customRange ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, period, customRange, depth, inflowKey, outflowKey, initialized, excludeClosing]);

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
          Cash Flow
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex items-center gap-4">
          <CategoryFilter label="Inflows" categories={inflowCategories} selected={selectedInflow} onChange={setSelectedInflow} colors={activeInflowColors} />
          <CategoryFilter label="Outflows" categories={outflowCategories} selected={selectedOutflow} onChange={setSelectedOutflow} colors={activeOutflowColors} />
        </div>
        {!hasData ? (
          <div className="flex h-[500px] items-center justify-center text-sm text-[#9A9FA5]">
            No cash flow data for the selected period and categories.
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

// ── Monthly Cash Flow Bar Chart ─────────────────────────────────────

function prevCalMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[parseInt(m) - 1] ?? m} '${year.slice(2)}`;
}

function CashFlowBarChart({ filters }: { filters: SankeyFilterState }) {
  const { data } = useDashboard();
  const { excludeClosing } = useClosing();
  const { period, setPeriod, customRange, setCustomRange } = filters;

  const activeInflow = excludeClosing && data?.monthlyCashInflowByCategoryExcludingClosing
    ? data.monthlyCashInflowByCategoryExcludingClosing : data?.monthlyCashInflowByCategory ?? [];
  const activeOutflow = excludeClosing && data?.monthlyCashOutflowByCategoryExcludingClosing
    ? data.monthlyCashOutflowByCategoryExcludingClosing : data?.monthlyCashOutflowByCategory ?? [];
  const activeCashFlow = excludeClosing && data?.cashFlowSeriesExcludingClosing
    ? data.cashFlowSeriesExcludingClosing : data?.cashFlowSeries ?? [];

  const dataRange = useMemo(
    () => getDataRange(activeCashFlow) ?? { min: "2020-01", max: "2026-01" },
    [activeCashFlow],
  );

  const validMonths = useMemo(
    () => getMonthsForPeriod(activeCashFlow, period, customRange ?? undefined),
    [activeCashFlow, period, customRange],
  );

  const netWorthMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of data?.netWorthSeries ?? []) map.set(row.month, row.netWorth);
    return map;
  }, [data]);

  const chartData = useMemo(() => {
    // Aggregate inflow/outflow by month
    const monthMap = new Map<string, { inflow: number; outflow: number }>();
    for (const row of activeInflow) {
      if (!validMonths.has(row.month)) continue;
      const entry = monthMap.get(row.month) ?? { inflow: 0, outflow: 0 };
      entry.inflow += row.amount;
      monthMap.set(row.month, entry);
    }
    for (const row of activeOutflow) {
      if (!validMonths.has(row.month)) continue;
      const entry = monthMap.get(row.month) ?? { inflow: 0, outflow: 0 };
      entry.outflow += row.amount;
      monthMap.set(row.month, entry);
    }
    return [...monthMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { inflow, outflow }]) => {
        const prevMonth = prevCalMonth(month);
        const nw = netWorthMap.get(month);
        const nwPrev = netWorthMap.get(prevMonth);
        const savingsRate =
          inflow > 0 && nw !== undefined && nwPrev !== undefined
            ? Math.max(-100, Math.min(100, ((nw - nwPrev) / inflow) * 100))
            : null;
        return { month, inflow, outflow, net: inflow - outflow, savingsRate };
      });
  }, [activeInflow, activeOutflow, validMonths, netWorthMap]);

  if (!data || chartData.length === 0) return null;

  const currency = data.currency;
  const totalNet = chartData.reduce((s, d) => s + d.net, 0);
  const totalInflow = chartData.reduce((s, d) => s + d.inflow, 0);
  const totalSavingsRate = (() => {
    const months = chartData.map((d) => d.month).sort();
    const firstMonth = months[0];
    const lastMonth = months[months.length - 1];
    const nwEnd = netWorthMap.get(lastMonth);
    const nwStart = netWorthMap.get(prevCalMonth(firstMonth));
    if (totalInflow <= 0 || nwEnd === undefined || nwStart === undefined) return null;
    return Math.max(-100, Math.min(100, ((nwEnd - nwStart) / totalInflow) * 100));
  })();

  return (
    <Card className="shadow-sm border-[#EFEFEF]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
          Monthly Cash Flow
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
        <div className="mb-1 flex items-baseline gap-3">
          <span className="text-3xl font-bold tracking-tight text-[#1A1D1F]" data-v>
            {formatCurrency(totalNet, currency)}
          </span>
          {totalSavingsRate !== null && (
            <span className={`text-lg font-semibold ${totalSavingsRate >= 0 ? "text-[#6C9B8B]" : "text-[#F87171]"}`}>
              {totalSavingsRate >= 0 ? "+" : ""}{totalSavingsRate.toFixed(1)}%
            </span>
          )}
        </div>
        {totalSavingsRate !== null && (
          <p className="mb-1 text-xs text-[#9A9FA5]">savings rate</p>
        )}

        <div className="mb-4 flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-[#3B6B8A]" />
            <span className="text-xs text-[#6F767E]">Inflow</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-[#F87171]" />
            <span className="text-xs text-[#6F767E]">Outflow</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-0.5 w-4 border-t-2 border-dashed border-[#1A1D1F]" />
            <span className="text-xs text-[#6F767E]">Net</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-0.5 w-4 border-t-2 border-solid border-[#6C9B8B]" />
            <span className="text-xs text-[#6F767E]">Savings rate</span>
          </div>
        </div>

        {chartData.length > 1 ? (
          <div className="h-55 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={1}>
              <ComposedChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonthLabel}
                  tick={{ fontSize: 11, fill: "#9A9FA5" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  yAxisId="amount"
                  tickFormatter={(v) => formatCurrencyShort(v, currency)}
                  tick={{ fontSize: 11, fill: "#9A9FA5" }}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <YAxis
                  yAxisId="rate"
                  orientation="right"
                  domain={[-100, 100]}
                  tickFormatter={(v: number) => `${v.toFixed(0)}%`}
                  tick={{ fontSize: 11, fill: "#9A9FA5" }}
                  axisLine={false}
                  tickLine={false}
                  width={36}
                />
                <Tooltip
                  formatter={(value, name) => {
                    if (name === "savingsRate") return [`${Number(value).toFixed(1)}%`, "Savings rate"];
                    return [
                      formatCurrency(Number(value), currency),
                      String(name).charAt(0).toUpperCase() + String(name).slice(1),
                    ];
                  }}
                  labelFormatter={(label) => {
                    if (typeof label !== "string") return label;
                    const [y, m] = label.split("-");
                    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                    return `${months[parseInt(m) - 1]} ${y}`;
                  }}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #EFEFEF",
                    borderRadius: "10px",
                    fontSize: "13px",
                  }}
                />
                <Bar yAxisId="amount" dataKey="inflow" fill="#3B6B8A" radius={[3, 3, 0, 0]} barSize={14} />
                <Bar yAxisId="amount" dataKey="outflow" fill="#F87171" radius={[3, 3, 0, 0]} barSize={14} />
                <Line yAxisId="amount" type="monotone" dataKey="net" stroke="#1A1D1F" strokeWidth={2} strokeDasharray="6 4" dot={false} />
                <Line yAxisId="rate" type="monotone" dataKey="savingsRate" stroke="#6C9B8B" strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex gap-4 pt-2">
            <div className="flex-1 rounded-xl bg-[#F4F5F7] p-4">
              <p className="text-xs text-[#9A9FA5]">Inflow</p>
              <p className="mt-1 text-xl font-bold text-[#3B6B8A]" data-v>
                {formatCurrency(chartData[0]?.inflow ?? 0, currency)}
              </p>
            </div>
            <div className="flex-1 rounded-xl bg-[#F4F5F7] p-4">
              <p className="text-xs text-[#9A9FA5]">Outflow</p>
              <p className="mt-1 text-xl font-bold text-[#F87171]" data-v>
                {formatCurrency(chartData[0]?.outflow ?? 0, currency)}
              </p>
            </div>
            <div className="flex-1 rounded-xl bg-[#F4F5F7] p-4">
              <p className="text-xs text-[#9A9FA5]">Net</p>
              <p className={`mt-1 text-xl font-bold ${(chartData[0]?.net ?? 0) >= 0 ? "text-[#3B6B8A]" : "text-[#F87171]"}`} data-v>
                {formatCurrency(chartData[0]?.net ?? 0, currency)}
              </p>
            </div>
            {totalSavingsRate !== null && (
              <div className="flex-1 rounded-xl bg-[#F4F5F7] p-4">
                <p className="text-xs text-[#9A9FA5]">Savings rate</p>
                <p className={`mt-1 text-xl font-bold ${totalSavingsRate >= 0 ? "text-[#6C9B8B]" : "text-[#F87171]"}`} data-v>
                  {totalSavingsRate >= 0 ? "+" : ""}{totalSavingsRate.toFixed(1)}%
                </p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Cash Flow Transactions Table ────────────────────────────────────

const BANK_CASH = new Set(["BANK", "CASH"]);
const TX_PAGE_SIZE = 25;

/**
 * Transaction table filtered by the Sankey's period and category selections.
 * Shows transactions that involve a BANK/CASH split where a counterparty
 * matches the selected inflow/outflow categories.
 */
function CashFlowTransactions({ filters }: { filters: SankeyFilterState }) {
  const { data } = useDashboard();
  const { excludeClosing } = useClosing();
  const [page, setPage] = useState(0);

  const { period, customRange, selectedInflow, selectedOutflow } = filters;

  const activeCashFlow = excludeClosing && data?.cashFlowSeriesExcludingClosing
    ? data.cashFlowSeriesExcludingClosing : data?.cashFlowSeries ?? [];

  const validMonths = useMemo(
    () => getMonthsForPeriod(activeCashFlow, period, customRange ?? undefined),
    [activeCashFlow, period, customRange],
  );

  const allSelected = useMemo(
    () => new Set([...selectedInflow, ...selectedOutflow]),
    [selectedInflow, selectedOutflow],
  );

  const filtered = useMemo(() => {
    if (!data) return [];

    return data.ledgerTransactions
      .filter((tx) => {
        // Period filter
        const txMonth = tx.date.substring(0, 7);
        if (!validMonths.has(txMonth)) return false;

        // Must have at least one BANK/CASH split
        const hasCash = tx.splits.some((s) => BANK_CASH.has(s.accountType));
        if (!hasCash) return false;

        // At least one non-cash split must match the selected categories
        return tx.splits.some((s) => {
          if (BANK_CASH.has(s.accountType)) return false;
          const topLevel = s.accountFullPath.split(":")[0];
          return allSelected.has(topLevel);
        });
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [data, validMonths, allSelected]);

  // Reset page when filters change
  const filterKey = `${period}-${customRange?.start}-${customRange?.end}-${Array.from(allSelected).sort().join(",")}`;
  useMemo(() => setPage(0), [filterKey]);

  if (!data || filtered.length === 0) return null;

  const totalPages = Math.ceil(filtered.length / TX_PAGE_SIZE);
  const pageData = filtered.slice(page * TX_PAGE_SIZE, (page + 1) * TX_PAGE_SIZE);
  const currency = data.currency;

  return (
    <Card className="shadow-sm border-[#EFEFEF]">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
          Cash Flow Transactions
          <span className="ml-2 text-sm font-normal text-[#9A9FA5]">
            {filtered.length.toLocaleString()} transactions
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EFEFEF]">
                <th className="pb-2 pr-4 text-left text-xs font-medium text-[#9A9FA5]">Date</th>
                <th className="pb-2 pr-4 text-left text-xs font-medium text-[#9A9FA5]">Description</th>
                <th className="pb-2 pr-4 text-left text-xs font-medium text-[#9A9FA5] hidden sm:table-cell">Account</th>
                <th className="pb-2 text-right text-xs font-medium text-[#9A9FA5]">Cash Amount</th>
              </tr>
            </thead>
            <tbody>
              {pageData.map((tx) => {
                // Find the BANK/CASH split(s) to show the cash amount
                const cashSplits = tx.splits.filter((s) => BANK_CASH.has(s.accountType));
                const cashAmount = cashSplits.reduce((sum, s) => sum + s.quantity, 0);
                // Find the primary non-cash counterparty for the account column
                const counterparty = tx.splits.find((s) => !BANK_CASH.has(s.accountType) && s.accountType !== "EQUITY");

                return (
                  <tr key={tx.guid} className="border-b border-[#EFEFEF] last:border-0">
                    <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-[#6F767E]">
                      {formatTxDate(tx.date)}
                    </td>
                    <td className="py-2.5 pr-4 text-xs text-[#1A1D1F]">
                      {tx.description}
                    </td>
                    <td className="hidden py-2.5 pr-4 text-xs text-[#6F767E] sm:table-cell">
                      {counterparty?.accountFullPath ?? ""}
                    </td>
                    <td className={`whitespace-nowrap py-2.5 text-right text-xs font-medium ${cashAmount >= 0 ? "text-[#3B6B8A]" : "text-[#1A1D1F]"}`}>
                      {cashAmount >= 0 ? "+" : ""}{formatCurrency(cashAmount, currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-[#9A9FA5]">
              {page * TX_PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * TX_PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="rounded-md border border-[#EFEFEF] px-2.5 py-1 text-xs text-[#6F767E] transition-colors hover:bg-[#F4F5F7] disabled:opacity-30"
              >
                Prev
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="rounded-md border border-[#EFEFEF] px-2.5 py-1 text-xs text-[#6F767E] transition-colors hover:bg-[#F4F5F7] disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatTxDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// ── Existing Cash Flow Budget Content ───────────────────────────────


/** When `include` is false, remove budget rows whose account is a BANK/CASH type (inter-cash transfers). */
function filterTransfers(categories: BudgetCategoryRow[], accountMap: Map<string, { account_type: string }>, include: boolean): BudgetCategoryRow[] {
  if (include) return categories;
  return categories.filter((cat) => {
    const acc = accountMap.get(cat.accountGuid);
    return !acc || !BANK_CASH.has(acc.account_type);
  });
}

function CashFlowBudgetContent({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  type CashFlowTab = "outflow" | "inflow";

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
        <h2 className="text-lg font-semibold text-[#1A1D1F] sm:text-xl">Cash Flow Budget</h2>
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
        <h2 className="text-lg font-semibold text-[#1A1D1F] sm:text-xl">Cash Flow Budget</h2>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Include transfers between bank/cash accounts" onClick={() => setIncludeTransfers((v) => !v)}>
            <div
              role="switch"
              aria-checked={includeTransfers}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setIncludeTransfers((v) => !v); } }}
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

    </div>
  );
}

// ── Main page ───────────────────────────────────────────────────────

export default function CashFlowPage() {
  const { data } = useDashboard();

  // Lifted Sankey filter state shared between Sankey + transaction table
  const [period, setPeriod] = useState<SankeyPeriod>("last-6m");
  const [customRange, setCustomRange] = useState<CustomRange | null>(null);
  const [selectedInflow, setSelectedInflow] = useState<Set<string>>(new Set());
  const [selectedOutflow, setSelectedOutflow] = useState<Set<string>>(new Set());

  const filters: SankeyFilterState = {
    period, setPeriod,
    customRange, setCustomRange,
    selectedInflow, setSelectedInflow,
    selectedOutflow, setSelectedOutflow,
  };

  if (!data) return null;

  return (
    <div className="flex flex-col gap-6 sm:gap-8">
      <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <p>
          This page is experimental and hasn&apos;t been fully tested. Please{" "}
          <a
            href="https://github.com/QuirkyTurtle94/GnuDash/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium underline hover:text-amber-900"
          >
            raise an issue on GitHub
          </a>{" "}
          with any feedback or requests.
        </p>
      </div>
      <CashFlowBarChart filters={filters} />
      <CashFlowSankeySection filters={filters} />
      <CashFlowBudgetContent data={data} />
      <CashFlowTransactions filters={filters} />
    </div>
  );
}
