"use client";

import { useMemo } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatCurrencyShort } from "@/lib/format";
import type { InvestmentHolding } from "@/lib/types/gnucash";

interface InvestmentPerformanceProps {
  investments: InvestmentHolding[];
  currency: string;
}

export function InvestmentPerformance({ investments, currency }: InvestmentPerformanceProps) {
  // Group by ticker, summing across accounts
  const top10 = useMemo(() => {
    const grouped = new Map<string, { ticker: string; accounts: string[]; costBasis: number; marketValue: number }>();
    for (const inv of investments) {
      const existing = grouped.get(inv.ticker);
      if (existing) {
        existing.costBasis += inv.costBasis;
        existing.marketValue += inv.marketValue;
        existing.accounts.push(inv.accountName);
      } else {
        grouped.set(inv.ticker, {
          ticker: inv.ticker,
          accounts: [inv.accountName],
          costBasis: inv.costBasis,
          marketValue: inv.marketValue,
        });
      }
    }
    return [...grouped.values()]
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 10);
  }, [investments]);

  const totalMarketValue = top10.reduce((sum, inv) => sum + inv.marketValue, 0);
  const totalCostBasis = top10.reduce((sum, inv) => sum + inv.costBasis, 0);
  const totalGainLoss = totalMarketValue - totalCostBasis;
  const totalGainLossPct = totalCostBasis !== 0
    ? (totalGainLoss / Math.abs(totalCostBasis)) * 100
    : 0;

  const chartData = top10.map((inv) => ({
    name: inv.ticker,
    costBasis: inv.costBasis,
    marketValue: inv.marketValue,
    gainLoss: inv.marketValue - inv.costBasis,
    gainLossPct: inv.costBasis !== 0 ? ((inv.marketValue - inv.costBasis) / Math.abs(inv.costBasis)) * 100 : 0,
  }));

  return (
    <Card className="shadow-sm border-[#EFEFEF]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
          Investment Performance
        </CardTitle>
        <div className="flex items-center gap-2">
          {totalGainLoss >= 0 ? (
            <TrendingUp className="h-4 w-4 text-[#6C9B8B]" />
          ) : (
            <TrendingDown className="h-4 w-4 text-[#F87171]" />
          )}
          <span
            className={`text-sm font-semibold ${
              totalGainLoss >= 0 ? "text-[#6C9B8B]" : "text-[#F87171]"
            }`}
          >
            <span data-v>{totalGainLossPct >= 0 ? "+" : ""}
            {totalGainLossPct.toFixed(1)}% overall</span>
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {/* Summary row */}
        <div className="mb-6 flex gap-6">
          <div>
            <p className="text-xs text-[#9A9FA5]">Market Value</p>
            <p className="text-2xl font-bold tracking-tight text-[#1A1D1F]" data-v>
              {formatCurrency(totalMarketValue, currency, { decimals: 0 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#9A9FA5]">Cost Basis</p>
            <p className="text-2xl font-bold tracking-tight text-[#6F767E]" data-v>
              {formatCurrency(totalCostBasis, currency, { decimals: 0 })}
            </p>
          </div>
          <div>
            <p className="text-xs text-[#9A9FA5]">Gain / Loss</p>
            <p className={`text-2xl font-bold tracking-tight ${totalGainLoss >= 0 ? "text-[#6C9B8B]" : "text-[#F87171]"}`} data-v>
              {totalGainLoss >= 0 ? "+" : ""}{formatCurrency(totalGainLoss, currency, { decimals: 0 })}
            </p>
          </div>
        </div>

        {/* Chart */}
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EFEFEF" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: "#9A9FA5" }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tickFormatter={(v) => formatCurrencyShort(v, currency)}
                tick={{ fontSize: 11, fill: "#9A9FA5" }}
                axisLine={false}
                tickLine={false}
                width={55}
              />
              <Tooltip
                formatter={(value, name) => [
                  formatCurrency(Number(value), currency),
                  name === "costBasis" ? "Cost Basis" : "Market Value",
                ]}
                contentStyle={{
                  backgroundColor: "white",
                  border: "1px solid #EFEFEF",
                  borderRadius: "10px",
                  fontSize: "13px",
                }}
              />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-[#6F767E]">
                    {value === "costBasis" ? "Cost Basis" : "Market Value"}
                  </span>
                )}
              />
              <Bar dataKey="costBasis" fill="#D4DAE0" radius={[3, 3, 0, 0]} barSize={16} />
              <Bar dataKey="marketValue" radius={[3, 3, 0, 0]} barSize={16}>
                {chartData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.gainLoss >= 0 ? "#6C9B8B" : "#F87171"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <div className="mt-4">
          <div className="flex items-center border-b border-[#EFEFEF] pb-2">
            <span className="w-[100px] text-xs font-semibold text-[#6F767E]">Asset</span>
            <span className="flex-1 text-right text-xs font-semibold text-[#6F767E]">Cost Basis</span>
            <span className="flex-1 text-right text-xs font-semibold text-[#6F767E]">Market Value</span>
            <span className="w-[100px] text-right text-xs font-semibold text-[#6F767E]">Gain/Loss</span>
          </div>
          {top10.map((inv) => {
            const gl = inv.marketValue - inv.costBasis;
            const glPct = inv.costBasis !== 0 ? (gl / Math.abs(inv.costBasis)) * 100 : 0;
            return (
              <div
                key={inv.ticker}
                className="flex items-center border-b border-[#EFEFEF] py-2.5"
              >
                <div className="w-[100px]">
                  <p className="text-[13px] font-semibold text-[#1A1D1F]" data-l>{inv.ticker}</p>
                  <p className="truncate text-[11px] text-[#9A9FA5]" data-l>
                    {inv.accounts.length === 1 ? inv.accounts[0] : `${inv.accounts.length} accounts`}
                  </p>
                </div>
                <span className="flex-1 text-right text-[13px] text-[#6F767E]" data-v>
                  {formatCurrency(inv.costBasis, currency)}
                </span>
                <span className="flex-1 text-right text-[13px] font-medium text-[#1A1D1F]" data-v>
                  {formatCurrency(inv.marketValue, currency)}
                </span>
                <span className={`w-[100px] text-right text-[13px] font-semibold ${gl >= 0 ? "text-[#6C9B8B]" : "text-[#F87171]"}`} data-v>
                  {gl >= 0 ? "+" : ""}{glPct.toFixed(1)}%
                </span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
