"use client";

import { SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency as fmt } from "@/lib/format";
import type { RecentTransaction } from "@/lib/types/gnucash";

function formatAmount(value: number, currency: string): string {
  const prefix = value >= 0 ? "+" : "";
  const formatted = fmt(Math.abs(value), currency);
  return `${prefix}${value < 0 ? "-" : ""}${formatted.replace("-", "")}`;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[date.getDay()]} ${date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Generate a color from category name
function getCategoryColor(name: string): string {
  const colors = ["#6C9B8B", "#F87171", "#FBBF24", "#60A5FA", "#A78BFA", "#FB923C"];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

interface RecentTransactionsTableProps {
  transactions: RecentTransaction[];
  currency: string;
}

export function RecentTransactionsTable({ transactions, currency }: RecentTransactionsTableProps) {
  return (
    <Card className="shadow-sm border-[#EFEFEF]">
      <CardHeader className="flex flex-row items-center justify-between border-b border-[#EFEFEF] pb-4">
        <CardTitle className="text-base font-semibold text-[#1A1D1F]">
          Recent Transaction
        </CardTitle>
        <button className="flex items-center gap-1.5 rounded-lg border border-[#EFEFEF] px-3 py-1.5">
          <SlidersHorizontal className="h-3.5 w-3.5 text-[#9A9FA5]" />
          <span className="text-xs font-medium text-[#6F767E]">Filter</span>
        </button>
      </CardHeader>
      <CardContent className="p-0">
        {/* Table header */}
        <div className="flex items-center bg-[#F4F5F7] px-6 py-3">
          <div className="w-[240px]">
            <span className="text-xs font-semibold text-[#6F767E]">Activity</span>
          </div>
          <div className="w-[160px]">
            <span className="text-xs font-semibold text-[#6F767E]">Date</span>
          </div>
          <div className="w-[140px]">
            <span className="text-xs font-semibold text-[#6F767E]">Total Amount</span>
          </div>
          <div className="w-[100px]">
            <span className="text-xs font-semibold text-[#6F767E]">Status</span>
          </div>
        </div>

        {/* Table rows */}
        <div className="divide-y divide-[#EFEFEF]">
          {transactions.slice(0, 8).map((txn, i) => {
            const color = getCategoryColor(txn.categoryName);
            return (
              <div
                key={i}
                className="flex items-center px-6 py-3.5 transition-colors hover:bg-[#F4F5F7]/50"
              >
                <div className="flex w-[240px] items-center gap-2.5">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-lg"
                    style={{ backgroundColor: `${color}20` }}
                  >
                    <span
                      className="text-[13px] font-bold"
                      style={{ color }}
                      data-d
                    >
                      {txn.description.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="truncate text-[13px] font-medium text-[#1A1D1F]" data-d>
                    {txn.description}
                  </span>
                </div>
                <div className="w-[160px]">
                  <span className="text-[13px] text-[#6F767E]">
                    {formatShortDate(txn.date)}
                  </span>
                </div>
                <div className="w-[140px]">
                  <span
                    className={`text-[13px] font-semibold ${
                      txn.amount >= 0 ? "text-[#1A1D1F]" : "text-[#1A1D1F]"
                    }`}
                  >
                    {formatAmount(txn.amount, currency)}
                  </span>
                </div>
                <div className="w-[100px]">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`h-1.5 w-1.5 rounded-full ${
                        txn.reconciled ? "bg-[#4ADE80]" : "bg-[#FBBF24]"
                      }`}
                    />
                    <span className="text-xs text-[#6F767E]">
                      {txn.reconciled ? "Reconciled" : "Pending"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
