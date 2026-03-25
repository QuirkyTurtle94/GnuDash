"use client";

import { useState, useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { TopBalance } from "@/lib/types/gnucash";

const TYPE_LABELS: Record<string, string> = {
  ASSET: "Asset",
  BANK: "Bank",
  CASH: "Cash",
  STOCK: "Stock",
  MUTUAL: "Fund",
  RECEIVABLE: "Receivable",
  LIABILITY: "Liability",
  CREDIT: "Credit Card",
  PAYABLE: "Payable",
};

interface BalancePieProps {
  balances: TopBalance[];
  currency: string;
  title: string;
  accentColor: string;
  colorPalette: string[];
  /** Group by account type instead of account name */
  groupByType?: boolean;
  /** Currently selected slice (fullPath or type key) */
  selectedSlice?: string | null;
  /** Called when a slice is clicked */
  onSelectSlice?: (key: string | null) => void;
}

interface PieEntry {
  name: string;
  key: string;
  amount: number;
  color: string;
}

export function BalancePie({
  balances,
  currency,
  title,
  accentColor,
  colorPalette,
  groupByType = false,
  selectedSlice,
  onSelectSlice,
}: BalancePieProps) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const categories = useMemo(() => {
    if (groupByType) {
      const byType = new Map<string, number>();
      for (const b of balances) {
        byType.set(b.type, (byType.get(b.type) ?? 0) + Math.abs(b.value));
      }
      return [...byType.entries()]
        .map(([type, amount], i) => ({
          name: TYPE_LABELS[type] ?? type,
          key: type,
          amount,
          color: colorPalette[i % colorPalette.length],
        }))
        .filter((e) => e.amount >= 0.01)
        .sort((a, b) => b.amount - a.amount);
    } else {
      // Group by top-level parent (first segment of fullPath)
      const byParent = new Map<string, number>();
      for (const b of balances) {
        const parts = b.fullPath.split(":");
        // Use second segment (first is the root type account like "Assets")
        const topLevel = parts.length > 1 ? parts[1] : parts[0];
        byParent.set(topLevel, (byParent.get(topLevel) ?? 0) + Math.abs(b.value));
      }
      return [...byParent.entries()]
        .map(([name, amount], i) => ({
          name,
          key: name,
          amount,
          color: colorPalette[i % colorPalette.length],
        }))
        .filter((e) => e.amount >= 0.01)
        .sort((a, b) => b.amount - a.amount);
    }
  }, [balances, groupByType, colorPalette]);

  const { activeCategories, activeTotal } = useMemo(() => {
    const active = categories.filter((c) => !excluded.has(c.key));
    return { activeCategories: active, activeTotal: active.reduce((s, c) => s + c.amount, 0) };
  }, [categories, excluded]);

  const pieData = useMemo(() => {
    if (activeTotal === 0) return [];
    const significant: PieEntry[] = [];
    let othersTotal = 0;
    for (const cat of activeCategories) {
      if ((cat.amount / activeTotal) * 100 >= 3) significant.push(cat);
      else othersTotal += cat.amount;
    }
    if (othersTotal > 0) significant.push({ name: "Others", key: "", amount: othersTotal, color: "#D4DAE0" });
    return significant;
  }, [activeCategories, activeTotal]);

  return (
    <Card className="shadow-sm border-[#EFEFEF] h-full">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#9A9FA5]">No accounts</p>
        ) : (
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex shrink-0 flex-col items-center sm:w-[220px]">
              <div className="mb-2 text-center">
                <span className="text-2xl font-bold text-[#1A1D1F]" data-v>
                  {formatCurrency(activeTotal, currency, { decimals: 0 })}
                </span>
                <p className="text-[11px] text-[#9A9FA5]">Total</p>
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
                      onClick={(_, index) => {
                        const k = pieData[index].key;
                        if (!k || !onSelectSlice) return;
                        onSelectSlice(selectedSlice === k ? null : k);
                      }}
                      style={onSelectSlice ? { cursor: "pointer" } : undefined}
                    >
                      {pieData.map((entry, i) => (
                        <Cell
                          key={`cell-${i}`}
                          fill={entry.color}
                          opacity={selectedSlice && entry.key !== selectedSlice ? 0.3 : 1}
                        />
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
            <div className="flex flex-1 flex-col justify-center gap-1.5 overflow-y-auto">
              {categories.map((cat) => {
                const isExcluded = excluded.has(cat.key);
                const isSelected = selectedSlice === cat.key;
                return (
                  <div
                    key={cat.key}
                    onClick={() => {
                      if (isExcluded) {
                        setExcluded((prev) => { const next = new Set(prev); next.delete(cat.key); return next; });
                      } else if (onSelectSlice) {
                        onSelectSlice(isSelected ? null : cat.key);
                      }
                    }}
                    className={`group flex items-center justify-between gap-2 rounded-md px-1 py-0.5 transition-colors ${
                      isExcluded
                        ? "cursor-pointer opacity-40"
                        : onSelectSlice
                          ? `cursor-pointer ${isSelected ? "" : "hover:bg-[#F4F5F7]"}`
                          : ""
                    } ${selectedSlice && !isSelected && !isExcluded ? "opacity-40" : ""}`}
                    style={isSelected && !isExcluded ? { backgroundColor: `${accentColor}18` } : undefined}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: cat.color }} />
                      <span className="truncate text-xs text-[#6F767E]">{cat.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <span className="text-xs font-medium text-[#1A1D1F]" data-v>
                        {formatCurrency(cat.amount, currency)}
                      </span>
                      {!isExcluded && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setExcluded((prev) => new Set(prev).add(cat.key));
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
