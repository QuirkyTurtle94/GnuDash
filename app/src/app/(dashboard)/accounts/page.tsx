"use client";

import { useState, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { useDashboard } from "@/lib/dashboard-context";
import type { AccountNode } from "@/lib/types/gnucash";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2 } from "lucide-react";
import { AccountEditorSheet } from "@/components/account-editor-sheet";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  ASSET: "Asset",
  BANK: "Bank",
  CASH: "Cash",
  CREDIT: "Credit Card",
  LIABILITY: "Liability",
  STOCK: "Stock",
  MUTUAL: "Mutual Fund",
  INCOME: "Income",
  EXPENSE: "Expense",
  EQUITY: "Equity",
  RECEIVABLE: "Receivable",
  PAYABLE: "Payable",
  TRADING: "Trading",
};

const TYPE_COLORS: Record<string, string> = {
  ASSET: "bg-emerald-50 text-emerald-700",
  BANK: "bg-emerald-50 text-emerald-700",
  CASH: "bg-emerald-50 text-emerald-700",
  STOCK: "bg-blue-50 text-blue-700",
  MUTUAL: "bg-blue-50 text-blue-700",
  INCOME: "bg-teal-50 text-teal-700",
  EXPENSE: "bg-amber-50 text-amber-700",
  LIABILITY: "bg-red-50 text-red-700",
  CREDIT: "bg-red-50 text-red-700",
  PAYABLE: "bg-red-50 text-red-700",
  EQUITY: "bg-purple-50 text-purple-700",
  RECEIVABLE: "bg-cyan-50 text-cyan-700",
  TRADING: "bg-gray-50 text-gray-700",
};

export default function AccountsPage() {
  const { data, isWritable } = useDashboard();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showEditor, setShowEditor] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountNode | null>(null);
  const [deletingAccount, setDeletingAccount] = useState<AccountNode | null>(null);

  const toggle = useCallback((guid: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });
  }, []);

  const expandAll = useCallback(() => {
    if (!data) return;
    const allGuids = new Set<string>();
    function collect(nodes: AccountNode[]) {
      for (const n of nodes) {
        if (n.children.length > 0) {
          allGuids.add(n.guid);
          collect(n.children);
        }
      }
    }
    collect(data.accounts);
    setExpanded(allGuids);
  }, [data]);

  const collapseAll = useCallback(() => {
    setExpanded(new Set());
  }, []);

  if (!data) return null;

  const currency = data.currency;
  const allExpanded = expanded.size > 0;

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[#1A1D1F] sm:text-xl">Chart of Accounts</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={allExpanded ? collapseAll : expandAll}
            className="rounded-lg border border-[#EFEFEF] px-3 py-1.5 text-xs text-[#6F767E] transition-colors hover:bg-[#F4F5F7]"
          >
            {allExpanded ? "Collapse all" : "Expand all"}
          </button>
          {isWritable && (
            <button
              onClick={() => { setEditingAccount(null); setShowEditor(true); }}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3B6B8A] text-white transition-colors hover:bg-[#2D5570]"
              title="Add account"
            >
              <Plus className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <Card className="shadow-sm border-[#EFEFEF]">
        <CardContent className="pt-0 pb-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#EFEFEF]">
                  <th className="py-3 text-left text-xs font-medium text-[#9A9FA5]">Account</th>
                  <th className="py-3 text-left text-xs font-medium text-[#9A9FA5] hidden sm:table-cell w-24">Type</th>
                  <th className="py-3 text-right text-xs font-medium text-[#9A9FA5] w-32">Balance</th>
                  {isWritable && <th className="py-3 w-16" />}
                </tr>
              </thead>
              <tbody>
                {data.accounts
                  .filter((a) => !a.hidden)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((account) => (
                    <AccountRow
                      key={account.guid}
                      account={account}
                      depth={0}
                      expanded={expanded}
                      onToggle={toggle}
                      currency={currency}
                      isWritable={isWritable}
                      onEdit={(a) => { setEditingAccount(a); setShowEditor(true); }}
                      onDelete={(a) => setDeletingAccount(a)}
                    />
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {isWritable && (
        <AccountEditorSheet
          open={showEditor}
          onOpenChange={(open) => { setShowEditor(open); if (!open) setEditingAccount(null); }}
          editingAccount={editingAccount}
        />
      )}

      {deletingAccount && (
        <DeleteAccountDialog
          account={deletingAccount}
          onClose={() => setDeletingAccount(null)}
        />
      )}
    </div>
  );
}

function AccountRow({
  account,
  depth,
  expanded,
  onToggle,
  currency,
  isWritable,
  onEdit,
  onDelete,
}: {
  account: AccountNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (guid: string) => void;
  currency: string;
  isWritable: boolean;
  onEdit: (account: AccountNode) => void;
  onDelete: (account: AccountNode) => void;
}) {
  const hasChildren = account.children.length > 0;
  const isExpanded = expanded.has(account.guid);
  const visibleChildren = account.children.filter((c) => !c.hidden);
  const isTopLevel = depth === 0;
  const typeColor = TYPE_COLORS[account.type] ?? "bg-gray-50 text-gray-700";

  return (
    <>
      <tr
        className={`group border-b border-[#EFEFEF] transition-colors ${hasChildren ? "cursor-pointer hover:bg-[#F9FAFB]" : "hover:bg-[#F9FAFB]"} ${isTopLevel ? "bg-[#FAFBFC]" : ""}`}
        onClick={hasChildren ? () => onToggle(account.guid) : undefined}
      >
        {/* Account name with indentation */}
        <td className="py-2.5 pr-4">
          <div className="flex items-center" style={{ paddingLeft: `${depth * 20 + 4}px` }}>
            <span className="mr-2 flex h-4 w-4 shrink-0 items-center justify-center">
              {hasChildren ? (
                isExpanded ? (
                  <ChevronDown className="h-3.5 w-3.5 text-[#9A9FA5]" />
                ) : (
                  <ChevronRight className="h-3.5 w-3.5 text-[#9A9FA5]" />
                )
              ) : (
                <span className="h-1 w-1 rounded-full bg-[#D1D5DB]" />
              )}
            </span>
            <span className={`text-xs ${isTopLevel ? "font-semibold text-[#1A1D1F]" : depth === 1 ? "font-medium text-[#1A1D1F]" : "text-[#6F767E]"}`} data-d>
              {account.name}
            </span>
          </div>
        </td>

        {/* Account type badge */}
        <td className="hidden py-2.5 pr-4 sm:table-cell">
          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${typeColor}`}>
            {ACCOUNT_TYPE_LABELS[account.type] ?? account.type}
          </span>
        </td>

        {/* Balance */}
        <td className="whitespace-nowrap py-2.5 pr-3 text-right text-xs font-medium" data-v>
          {account.type !== "ROOT" && (() => {
            const creditTypes = new Set(["INCOME", "EQUITY", "LIABILITY", "CREDIT", "PAYABLE"]);
            const displayBalance = creditTypes.has(account.type) ? -account.balance : account.balance;
            return (
              <span className={displayBalance < 0 ? "text-[#E87C6B]" : "text-[#1A1D1F]"}>
                {displayBalance < 0 ? "−" : ""}{formatCurrency(Math.abs(displayBalance), currency)}
              </span>
            );
          })()}
        </td>

        {/* Edit/Delete buttons */}
        {isWritable && (
          <td className="py-2.5 pr-2">
            <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(account); }}
                className="flex h-6 w-6 items-center justify-center rounded text-[#9A9FA5] hover:bg-[#3B6B8A]/10 hover:text-[#3B6B8A]"
                title="Edit account"
              >
                <Pencil className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(account); }}
                className="flex h-6 w-6 items-center justify-center rounded text-[#9A9FA5] hover:bg-red-50 hover:text-[#E87C6B]"
                title="Delete account"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </td>
        )}
      </tr>

      {/* Render children when expanded */}
      {isExpanded &&
        visibleChildren
          .sort((a, b) => a.name.localeCompare(b.name))
          .map((child) => (
          <AccountRow
            key={child.guid}
            account={child}
            depth={depth + 1}
            expanded={expanded}
            onToggle={onToggle}
            currency={currency}
            isWritable={isWritable}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
    </>
  );
}
