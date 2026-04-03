"use client";

import { useState, useMemo, useCallback } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { assignShades } from "@/lib/color-utils";
import { useSpendingFilter } from "@/lib/spending-filter-context";
import { getMonthsForPeriod } from "@/lib/spending-utils";
import type { MonthlyExpenseByCategory } from "@/lib/types/gnucash";

interface SpendingPieCardProps {
  monthlyExpenses: MonthlyExpenseByCategory[];
  categoryColors: Record<string, string>;
  currency: string;
  title?: string;
  accentColor?: string;
}

export function SpendingPieCard({ monthlyExpenses, categoryColors, currency, title = "Spending Breakdown", accentColor = "#6C9B8B" }: SpendingPieCardProps) {
  const { period, selectedCategory, setSelectedCategory, selectedMonth, selectedAccount, setSelectedAccount, excluded, toggleExcluded } = useSpendingFilter();
  const [showAverage, setShowAverage] = useState(false);

  const drillParts = selectedCategory ? selectedCategory.split(":") : null;
  const drillDepth = drillParts ? drillParts.length : 0;
  const monthCount = selectedMonth ? 1 : getMonthsForPeriod(period).length;

  const { categories, total } = useMemo(() => {
    if (!monthlyExpenses) return { categories: [], total: 0 };

    const validMonths = new Set(selectedMonth ? [selectedMonth] : getMonthsForPeriod(period));
    const totals = new Map<string, number>();

    for (const row of monthlyExpenses) {
      if (!validMonths.has(row.month)) continue;
      if (!row.pathParts) continue;

      if (selectedCategory) {
        const rowPrefix = row.pathParts.slice(0, drillDepth).join(":");
        if (rowPrefix !== selectedCategory) continue;
        if (row.pathParts.length <= drillDepth) continue;
        const groupKey = row.pathParts.slice(0, drillDepth + 1).join(":");
        totals.set(groupKey, (totals.get(groupKey) ?? 0) + row.amount);
      } else {
        const groupKey = row.pathParts[0];
        totals.set(groupKey, (totals.get(groupKey) ?? 0) + row.amount);
      }
    }

    const cats = [...totals.entries()]
      .map(([path, amount]) => {
        const topLevel = path.split(":")[0];
        const displayName = selectedCategory ? path.split(":").slice(-1)[0] : path;
        return {
          name: displayName,
          fullPath: path,
          amount,
          color: categoryColors[topLevel] ?? "#D4DAE0",
        };
      })
      .sort((a, b) => b.amount - a.amount);

    // When drilled into a category, generate different shades for subcategories
    if (selectedCategory) assignShades(cats);

    const t = cats.reduce((sum, c) => sum + c.amount, 0);
    return { categories: cats, total: t };
  }, [monthlyExpenses, categoryColors, period, selectedCategory, selectedMonth, drillDepth]);

  const { activeCategories, activeTotal } = useMemo(() => {
    const active = categories.filter((c) => !excluded.has(c.fullPath));
    const t = active.reduce((sum, c) => sum + c.amount, 0);
    return { activeCategories: active, activeTotal: t };
  }, [categories, excluded]);

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

  const canDrill = useCallback((fullPath: string) => {
    if (!monthlyExpenses || !fullPath) return false;
    const validMonths = new Set(selectedMonth ? [selectedMonth] : getMonthsForPeriod(period));
    const parts = fullPath.split(":");
    return monthlyExpenses.some(
      (row) => row.pathParts && row.pathParts.length > parts.length &&
        validMonths.has(row.month) &&
        row.pathParts.slice(0, parts.length).join(":") === fullPath
    );
  }, [monthlyExpenses, period, selectedMonth]);

  const handleSliceClick = useCallback((data: { fullPath: string }) => {
    if (!data.fullPath) return;
    if (canDrill(data.fullPath)) {
      setSelectedCategory(data.fullPath);
      setSelectedAccount(null);
    } else {
      // Leaf account: toggle table filter
      setSelectedAccount(selectedAccount === data.fullPath ? null : data.fullPath);
    }
  }, [canDrill, setSelectedCategory, setSelectedAccount, selectedAccount]);

  return (
    <Card className="shadow-sm border-[#EFEFEF] h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
          {title}
        </CardTitle>
        {monthCount > 1 && (
          <button
            onClick={() => setShowAverage((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showAverage
                ? `border-current bg-current/10`
                : "border-[#EFEFEF] text-[#6F767E] hover:bg-[#F4F5F7]"
            }`}
            style={showAverage ? { color: accentColor } : undefined}
          >
            Monthly Avg
          </button>
        )}
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#9A9FA5]">No expenses in this period</p>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row">
            {/* Donut chart */}
            <div className="flex shrink-0 flex-col items-center sm:w-[220px]">
              {selectedCategory && (
                <button
                  onClick={() => {
                    const parts = selectedCategory.split(":");
                    setSelectedCategory(parts.length > 1 ? parts.slice(0, -1).join(":") : null);
                  }}
                  className="mb-1 flex items-center gap-1 self-start rounded-md px-2 py-1 text-xs transition-colors hover:bg-[#F4F5F7]"
                  style={{ color: accentColor }}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  <span data-l>{selectedCategory.split(":").length > 1
                    ? selectedCategory.split(":").slice(-2, -1)[0]
                    : "All Categories"}</span>
                </button>
              )}
              <div className="mb-2 text-center">
                <span className="text-2xl font-bold text-[#1A1D1F]" data-v>
                  {formatCurrency(showAverage ? activeTotal / monthCount : activeTotal, currency, { decimals: 0 })}
                </span>
                <p className="text-[11px] text-[#9A9FA5]" data-l>
                  {showAverage ? "Monthly average" : selectedCategory ? selectedCategory.split(":").slice(-1)[0] : `Total ${title.toLowerCase().replace("breakdown", "").trim()}`}
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
                        const raw = Number(value);
                        const display = showAverage ? raw / monthCount : raw;
                        const pct = activeTotal > 0 ? ((raw / activeTotal) * 100).toFixed(1) : "0";
                        return `${formatCurrency(display, currency)} (${pct}%)`;
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
                const isSelected = selectedAccount === cat.fullPath;
                return (
                  <div
                    key={cat.fullPath}
                    onClick={() => {
                      if (isExcluded) {
                        toggleExcluded(cat.fullPath);
                      } else {
                        handleSliceClick(cat);
                      }
                    }}
                    className={`group flex cursor-pointer items-center justify-between gap-2 rounded-md px-1 py-0.5 transition-colors ${
                      isExcluded
                        ? "opacity-40"
                        : isSelected
                          ? ""
                          : "hover:bg-[#F4F5F7]"
                    }`}
                    style={isSelected && !isExcluded ? { backgroundColor: `${accentColor}18` } : undefined}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className={`truncate text-xs ${isSelected ? "font-medium text-[#1A1D1F]" : "text-[#6F767E]"}`} data-l>{cat.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-xs font-medium text-[#1A1D1F]" data-v>
                        {formatCurrency(showAverage ? cat.amount / monthCount : cat.amount, currency)}
                      </span>
                      {!isExcluded && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExcluded(cat.fullPath);
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
