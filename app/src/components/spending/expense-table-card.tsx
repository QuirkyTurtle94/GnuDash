"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { useSpendingFilter } from "@/lib/spending-filter-context";
import { getMonthsForPeriod } from "@/lib/spending-utils";
import type { ExpenseTransaction } from "@/lib/types/gnucash";

interface ExpenseTableCardProps {
  transactions: ExpenseTransaction[];
  currency: string;
  title?: string;
}

const PAGE_SIZE = 25;

export function ExpenseTableCard({ transactions, currency, title = "Expenses" }: ExpenseTableCardProps) {
  const { period, selectedCategory, selectedMonth, selectedAccount, excluded } = useSpendingFilter();
  const [page, setPage] = useState(0);

  // Reset page when filters change
  const filterKey = `${period}-${selectedCategory}-${selectedMonth}-${selectedAccount}-${[...excluded].join(",")}`;

  const filtered = useMemo(() => {
    const validMonths = new Set(selectedMonth ? [selectedMonth] : getMonthsForPeriod(period));
    const drillParts = selectedCategory ? selectedCategory.split(":") : null;
    const drillDepth = drillParts ? drillParts.length : 0;

    return transactions.filter((tx) => {
      // Period filter: check if tx month is in valid months
      const txMonth = tx.date.substring(0, 7); // YYYY-MM
      if (!validMonths.has(txMonth)) return false;

      // Leaf account filter (most specific — if set, only show this exact account)
      if (selectedAccount) {
        return tx.fullPath === selectedAccount || tx.fullPath.startsWith(selectedAccount + ":");
      }

      // Category filter
      if (selectedCategory) {
        const txPrefix = tx.pathParts.slice(0, drillDepth).join(":");
        if (txPrefix !== selectedCategory) return false;
        // Excluded sub-categories
        const subKey = tx.pathParts.slice(0, drillDepth + 1).join(":");
        if (excluded.has(subKey)) return false;
      } else {
        if (excluded.has(tx.pathParts[0])) return false;
      }

      return true;
    }).sort((a, b) => b.amount - a.amount);
  }, [transactions, period, selectedCategory, selectedMonth, selectedAccount, excluded]);

  // Reset page when filters change
  useMemo(() => setPage(0), [filterKey]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <Card className="shadow-sm border-[#EFEFEF]">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
          {title}
          <span className="ml-2 text-sm font-normal text-[#9A9FA5]">
            {filtered.length.toLocaleString()} transactions
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#9A9FA5]">No expenses in this period</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#EFEFEF]">
                    <th className="pb-2 pr-4 text-left text-xs font-medium text-[#9A9FA5]">Date</th>
                    <th className="pb-2 pr-4 text-left text-xs font-medium text-[#9A9FA5]">Description</th>
                    <th className="hidden pb-2 pr-4 text-left text-xs font-medium text-[#9A9FA5] sm:table-cell">Account</th>
                    <th className="pb-2 text-right text-xs font-medium text-[#9A9FA5]">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((tx, i) => (
                    <tr
                      key={`${tx.date}-${tx.description}-${i}`}
                      className="border-b border-[#EFEFEF] last:border-0"
                    >
                      <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-[#6F767E]">
                        {formatDate(tx.date)}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-[#1A1D1F]">
                        {tx.description}
                      </td>
                      <td className="hidden py-2.5 pr-4 text-xs text-[#6F767E] sm:table-cell">
                        {tx.fullPath}
                      </td>
                      <td className="whitespace-nowrap py-2.5 text-right text-xs font-medium text-[#1A1D1F]" data-v>
                        {formatCurrency(tx.amount, currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-[#9A9FA5]">
                  {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of {filtered.length.toLocaleString()}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="rounded-md border border-[#EFEFEF] px-2.5 py-1 text-xs text-[#6F767E] transition-colors hover:bg-[#F4F5F7] disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="rounded-md border border-[#EFEFEF] px-2.5 py-1 text-xs text-[#6F767E] transition-colors hover:bg-[#F4F5F7] disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
