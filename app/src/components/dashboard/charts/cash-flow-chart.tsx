"use client";

import { useState, useMemo } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PeriodSelector } from "@/components/ui/period-selector";
import { formatCurrency, formatCurrencyShort } from "@/lib/format";
import { type CustomRange, getDataRange, dateToMonth } from "@/lib/period-utils";
import type { MonthlyCashFlow } from "@/lib/types/gnucash";

type TimePeriod = "this-month" | "last-month" | "last-6m" | "last-12m" | "custom";

const PERIOD_LABELS: Record<string, string> = {
  "this-month": "This Month",
  "last-month": "Last Month",
  "last-6m": "Last 6 Months",
  "this-year": "This Year",
  "last-12m": "Last 12 Months",
  "all-time": "All Time",
  "custom": "Custom",
};

function getSlice(series: MonthlyCashFlow[], period: string, customRange?: CustomRange | null): MonthlyCashFlow[] {
  switch (period) {
    case "this-month": return series.slice(-1);
    case "last-month": return series.slice(-2, -1);
    case "last-6m": return series.slice(-6);
    case "last-12m": return series.slice(-12);
    case "this-year": {
      const year = String(new Date().getFullYear());
      return series.filter((s) => s.month.startsWith(year));
    }
    case "all-time": return series;
    case "custom":
      if (!customRange) return series;
      return series.filter((s) => s.month >= dateToMonth(customRange.start) && s.month <= dateToMonth(customRange.end));
    default: return series;
  }
}

function formatMonthLabel(month: string): string {
  const [year, m] = month.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const label = months[parseInt(m) - 1] ?? m;
  return `${label} '${year.slice(2)}`;
}

interface CashFlowChartProps {
  series: MonthlyCashFlow[];
  currentIncome: number;
  currentExpenses: number;
  currency: string;
  externalPeriod?: string;
  externalCustomRange?: CustomRange | null;
  onExternalPeriodChange?: (p: string) => void;
  onExternalCustomRangeChange?: (r: CustomRange) => void;
  externalDataRange?: { min: string; max: string };
}

export function CashFlowChart({ series, currency, externalPeriod, externalCustomRange, onExternalPeriodChange, onExternalCustomRangeChange, externalDataRange }: CashFlowChartProps) {
  const [localPeriod, setLocalPeriod] = useState<TimePeriod>("last-6m");
  const [localCustomRange, setLocalCustomRange] = useState<CustomRange | null>(null);

  const isExternal = externalPeriod !== undefined;
  const isSynced = isExternal && !!onExternalPeriodChange;
  const period = (isExternal ? externalPeriod : localPeriod) as TimePeriod;
  const customRange = isExternal ? (externalCustomRange ?? null) : localCustomRange;

  const activeSeries = series;

  const dataRange = useMemo(() => getDataRange(activeSeries) ?? { min: "2020-01", max: "2026-01" }, [activeSeries]);
  const filtered = useMemo(() => getSlice(activeSeries, period, customRange), [activeSeries, period, customRange]);
  const totalNet = filtered.reduce((sum, s) => sum + s.net, 0);
  const showChart = filtered.length > 1;

  return (
    <Card className="shadow-sm border-[#EFEFEF] h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div>
          <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
            Income / Expense Flow
          </CardTitle>
          <p className="text-xs text-[#9A9FA5]">Net income</p>
        </div>
        <div className="flex items-center gap-3">
        {isSynced ? (
          <PeriodSelector
            period={period}
            labels={PERIOD_LABELS}
            onChange={(p) => onExternalPeriodChange!(p)}
            customRange={customRange}
            onCustomRangeChange={(r) => onExternalCustomRangeChange!(r)}
            dataRange={externalDataRange ?? dataRange}
          />
        ) : !isExternal ? (
          <PeriodSelector
            period={localPeriod}
            labels={PERIOD_LABELS}
            onChange={setLocalPeriod}
            customRange={localCustomRange}
            onCustomRangeChange={setLocalCustomRange}
            dataRange={dataRange}
          />
        ) : null}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-1">
          <span className="text-3xl font-bold tracking-tight text-[#1A1D1F]" data-v>
            {formatCurrency(totalNet, currency)}
          </span>
        </div>

        <div className="mb-4 flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-[#6C9B8B]" />
            <span className="text-xs text-[#6F767E]">Income</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-2.5 w-2.5 rounded-sm bg-[#F87171]" />
            <span className="text-xs text-[#6F767E]">Expense</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="h-0.5 w-4 border-t-2 border-dashed border-[#1A1D1F]" />
            <span className="text-xs text-[#6F767E]">Net</span>
          </div>
        </div>

        {showChart ? (
          <div className="h-[220px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={filtered} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" vertical={false} />
                <XAxis
                  dataKey="month"
                  tickFormatter={formatMonthLabel}
                  tick={{ fontSize: 11, fill: "#9A9FA5" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tickFormatter={(v) => formatCurrencyShort(v, currency)}
                  tick={{ fontSize: 11, fill: "#9A9FA5" }}
                  axisLine={false}
                  tickLine={false}
                  width={50}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatCurrency(Number(value), currency),
                    String(name).charAt(0).toUpperCase() + String(name).slice(1),
                  ]}
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
                <Bar dataKey="income" fill="#6C9B8B" radius={[3, 3, 0, 0]} barSize={14} />
                <Bar dataKey="expenses" fill="#F87171" radius={[3, 3, 0, 0]} barSize={14} />
                <Line
                  type="monotone"
                  dataKey="net"
                  stroke="#1A1D1F"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          /* Single month view — show summary instead of chart */
          <div className="flex gap-4 pt-2">
            <div className="flex-1 rounded-xl bg-[#F4F5F7] p-4">
              <p className="text-xs text-[#9A9FA5]">Income</p>
              <p className="mt-1 text-xl font-bold text-[#1A1D1F]" data-v>
                {formatCurrency(filtered[0]?.income ?? 0, currency)}
              </p>
            </div>
            <div className="flex-1 rounded-xl bg-[#F4F5F7] p-4">
              <p className="text-xs text-[#9A9FA5]">Expenses</p>
              <p className="mt-1 text-xl font-bold text-[#1A1D1F]" data-v>
                {formatCurrency(filtered[0]?.expenses ?? 0, currency)}
              </p>
            </div>
            <div className="flex-1 rounded-xl bg-[#F4F5F7] p-4">
              <p className="text-xs text-[#9A9FA5]">Net</p>
              <p className={`mt-1 text-xl font-bold ${(filtered[0]?.net ?? 0) >= 0 ? "text-[#6C9B8B]" : "text-[#F87171]"}`} data-v>
                {formatCurrency(filtered[0]?.net ?? 0, currency)}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
