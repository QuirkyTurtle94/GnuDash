"use client";

import { useMemo, useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { useDashboard } from "@/lib/dashboard-context";
import type { AccountNode, LedgerTransaction, LedgerSplit } from "@/lib/types/gnucash";
import { Search, ChevronDown, ChevronRight, X, Plus, Pencil, Trash2 } from "lucide-react";
import { AddTransactionSheet } from "@/components/add-transaction-sheet";

const PAGE_SIZE = 50;

type SortField = "date" | "description" | "transfer" | "amount";
type SortDir = "asc" | "desc";

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

/**
 * GnuCash-style register view for a single account.
 * Shows transactions where this account appears as a split,
 * with running balance, transfer account, and reconciliation status.
 */
export function AccountLedger({
  account,
}: {
  account: AccountNode;
}) {
  const { data, isWritable, deleteTransaction } = useDashboard();
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [editingTx, setEditingTx] = useState<LedgerTransaction | null>(null);
  const [deletingGuid, setDeletingGuid] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [expandedTx, setExpandedTx] = useState<Set<string>>(new Set());

  const creditTypes = new Set(["INCOME", "EQUITY", "LIABILITY", "CREDIT", "PAYABLE"]);
  const isCredit = creditTypes.has(account.type);

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
      setSortDir(field === "date" ? "asc" : "desc");
    }
    setPage(0);
  }

  // Filter transactions to those involving this account, and compute running balance
  const { rows, runningBalance } = useMemo(() => {
    if (!data) return { rows: [], runningBalance: 0 };

    const searchLower = search.toLowerCase();

    // Get all transactions with a split in this account
    type RegisterRow = {
      tx: LedgerTransaction;
      accountSplit: LedgerSplit;
      transferSplits: LedgerSplit[];
      balance: number;
    };

    // First pass: collect matching transactions sorted by date asc for running balance
    const matching: { tx: LedgerTransaction; accountSplit: LedgerSplit; transferSplits: LedgerSplit[] }[] = [];

    for (const tx of data.ledgerTransactions) {
      const accountSplit = tx.splits.find((s) => s.accountGuid === account.guid);
      if (!accountSplit) continue;

      // Apply search filter
      if (searchLower) {
        const descMatch = tx.description.toLowerCase().includes(searchLower);
        const numMatch = tx.num.toLowerCase().includes(searchLower);
        const splitMatch = tx.splits.some(
          (s) =>
            s.accountName.toLowerCase().includes(searchLower) ||
            s.accountFullPath.toLowerCase().includes(searchLower) ||
            s.memo.toLowerCase().includes(searchLower)
        );
        if (!descMatch && !numMatch && !splitMatch) continue;
      }

      const transferSplits = tx.splits.filter((s) => s !== accountSplit);
      matching.push({ tx, accountSplit, transferSplits });
    }

    // Sort by date ascending for running balance calculation
    matching.sort((a, b) => a.tx.date.localeCompare(b.tx.date) || a.tx.guid.localeCompare(b.tx.guid));

    // Compute running balances
    let balance = 0;
    const withBalance: RegisterRow[] = matching.map((m) => {
      // Use quantity (account's native commodity) for the register
      const amount = isCredit ? -m.accountSplit.quantity : m.accountSplit.quantity;
      balance += amount;
      return { ...m, balance };
    });

    // Now apply the user's sort
    const sorted = [...withBalance];
    sorted.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "date":
          cmp = a.tx.date.localeCompare(b.tx.date) || a.tx.guid.localeCompare(b.tx.guid);
          break;
        case "description":
          cmp = a.tx.description.localeCompare(b.tx.description, undefined, { sensitivity: "base" });
          break;
        case "transfer":
          cmp = (a.transferSplits[0]?.accountName ?? "").localeCompare(b.transferSplits[0]?.accountName ?? "");
          break;
        case "amount": {
          cmp = Math.abs(a.accountSplit.quantity) - Math.abs(b.accountSplit.quantity);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return { rows: sorted, runningBalance: balance };
  }, [data, account.guid, search, sortField, sortDir, isCredit]);

  // Reset page on search change
  const filterKey = search;
  useMemo(() => setPage(0), [filterKey]);

  if (!data) return null;

  const currency = account.commodityMnemonic || data.currency;
  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageData = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      {/* Header row with account info and controls */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#9A9FA5]">
            {rows.length.toLocaleString()} transaction{rows.length !== 1 ? "s" : ""}
          </span>
          <span className="text-xs text-[#9A9FA5]">|</span>
          <span className="text-sm font-medium text-[#1A1D1F]" data-v>
            Balance: {formatCurrency(Math.abs(runningBalance), currency)}
            {runningBalance < 0 ? " CR" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isWritable && (
            <button
              onClick={() => { setEditingTx(null); setShowAddSheet(true); }}
              className="flex items-center gap-1.5 rounded-lg bg-[#3B6B8A] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#2D5570]"
              title="Add transaction"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New Transaction</span>
            </button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9FA5]" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search descriptions, accounts, memos..."
          className="h-9 w-full rounded-lg border border-[#EFEFEF] bg-white pl-9 pr-3 text-sm text-[#1A1D1F] placeholder:text-[#9A9FA5] focus:border-[#3B6B8A] focus:outline-none focus:ring-1 focus:ring-[#3B6B8A]"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9A9FA5] hover:text-[#6F767E]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Register table */}
      <Card className="shadow-sm border-[#EFEFEF]">
        <CardContent className="pt-0 pb-0">
          {rows.length === 0 ? (
            <p className="py-12 text-center text-sm text-[#9A9FA5]">
              {search ? "No transactions match your search" : "No transactions for this account"}
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[#EFEFEF]">
                      <th className="w-8 pb-2 pt-3" />
                      <RegisterSortHeader field="date" label="Date" current={sortField} dir={sortDir} onSort={handleSort} />
                      <RegisterSortHeader field="description" label="Description" current={sortField} dir={sortDir} onSort={handleSort} />
                      <RegisterSortHeader field="transfer" label="Transfer" current={sortField} dir={sortDir} onSort={handleSort} className="hidden md:table-cell" />
                      <th className="pb-2 pt-3 text-center text-xs font-medium text-[#9A9FA5] w-10 hidden sm:table-cell">R</th>
                      <RegisterSortHeader field="amount" label="Increase" current={sortField} dir={sortDir} onSort={handleSort} align="right" />
                      <th className="pb-2 pt-3 text-right text-xs font-medium text-[#9A9FA5] pr-0">Decrease</th>
                      <th className="pb-2 pt-3 text-right text-xs font-medium text-[#9A9FA5] pl-4 hidden lg:table-cell">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageData.map((row) => {
                      const isExpanded = expandedTx.has(row.tx.guid);
                      const quantity = isCredit ? -row.accountSplit.quantity : row.accountSplit.quantity;
                      const isIncrease = quantity > 0;
                      const transferName = row.transferSplits.length === 1
                        ? row.transferSplits[0].accountFullPath
                        : row.transferSplits.length > 1
                          ? `-- Split (${row.transferSplits.length}) --`
                          : "";
                      const rec = reconcileLabel(row.accountSplit.reconcileState);

                      return (
                        <RegisterRow
                          key={row.tx.guid}
                          tx={row.tx}
                          isExpanded={isExpanded}
                          transferName={transferName}
                          isMultiSplit={row.transferSplits.length > 1}
                          quantity={quantity}
                          isIncrease={isIncrease}
                          balance={row.balance}
                          currency={currency}
                          rec={rec}
                          onToggle={toggleExpand}
                          onEdit={isWritable ? (tx) => { setEditingTx(tx); setShowAddSheet(true); } : undefined}
                          onDelete={isWritable ? (guid) => setDeletingGuid(guid) : undefined}
                          transferSplits={row.transferSplits}
                          accountSplit={row.accountSplit}
                          baseCurrency={data.currency}
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
                    {page * PAGE_SIZE + 1}&ndash;{Math.min((page + 1) * PAGE_SIZE, rows.length)} of{" "}
                    {rows.length.toLocaleString()}
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

      {/* Add/Edit Transaction Sheet */}
      {isWritable && (
        <>
          <AddTransactionSheet
            open={showAddSheet}
            onOpenChange={(open) => {
              setShowAddSheet(open);
              if (!open) setEditingTx(null);
            }}
            editingTransaction={editingTx}
            defaultAccountGuid={!editingTx ? account.guid : undefined}
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
    </div>
  );
}

function RegisterRow({
  tx,
  isExpanded,
  transferName,
  isMultiSplit,
  quantity,
  isIncrease,
  balance,
  currency,
  rec,
  onToggle,
  onEdit,
  onDelete,
  transferSplits,
  accountSplit,
  baseCurrency,
}: {
  tx: LedgerTransaction;
  isExpanded: boolean;
  transferName: string;
  isMultiSplit: boolean;
  quantity: number;
  isIncrease: boolean;
  balance: number;
  currency: string;
  rec: { text: string; className: string };
  onToggle: (guid: string) => void;
  onEdit?: (tx: LedgerTransaction) => void;
  onDelete?: (guid: string) => void;
  transferSplits: LedgerSplit[];
  accountSplit: LedgerSplit;
  baseCurrency: string;
}) {
  return (
    <>
      <tr
        className={`border-b border-[#EFEFEF] cursor-pointer transition-colors hover:bg-[#F9FAFB] ${isExpanded ? "bg-[#F9FAFB]" : ""}`}
        onClick={() => onToggle(tx.guid)}
      >
        {/* Expand toggle */}
        <td className="py-2 pl-1 pr-1">
          {isExpanded ? (
            <ChevronDown className="h-3.5 w-3.5 text-[#9A9FA5]" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-[#9A9FA5]" />
          )}
        </td>

        {/* Date */}
        <td className="whitespace-nowrap py-2 pr-4 text-xs text-[#6F767E]" data-d>
          {formatDate(tx.date)}
        </td>

        {/* Description */}
        <td className="py-2 pr-4 text-xs text-[#1A1D1F]" data-d>
          <div className="flex items-center gap-2">
            <span className="truncate">{tx.description || <span className="italic text-[#9A9FA5]">No description</span>}</span>
            {tx.num && (
              <span className="shrink-0 rounded bg-[#F4F5F7] px-1.5 py-0.5 text-[10px] text-[#9A9FA5]">
                #{tx.num}
              </span>
            )}
          </div>
        </td>

        {/* Transfer account */}
        <td className="hidden py-2 pr-4 text-xs text-[#6F767E] md:table-cell truncate max-w-[200px]" data-d>
          {isMultiSplit ? (
            <span className="italic text-[#9A9FA5]">{transferName}</span>
          ) : (
            transferName
          )}
        </td>

        {/* Reconcile status */}
        <td className="py-2 text-center hidden sm:table-cell">
          <span className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-medium ${rec.className}`}>
            {rec.text}
          </span>
        </td>

        {/* Increase (positive amount) */}
        <td className="whitespace-nowrap py-2 text-right text-xs font-medium" data-v>
          {isIncrease ? (
            <span className="text-[#1A1D1F]">{formatCurrency(Math.abs(quantity), currency)}</span>
          ) : null}
        </td>

        {/* Decrease (negative amount) */}
        <td className="whitespace-nowrap py-2 text-right text-xs font-medium pr-0" data-v>
          {!isIncrease ? (
            <span className="text-[#E87C6B]">{formatCurrency(Math.abs(quantity), currency)}</span>
          ) : null}
        </td>

        {/* Running balance */}
        <td className="whitespace-nowrap py-2 text-right text-xs font-medium pl-4 hidden lg:table-cell" data-v>
          <span className={balance < 0 ? "text-[#E87C6B]" : "text-[#1A1D1F]"}>
            {balance < 0 ? "−" : ""}{formatCurrency(Math.abs(balance), currency)}
          </span>
        </td>
      </tr>

      {/* Expanded split details */}
      {isExpanded && (
        <tr className="bg-[#F9FAFB]">
          <td colSpan={8} className="px-2 pb-3 pt-0">
            <div className="ml-6 rounded-lg border border-[#EFEFEF] bg-white">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#EFEFEF]">
                    <th className="py-1.5 pl-3 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-[#9A9FA5]">Account</th>
                    <th className="py-1.5 pr-3 text-left text-[10px] font-medium uppercase tracking-wider text-[#9A9FA5] hidden sm:table-cell">Memo</th>
                    <th className="py-1.5 pr-3 text-center text-[10px] font-medium uppercase tracking-wider text-[#9A9FA5] w-8">R</th>
                    <th className="py-1.5 pr-3 text-right text-[10px] font-medium uppercase tracking-wider text-[#9A9FA5]">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {tx.splits.map((split, i) => {
                    const splitRec = reconcileLabel(split.reconcileState);
                    const isThisAccount = split.accountGuid === accountSplit.accountGuid;
                    return (
                      <tr key={i} className={`border-b border-[#EFEFEF] last:border-0 ${isThisAccount ? "bg-[#3B6B8A]/5" : ""}`}>
                        <td className="py-1.5 pl-3 pr-3 text-xs text-[#1A1D1F]" data-d>
                          <span className={isThisAccount ? "font-medium" : ""}>{split.accountFullPath}</span>
                        </td>
                        <td className="py-1.5 pr-3 text-xs text-[#9A9FA5] hidden sm:table-cell" data-d>
                          {split.memo}
                        </td>
                        <td className="py-1.5 pr-3 text-center">
                          <span className={`inline-flex h-4 w-4 items-center justify-center rounded text-[9px] font-medium ${splitRec.className}`}>
                            {splitRec.text}
                          </span>
                        </td>
                        <td className="whitespace-nowrap py-1.5 pr-3 text-right text-xs font-medium" data-v>
                          <span className={split.amount >= 0 ? "text-[#1A1D1F]" : "text-[#E87C6B]"}>
                            {split.amount >= 0 ? "" : "−"}{formatCurrency(Math.abs(split.amount), baseCurrency)}
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

function RegisterSortHeader({
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
      className={`cursor-pointer select-none pb-2 pt-3 pr-4 text-xs font-medium text-[#9A9FA5] transition-colors hover:text-[#6F767E] ${align === "right" ? "text-right" : "text-left"} ${className ?? ""}`}
      onClick={() => onSort(field)}
    >
      {label}
      <span className="ml-1 inline-block w-3 text-[10px]">
        {active ? (dir === "asc" ? "▲" : "▼") : ""}
      </span>
    </th>
  );
}
