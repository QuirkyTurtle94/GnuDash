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
import { formatCurrency, formatCurrencyShort } from "@/lib/format";
import type { MonthlyCashFlow } from "@/lib/types/gnucash";

type TimePeriod = "this-month" | "last-month" | "last-6m" | "last-12m";

const PERIOD_LABELS: Record<TimePeriod, string> = {
  "this-month": "This Month",
  "last-month": "Last Month",
  "last-6m": "Last 6 Months",
  "last-12m": "Last 12 Months",
};

function getMonthsForPeriod(period: TimePeriod): number {
  switch (period) {
    case "this-month": return 1;
    case "last-month": return 1;
    case "last-6m": return 6;
    case "last-12m": return 12;
  }
}

function getSlice(series: MonthlyCashFlow[], period: TimePeriod): MonthlyCashFlow[] {
  if (period === "last-month") {
    return series.slice(-2, -1);
  }
  const n = getMonthsForPeriod(period);
  return series.slice(-n);
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
}

export function CashFlowChart({ series, currency }: CashFlowChartProps) {
  const [period, setPeriod] = useState<TimePeriod>("last-6m");
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = useMemo(() => getSlice(series, period), [series, period]);
  const totalNet = filtered.reduce((sum, s) => sum + s.net, 0);
  const showChart = filtered.length > 1;

  return (
    <Card className="shadow-sm border-[#EFEFEF] h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
          Cash Flow
        </CardTitle>
        <div className="relative">
          <button
            onClick={() => setShowDropdown(!showDropdown)}
            className="flex items-center gap-1.5 rounded-lg border border-[#EFEFEF] px-3 py-1.5 transition-colors hover:bg-[#F4F5F7]"
          >
            <span className="text-xs font-medium text-[#6F767E]">{PERIOD_LABELS[period]}</span>
            <svg className="h-3.5 w-3.5 text-[#9A9FA5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showDropdown && (
            <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border border-[#EFEFEF] bg-white py-1 shadow-lg">
              {(Object.keys(PERIOD_LABELS) as TimePeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => { setPeriod(p); setShowDropdown(false); }}
                  className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-[#F4F5F7] ${
                    period === p ? "font-medium text-[#6C9B8B]" : "text-[#6F767E]"
                  }`}
                >
                  {PERIOD_LABELS[p]}
                </button>
              ))}
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-1">
          <span className="text-3xl font-bold tracking-tight text-[#1A1D1F]" data-v>
            {formatCurrency(totalNet, currency)}
          </span>
          <p className="mt-0.5 text-xs text-[#9A9FA5]">Net cash flow</p>
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
