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

type SortField = "date" | "description" | "account" | "amount";
type SortDir = "asc" | "desc";

function compareTx(a: ExpenseTransaction, b: ExpenseTransaction, field: SortField, dir: SortDir): number {
  let cmp = 0;
  switch (field) {
    case "date":
      cmp = a.date.localeCompare(b.date);
      break;
    case "description":
      cmp = a.description.localeCompare(b.description, undefined, { sensitivity: "base" });
      break;
    case "account":
      cmp = a.fullPath.localeCompare(b.fullPath, undefined, { sensitivity: "base" });
      break;
    case "amount":
      cmp = a.amount - b.amount;
      break;
  }
  return dir === "asc" ? cmp : -cmp;
}

export function ExpenseTableCard({ transactions, currency, title = "Expenses" }: ExpenseTableCardProps) {
  const { period, selectedCategory, selectedMonth, selectedAccount, excluded } = useSpendingFilter();
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "amount" ? "desc" : "asc");
    }
    setPage(0);
  }

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
    }).sort((a, b) => compareTx(a, b, sortField, sortDir));
  }, [transactions, period, selectedCategory, selectedMonth, selectedAccount, excluded, sortField, sortDir]);

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
                    <SortHeader field="date" label="Date" current={sortField} dir={sortDir} onSort={handleSort} />
                    <SortHeader field="description" label="Description" current={sortField} dir={sortDir} onSort={handleSort} />
                    <SortHeader field="account" label="Account" current={sortField} dir={sortDir} onSort={handleSort} className="hidden sm:table-cell" />
                    <SortHeader field="amount" label="Amount" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                  </tr>
                </thead>
                <tbody>
                  {pageData.map((tx, i) => (
                    <tr
                      key={`${tx.date}-${tx.description}-${i}`}
                      className="border-b border-[#EFEFEF] last:border-0"
                    >
                      <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-[#6F767E]" data-d>
                        {formatDate(tx.date)}
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-[#1A1D1F]" data-d>
                        {tx.description}
                      </td>
                      <td className="hidden py-2.5 pr-4 text-xs text-[#6F767E] sm:table-cell" data-d>
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

function SortHeader({
  field,
  label,
  current,
  dir,
  onSort,
  align,
  className,
}: {
  field: SortField;
  label: string;
  current: SortField;
  dir: SortDir;
  onSort: (f: SortField) => void;
  align?: "right";
  className?: string;
}) {
  const active = field === current;
  return (
    <th
      className={`cursor-pointer select-none pb-2 pr-4 text-xs font-medium text-[#9A9FA5] transition-colors hover:text-[#6F767E] ${align === "right" ? "text-right !pr-0" : "text-left"} ${className ?? ""}`}
      onClick={() => onSort(field)}
    >
      {label}
      <span className="ml-1 inline-block w-3 text-[10px]">
        {active ? (dir === "asc" ? "▲" : "▼") : ""}
      </span>
    </th>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}
