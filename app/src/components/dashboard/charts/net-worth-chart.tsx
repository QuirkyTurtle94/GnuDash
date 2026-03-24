"use client";

import { useState, useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatCurrencyShort } from "@/lib/format";
import type { MonthlyNetWorth } from "@/lib/types/gnucash";

type TimePeriod = "last-6m" | "last-12m" | "all-time";

const PERIOD_LABELS: Record<TimePeriod, string> = {
  "last-6m": "Last 6 Months",
  "last-12m": "Last 12 Months",
  "all-time": "All Time",
};

function formatAxisMonth(month: string): string {
  const [year, m] = month.split("-");
  const monthIdx = parseInt(m) - 1;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (monthIdx === 0) return `Jan '${year.slice(2)}`;
  return months[monthIdx];
}

function getVisibleTicks(series: MonthlyNetWorth[]): string[] {
  if (series.length <= 8) {
    return series.map((s) => s.month);
  }
  if (series.length <= 14) {
    return series.filter((_, i) => i % 2 === 0).map((s) => s.month);
  }
  if (series.length <= 24) {
    return series.filter((_, i) => i % 3 === 0).map((s) => s.month);
  }
  return series
    .filter((s) => {
      const m = parseInt(s.month.split("-")[1]);
      return m === 1 || m === 7;
    })
    .map((s) => s.month);
}

interface NetWorthChartProps {
  series: MonthlyNetWorth[];
  currentNetWorth: number;
  currency: string;
}

export function NetWorthChart({ series, currentNetWorth, currency }: NetWorthChartProps) {
  const [period, setPeriod] = useState<TimePeriod>("last-6m");
  const [showDropdown, setShowDropdown] = useState(false);

  const filtered = useMemo(() => {
    switch (period) {
      case "last-6m": return series.slice(-6);
      case "last-12m": return series.slice(-12);
      case "all-time": return series;
    }
  }, [series, period]);

  // Compute Y-axis domain with padding so the line isn't flat
  const yDomain = useMemo(() => {
    if (filtered.length === 0) return [0, 0];
    const values = filtered.map((d) => d.netWorth);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min;
    const padding = range > 0 ? range * 0.1 : Math.abs(max) * 0.05;
    return [
      Math.floor((min - padding) / 1000) * 1000,
      Math.ceil((max + padding) / 1000) * 1000,
    ];
  }, [filtered]);

  const pctChange = useMemo(() => {
    if (filtered.length < 2) return null;
    const startValue = filtered[0].netWorth;
    const endValue = filtered[filtered.length - 1].netWorth;
    if (startValue === 0) return null;
    return ((endValue - startValue) / Math.abs(startValue)) * 100;
  }, [filtered]);

  return (
    <Card className="shadow-sm border-[#EFEFEF]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
          Net Worth
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
          <span className="text-3xl font-bold tracking-tight text-[#1A1D1F]">
            {formatCurrency(currentNetWorth, currency, { decimals: 0 })}
          </span>
        </div>
        {pctChange !== null && (
          <div className="mb-4 flex items-center gap-2">
            <span
              className={`rounded-md px-2 py-0.5 text-xs font-semibold ${
                pctChange >= 0
                  ? "bg-[#E8F0ED] text-[#6C9B8B]"
                  : "bg-red-50 text-red-500"
              }`}
            >
              {pctChange >= 0 ? "+" : ""}
              {pctChange.toFixed(1)}%
            </span>
            <span className="text-xs text-[#9A9FA5]">
              {period === "all-time" ? "all time" : PERIOD_LABELS[period].toLowerCase()}
            </span>
          </div>
        )}

        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filtered} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="netWorthGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6C9B8B" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#6C9B8B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" vertical={false} />
              <XAxis
                dataKey="month"
                tickFormatter={formatAxisMonth}
                ticks={getVisibleTicks(filtered)}
                tick={{ fontSize: 11, fill: "#9A9FA5" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={yDomain}
                tickFormatter={(v) => formatCurrencyShort(v, currency)}
                tick={{ fontSize: 11, fill: "#9A9FA5" }}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <Tooltip
                formatter={(value) => [formatCurrency(Number(value), currency, { decimals: 0 }), "Net Worth"]}
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
              <Area
                type="monotone"
                dataKey="netWorth"
                stroke="#6C9B8B"
                strokeWidth={2}
                fill="url(#netWorthGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
