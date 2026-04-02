"use client";

import { useMemo, useCallback } from "react";
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { useSpendingFilter } from "@/lib/spending-filter-context";
import { getMonthsForPeriod } from "@/lib/spending-utils";
import type { MonthlyExpenseByCategory } from "@/lib/types/gnucash";

interface MonthlyExpenseBarCardProps {
  monthlyExpenses: MonthlyExpenseByCategory[];
  currency: string;
  title?: string;
  barColor?: string;
  selectedBarColor?: string;
  fadedBarColor?: string;
}

export function MonthlyExpenseBarCard({
  monthlyExpenses,
  currency,
  title = "Monthly Spending",
  barColor = "#6C9B8B",
  selectedBarColor = "#4A7A6B",
  fadedBarColor = "#D5F0E4",
}: MonthlyExpenseBarCardProps) {
  const { period, selectedCategory, excluded, selectedMonth, setSelectedMonth } = useSpendingFilter();

  const handleBarClick = useCallback((data: { month: string }) => {
    // Toggle: click same month again to deselect
    setSelectedMonth(selectedMonth === data.month ? null : data.month);
  }, [selectedMonth, setSelectedMonth]);

  const barData = useMemo(() => {
    if (!monthlyExpenses) return [];

    const validMonths = getMonthsForPeriod(period);
    const validSet = new Set(validMonths);
    const drillParts = selectedCategory ? selectedCategory.split(":") : null;
    const drillDepth = drillParts ? drillParts.length : 0;

    const totals = new Map<string, number>();
    // Initialize all valid months to 0 so empty months still show
    for (const m of validMonths) {
      totals.set(m, 0);
    }

    for (const row of monthlyExpenses) {
      if (!validSet.has(row.month)) continue;
      if (!row.pathParts) continue;

      // Apply category filter
      if (selectedCategory) {
        const rowPrefix = row.pathParts.slice(0, drillDepth).join(":");
        if (rowPrefix !== selectedCategory) continue;
        if (row.pathParts.length <= drillDepth) continue;
        // Check excluded at the sub-category level
        const subKey = row.pathParts.slice(0, drillDepth + 1).join(":");
        if (excluded.has(subKey)) continue;
      } else {
        // Top-level: check excluded at top level
        if (excluded.has(row.pathParts[0])) continue;
      }

      totals.set(row.month, (totals.get(row.month) ?? 0) + row.amount);
    }

    return validMonths.map((month) => {
      // Format: "Jan", "Feb", etc. for multi-month; "Jan 2025" for single
      const [yr, mo] = month.split("-");
      const d = new Date(Number(yr), Number(mo) - 1, 1);
      const label =
        validMonths.length === 1
          ? d.toLocaleDateString("en-US", { month: "short", year: "numeric" })
          : d.toLocaleDateString("en-US", { month: "short" });
      return {
        month,
        label,
        amount: totals.get(month) ?? 0,
      };
    });
  }, [monthlyExpenses, period, selectedCategory, excluded]);

  const maxAmount = useMemo(
    () => Math.max(...barData.map((d) => d.amount), 0),
    [barData]
  );

  const average = useMemo(() => {
    if (barData.length === 0) return 0;
    const sum = barData.reduce((s, d) => s + d.amount, 0);
    return sum / barData.length;
  }, [barData]);

  return (
    <Card className="shadow-sm border-[#EFEFEF] h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
          {title}
          {selectedCategory && (
            <span className="ml-2 text-sm font-normal" style={{ color: barColor }} data-l>
              {selectedCategory.split(":").slice(-1)[0]}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {barData.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#9A9FA5]">No data for this period</p>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: "#9A9FA5" }}
                  tickLine={false}
                  axisLine={{ stroke: "#EFEFEF" }}
                />
                <YAxis
                  tick={{ fontSize: 12, fill: "#9A9FA5" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    maxAmount >= 1000
                      ? `${(v / 1000).toFixed(0)}k`
                      : String(v)
                  }
                  width={48}
                />
                <Tooltip
                  formatter={(value) => formatCurrency(Number(value), currency)}
                  labelFormatter={(label) => String(label)}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #EFEFEF",
                    borderRadius: "10px",
                    fontSize: "13px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                />
                {barData.length > 1 && average > 0 && (
                  <ReferenceLine
                    y={average}
                    stroke={barColor}
                    strokeDasharray="6 4"
                    strokeWidth={1.5}
                    label={{
                      value: `Avg: ${formatCurrency(average, currency, { decimals: 0 })}`,
                      position: "right",
                      fill: barColor,
                      fontSize: 11,
                      fontWeight: 500,
                    }}
                  />
                )}
                <Bar
                  dataKey="amount"
                  fill={barColor}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                  name="Amount"
                  onClick={(data) => handleBarClick({ month: (data as unknown as { month: string }).month })}
                  style={{ cursor: "pointer" }}
                >
                  {barData.map((entry) => (
                    <Cell
                      key={entry.month}
                      fill={
                        selectedMonth
                          ? entry.month === selectedMonth
                            ? selectedBarColor
                            : fadedBarColor
                          : barColor
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
