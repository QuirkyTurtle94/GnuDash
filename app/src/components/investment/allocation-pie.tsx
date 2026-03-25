"use client";

import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { GroupedHolding } from "@/app/(dashboard)/investment/page";

interface AllocationPieProps {
  items: GroupedHolding[];
  currency: string;
  selectedTicker: string | null;
  onSelect: (ticker: string | null) => void;
  grouped: boolean;
  onToggleGrouped: () => void;
}

const COLORS = [
  "#4A7A6B", "#5C8C7C", "#6C9B8B", "#7DAA9A", "#8FB9A9",
  "#A0C8B8", "#B2D7C8", "#3B6B8A", "#4A7A9A", "#5889A9",
  "#6798B8", "#76A7C7", "#85B6D6", "#D4DAE0",
];

interface SliceData {
  key: string;
  name: string;
  ticker: string;
  value: number;
  color: string;
}

export function AllocationPie({ items, currency, selectedTicker, onSelect, grouped, onToggleGrouped }: AllocationPieProps) {
  const totalValue = useMemo(
    () => items.reduce((s, h) => s + h.marketValue, 0),
    [items]
  );

  const pieData = useMemo(() => {
    if (totalValue === 0) return [];
    const sorted = [...items]
      .filter((h) => h.marketValue > 0)
      .sort((a, b) => b.marketValue - a.marketValue);

    const significant: SliceData[] = [];
    let othersTotal = 0;

    sorted.forEach((h, i) => {
      if ((h.marketValue / totalValue) * 100 >= 2) {
        // When ungrouped and ticker appears multiple times, show account name
        const label = !grouped && sorted.filter((s) => s.ticker === h.ticker).length > 1
          ? `${h.ticker} (${h.accountName})`
          : h.ticker;
        significant.push({
          key: h.key,
          name: label,
          ticker: h.ticker,
          value: h.marketValue,
          color: COLORS[i % COLORS.length],
        });
      } else {
        othersTotal += h.marketValue;
      }
    });

    if (othersTotal > 0) {
      significant.push({ key: "__others", name: "Others", ticker: "", value: othersTotal, color: "#D4DAE0" });
    }
    return significant;
  }, [items, totalValue, grouped]);

  return (
    <Card className="shadow-sm border-[#EFEFEF] h-full">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
          Allocation
        </CardTitle>
        <button
          onClick={onToggleGrouped}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
            grouped
              ? "border-[#6C9B8B] bg-[#6C9B8B]/10 text-[#6C9B8B]"
              : "border-[#EFEFEF] text-[#6F767E] hover:bg-[#F4F5F7]"
          }`}
        >
          Group by ticker
        </button>
      </CardHeader>
      <CardContent>
        {pieData.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#9A9FA5]">No holdings</p>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex shrink-0 flex-col items-center sm:w-[200px]">
              <div className="mb-2 text-center">
                <span className="text-2xl font-bold text-[#1A1D1F]">
                  {formatCurrency(totalValue, currency, { decimals: 0 })}
                </span>
                <p className="text-[11px] text-[#9A9FA5]">Total value</p>
              </div>
              <div className="relative h-[170px] w-[170px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                      stroke="none"
                      onClick={(_, index) => {
                        const t = pieData[index].ticker;
                        if (!t) return;
                        onSelect(selectedTicker === t ? null : t);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      {pieData.map((entry, i) => (
                        <Cell
                          key={`cell-${i}`}
                          fill={entry.color}
                          opacity={selectedTicker && entry.ticker !== selectedTicker ? 0.3 : 1}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value) => {
                        const pct = totalValue > 0 ? ((Number(value) / totalValue) * 100).toFixed(1) : "0";
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

            <div className="flex flex-1 flex-col justify-center gap-1.5 overflow-y-auto">
              {pieData.map((entry) => {
                const pct = totalValue > 0 ? ((entry.value / totalValue) * 100).toFixed(1) : "0";
                const isSelected = selectedTicker === entry.ticker;
                return (
                  <div
                    key={entry.key}
                    onClick={() => {
                      if (!entry.ticker) return;
                      onSelect(isSelected ? null : entry.ticker);
                    }}
                    className={`flex cursor-pointer items-center justify-between gap-2 rounded-md px-1 py-0.5 transition-colors ${
                      isSelected ? "bg-[#6C9B8B]/10" : "hover:bg-[#F4F5F7]"
                    } ${selectedTicker && !isSelected && entry.ticker ? "opacity-40" : ""}`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className={`truncate text-xs ${isSelected ? "font-medium text-[#1A1D1F]" : "text-[#6F767E]"}`}>
                        {entry.name}
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-medium text-[#1A1D1F]">
                        {formatCurrency(entry.value, currency, { decimals: 0 })}
                      </span>
                      <span className="w-[36px] text-right text-[11px] text-[#9A9FA5]">
                        {pct}%
                      </span>
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
