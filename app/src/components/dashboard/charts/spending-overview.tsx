"use client";

import { useState, useMemo, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { MonthlyExpenseByCategory } from "@/lib/types/gnucash";

type TimePeriod = "this-month" | "last-month" | "this-year" | "last-12m";

const PERIOD_LABELS: Record<TimePeriod, string> = {
  "this-month": "This Month",
  "last-month": "Last Month",
  "this-year": "This Year",
  "last-12m": "Last 12 Months",
};

function getMonthsForPeriod(period: TimePeriod): string[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  switch (period) {
    case "this-month":
      return [`${y}-${String(m + 1).padStart(2, "0")}`];
    case "last-month": {
      const d = new Date(y, m - 1, 1);
      return [`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`];
    }
    case "this-year": {
      const months: string[] = [];
      for (let i = 0; i <= m; i++) {
        months.push(`${y}-${String(i + 1).padStart(2, "0")}`);
      }
      return months;
    }
    case "last-12m": {
      const months: string[] = [];
      for (let i = 11; i >= 0; i--) {
        const d = new Date(y, m - i, 1);
        months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
      }
      return months;
    }
  }
}

interface SpendingOverviewProps {
  monthlyExpenses: MonthlyExpenseByCategory[];
  categoryColors: Record<string, string>;
  currency: string;
  /** If set, the card title links to this URL */
  linkTo?: string;
}

export function SpendingOverview({ monthlyExpenses, categoryColors, currency, linkTo }: SpendingOverviewProps) {
  const [period, setPeriod] = useState<TimePeriod>("this-month");
  const [showPeriodDropdown, setShowPeriodDropdown] = useState(false);
  const [depth, setDepth] = useState(1);
  const [showDepthDropdown, setShowDepthDropdown] = useState(false);
  // Drill-down: null = top-level view, string = path prefix to filter by
  const [drillPath, setDrillPath] = useState<string | null>(null);
  // Excluded categories (by fullPath) — hidden from pie chart
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  // Determine max available depth
  const maxDepth = useMemo(() => {
    if (!monthlyExpenses) return 1;
    let max = 1;
    for (const row of monthlyExpenses) {
      if (row.pathParts && row.pathParts.length > max) {
        max = row.pathParts.length;
      }
    }
    return max;
  }, [monthlyExpenses]);

  const { categories, total } = useMemo(() => {
    if (!monthlyExpenses) return { categories: [], total: 0 };

    const validMonths = new Set(getMonthsForPeriod(period));
    const drillParts = drillPath ? drillPath.split(":") : null;
    const drillDepth = drillParts ? drillParts.length : 0;
    const totals = new Map<string, number>();

    for (const row of monthlyExpenses) {
      if (!validMonths.has(row.month)) continue;
      if (!row.pathParts) continue;

      if (drillPath) {
        // When drilled in, only include rows whose path starts with the drill prefix
        const rowPrefix = row.pathParts.slice(0, drillDepth).join(":");
        if (rowPrefix !== drillPath) continue;
        // Must have at least one more level to show as a sub-category
        if (row.pathParts.length <= drillDepth) continue;
        // Group by the next level below the drill path
        const groupKey = row.pathParts.slice(0, drillDepth + 1).join(":");
        totals.set(groupKey, (totals.get(groupKey) ?? 0) + row.amount);
      } else {
        // Top-level view: group by the path truncated to selected depth
        const groupKey = row.pathParts.slice(0, depth).join(":");
        totals.set(groupKey, (totals.get(groupKey) ?? 0) + row.amount);
      }
    }

    const cats = [...totals.entries()]
      .map(([path, amount]) => {
        const topLevel = path.split(":")[0];
        // Display name: show only the last segment when drilled in
        const displayName = drillPath ? path.split(":").slice(-1)[0] : path;
        return {
          name: displayName,
          fullPath: path,
          amount,
          color: categoryColors[topLevel] ?? "#D4DAE0",
        };
      })
      .sort((a, b) => b.amount - a.amount);

    const t = cats.reduce((sum, c) => sum + c.amount, 0);
    return { categories: cats, total: t };
  }, [monthlyExpenses, categoryColors, period, depth, drillPath]);

  // Active categories (not excluded) and their total
  const { activeCategories, activeTotal } = useMemo(() => {
    const active = categories.filter((c) => !excluded.has(c.fullPath));
    const t = active.reduce((sum, c) => sum + c.amount, 0);
    return { activeCategories: active, activeTotal: t };
  }, [categories, excluded]);

  // For the pie chart, group small slices (<3%) into "Others"
  const pieData = useMemo(() => {
    if (activeTotal === 0) return [];
    const significant: { name: string; fullPath: string; amount: number; color: string }[] = [];
    let othersTotal = 0;
    for (const cat of activeCategories) {
      if ((cat.amount / activeTotal) * 100 >= 3) {
        significant.push(cat);
      } else {
        othersTotal += cat.amount;
      }
    }
    if (othersTotal > 0) {
      significant.push({ name: "Others", fullPath: "", amount: othersTotal, color: "#D4DAE0" });
    }
    return significant;
  }, [activeCategories, activeTotal]);

  // Check if a drilled category has sub-accounts to drill into
  const canDrill = useCallback((fullPath: string) => {
    if (!monthlyExpenses || !fullPath) return false;
    const parts = fullPath.split(":");
    return monthlyExpenses.some(
      (row) => row.pathParts && row.pathParts.length > parts.length &&
        row.pathParts.slice(0, parts.length).join(":") === fullPath
    );
  }, [monthlyExpenses]);

  const handleSliceClick = useCallback((data: { fullPath: string }) => {
    if (!data.fullPath) return; // "Others" slice — don't drill
    if (canDrill(data.fullPath)) {
      setDrillPath(data.fullPath);
      setExcluded(new Set());
    }
  }, [canDrill]);

  return (
    <Card className="shadow-sm border-[#EFEFEF] h-full">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
          {linkTo ? (
            <Link href={linkTo} className="hover:text-[#6C9B8B] transition-colors">
              Spending Overview
            </Link>
          ) : (
            "Spending Overview"
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          {/* Depth selector */}
          <div className="relative">
            <button
              onClick={() => { setShowDepthDropdown(!showDepthDropdown); setShowPeriodDropdown(false); }}
              className="flex items-center gap-1.5 rounded-lg border border-[#EFEFEF] px-3 py-1.5 transition-colors hover:bg-[#F4F5F7]"
            >
              <span className="text-xs font-medium text-[#6F767E]">
                {depth === 1 ? "Top Level" : `Depth ${depth}`}
              </span>
              <svg className="h-3.5 w-3.5 text-[#9A9FA5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showDepthDropdown && (
              <div className="absolute right-0 top-full z-10 mt-1 w-32 rounded-lg border border-[#EFEFEF] bg-white py-1 shadow-lg">
                {Array.from({ length: maxDepth }, (_, i) => i + 1).map((d) => (
                  <button
                    key={d}
                    onClick={() => { setDepth(d); setShowDepthDropdown(false); }}
                    className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-[#F4F5F7] ${
                      depth === d ? "font-medium text-[#6C9B8B]" : "text-[#6F767E]"
                    }`}
                  >
                    {d === 1 ? "Top Level" : `Depth ${d}`}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Period selector */}
          <div className="relative">
            <button
              onClick={() => { setShowPeriodDropdown(!showPeriodDropdown); setShowDepthDropdown(false); }}
              className="flex items-center gap-1.5 rounded-lg border border-[#EFEFEF] px-3 py-1.5 transition-colors hover:bg-[#F4F5F7]"
            >
              <span className="text-xs font-medium text-[#6F767E]">{PERIOD_LABELS[period]}</span>
              <svg className="h-3.5 w-3.5 text-[#9A9FA5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showPeriodDropdown && (
              <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border border-[#EFEFEF] bg-white py-1 shadow-lg">
                {(Object.keys(PERIOD_LABELS) as TimePeriod[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setPeriod(p); setShowPeriodDropdown(false); }}
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
        </div>
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#9A9FA5]">No expenses in this period</p>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row">
            {/* Donut chart with total above */}
            <div className="flex shrink-0 flex-col items-center sm:w-[220px]">
              {drillPath && (
                <button
                  onClick={() => {
                    // Go up one level, or back to top if only one level deep
                    const parts = drillPath.split(":");
                    setDrillPath(parts.length > 1 ? parts.slice(0, -1).join(":") : null);
                    setExcluded(new Set());
                  }}
                  className="mb-1 flex items-center gap-1 self-start rounded-md px-2 py-1 text-xs text-[#6C9B8B] transition-colors hover:bg-[#F4F5F7]"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  {drillPath.split(":").length > 1
                    ? drillPath.split(":").slice(-2, -1)[0]
                    : "All Categories"}
                </button>
              )}
              <div className="mb-2 text-center">
                <span className="text-2xl font-bold text-[#1A1D1F]" data-v>
                  {formatCurrency(activeTotal, currency, { decimals: 0 })}
                </span>
                <p className="text-[11px] text-[#9A9FA5]">
                  {drillPath ? drillPath.split(":").slice(-1)[0] : "Total spending"}
                </p>
              </div>
              <div className="relative h-[180px] w-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                      dataKey="amount"
                      stroke="none"
                      onClick={(_, index) => handleSliceClick(pieData[index])}
                      style={{ cursor: "pointer" }}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={`cell-${i}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      position={{ x: 50, y: -10 }}
                      formatter={(value) => {
                        const pct = activeTotal > 0 ? ((Number(value) / activeTotal) * 100).toFixed(1) : "0";
                        return `${formatCurrency(Number(value), currency)} (${pct}%)`;
                      }}
                      contentStyle={{
                        backgroundColor: "white",
                        border: "1px solid #EFEFEF",
                        borderRadius: "10px",
                        fontSize: "13px",
                        boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category list */}
            <div className="flex flex-1 flex-col justify-center gap-1.5 overflow-y-auto">
              {categories.map((cat) => {
                const drillable = canDrill(cat.fullPath);
                const isExcluded = excluded.has(cat.fullPath);
                return (
                  <div
                    key={cat.fullPath}
                    onClick={() => {
                      if (isExcluded) {
                        setExcluded((prev) => { const next = new Set(prev); next.delete(cat.fullPath); return next; });
                      } else if (drillable) {
                        handleSliceClick(cat);
                      }
                    }}
                    className={`group flex items-center justify-between gap-2 rounded-md px-1 py-0.5 transition-colors ${
                      isExcluded
                        ? "cursor-pointer opacity-40"
                        : drillable
                          ? "cursor-pointer hover:bg-[#F4F5F7]"
                          : ""
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="truncate text-xs text-[#6F767E]">
                        {cat.name}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-xs font-medium text-[#1A1D1F]" data-v>
                        {formatCurrency(cat.amount, currency)}
                      </span>
                      {!isExcluded && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExcluded((prev) => new Set(prev).add(cat.fullPath));
                          }}
                          className="ml-0.5 hidden h-4 w-4 items-center justify-center rounded text-[#9A9FA5] transition-colors hover:bg-[#EFEFEF] hover:text-[#6F767E] group-hover:flex"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
