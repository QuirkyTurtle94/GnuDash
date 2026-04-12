"use client";

import { useState, useCallback, useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import { useDashboard } from "@/lib/dashboard-context";
import type { AccountNode } from "@/lib/types/gnucash";
import { ChevronDown, ChevronRight, Plus, Pencil, Trash2, X, List } from "lucide-react";
import { AccountEditorSheet } from "@/components/account-editor-sheet";
import { DeleteAccountDialog } from "@/components/delete-account-dialog";
import { AccountLedger } from "@/components/account-ledger";

// ── Types ────────────────────────────────────────────────────────

interface AccountTab {
  guid: string;
  name: string;
  fullPath: string;
  account: AccountNode;
}

// ── Constants ────────────────────────────────────────────────────

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

// ── Helpers ──────────────────────────────────────────────────────

/** Recursively find an AccountNode by GUID */
function findAccount(nodes: AccountNode[], guid: string): AccountNode | null {
  for (const n of nodes) {
    if (n.guid === guid) return n;
    const found = findAccount(n.children, guid);
    if (found) return found;
  }
  return null;
}

/** Build full path for an account by walking up to root */
function buildFullPath(account: AccountNode, allAccounts: AccountNode[]): string {
  // The AccountNode already has fullPath on it from the tree builder, but it may not
  // be set for all nodes. Use the name as fallback.
  return account.fullPath || account.name;
}

// ── Main Component ───────────────────────────────────────────────

export default function AccountsPage() {
  const { data, isWritable } = useDashboard();

  // Tab state: "accounts" is the permanent first tab, then open account register tabs
  const [openTabs, setOpenTabs] = useState<AccountTab[]>([]);
  const [activeTab, setActiveTab] = useState<string>("accounts"); // "accounts" or account guid
  const tabBarRef = useRef<HTMLDivElement>(null);

  // Chart of accounts state
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

  /** Open an account register tab (or switch to it if already open) */
  const openAccountTab = useCallback((account: AccountNode) => {
    setOpenTabs((prev) => {
      const exists = prev.find((t) => t.guid === account.guid);
      if (exists) return prev;
      return [...prev, {
        guid: account.guid,
        name: account.name,
        fullPath: account.fullPath || account.name,
        account,
      }];
    });
    setActiveTab(account.guid);
  }, []);

  /** Close an account register tab */
  const closeTab = useCallback((guid: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setOpenTabs((prev) => prev.filter((t) => t.guid !== guid));
    setActiveTab((prev) => {
      if (prev === guid) return "accounts";
      return prev;
    });
  }, []);

  /** Handle middle-click to close a tab */
  const handleTabMouseDown = useCallback((guid: string, e: React.MouseEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(guid);
    }
  }, [closeTab]);

  if (!data) return null;

  const currency = data.currency;
  const allExpanded = expanded.size > 0;

  // Resolve active tab's account (may have been deleted/changed)
  const activeTabAccount = activeTab !== "accounts"
    ? openTabs.find((t) => t.guid === activeTab)
    : null;

  // If the active tab's account was removed, fall back to accounts
  const resolvedActiveTab = activeTabAccount ? activeTab : (activeTab === "accounts" ? "accounts" : "accounts");

  return (
    <div className="flex flex-col gap-0">
      {/* ── Tab Bar ─────────────────────────────────────── */}
      <div
        ref={tabBarRef}
        className="flex items-end gap-0 overflow-x-auto border-b border-[#EFEFEF] bg-white -mx-4 sm:-mx-6 md:-mx-8 -mt-4 sm:-mt-6 md:-mt-8 px-4 sm:px-6 md:px-8 scrollbar-thin"
      >
        {/* Accounts tab (always first, cannot be closed) */}
        <button
          onClick={() => setActiveTab("accounts")}
          className={`group relative flex shrink-0 items-center gap-2 px-4 py-2.5 text-sm transition-colors ${
            resolvedActiveTab === "accounts"
              ? "text-[#1A1D1F] font-medium"
              : "text-[#6F767E] hover:text-[#1A1D1F]"
          }`}
        >
          <List className="h-3.5 w-3.5" />
          <span>Accounts</span>
          {resolvedActiveTab === "accounts" && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6B8A] rounded-full" />
          )}
        </button>

        {/* Account register tabs */}
        {openTabs.map((tab) => {
          const isActive = resolvedActiveTab === tab.guid;
          const typeColor = TYPE_COLORS[tab.account.type];
          return (
            <button
              key={tab.guid}
              onClick={() => setActiveTab(tab.guid)}
              onMouseDown={(e) => handleTabMouseDown(tab.guid, e)}
              className={`group relative flex shrink-0 items-center gap-1.5 pl-3 pr-1.5 py-2.5 text-sm transition-colors max-w-[200px] ${
                isActive
                  ? "text-[#1A1D1F] font-medium"
                  : "text-[#6F767E] hover:text-[#1A1D1F]"
              }`}
              title={tab.fullPath}
            >
              {typeColor && (
                <span className={`h-2 w-2 rounded-full shrink-0 ${typeColor.split(" ")[0].replace("bg-", "bg-")}`}
                  style={{ backgroundColor: typeColor.includes("emerald") ? "#059669" : typeColor.includes("blue") ? "#2563eb" : typeColor.includes("teal") ? "#0d9488" : typeColor.includes("amber") ? "#d97706" : typeColor.includes("red") ? "#dc2626" : typeColor.includes("purple") ? "#7c3aed" : typeColor.includes("cyan") ? "#0891b2" : "#6b7280" }}
                />
              )}
              <span className="truncate">{tab.name}</span>
              <span
                onClick={(e) => closeTab(tab.guid, e)}
                className="ml-1 flex h-5 w-5 shrink-0 items-center justify-center rounded transition-colors hover:bg-[#EFEFEF] text-[#9A9FA5] hover:text-[#6F767E]"
                title="Close tab"
              >
                <X className="h-3 w-3" />
              </span>
              {isActive && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#3B6B8A] rounded-full" />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ────────────────────────────────── */}
      <div className="pt-4 sm:pt-6">
        {/* Experimental banner */}
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <svg className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>
            This page is experimental and hasn&apos;t been fully tested. Please{" "}
            <a
              href="https://github.com/QuirkyTurtle94/GnuDash/issues"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline hover:text-amber-900"
            >
              raise an issue on GitHub
            </a>{" "}
            with any feedback or requests.
          </p>
        </div>

        {resolvedActiveTab === "accounts" ? (
          /* ── Chart of Accounts ─────────────────────── */
          <div className="flex flex-col gap-4 sm:gap-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-lg font-semibold text-[#1A1D1F] sm:text-xl">Chart of Accounts</h2>
                <span className="text-xs text-[#9A9FA5] hidden sm:inline">Double-click to open register</span>
              </div>
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
                            onOpenRegister={openAccountTab}
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
        ) : activeTabAccount ? (
          /* ── Account Register Tab ──────────────────── */
          <AccountLedger account={activeTabAccount.account} />
        ) : null}
      </div>
    </div>
  );
}

// ── AccountRow ───────────────────────────────────────────────────

function AccountRow({
  account,
  depth,
  expanded,
  onToggle,
  currency,
  isWritable,
  onEdit,
  onDelete,
  onOpenRegister,
}: {
  account: AccountNode;
  depth: number;
  expanded: Set<string>;
  onToggle: (guid: string) => void;
  currency: string;
  isWritable: boolean;
  onEdit: (account: AccountNode) => void;
  onDelete: (account: AccountNode) => void;
  onOpenRegister: (account: AccountNode) => void;
}) {
  const hasChildren = account.children.length > 0;
  const isExpanded = expanded.has(account.guid);
  const visibleChildren = account.children.filter((c) => !c.hidden);
  const isTopLevel = depth === 0;
  const typeColor = TYPE_COLORS[account.type] ?? "bg-gray-50 text-gray-700";

  return (
    <>
      <tr
        className={`group border-b border-[#EFEFEF] transition-colors cursor-pointer hover:bg-[#F9FAFB] ${isTopLevel ? "bg-[#FAFBFC]" : ""}`}
        onClick={hasChildren ? () => onToggle(account.guid) : undefined}
        onDoubleClick={(e) => {
          e.stopPropagation();
          // Don't open ROOT type accounts
          if (account.type !== "ROOT") {
            onOpenRegister(account);
          }
        }}
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

        {/* Balance (in account's native currency) */}
        <td className="whitespace-nowrap py-2.5 pr-3 text-right text-xs font-medium" data-v>
          {account.type !== "ROOT" && (() => {
            const creditTypes = new Set(["INCOME", "EQUITY", "LIABILITY", "CREDIT", "PAYABLE"]);
            const displayBalance = creditTypes.has(account.type) ? -account.nativeBalance : account.nativeBalance;
            const displayCurrency = account.nativeCurrencyMnemonic;
            return (
              <span className={displayBalance < 0 ? "text-[#E87C6B]" : "text-[#1A1D1F]"}>
                {displayBalance < 0 ? "−" : ""}{formatCurrency(Math.abs(displayBalance), displayCurrency)}
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
            onOpenRegister={onOpenRegister}
          />
        ))}
    </>
  );
}
