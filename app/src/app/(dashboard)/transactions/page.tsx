"use client";

import { useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { useDashboard } from "@/lib/dashboard-context";
import type { LedgerTransaction } from "@/lib/types/gnucash";
import { Search, ChevronDown, ChevronRight, X, Plus, Pencil, Trash2 } from "lucide-react";
import { AddTransactionSheet } from "@/components/add-transaction-sheet";

const PAGE_SIZE = 50;

type SortField = "date" | "description" | "amount";
type SortDir = "asc" | "desc";

const ACCOUNT_TYPE_GROUPS: Record<string, string[]> = {
  "All": [],
  "Bank & Cash": ["BANK", "CASH"],
  "Expenses": ["EXPENSE"],
  "Income": ["INCOME"],
  "Assets": ["ASSET", "BANK", "CASH", "STOCK", "MUTUAL", "RECEIVABLE"],
  "Liabilities": ["LIABILITY", "CREDIT", "PAYABLE"],
  "Investment": ["STOCK", "MUTUAL"],
};

function compareTx(a: LedgerTransaction, b: LedgerTransaction, field: SortField, dir: SortDir): number {
  let cmp = 0;
  switch (field) {
    case "date":
      cmp = a.date.localeCompare(b.date);
      break;
    case "description":
      cmp = a.description.localeCompare(b.description, undefined, { sensitivity: "base" });
      break;
    case "amount": {
      const aAmt = Math.max(...a.splits.map((s) => Math.abs(s.amount)));
      const bAmt = Math.max(...b.splits.map((s) => Math.abs(s.amount)));
      cmp = aAmt - bAmt;
      break;
    }
  }
  return dir === "asc" ? cmp : -cmp;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function reconcileLabel(state: string): { text: string; className: string } {
  switch (state) {
    case "y":
      return { text: "R", className: "text-emerald-600 bg-emerald-50" };
    case "c":
      return { text: "C", className: "text-blue-600 bg-blue-50" };
    default:
      return { text: "N", className: "text-[#9A9FA5] bg-[#F4F5F7]" };
  }
}

export default function TransactionsPage() {
  const { data, isWritable, deleteTransaction } = useDashboard();
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editingTx, setEditingTx] = useState<LedgerTransaction | null>(null);
  const [deletingGuid, setDeletingGuid] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [accountTypeFilter, setAccountTypeFilter] = useState("All");
  const [accountFilter, setAccountFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [expandedTx, setExpandedTx] = useState<Set<string>>(new Set());

  const toggleExpand = useCallback((guid: string) => {
    setExpandedTx((prev) => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });
  }, []);

  function handleSort(field: SortField) {
    if (field === sortField) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "amount" ? "desc" : "asc");
    }
    setPage(0);
  }

  // Collect unique account paths for the account dropdown
  const accountPaths = useMemo(() => {
    if (!data) return [];
    const paths = new Set<string>();
    for (const tx of data.ledgerTransactions) {
      for (const s of tx.splits) {
        paths.add(s.accountFullPath);
      }
    }
    return Array.from(paths).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const searchLower = search.toLowerCase();
    const typeSet = ACCOUNT_TYPE_GROUPS[accountTypeFilter];
    const hasTypeFilter = typeSet && typeSet.length > 0;

    return data.ledgerTransactions
      .filter((tx) => {
        // Date range
        if (dateFrom && tx.date < dateFrom) return false;
        if (dateTo && tx.date > dateTo) return false;

        // Account type filter: at least one split must match
        if (hasTypeFilter && !tx.splits.some((s) => typeSet.includes(s.accountType))) return false;

        // Account path filter
        if (accountFilter && !tx.splits.some((s) => s.accountFullPath === accountFilter)) return false;

        // Search: match description, split account names, memos, or num
        if (searchLower) {
          const descMatch = tx.description.toLowerCase().includes(searchLower);
          const numMatch = tx.num.toLowerCase().includes(searchLower);
          const splitMatch = tx.splits.some(
            (s) =>
              s.accountName.toLowerCase().includes(searchLower) ||
              s.accountFullPath.toLowerCase().includes(searchLower) ||
              s.memo.toLowerCase().includes(searchLower)
          );
          if (!descMatch && !numMatch && !splitMatch) return false;
        }

        return true;
      })
      .sort((a, b) => compareTx(a, b, sortField, sortDir));
  }, [data, search, accountTypeFilter, accountFilter, dateFrom, dateTo, sortField, sortDir]);

  // Reset page when filters change
  const filterKey = `${search}-${accountTypeFilter}-${accountFilter}-${dateFrom}-${dateTo}`;
  useMemo(() => setPage(0), [filterKey]);

  if (!data) return null;

  const currency = data.currency;
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const hasActiveFilters = search || accountTypeFilter !== "All" || accountFilter || dateFrom || dateTo;

  function clearFilters() {
    setSearch("");
    setAccountTypeFilter("All");
    setAccountFilter("");
    setDateFrom("");
    setDateTo("");
    setPage(0);
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[#1A1D1F] sm:text-xl">Transactions</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#9A9FA5]">
            {filtered.length.toLocaleString()} transaction{filtered.length !== 1 ? "s" : ""}
          </span>
          {isWritable && (
            <button
              onClick={() => setShowAddSheet(true)}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3B6B8A] text-white transition-colors hover:bg-[#2D5570]"
              title="Add transaction"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {isWritable && (
        <>
          <AddTransactionSheet
            open={showAddSheet}
            onOpenChange={(open) => {
              setShowAddSheet(open);
              if (!open) setEditingTx(null);
            }}
            editingTransaction={editingTx}
          />

          {/* Delete confirmation */}
          {deletingGuid && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => { setDeletingGuid(null); setDeleteError(null); }}>
              <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-sm font-semibold text-[#1A1D1F]">Delete Transaction</h3>
                <p className="mt-2 text-xs text-[#6F767E]">
                  Are you sure you want to delete this transaction? This cannot be undone.
                </p>
                {deleteError && (
                  <p className="mt-2 text-xs text-red-600">{deleteError}</p>
                )}
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => { setDeletingGuid(null); setDeleteError(null); }}
                    className="flex-1 rounded-lg border border-[#EFEFEF] px-3 py-2 text-xs font-medium text-[#6F767E] transition-colors hover:bg-[#F4F5F7]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      try {
                        setDeleteError(null);
                        await deleteTransaction({ transactionGuid: deletingGuid });
                        setDeletingGuid(null);
                        setExpandedTx(new Set());
                      } catch (err) {
                        setDeleteError(err instanceof Error ? err.message : "Delete failed");
                      }
                    }}
                    className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Filters */}
      <Card className="shadow-sm border-[#EFEFEF]">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col gap-3">
            {/* Row 1: Search + Clear */}
            <div className="flex items-center gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9FA5]" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search descriptions, accounts, memos..."
                  className="h-9 w-full rounded-lg border border-[#EFEFEF] bg-white pl-9 pr-3 text-sm text-[#1A1D1F] placeholder:text-[#9A9FA5] focus:border-[#3B6B8A] focus:outline-none focus:ring-1 focus:ring-[#3B6B8A]"
                />
              </div>
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1 rounded-lg border border-[#EFEFEF] px-3 py-2 text-xs text-[#6F767E] transition-colors hover:bg-[#F4F5F7]"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>

            {/* Row 2: Filter controls */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Account type */}
              <select
                value={accountTypeFilter}
                onChange={(e) => { setAccountTypeFilter(e.target.value); setPage(0); }}
                className="h-8 rounded-lg border border-[#EFEFEF] bg-white px-2.5 text-xs text-[#6F767E] focus:border-[#3B6B8A] focus:outline-none"
              >
                {Object.keys(ACCOUNT_TYPE_GROUPS).map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>

              {/* Account path */}
              <select
                value={accountFilter}
                onChange={(e) => { setAccountFilter(e.target.value); setPage(0); }}
                className="h-8 max-w-[240px] rounded-lg border border-[#EFEFEF] bg-white px-2.5 text-xs text-[#6F767E] focus:border-[#3B6B8A] focus:outline-none"
              >
                <option value="">All accounts</option>
                {accountPaths.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>

              {/* Date range */}
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(0); }}
                  className="h-8 rounded-lg border border-[#EFEFEF] bg-white px-2 text-xs text-[#6F767E] focus:border-[#3B6B8A] focus:outline-none"
                />
                <span className="text-xs text-[#9A9FA5]">to</span>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(0); }}
                  className="h-8 rounded-lg border border-[#EFEFEF] bg-white px-2 text-xs text-[#6F767E] focus:border-[#3B6B8A] focus:outline-none"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction table */}
      <Card className="shadow-sm border-[#EFEFEF]">
        <CardContent className="pt-0 pb-0">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-[#9A9FA5]">
              {hasActiveFilters ? "No transactions match your filters" : "No transactions found"}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#EFEFEF]">
                      <th className="w-8 pb-2 pt-4" />
                      <SortHeader field="date" label="Date" current={sortField} dir={sortDir} onSort={handleSort} />
                      <SortHeader field="description" label="Description" current={sortField} dir={sortDir} onSort={handleSort} />
                      <th className="pb-2 pt-4 text-left text-xs font-medium text-[#9A9FA5] pr-4 hidden md:table-cell">Accounts</th>
                      <SortHeader field="amount" label="Amount" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((tx) => {
                      const isExpanded = expandedTx.has(tx.guid);
                      // For simple 2-split transactions, show debit/credit summary
                      const primarySplit = tx.splits.find((s) => s.amount > 0) ?? tx.splits[0];
                      const counterSplit = tx.splits.find((s) => s !== primarySplit) ?? tx.splits[1];
                      const isMultiSplit = tx.splits.length > 2;

                      return (
                        <TransactionRow
                          key={tx.guid}
                          tx={tx}
                          primarySplit={primarySplit}
                          counterSplit={counterSplit}
                          isMultiSplit={isMultiSplit}
                          isExpanded={isExpanded}
                          currency={currency}
                          onToggle={toggleExpand}
                          onEdit={isWritable ? (tx) => { setEditingTx(tx); setShowAddSheet(true); } : undefined}
                          onDelete={isWritable ? (guid) => setDeletingGuid(guid) : undefined}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t border-[#EFEFEF] py-3">
                  <span className="text-xs text-[#9A9FA5]">
                    {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, filtered.length)} of{" "}
                    {filtered.length.toLocaleString()}
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
    </div>
  );
}

function TransactionRow({
  tx,
  primarySplit,
  counterSplit,
  isMultiSplit,
  isExpanded,
  currency,
  onToggle,
  onEdit,
  onDelete,
}: {
  tx: LedgerTransaction;
  primarySplit: LedgerTransaction["splits"][0];
  counterSplit: LedgerTransaction["splits"][0] | undefined;
  isMultiSplit: boolean;
  isExpanded: boolean;
  currency: string;
  onToggle: (guid: string) => void;
  onEdit?: (tx: LedgerTransaction) => void;
  onDelete?: (guid: string) => void;
}) {
  return (
    <>
      <tr
        className={`border-b border-[#EFEFEF] cursor-pointer transition-colors hover:bg-[#F9FAFB] ${isExpanded ? "bg-[#F9FAFB]" : ""}`}
        onClick={() => onToggle(tx.guid)}
      >
        {/* Expand toggle */}
        <td className="py-2.5 pl-1 pr-1">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[#9A9FA5]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[#9A9FA5]" />
          )}
        </td>

        {/* Date */}
        <td className="whitespace-nowrap py-2.5 pr-4 text-xs text-[#6F767E]" data-d>
          {formatDate(tx.date)}
        </td>

        {/* Description */}
        <td className="py-2.5 pr-4 text-xs text-[#1A1D1F]" data-d>
          <div className="flex items-center gap-2">
            <span>{tx.description}</span>
            {isMultiSplit && !isExpanded && (
              <span className="rounded bg-[#F4F5F7] px-1.5 py-0.5 text-[10px] text-[#9A9FA5]">
                {tx.splits.length} splits
              </span>
            )}
          </div>
        </td>

        {/* Accounts summary */}
        <td className="hidden py-2.5 pr-4 text-xs text-[#6F767E] md:table-cell" data-d>
          {isMultiSplit ? (
            <span className="italic text-[#9A9FA5]">Multiple accounts</span>
          ) : (
            <span>
              {primarySplit.accountName}
              <span className="mx-1 text-[#9A9FA5]">&larr;</span>
              {counterSplit?.accountName ?? "—"}
            </span>
          )}
        </td>

        {/* Amount (largest absolute split) */}
        <td className="whitespace-nowrap py-2.5 text-right text-xs font-medium" data-v>
          <span className={primarySplit.amount > 0 ? "text-[#1A1D1F]" : "text-[#E87C6B]"}>
            {formatCurrency(Math.abs(primarySplit.amount), currency)}
          </span>
        </td>
      </tr>

      {/* Expanded splits */}
      {isExpanded && (
        <tr className="bg-[#F9FAFB]">
          <td colSpan={5} className="px-2 pb-3 pt-0">
            <div className="ml-6 rounded-lg border border-[#EFEFEF] bg-white">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#EFEFEF]">
                    <th className="py-1.5 pl-3 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-[#9A9FA5]">Account</th>
                    <th className="py-1.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-[#9A9FA5] hidden sm:table-cell">Memo</th>
                    <th className="py-1.5 pr-3 text-center text-[10px] font-medium uppercase tracking-wider text-[#9A9FA5] w-8">Status</th>
                    <th className="py-1.5 pr-3 text-right text-[10px] font-medium uppercase tracking-wider text-[#9A9FA5]">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {tx.splits.map((split, i) => {
                    const rec = reconcileLabel(split.reconcileState);
                    return (
                      <tr key={i} className="border-b border-[#EFEFEF] last:border-0">
                        <td className="py-1.5 pl-3 pr-3 text-xs text-[#1A1D1F]" data-d>
                          <div className="flex flex-col">
                            <span>{split.accountFullPath}</span>
                          </div>
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-[#9A9FA5] hidden sm:table-cell" data-d>
                          {split.memo}
                        </td>
                        <td className="py-1.5 pr-3 text-center">
                          <span className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-medium ${rec.className}`}>
                            {rec.text}
                          </span>
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-3 text-right text-xs font-medium" data-v>
                          <span className={split.amount >= 0 ? "text-[#1A1D1F]" : "text-[#E87C6B]"}>
                            {split.amount >= 0 ? "" : "−"}{formatCurrency(Math.abs(split.amount), currency)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Edit / Delete buttons */}
              {(onEdit || onDelete) && (
                <div className="flex items-center justify-end gap-1.5 border-t border-[#EFEFEF] px-3 py-2">
                  {onEdit && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onEdit(tx); }}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#3B6B8A] transition-colors hover:bg-[#3B6B8A]/10"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit
                    </button>
                  )}
                  {onDelete && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(tx.guid); }}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#E87C6B] transition-colors hover:bg-red-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
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
      className={`cursor-pointer select-none pb-2 pt-4 pr-4 text-xs font-medium text-[#9A9FA5] transition-colors hover:text-[#6F767E] ${align === "right" ? "text-right !pr-0" : "text-left"} ${className ?? ""}`}
      onClick={() => onSort(field)}
    >
      {label}
      <span className="ml-1 inline-block w-3 text-[10px]">
        {active ? (dir === "asc" ? "▲" : "▼") : ""}
      </span>
    </th>
  );
}
