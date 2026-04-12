"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboard } from "@/lib/dashboard-context";
import { formatCurrency } from "@/lib/format";
import type { AccountNode, LedgerTransaction } from "@/lib/types/gnucash";
import { ArrowLeft, ArrowRight, Layers, Search, X } from "lucide-react";

/**
 * Bulk-edit workflow for cleaning up imported transactions.
 *
 * Groups simple (single-split, 2-posting) transactions by exact description
 * match and lets the user apply a rename and/or account reassignment across
 * every member of the group in one atomic DB write. Multi-split transactions
 * are excluded from grouping because "from"/"to" is ambiguous for them.
 */

interface TransactionGroup {
  key: string; // description (exact)
  description: string;
  transactions: LedgerTransaction[];
  totalValue: number; // absolute value sum in the tx currency
  currencyMnemonic: string;
  /** Most common "from" account in the group, or null if fully mixed. */
  dominantFromName: string | null;
  /** Most common "to" account in the group, or null if fully mixed. */
  dominantToName: string | null;
  fromIsMixed: boolean;
  toIsMixed: boolean;
  firstDate: string;
  lastDate: string;
  /**
   * Currency-GUID proxy: the commodity mnemonic of the tx splits. Used to
   * verify a target account is compatible before sending the mutation.
   */
  commodityMnemonic: string;
}

/** Flatten an account tree into a list of real (non-placeholder) accounts. */
function flattenAccounts(nodes: AccountNode[]): AccountNode[] {
  const out: AccountNode[] = [];
  const walk = (n: AccountNode) => {
    if (!n.placeholder && n.type !== "ROOT") out.push(n);
    for (const c of n.children) walk(c);
  };
  for (const n of nodes) walk(n);
  return out.sort((a, b) => a.fullPath.localeCompare(b.fullPath));
}

/**
 * Build groups of single-split (exactly 2-posting) transactions keyed by
 * exact description. Only returns groups with 2 or more members.
 */
function buildGroups(txs: LedgerTransaction[]): TransactionGroup[] {
  const byDescription = new Map<string, LedgerTransaction[]>();
  for (const tx of txs) {
    if (tx.splits.length !== 2) continue;
    // All splits must share one commodity for the "mixed" heuristic and
    // currency check to be meaningful.
    if (tx.splits[0].commodityMnemonic !== tx.splits[1].commodityMnemonic) continue;
    const list = byDescription.get(tx.description) ?? [];
    list.push(tx);
    byDescription.set(tx.description, list);
  }

  const groups: TransactionGroup[] = [];
  for (const [desc, list] of byDescription) {
    if (list.length < 2) continue;

    const fromCounts = new Map<string, number>();
    const toCounts = new Map<string, number>();
    let totalValue = 0;
    let firstDate = list[0].date;
    let lastDate = list[0].date;

    for (const tx of list) {
      if (tx.date < firstDate) firstDate = tx.date;
      if (tx.date > lastDate) lastDate = tx.date;
      for (const s of tx.splits) {
        if (s.amount < 0) {
          fromCounts.set(s.accountFullPath, (fromCounts.get(s.accountFullPath) ?? 0) + 1);
        } else if (s.amount > 0) {
          toCounts.set(s.accountFullPath, (toCounts.get(s.accountFullPath) ?? 0) + 1);
          totalValue += s.amount;
        }
      }
    }

    const fromEntries = Array.from(fromCounts.entries()).sort((a, b) => b[1] - a[1]);
    const toEntries = Array.from(toCounts.entries()).sort((a, b) => b[1] - a[1]);
    const fromIsMixed = fromEntries.length > 1;
    const toIsMixed = toEntries.length > 1;

    groups.push({
      key: desc,
      description: desc,
      transactions: list,
      totalValue,
      currencyMnemonic: list[0].splits[0].commodityMnemonic,
      dominantFromName: fromEntries.length > 0 ? fromEntries[0][0] : null,
      dominantToName: toEntries.length > 0 ? toEntries[0][0] : null,
      fromIsMixed,
      toIsMixed,
      firstDate,
      lastDate,
      commodityMnemonic: list[0].splits[0].commodityMnemonic,
    });
  }

  return groups.sort((a, b) => b.transactions.length - a.transactions.length);
}

export default function BulkEditPage() {
  const { data, isWritable, bulkEditTransactions } = useDashboard();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [newDescription, setNewDescription] = useState("");
  const [newFromGuid, setNewFromGuid] = useState("");
  const [newToGuid, setNewToGuid] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const groups = useMemo(
    () => (data ? buildGroups(data.ledgerTransactions) : []),
    [data],
  );

  const accounts = useMemo(
    () => (data ? flattenAccounts(data.accounts) : []),
    [data],
  );

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => g.description.toLowerCase().includes(q));
  }, [groups, searchQuery]);

  const selected = useMemo(
    () => groups.find((g) => g.key === selectedKey) ?? null,
    [groups, selectedKey],
  );

  /**
   * Accounts compatible with the selected group for account reassignment.
   * Must share the same commodity as the group's transactions.
   */
  const compatibleAccounts = useMemo(() => {
    if (!selected) return [];
    return accounts.filter((a) => a.commodityMnemonic === selected.commodityMnemonic);
  }, [accounts, selected]);

  function handleSelectGroup(key: string) {
    setSelectedKey(key);
    const g = groups.find((x) => x.key === key);
    setNewDescription(g?.description ?? "");
    setNewFromGuid("");
    setNewToGuid("");
    setError(null);
  }

  function clearSelection() {
    setSelectedKey(null);
    setNewDescription("");
    setNewFromGuid("");
    setNewToGuid("");
    setError(null);
  }

  const hasChanges = !!selected && (
    (newDescription.trim() !== "" && newDescription !== selected.description) ||
    newFromGuid !== "" ||
    newToGuid !== ""
  );

  async function handleApply() {
    if (!selected || !hasChanges) return;
    setSubmitting(true);
    setError(null);
    try {
      await bulkEditTransactions({
        transactionGuids: selected.transactions.map((t) => t.guid),
        newDescription: newDescription !== selected.description ? newDescription : undefined,
        newFromAccountGuid: newFromGuid || undefined,
        newToAccountGuid: newToGuid || undefined,
      });
      setShowPreview(false);
      clearSelection();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!data) return null;

  if (!isWritable) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <BreadcrumbBar />
        <Card>
          <CardContent className="p-6 text-sm text-[#6F767E]">
            Bulk edit requires the database to be open in editing mode. Click the
            <span className="mx-1 font-medium text-[#3B6B8A]">Read-only</span>
            button in the top bar to enable editing.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <BreadcrumbBar />

      <header className="flex items-start gap-3">
        <div className="mt-1 rounded-lg bg-[#3B6B8A]/10 p-2 text-[#3B6B8A]">
          <Layers className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1D1F]">Bulk edit transactions</h1>
          <p className="mt-1 text-sm text-[#6F767E]">
            Groups simple 2-posting transactions by exact description.
            Multi-split transactions are not shown. Changes commit atomically.
          </p>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* ── Groups list ────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9A9FA5]" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search descriptions..."
                  className="w-full rounded-lg border border-[#EFEFEF] bg-white py-1.5 pl-8 pr-3 text-sm outline-none focus:border-[#3B6B8A]"
                />
              </div>
              <span className="text-xs text-[#9A9FA5]">
                {filteredGroups.length} group{filteredGroups.length === 1 ? "" : "s"}
              </span>
            </div>

            {filteredGroups.length === 0 ? (
              <p className="px-2 py-8 text-center text-sm text-[#9A9FA5]">
                No matching groups found.
              </p>
            ) : (
              <div className="max-h-[70vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white text-xs text-[#9A9FA5]">
                    <tr>
                      <th className="py-2 pr-2 text-left font-normal">Description</th>
                      <th className="py-2 pr-2 text-right font-normal">Count</th>
                      <th className="py-2 pr-2 text-right font-normal">Total</th>
                      <th className="py-2 pr-2 text-left font-normal">Transfer</th>
                      <th className="py-2 text-left font-normal">Dates</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredGroups.map((g) => {
                      const isActive = g.key === selectedKey;
                      return (
                        <tr
                          key={g.key}
                          onClick={() => handleSelectGroup(g.key)}
                          className={`cursor-pointer border-t border-[#EFEFEF] transition-colors ${
                            isActive ? "bg-[#3B6B8A]/5" : "hover:bg-[#F4F5F7]"
                          }`}
                        >
                          <td className="py-2 pr-2 font-medium text-[#1A1D1F]">
                            {g.description}
                          </td>
                          <td className="py-2 pr-2 text-right text-[#6F767E]">
                            {g.transactions.length}
                          </td>
                          <td className="py-2 pr-2 text-right font-mono text-xs text-[#6F767E]">
                            {formatCurrency(g.totalValue, g.currencyMnemonic)}
                          </td>
                          <td className="py-2 pr-2 text-xs text-[#6F767E]">
                            {g.fromIsMixed ? <em className="text-[#9A9FA5]">(mixed)</em> : g.dominantFromName}
                            <ArrowRight className="mx-1 inline h-3 w-3 text-[#9A9FA5]" />
                            {g.toIsMixed ? <em className="text-[#9A9FA5]">(mixed)</em> : g.dominantToName}
                          </td>
                          <td className="py-2 text-xs text-[#9A9FA5]">
                            {g.firstDate === g.lastDate ? g.firstDate : `${g.firstDate} → ${g.lastDate}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Edit panel ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="p-4">
            {selected ? (
              <>
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#9A9FA5]">
                      Editing {selected.transactions.length} transaction
                      {selected.transactions.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-0.5 text-sm font-medium text-[#1A1D1F]">
                      {selected.description}
                    </p>
                  </div>
                  <button
                    onClick={clearSelection}
                    title="Clear selection"
                    className="rounded p-1 text-[#9A9FA5] hover:bg-[#F4F5F7] hover:text-[#6F767E]"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <FieldLabel>New description</FieldLabel>
                  <input
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    className="w-full rounded-lg border border-[#EFEFEF] bg-white px-3 py-1.5 text-sm outline-none focus:border-[#3B6B8A]"
                  />

                  <FieldLabel>Reassign &ldquo;from&rdquo; account (optional)</FieldLabel>
                  <AccountSelect
                    accounts={compatibleAccounts}
                    value={newFromGuid}
                    onChange={setNewFromGuid}
                    placeholder="Leave as-is"
                  />

                  <FieldLabel>Reassign &ldquo;to&rdquo; account (optional)</FieldLabel>
                  <AccountSelect
                    accounts={compatibleAccounts}
                    value={newToGuid}
                    onChange={setNewToGuid}
                    placeholder="Leave as-is"
                  />

                  {error && (
                    <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                      {error}
                    </p>
                  )}

                  <button
                    onClick={() => setShowPreview(true)}
                    disabled={!hasChanges}
                    className="w-full rounded-lg bg-[#3B6B8A] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[#2F5770] disabled:cursor-not-allowed disabled:bg-[#9A9FA5]"
                  >
                    Preview changes
                  </button>
                </div>
              </>
            ) : (
              <p className="px-2 py-8 text-center text-sm text-[#9A9FA5]">
                Select a group from the list to start editing.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {showPreview && selected && (
        <BulkEditPreview
          group={selected}
          accounts={accounts}
          newDescription={newDescription !== selected.description ? newDescription : undefined}
          newFromGuid={newFromGuid || undefined}
          newToGuid={newToGuid || undefined}
          submitting={submitting}
          onCancel={() => setShowPreview(false)}
          onConfirm={handleApply}
        />
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────

function BreadcrumbBar() {
  return (
    <nav className="flex items-center gap-2 text-xs text-[#9A9FA5]">
      <Link
        href="/special-functions"
        className="inline-flex items-center gap-1 hover:text-[#6F767E]"
      >
        <ArrowLeft className="h-3 w-3" />
        Special functions
      </Link>
    </nav>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mt-2 block text-xs font-medium uppercase tracking-wide text-[#9A9FA5]">
      {children}
    </label>
  );
}

function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder,
}: {
  accounts: AccountNode[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-[#EFEFEF] bg-white px-3 py-1.5 text-sm outline-none focus:border-[#3B6B8A]"
    >
      <option value="">{placeholder}</option>
      {accounts.map((a) => (
        <option key={a.guid} value={a.guid}>
          {a.fullPath}
        </option>
      ))}
    </select>
  );
}

/**
 * Read-only preview modal. Lists every transaction that would be affected,
 * showing the old → new value for each field the user chose to change.
 */
function BulkEditPreview({
  group,
  accounts,
  newDescription,
  newFromGuid,
  newToGuid,
  submitting,
  onCancel,
  onConfirm,
}: {
  group: TransactionGroup;
  accounts: AccountNode[];
  newDescription?: string;
  newFromGuid?: string;
  newToGuid?: string;
  submitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const fromName = newFromGuid ? accounts.find((a) => a.guid === newFromGuid)?.fullPath ?? "?" : undefined;
  const toName = newToGuid ? accounts.find((a) => a.guid === newToGuid)?.fullPath ?? "?" : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-4">
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-[#EFEFEF] px-5 py-3">
          <div>
            <h2 className="text-base font-semibold text-[#1A1D1F]">
              Preview bulk edit
            </h2>
            <p className="mt-0.5 text-xs text-[#9A9FA5]">
              {group.transactions.length} transaction{group.transactions.length === 1 ? "" : "s"} will be updated atomically.
            </p>
          </div>
          <button
            onClick={onCancel}
            className="rounded p-1 text-[#9A9FA5] hover:bg-[#F4F5F7] hover:text-[#6F767E]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-4">
          <dl className="mb-4 space-y-1 text-sm">
            {newDescription !== undefined && (
              <ChangeRow label="Description">
                <span className="text-[#9A9FA5] line-through">{group.description}</span>
                <ArrowRight className="mx-2 inline h-3 w-3 text-[#9A9FA5]" />
                <span className="font-medium text-[#1A1D1F]">{newDescription}</span>
              </ChangeRow>
            )}
            {fromName && (
              <ChangeRow label='"From" account'>
                <span className="font-medium text-[#1A1D1F]">{fromName}</span>
                <span className="ml-2 text-xs text-[#9A9FA5]">
                  (applied to the negative-value split on each transaction)
                </span>
              </ChangeRow>
            )}
            {toName && (
              <ChangeRow label='"To" account'>
                <span className="font-medium text-[#1A1D1F]">{toName}</span>
                <span className="ml-2 text-xs text-[#9A9FA5]">
                  (applied to the positive-value split on each transaction)
                </span>
              </ChangeRow>
            )}
          </dl>

          <div className="rounded-lg border border-[#EFEFEF]">
            <table className="w-full text-xs">
              <thead className="bg-[#F4F5F7] text-[#9A9FA5]">
                <tr>
                  <th className="px-3 py-2 text-left font-normal">Date</th>
                  <th className="px-3 py-2 text-left font-normal">Description</th>
                  <th className="px-3 py-2 text-right font-normal">Amount</th>
                  <th className="px-3 py-2 text-left font-normal">Transfer</th>
                </tr>
              </thead>
              <tbody>
                {group.transactions.map((tx) => {
                  const to = tx.splits.find((s) => s.amount > 0);
                  const from = tx.splits.find((s) => s.amount < 0);
                  return (
                    <tr key={tx.guid} className="border-t border-[#EFEFEF]">
                      <td className="px-3 py-1.5 text-[#6F767E]">{tx.date}</td>
                      <td className="px-3 py-1.5 text-[#6F767E]">{tx.description}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-[#6F767E]">
                        {to ? formatCurrency(to.amount, to.commodityMnemonic) : "—"}
                      </td>
                      <td className="px-3 py-1.5 text-[#6F767E]">
                        {from?.accountFullPath ?? "—"}
                        <ArrowRight className="mx-1 inline h-3 w-3 text-[#9A9FA5]" />
                        {to?.accountFullPath ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-[#EFEFEF] px-5 py-3">
          <button
            onClick={onCancel}
            disabled={submitting}
            className="rounded-lg px-3 py-1.5 text-sm text-[#6F767E] hover:bg-[#F4F5F7]"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="rounded-lg bg-[#3B6B8A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#2F5770] disabled:bg-[#9A9FA5]"
          >
            {submitting ? "Applying..." : "Apply bulk edit"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function ChangeRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-32 shrink-0 text-xs uppercase tracking-wide text-[#9A9FA5]">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}
