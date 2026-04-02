"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { MonthlyInvestmentValue } from "@/lib/types/gnucash";

interface ValueOverTimeChartProps {
  series: MonthlyInvestmentValue[];
  currency: string;
  selectedTicker: string | null;
}

export function ValueOverTimeChart({ series, currency, selectedTicker }: ValueOverTimeChartProps) {
  const chartData = useMemo(() => {
    // Filter by ticker if selected
    const filtered = selectedTicker
      ? series.filter((s) => s.ticker === selectedTicker)
      : series;

    // Aggregate by month: sum value and costBasis across all tickers
    const monthly = new Map<string, { value: number; costBasis: number }>();
    for (const row of filtered) {
      const existing = monthly.get(row.month);
      if (existing) {
        existing.value += row.value;
        existing.costBasis += row.costBasis;
      } else {
        monthly.set(row.month, { value: row.value, costBasis: row.costBasis });
      }
    }

    return [...monthly.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => {
        const [yr, mo] = month.split("-");
        const d = new Date(Number(yr), Number(mo) - 1, 1);
        return {
          month,
          label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
          value: data.value,
          costBasis: data.costBasis,
        };
      });
  }, [series, selectedTicker]);

  const maxValue = useMemo(
    () => Math.max(...chartData.map((d) => Math.max(d.value, d.costBasis)), 0),
    [chartData]
  );

  return (
    <Card className="shadow-sm border-[#EFEFEF]">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
          Portfolio Value
          {selectedTicker && (
            <span className="ml-2 text-sm font-normal text-[#6C9B8B]">
              {selectedTicker}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#9A9FA5]">No data available</p>
        ) : (
          <div className="h-[260px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11, fill: "#9A9FA5" }}
                  tickLine={false}
                  axisLine={{ stroke: "#EFEFEF" }}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "#9A9FA5" }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v) =>
                    maxValue >= 1000
                      ? `${(v / 1000).toFixed(0)}k`
                      : String(v)
                  }
                  width={52}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatCurrency(Number(value), currency),
                    name === "value" ? "Market Value" : "Cost Basis",
                  ]}
                  labelFormatter={(label) => String(label)}
                  contentStyle={{
                    backgroundColor: "white",
                    border: "1px solid #EFEFEF",
                    borderRadius: "10px",
                    fontSize: "13px",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                  }}
                />
                <Legend
                  formatter={(value) => (
                    <span className="text-xs text-[#6F767E]">
                      {value === "value" ? "Market Value" : "Cost Basis"}
                    </span>
                  )}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#6C9B8B"
                  strokeWidth={2}
                  dot={false}
                  name="value"
                />
                <Line
                  type="monotone"
                  dataKey="costBasis"
                  stroke="#9A9FA5"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  dot={false}
                  name="costBasis"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
