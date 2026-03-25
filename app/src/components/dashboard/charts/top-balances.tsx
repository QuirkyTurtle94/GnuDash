"use client";

import { Wallet, Landmark, TrendingUp, CreditCard, PiggyBank } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { TopBalance } from "@/lib/types/gnucash";

const TYPE_CONFIG: Record<string, { icon: typeof Wallet; color: string; bg: string; label: string }> = {
  BANK: { icon: Landmark, color: "#6C9B8B", bg: "#6C9B8B15", label: "Bank" },
  CASH: { icon: Wallet, color: "#FBBF24", bg: "#FBBF2415", label: "Cash" },
  STOCK: { icon: TrendingUp, color: "#818CF8", bg: "#818CF815", label: "Stock" },
  MUTUAL: { icon: TrendingUp, color: "#60A5FA", bg: "#60A5FA15", label: "Fund" },
  ASSET: { icon: PiggyBank, color: "#34D399", bg: "#34D39915", label: "Asset" },
  RECEIVABLE: { icon: Wallet, color: "#FB923C", bg: "#FB923C15", label: "Receivable" },
  LIABILITY: { icon: CreditCard, color: "#F87171", bg: "#F8717115", label: "Liability" },
  CREDIT: { icon: CreditCard, color: "#F87171", bg: "#F8717115", label: "Credit" },
  PAYABLE: { icon: CreditCard, color: "#F87171", bg: "#F8717115", label: "Payable" },
};

const DEFAULT_CONFIG = { icon: Wallet, color: "#9A9FA5", bg: "#9A9FA515", label: "Other" };

interface TopBalancesProps {
  balances: TopBalance[];
  currency: string;
  /** If set, only show balances of this account type */
  filterType?: string | null;
}

export function TopBalances({ balances, currency, filterType }: TopBalancesProps) {
  const filtered = filterType ? balances.filter((b) => b.type === filterType) : balances;
  const totalAssets = filtered
    .filter((b) => b.value > 0)
    .reduce((sum, b) => sum + b.value, 0);
  const totalLiabilities = filtered
    .filter((b) => b.value < 0)
    .reduce((sum, b) => sum + b.value, 0);

  return (
    <Card className="shadow-sm border-[#EFEFEF]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
          Account Balances
        </CardTitle>
        <div className="flex items-center gap-4">
          <div>
            <span className="text-xs text-[#9A9FA5]">Assets </span>
            <span className="text-sm font-semibold text-[#6C9B8B]">
              {formatCurrency(totalAssets, currency, { decimals: 0 })}
            </span>
          </div>
          {totalLiabilities !== 0 && (
            <div>
              <span className="text-xs text-[#9A9FA5]">Liabilities </span>
              <span className="text-sm font-semibold text-[#F87171]">
                {formatCurrency(Math.abs(totalLiabilities), currency, { decimals: 0 })}
              </span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {/* Header row */}
        <div className="flex items-center bg-[#F4F5F7] px-6 py-2.5">
          <span className="flex-1 text-xs font-semibold text-[#6F767E]">Account</span>
          <span className="w-[80px] text-right text-xs font-semibold text-[#6F767E]">Type</span>
          <span className="w-[140px] text-right text-xs font-semibold text-[#6F767E]">Balance</span>
        </div>

        <div className="divide-y divide-[#EFEFEF]">
          {filtered.map((bal, i) => {
            const config = TYPE_CONFIG[bal.type] ?? DEFAULT_CONFIG;
            const Icon = config.icon;
            const isNegative = bal.value < 0;
            const prevPositive = i > 0 && filtered[i - 1].value > 0;
            const showSeparator = isNegative && prevPositive;

            return (
              <div key={bal.fullPath}>
                {showSeparator && (
                  <div className="flex items-center gap-3 bg-[#F4F5F7] px-6 py-2">
                    <span className="text-[11px] font-semibold text-[#9A9FA5]">LIABILITIES</span>
                  </div>
                )}
              <div
                className="flex items-center px-6 py-3 transition-colors hover:bg-[#F4F5F7]/50"
              >
                <div className="flex flex-1 items-center gap-3">
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ backgroundColor: config.bg }}
                  >
                    <Icon className="h-4 w-4" style={{ color: config.color }} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[#1A1D1F]">
                      {bal.accountName}
                    </p>
                    <p className="truncate text-[11px] text-[#9A9FA5]">{bal.fullPath}</p>
                  </div>
                </div>
                <span
                  className="w-[80px] text-right text-[11px] font-medium"
                  style={{ color: config.color }}
                >
                  {config.label}
                </span>
                <span
                  className={`w-[140px] text-right text-[13px] font-semibold ${
                    isNegative ? "text-[#F87171]" : "text-[#1A1D1F]"
                  }`}
                >
                  {formatCurrency(bal.value, currency)}
                </span>
              </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
