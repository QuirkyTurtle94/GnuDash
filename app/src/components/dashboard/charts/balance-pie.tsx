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
import type { AccountNode, InvestmentHolding } from "@/lib/types/gnucash";

const INVESTMENT_TYPES = new Set(["STOCK", "MUTUAL"]);

interface BalancePieProps {
  accounts: AccountNode[];
  currency: string;
  title: string;
  accountTypes: string[];
  accentColor: string;
  colorPalette: string[];
  /** Investment holdings — used to get market value instead of cost basis for STOCK/MUTUAL */
  investments?: InvestmentHolding[];
  /** Group by account type (BANK, CASH, STOCK, etc.) instead of account name */
  groupByType?: boolean;
  /** Currently selected slice (fullPath), for cross-filtering */
  selectedSlice?: string | null;
  /** Called when a slice is clicked */
  onSelectSlice?: (fullPath: string | null) => void;
}

interface BalanceEntry {
  name: string;
  fullPath: string;
  amount: number;
  color: string;
}

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

interface LeafBalance {
  name: string;
  fullPath: string;
  amount: number;
  type: string;
}

function collectLeafBalances(
  node: AccountNode,
  accountTypes: string[],
  parentPath: string,
  investmentValues: Map<string, number>
): LeafBalance[] {
  const path = parentPath ? `${parentPath}:${node.name}` : node.name;

  const childResults: LeafBalance[] = [];
  for (const child of node.children) {
    childResults.push(...collectLeafBalances(child, accountTypes, path, investmentValues));
  }

  if (childResults.length > 0) return childResults;

  if (accountTypes.includes(node.type)) {
    const value = INVESTMENT_TYPES.has(node.type)
      ? investmentValues.get(node.name) ?? 0
      : node.balance;
    if (Math.abs(value) >= 0.01) {
      return [{ name: node.name, fullPath: path, amount: Math.abs(value), type: node.type }];
    }
  }
  return [];
}

function getBreakdown(
  accounts: AccountNode[],
  accountTypes: string[],
  investmentValues: Map<string, number>,
  groupByType: boolean
): { name: string; fullPath: string; amount: number }[] {
  const containers = accounts.filter((a) => accountTypes.includes(a.type));

  // Collect all leaves
  const allLeaves: LeafBalance[] = [];
  for (const container of containers) {
    for (const child of container.children) {
      allLeaves.push(...collectLeafBalances(child, accountTypes, "", investmentValues));
    }
  }

  if (groupByType) {
    // Group by account type
    const byType = new Map<string, number>();
    for (const leaf of allLeaves) {
      byType.set(leaf.type, (byType.get(leaf.type) ?? 0) + leaf.amount);
    }
    return [...byType.entries()]
      .map(([type, amount]) => ({
        name: TYPE_LABELS[type] ?? type,
        fullPath: type,
        amount,
      }))
      .filter((e) => e.amount >= 0.01)
      .sort((a, b) => b.amount - a.amount);
  } else {
    // Group by top-level child account
    const byAccount = new Map<string, number>();
    for (const container of containers) {
      for (const child of container.children) {
        const leaves = collectLeafBalances(child, accountTypes, "", investmentValues);
        const total = leaves.reduce((s, l) => s + l.amount, 0);
        if (total >= 0.01) {
          byAccount.set(child.name, (byAccount.get(child.name) ?? 0) + total);
        }
      }
    }
    return [...byAccount.entries()]
      .map(([name, amount]) => ({ name, fullPath: name, amount }))
      .sort((a, b) => b.amount - a.amount);
  }
}

export function BalancePie({ accounts, currency, title, accountTypes, accentColor, colorPalette, investments, groupByType = false, selectedSlice, onSelectSlice }: BalancePieProps) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  // Build map of account name → market value from investment holdings
  const investmentValues = useMemo(() => {
    const map = new Map<string, number>();
    if (!investments) return map;
    for (const h of investments) {
      // Accumulate in case multiple holdings share an account name
      map.set(h.accountName, (map.get(h.accountName) ?? 0) + h.marketValue);
    }
    return map;
  }, [investments]);

  const categories = useMemo(() => {
    const items = getBreakdown(accounts, accountTypes, investmentValues, groupByType);
    return items.map((item, i) => ({
      ...item,
      color: colorPalette[i % colorPalette.length],
    }));
  }, [accounts, accountTypes, colorPalette, investmentValues, groupByType]);

  const { activeCategories, activeTotal } = useMemo(() => {
    const active = categories.filter((c) => !excluded.has(c.fullPath));
    return { activeCategories: active, activeTotal: active.reduce((s, c) => s + c.amount, 0) };
  }, [categories, excluded]);

  const pieData = useMemo(() => {
    if (activeTotal === 0) return [];
    const significant: BalanceEntry[] = [];
    let othersTotal = 0;
    for (const cat of activeCategories) {
      if ((cat.amount / activeTotal) * 100 >= 3) significant.push(cat);
      else othersTotal += cat.amount;
    }
    if (othersTotal > 0) significant.push({ name: "Others", fullPath: "", amount: othersTotal, color: "#D4DAE0" });
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
                <span className="text-2xl font-bold text-[#1A1D1F]">
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
                        const fp = pieData[index].fullPath;
                        if (!fp || !onSelectSlice) return;
                        onSelectSlice(selectedSlice === fp ? null : fp);
                      }}
                      style={onSelectSlice ? { cursor: "pointer" } : undefined}
                    >
                      {pieData.map((entry, i) => (
                        <Cell
                          key={`cell-${i}`}
                          fill={entry.color}
                          opacity={selectedSlice && entry.fullPath !== selectedSlice ? 0.3 : 1}
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
                const isExcluded = excluded.has(cat.fullPath);
                const isSelected = selectedSlice === cat.fullPath;
                return (
                  <div
                    key={cat.fullPath}
                    onClick={() => {
                      if (isExcluded) {
                        setExcluded((prev) => { const next = new Set(prev); next.delete(cat.fullPath); return next; });
                      } else if (onSelectSlice) {
                        onSelectSlice(isSelected ? null : cat.fullPath);
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
                      <span className="text-xs font-medium text-[#1A1D1F]">
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
