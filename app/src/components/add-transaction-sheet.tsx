"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useDashboard } from "@/lib/dashboard-context";
import { Plus, Trash2, AlertCircle, Check, Search } from "lucide-react";
import type { AccountNode, LedgerTransaction } from "@/lib/types/gnucash";
import type { CreateTransactionPayload, EditTransactionPayload } from "@/lib/gnucash/worker/messages";
import { formatCurrency } from "@/lib/format";

// ── Types ───────────────────────────────────────────────────────

type FlatAccount = {
  guid: string;
  name: string;
  fullPath: string;
  type: string;
  commodityMnemonic: string;
};

interface SplitRow {
  id: number;
  accountGuid: string;
  accountPath: string;
  accountType: string;
  commodityMnemonic: string;
  // Currency splits
  debit: string;
  credit: string;
  // Investment splits (STOCK/MUTUAL)
  shares: string;
  price: string;
  total: string;
  isBuy: boolean; // true = debit (buying), false = credit (selling)
  memo: string;
}

/** Which of the 3 investment fields was last edited by the user */
type InvestmentField = "shares" | "price" | "total";

function isInvestmentType(type: string): boolean {
  return type === "STOCK" || type === "MUTUAL";
}

function emptyRow(id: number): SplitRow {
  return {
    id, accountGuid: "", accountPath: "", accountType: "", commodityMnemonic: "",
    debit: "", credit: "", shares: "", price: "", total: "", isBuy: true, memo: "",
  };
}

// ── Helpers ─────────────────────────────────────────────────────

function flattenAccounts(nodes: AccountNode[], path: string[] = []): FlatAccount[] {
  const results: FlatAccount[] = [];
  for (const node of nodes) {
    const currentPath = [...path, node.name];
    if (node.type !== "ROOT" && !node.placeholder) {
      results.push({
        guid: node.guid,
        name: node.name,
        fullPath: currentPath.join(":"),
        type: node.type,
        commodityMnemonic: node.commodityMnemonic,
      });
    }
    if (node.children.length > 0) {
      results.push(...flattenAccounts(node.children, currentPath));
    }
  }
  return results;
}

function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) {
    return { match: true, score: 1000 - t.indexOf(q) };
  }
  let qi = 0;
  let consecutive = 0;
  let maxConsecutive = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) { qi++; consecutive++; maxConsecutive = Math.max(maxConsecutive, consecutive); }
    else { consecutive = 0; }
  }
  if (qi === q.length) return { match: true, score: maxConsecutive * 10 };
  return { match: false, score: 0 };
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  BANK: "Bank", CASH: "Cash", ASSET: "Assets", STOCK: "Stocks", MUTUAL: "Funds",
  INCOME: "Income", EXPENSE: "Expenses", EQUITY: "Equity", LIABILITY: "Liabilities",
  CREDIT: "Credit", RECEIVABLE: "Receivable", PAYABLE: "Payable", TRADING: "Trading",
};

const NUM_INPUT_CLASS = "h-8 w-full rounded-md border border-[#EFEFEF] bg-white px-2 text-right text-xs text-[#1A1D1F] placeholder:text-[#D4DAE0] focus:border-[#3B6B8A] focus:outline-none focus:ring-1 focus:ring-[#3B6B8A] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

// ── Account Combobox ────────────────────────────────────────────

function AccountCombobox({
  accounts,
  value,
  onChange,
}: {
  accounts: FlatAccount[];
  value: { guid: string; path: string };
  onChange: (account: FlatAccount | null) => void;
}) {
  const [query, setQuery] = useState(value.path);
  const [open, setOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value.path); }, [value.path]);

  const filtered = useMemo(() => {
    if (!query.trim()) return accounts.slice(0, 50);
    return accounts
      .map((a) => ({ ...a, ...fuzzyMatch(query, a.fullPath) }))
      .filter((a) => a.match)
      .sort((a, b) => b.score - a.score)
      .slice(0, 30);
  }, [accounts, query]);

  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    for (const item of filtered) {
      const label = ACCOUNT_TYPE_LABELS[item.type] ?? item.type;
      if (!groups[label]) groups[label] = [];
      groups[label].push(item);
    }
    return groups;
  }, [filtered]);

  const flatList = useMemo(() => filtered, [filtered]);

  const selectItem = useCallback(
    (item: FlatAccount) => {
      onChange(item);
      setQuery(item.fullPath);
      setOpen(false);
    },
    [onChange]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") { setOpen(true); e.preventDefault(); }
      return;
    }
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); setHighlightIndex((i) => Math.min(i + 1, flatList.length - 1)); break;
      case "ArrowUp": e.preventDefault(); setHighlightIndex((i) => Math.max(i - 1, 0)); break;
      case "Enter": e.preventDefault(); if (flatList[highlightIndex]) selectItem(flatList[highlightIndex]); break;
      case "Escape": e.preventDefault(); setOpen(false); break;
    }
  }

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${highlightIndex}"]`);
    if (el) el.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, open]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[#9A9FA5]" />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlightIndex(0);
            if (!e.target.value) onChange(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder="Search accounts..."
          className="h-8 w-full rounded-md border border-[#EFEFEF] bg-white pl-7 pr-2 text-xs text-[#1A1D1F] placeholder:text-[#9A9FA5] focus:border-[#3B6B8A] focus:outline-none focus:ring-1 focus:ring-[#3B6B8A]"
        />
      </div>
      {open && filtered.length > 0 && (
        <div ref={listRef} className="absolute left-0 top-full z-50 mt-1 max-h-60 w-72 overflow-auto rounded-lg border border-[#EFEFEF] bg-white shadow-lg">
          {Object.entries(grouped).map(([groupLabel, items]) => (
            <div key={groupLabel}>
              <div className="sticky top-0 bg-[#F4F5F7] px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-[#9A9FA5]">{groupLabel}</div>
              {items.map((item) => {
                const globalIndex = flatList.indexOf(item);
                return (
                  <div
                    key={item.guid}
                    data-index={globalIndex}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectItem(item)}
                    onMouseEnter={() => setHighlightIndex(globalIndex)}
                    className={`flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs ${globalIndex === highlightIndex ? "bg-[#3B6B8A]/10" : ""} ${item.guid === value.guid ? "font-medium text-[#3B6B8A]" : "text-[#1A1D1F]"}`}
                  >
                    <span className="flex-1 truncate">{item.fullPath}</span>
                    {item.guid === value.guid && <Check className="h-3 w-3 text-[#3B6B8A]" />}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Recalculate Picker (2-of-3 ambiguity dialog) ───────────────

function RecalcPicker({
  onPick,
  onCancel,
}: {
  onPick: (field: InvestmentField) => void;
  onCancel: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/10 rounded-md">
      <div className="rounded-lg border border-[#EFEFEF] bg-white p-3 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <p className="mb-2 text-[10px] font-medium text-[#6F767E]">Which value should be recalculated?</p>
        <div className="flex gap-1.5">
          <button onClick={() => onPick("shares")} className="rounded-md border border-[#EFEFEF] px-2.5 py-1 text-[10px] font-medium text-[#1A1D1F] hover:bg-[#F4F5F7]">Shares</button>
          <button onClick={() => onPick("price")} className="rounded-md border border-[#EFEFEF] px-2.5 py-1 text-[10px] font-medium text-[#1A1D1F] hover:bg-[#F4F5F7]">Price</button>
          <button onClick={() => onPick("total")} className="rounded-md border border-[#EFEFEF] px-2.5 py-1 text-[10px] font-medium text-[#1A1D1F] hover:bg-[#F4F5F7]">Total</button>
          <button onClick={onCancel} className="rounded-md px-2 py-1 text-[10px] text-[#9A9FA5] hover:bg-[#F4F5F7]">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Investment Split Row ────────────────────────────────────────

function InvestmentSplitRow({
  split,
  onUpdate,
  onRemove,
  canRemove,
  accounts,
  currency,
}: {
  split: SplitRow;
  onUpdate: (updates: Partial<SplitRow>) => void;
  onRemove: () => void;
  canRemove: boolean;
  accounts: FlatAccount[];
  currency: string;
}) {
  // Track which two fields the user has filled in to auto-compute the third
  const [pendingField, setPendingField] = useState<InvestmentField | null>(null);
  const [showRecalcPicker, setShowRecalcPicker] = useState(false);
  // Store the value the user just typed that triggered the conflict
  const pendingValue = useRef<{ field: InvestmentField; value: string } | null>(null);

  function parseNum(s: string): number | null {
    const n = parseFloat(s);
    return isNaN(n) || n <= 0 ? null : n;
  }

  function allThreeFilled(shares: string, price: string, total: string): boolean {
    return parseNum(shares) !== null && parseNum(price) !== null && parseNum(total) !== null;
  }

  function autoCompute(
    changedField: InvestmentField,
    shares: string,
    price: string,
    total: string,
    forceRecalc?: InvestmentField,
  ): Partial<SplitRow> {
    const s = parseNum(shares);
    const p = parseNum(price);
    const t = parseNum(total);

    // If a specific field was chosen to recalculate, blank it first
    if (forceRecalc) {
      if (forceRecalc === "shares") { shares = ""; }
      else if (forceRecalc === "price") { price = ""; }
      else if (forceRecalc === "total") { total = ""; }
      return autoCompute(changedField,
        forceRecalc === "shares" ? "" : shares,
        forceRecalc === "price" ? "" : price,
        forceRecalc === "total" ? "" : total,
      );
    }

    const sVal = forceRecalc === "shares" ? null : s;
    const pVal = forceRecalc === "price" ? null : p;
    const tVal = forceRecalc === "total" ? null : t;

    // Compute the missing third field from the other two
    if (sVal != null && pVal != null && tVal == null) {
      return { shares, price, total: (sVal * pVal).toFixed(2) };
    }
    if (sVal != null && tVal != null && pVal == null) {
      return { shares, total, price: (tVal / sVal).toFixed(4) };
    }
    if (pVal != null && tVal != null && sVal == null) {
      return { price, total, shares: pVal > 0 ? (tVal / pVal).toFixed(4) : "" };
    }

    // Only one or zero fields filled — just store what the user typed
    return { shares, price, total };
  }

  function handleFieldChange(field: InvestmentField, value: string) {
    const newShares = field === "shares" ? value : split.shares;
    const newPrice = field === "price" ? value : split.price;
    const newTotal = field === "total" ? value : split.total;

    // If all three are already filled and user edits one, ask which to recalculate
    if (allThreeFilled(split.shares, split.price, split.total) && parseNum(value) !== null) {
      pendingValue.current = { field, value };
      setPendingField(field);
      setShowRecalcPicker(true);
      return;
    }

    const updates = autoCompute(field, newShares, newPrice, newTotal);
    onUpdate(updates);
  }

  function handleRecalcPick(recalcField: InvestmentField) {
    if (!pendingValue.current) return;
    const { field, value } = pendingValue.current;
    const newShares = field === "shares" ? value : split.shares;
    const newPrice = field === "price" ? value : split.price;
    const newTotal = field === "total" ? value : split.total;

    const updates = autoCompute(field, newShares, newPrice, newTotal, recalcField);
    onUpdate(updates);
    setShowRecalcPicker(false);
    pendingValue.current = null;
    setPendingField(null);
  }

  function handleRecalcCancel() {
    setShowRecalcPicker(false);
    pendingValue.current = null;
    setPendingField(null);
  }

  return (
    <div className="relative rounded-lg border border-[#EFEFEF] bg-[#F9FAFB] p-2.5">
      {showRecalcPicker && (
        <RecalcPicker onPick={handleRecalcPick} onCancel={handleRecalcCancel} />
      )}

      {/* Account row */}
      <div className="flex items-start gap-1.5 mb-2">
        <div className="flex-1">
          <AccountCombobox
            accounts={accounts}
            value={{ guid: split.accountGuid, path: split.accountPath }}
            onChange={(account) => {
              if (account) {
                onUpdate({
                  accountGuid: account.guid,
                  accountPath: account.fullPath,
                  accountType: account.type,
                  commodityMnemonic: account.commodityMnemonic,
                });
              } else {
                onUpdate({ accountGuid: "", accountPath: "", accountType: "", commodityMnemonic: "" });
              }
            }}
          />
        </div>
        {/* Buy/Sell toggle */}
        <div className="flex h-8 rounded-md border border-[#EFEFEF] bg-white">
          <button
            onClick={() => onUpdate({ isBuy: true })}
            className={`px-2.5 text-[10px] font-medium rounded-l-md transition-colors ${split.isBuy ? "bg-[#3B6B8A] text-white" : "text-[#9A9FA5] hover:bg-[#F4F5F7]"}`}
          >
            Buy
          </button>
          <button
            onClick={() => onUpdate({ isBuy: false })}
            className={`px-2.5 text-[10px] font-medium rounded-r-md transition-colors ${!split.isBuy ? "bg-[#E87C6B] text-white" : "text-[#9A9FA5] hover:bg-[#F4F5F7]"}`}
          >
            Sell
          </button>
        </div>
        <button
          onClick={onRemove}
          disabled={!canRemove}
          className="flex h-8 w-7 items-center justify-center rounded-md text-[#9A9FA5] transition-colors hover:bg-red-50 hover:text-[#E87C6B] disabled:opacity-20"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      {/* Shares / Price / Total */}
      <div className="grid grid-cols-3 gap-1.5">
        <div>
          <label className="mb-0.5 block text-[10px] font-medium text-[#9A9FA5]">
            Shares {split.commodityMnemonic ? `(${split.commodityMnemonic})` : ""}
          </label>
          <input
            type="number" step="any" min="0"
            value={split.shares}
            onChange={(e) => handleFieldChange("shares", e.target.value)}
            placeholder="0"
            className={NUM_INPUT_CLASS}
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] font-medium text-[#9A9FA5]">Price/{currency}</label>
          <input
            type="number" step="any" min="0"
            value={split.price}
            onChange={(e) => handleFieldChange("price", e.target.value)}
            placeholder="0.00"
            className={NUM_INPUT_CLASS}
          />
        </div>
        <div>
          <label className="mb-0.5 block text-[10px] font-medium text-[#9A9FA5]">Total {currency}</label>
          <input
            type="number" step="0.01" min="0"
            value={split.total}
            onChange={(e) => handleFieldChange("total", e.target.value)}
            placeholder="0.00"
            className={NUM_INPUT_CLASS}
          />
        </div>
      </div>

      {/* Memo */}
      <input
        type="text"
        value={split.memo}
        onChange={(e) => onUpdate({ memo: e.target.value })}
        placeholder="Memo..."
        className="mt-1.5 h-6 w-full rounded border-0 bg-transparent px-1 text-[10px] text-[#9A9FA5] placeholder:text-[#D4DAE0] focus:bg-white focus:outline-none"
      />
    </div>
  );
}

// ── Currency Split Row ──────────────────────────────────────────

function CurrencySplitRow({
  split,
  onUpdate,
  onRemove,
  canRemove,
  accounts,
}: {
  split: SplitRow;
  onUpdate: (updates: Partial<SplitRow>) => void;
  onRemove: () => void;
  canRemove: boolean;
  accounts: FlatAccount[];
}) {
  return (
    <div className="grid grid-cols-[1fr_80px_80px_28px] items-start gap-1.5">
      <AccountCombobox
        accounts={accounts}
        value={{ guid: split.accountGuid, path: split.accountPath }}
        onChange={(account) => {
          if (account) {
            onUpdate({
              accountGuid: account.guid,
              accountPath: account.fullPath,
              accountType: account.type,
              commodityMnemonic: account.commodityMnemonic,
            });
          } else {
            onUpdate({ accountGuid: "", accountPath: "", accountType: "", commodityMnemonic: "" });
          }
        }}
      />
      <input
        type="number" step="0.01" min="0"
        value={split.debit}
        onChange={(e) => onUpdate({ debit: e.target.value, credit: "" })}
        placeholder="0.00"
        className={NUM_INPUT_CLASS}
      />
      <input
        type="number" step="0.01" min="0"
        value={split.credit}
        onChange={(e) => onUpdate({ credit: e.target.value, debit: "" })}
        placeholder="0.00"
        className={`${NUM_INPUT_CLASS} !text-[#E87C6B]`}
      />
      <button
        onClick={onRemove}
        disabled={!canRemove}
        className="flex h-8 w-7 items-center justify-center rounded-md text-[#9A9FA5] transition-colors hover:bg-red-50 hover:text-[#E87C6B] disabled:opacity-20 disabled:hover:bg-transparent"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export function AddTransactionSheet({
  open,
  onOpenChange,
  editingTransaction,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingTransaction?: LedgerTransaction | null;
}) {
  const { data, createTransaction, editTransaction } = useDashboard();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [num, setNum] = useState("");
  const [splits, setSplits] = useState<SplitRow[]>(() => [emptyRow(1), emptyRow(2)]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const nextId = useRef(3);

  const isEditing = !!editingTransaction;

  const accounts = useMemo(() => {
    if (!data) return [];
    return flattenAccounts(data.accounts);
  }, [data]);

  const currency = data?.currency ?? "GBP";

  // Pre-fill form when editing
  useEffect(() => {
    if (editingTransaction && open) {
      setDate(editingTransaction.date);
      setDescription(editingTransaction.description);
      setNum(editingTransaction.num);
      const rows = editingTransaction.splits.map((s, i) => {
        const account = accounts.find((a) => a.guid === s.accountGuid);
        const isInv = isInvestmentType(s.accountType);
        const amount = s.amount; // value_num / value_denom (in tx currency)
        const qty = s.quantity; // quantity_num / quantity_denom (in account commodity)

        if (isInv) {
          const absTotal = Math.abs(amount);
          const absShares = Math.abs(qty);
          const pricePerShare = absShares > 0 ? absTotal / absShares : 0;
          return {
            ...emptyRow(i + 1),
            accountGuid: s.accountGuid,
            accountPath: s.accountFullPath,
            accountType: s.accountType,
            commodityMnemonic: account?.commodityMnemonic ?? s.commodityMnemonic,
            shares: absShares > 0 ? String(absShares) : "",
            price: pricePerShare > 0 ? pricePerShare.toFixed(4) : "",
            total: absTotal > 0 ? absTotal.toFixed(2) : "",
            isBuy: amount >= 0,
            memo: s.memo,
          };
        }

        return {
          ...emptyRow(i + 1),
          accountGuid: s.accountGuid,
          accountPath: s.accountFullPath,
          accountType: s.accountType,
          commodityMnemonic: account?.commodityMnemonic ?? s.commodityMnemonic,
          debit: amount >= 0 ? String(Math.abs(amount)) : "",
          credit: amount < 0 ? String(Math.abs(amount)) : "",
          memo: s.memo,
        };
      });
      setSplits(rows);
      nextId.current = rows.length + 1;
      setSaveError(null);
    }
  }, [editingTransaction, open, accounts]);

  // ── Balance computation ─────────────────────────────────────

  const { totalDebit, totalCredit, isBalanced } = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const s of splits) {
      if (isInvestmentType(s.accountType)) {
        const t = parseFloat(s.total);
        if (!isNaN(t) && t > 0) {
          if (s.isBuy) totalDebit += t;
          else totalCredit += t;
        }
      } else {
        const d = parseFloat(s.debit);
        const c = parseFloat(s.credit);
        if (!isNaN(d) && d > 0) totalDebit += d;
        if (!isNaN(c) && c > 0) totalCredit += c;
      }
    }
    totalDebit = Math.round(totalDebit * 100) / 100;
    totalCredit = Math.round(totalCredit * 100) / 100;
    const isBalanced = totalDebit === totalCredit && totalDebit > 0;
    return { totalDebit, totalCredit, isBalanced };
  }, [splits]);

  const canSave = isBalanced && description.trim().length > 0 && date.length > 0 &&
    splits.every((s) => {
      if (!s.accountGuid) return false;
      if (isInvestmentType(s.accountType)) {
        const sh = parseFloat(s.shares);
        const t = parseFloat(s.total);
        return !isNaN(sh) && sh > 0 && !isNaN(t) && t > 0;
      }
      return parseFloat(s.debit) > 0 || parseFloat(s.credit) > 0;
    });

  function updateSplit(id: number, updates: Partial<SplitRow>) {
    setSplits((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }

  function addSplitRow() {
    setSplits((prev) => [...prev, emptyRow(nextId.current++)]);
  }

  function removeSplitRow(id: number) {
    if (splits.length <= 2) return;
    setSplits((prev) => prev.filter((s) => s.id !== id));
  }

  function resetForm() {
    setDate(new Date().toISOString().slice(0, 10));
    setDescription("");
    setNum("");
    setSplits([emptyRow(1), emptyRow(2)]);
    nextId.current = 3;
    setSaveError(null);
  }

  // ── Save ──────────────────────────────────────────────────────

  async function handleSave() {
    if (!canSave || !data) return;
    setSaving(true);
    setSaveError(null);

    try {
      const fraction = data.currencyFraction;
      const splitPayloads: CreateTransactionPayload["splits"] = [];

      for (const s of splits) {
        if (isInvestmentType(s.accountType)) {
          // Investment split: value = total cost in tx currency, quantity = shares
          const totalVal = parseFloat(s.total) || 0;
          const sharesVal = parseFloat(s.shares) || 0;
          const sign = s.isBuy ? 1 : -1;
          const valueNum = Math.round(sign * totalVal * fraction);
          const quantityNum = Math.round(sign * sharesVal * 10000);

          splitPayloads.push({
            accountGuid: s.accountGuid,
            valueNum,
            valueDenom: fraction,
            quantityNum,
            quantityDenom: 10000,
            memo: s.memo || undefined,
          });
        } else {
          // Currency split: value = quantity
          const debitVal = parseFloat(s.debit) || 0;
          const creditVal = parseFloat(s.credit) || 0;
          const amount = debitVal > 0 ? debitVal : -creditVal;
          const valueNum = Math.round(amount * fraction);

          splitPayloads.push({
            accountGuid: s.accountGuid,
            valueNum,
            valueDenom: fraction,
            quantityNum: valueNum,
            quantityDenom: fraction,
            memo: s.memo || undefined,
          });
        }
      }

      if (isEditing && editingTransaction) {
        await editTransaction({
          originalGuid: editingTransaction.guid,
          currencyGuid: data.currencyGuid,
          postDate: date,
          description: description.trim(),
          num: num.trim() || undefined,
          splits: splitPayloads,
        });
      } else {
        await createTransaction({
          currencyGuid: data.currencyGuid,
          postDate: date,
          description: description.trim(),
          num: num.trim() || undefined,
          splits: splitPayloads,
        });
      }

      resetForm();
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save transaction");
    } finally {
      setSaving(false);
    }
  }

  // ── Separate investment and currency splits ─────────────────

  const hasInvestmentSplits = splits.some((s) => isInvestmentType(s.accountType));
  const hasCurrencySplits = splits.some((s) => s.accountGuid && !isInvestmentType(s.accountType));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-lg w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit Transaction" : "Add Transaction"}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? "Modify and save this transaction. Debits must equal credits."
              : "Create a new double-entry transaction. Debits must equal credits."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          {/* Date & Description */}
          <div className="flex gap-3">
            <div className="w-36">
              <label className="mb-1 block text-xs font-medium text-[#6F767E]">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 w-full rounded-md border border-[#EFEFEF] bg-white px-2 text-xs text-[#1A1D1F] focus:border-[#3B6B8A] focus:outline-none focus:ring-1 focus:ring-[#3B6B8A]"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[#6F767E]">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Payee / description"
                className="h-8 w-full rounded-md border border-[#EFEFEF] bg-white px-2 text-xs text-[#1A1D1F] placeholder:text-[#9A9FA5] focus:border-[#3B6B8A] focus:outline-none focus:ring-1 focus:ring-[#3B6B8A]"
              />
            </div>
          </div>

          {/* Reference number */}
          <div className="w-36">
            <label className="mb-1 block text-xs font-medium text-[#6F767E]">Ref #</label>
            <input
              type="text"
              value={num}
              onChange={(e) => setNum(e.target.value)}
              placeholder="Optional"
              className="h-8 w-full rounded-md border border-[#EFEFEF] bg-white px-2 text-xs text-[#1A1D1F] placeholder:text-[#9A9FA5] focus:border-[#3B6B8A] focus:outline-none focus:ring-1 focus:ring-[#3B6B8A]"
            />
          </div>

          {/* Splits */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="text-xs font-medium text-[#6F767E]">Splits</label>
              <button
                onClick={addSplitRow}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-[#3B6B8A] transition-colors hover:bg-[#3B6B8A]/10"
              >
                <Plus className="h-3 w-3" />
                Add split
              </button>
            </div>

            {/* Column headers for currency splits */}
            {(!hasInvestmentSplits || hasCurrencySplits) && (
              <div className="mb-1 grid grid-cols-[1fr_80px_80px_28px] gap-1.5 px-1">
                <span className="text-[10px] font-medium uppercase tracking-wider text-[#9A9FA5]">Account</span>
                <span className="text-right text-[10px] font-medium uppercase tracking-wider text-[#9A9FA5]">Debit</span>
                <span className="text-right text-[10px] font-medium uppercase tracking-wider text-[#9A9FA5]">Credit</span>
                <span />
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              {splits.map((split) => {
                const isInv = isInvestmentType(split.accountType);
                if (isInv) {
                  return (
                    <InvestmentSplitRow
                      key={split.id}
                      split={split}
                      onUpdate={(updates) => updateSplit(split.id, updates)}
                      onRemove={() => removeSplitRow(split.id)}
                      canRemove={splits.length > 2}
                      accounts={accounts}
                      currency={currency}
                    />
                  );
                }
                return (
                  <CurrencySplitRow
                    key={split.id}
                    split={split}
                    onUpdate={(updates) => updateSplit(split.id, updates)}
                    onRemove={() => removeSplitRow(split.id)}
                    canRemove={splits.length > 2}
                    accounts={accounts}
                  />
                );
              })}
            </div>

            {/* Memos for currency splits (investment splits have inline memos) */}
            {splits.map((split) =>
              split.accountGuid && !isInvestmentType(split.accountType) ? (
                <div key={`memo-${split.id}`} className="mt-0.5 ml-0 mb-1">
                  <input
                    type="text"
                    value={split.memo}
                    onChange={(e) => updateSplit(split.id, { memo: e.target.value })}
                    placeholder={`Memo for ${split.accountPath.split(":").pop() || "split"}...`}
                    className="h-6 w-full rounded border-0 bg-transparent px-1 text-[10px] text-[#9A9FA5] placeholder:text-[#D4DAE0] focus:bg-[#F9FAFB] focus:outline-none"
                  />
                </div>
              ) : null
            )}
          </div>

          {/* Balance indicator */}
          <div
            className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
              isBalanced ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"
            }`}
          >
            <div className="flex items-center gap-2">
              {isBalanced ? (
                <Check className="h-3.5 w-3.5 text-emerald-600" />
              ) : (
                <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
              )}
              <span className={`text-xs font-medium ${isBalanced ? "text-emerald-700" : "text-amber-700"}`}>
                {isBalanced ? "Balanced" : "Unbalanced"}
              </span>
            </div>
            <div className="flex gap-4 text-xs">
              <span className="text-[#1A1D1F]">Dr {formatCurrency(totalDebit, currency)}</span>
              <span className="text-[#E87C6B]">Cr {formatCurrency(totalCredit, currency)}</span>
            </div>
          </div>

          {/* Error */}
          {saveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs text-red-600">{saveError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => { resetForm(); onOpenChange(false); }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="flex-1"
              disabled={!canSave || saving}
              onClick={handleSave}
            >
              {saving ? "Saving..." : isEditing ? "Update Transaction" : "Save Transaction"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
