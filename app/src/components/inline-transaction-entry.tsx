"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { useDashboard } from "@/lib/dashboard-context";
import { type FlatAccount, flattenAccounts, buildCurrencySplitPayload, isInvestmentType, evalExpr } from "@/lib/transaction-helpers";
import type { AccountNode, LedgerTransaction, LedgerSplit } from "@/lib/types/gnucash";
import type { CreateTransactionPayload, EditTransactionPayload } from "@/lib/gnucash/worker/messages";
import { DescriptionAutocomplete, type QuickFillMatch } from "@/components/inline-entry/description-autocomplete";
import { AccountAutocomplete } from "@/components/inline-entry/account-autocomplete";
import { SplitEntryRows, type SplitEntryRow } from "@/components/inline-entry/split-entry-rows";
import { SmartDateInput, getDefaultDate } from "@/components/inline-entry/smart-date-input";
import { Split } from "lucide-react";

// ── Constants ────────────────────────────────────────────────────

type FieldName = "date" | "num" | "description" | "transfer" | "increase" | "decrease" | "shares" | "price" | "value";

const CURRENCY_FIELD_ORDER: FieldName[] = ["date", "num", "description", "transfer", "increase", "decrease"];
const INVESTMENT_FIELD_ORDER: FieldName[] = ["date", "num", "description", "transfer", "shares", "price", "value"];

const CREDIT_TYPES = new Set(["INCOME", "EQUITY", "LIABILITY", "CREDIT", "PAYABLE"]);

const CELL_INPUT = "h-7 w-full rounded border border-[#C8DFC9] bg-white px-2 text-xs text-[#1A1D1F] placeholder:text-[#9A9FA5] focus:border-[#3B6B8A] focus:outline-none focus:ring-1 focus:ring-[#3B6B8A]";
const AMOUNT_CELL_INPUT = CELL_INPUT + " text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";


// ── Component ────────────────────────────────────────────────────

/** Imperative handle for parent to trigger toasts */
export interface InlineEntryHandle {
  showToast: (msg: string, type: "success" | "warning" | "error") => void;
}

interface Props {
  account: AccountNode;
  transactions: LedgerTransaction[];
  colSpan: number;
  /** If set, we're editing this existing transaction inline */
  editingTransaction?: LedgerTransaction | null;
  /** Called when editing is cancelled (click-away, Escape) */
  onCancelEdit?: () => void;
  /** Ref for imperative access (e.g. triggering toasts from parent) */
  entryRef?: React.RefObject<InlineEntryHandle | null>;
}

export function InlineTransactionEntry({ account, transactions, colSpan, editingTransaction, onCancelEdit, entryRef }: Props) {
  const { data, createTransaction, editTransaction, isWritable, toggleWritable } = useDashboard();

  const isEditing = !!editingTransaction;
  const isCredit = CREDIT_TYPES.has(account.type);
  const isInvestment = isInvestmentType(account.type);
  const FIELD_ORDER = isInvestment ? INVESTMENT_FIELD_ORDER : CURRENCY_FIELD_ORDER;

  // Field state
  const [date, setDate] = useState(() => getDefaultDate());
  const [num, setNum] = useState("");
  const [description, setDescription] = useState("");
  const [transferAccountGuid, setTransferAccountGuid] = useState("");
  const [transferAccountPath, setTransferAccountPath] = useState("");
  const [increase, setIncrease] = useState("");
  const [decrease, setDecrease] = useState("");

  // Cross-currency field (foreign amount in transfer account's currency)
  const [foreignAmount, setForeignAmount] = useState("");

  // Investment fields
  const [shares, setShares] = useState("");
  const [price, setPrice] = useState("");
  const [value, setValue] = useState("");
  const [isBuy, setIsBuy] = useState(true);
  const [showRecalcPicker, setShowRecalcPicker] = useState(false);
  const pendingInvChange = useRef<{ field: "shares" | "price" | "value"; val: string } | null>(null);

  // Multi-split mode
  const [isMultiSplit, setIsMultiSplit] = useState(false);
  const [extraSplits, setExtraSplits] = useState<SplitEntryRow[]>([]);
  const nextSplitId = useRef(3);

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "warning" | "error" } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Refs
  const rowRef = useRef<HTMLTableRowElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const numRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLInputElement>(null);
  const transferRef = useRef<HTMLInputElement>(null);
  const increaseRef = useRef<HTMLInputElement>(null);
  const decreaseRef = useRef<HTMLInputElement>(null);
  const sharesRef = useRef<HTMLInputElement>(null);
  const priceRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef<HTMLInputElement>(null);
  const submitRef = useRef<() => void>(() => {});

  const fieldRefs: Record<FieldName, React.RefObject<HTMLInputElement | null>> = {
    date: dateRef, num: numRef, description: descriptionRef,
    transfer: transferRef, increase: increaseRef, decrease: decreaseRef,
    shares: sharesRef, price: priceRef, value: valueRef,
  };

  const flatAccounts = useMemo(() => {
    if (!data) return [];
    return flattenAccounts(data.accounts);
  }, [data]);

  // Detect cross-currency transfer (e.g., GBP account → EUR account)
  const transferAccount = useMemo(() => {
    if (!transferAccountGuid) return null;
    return flatAccounts.find((a) => a.guid === transferAccountGuid) ?? null;
  }, [flatAccounts, transferAccountGuid]);

  const isCrossCurrency = useMemo(() => {
    if (!transferAccount || isInvestment || isMultiSplit) return false;
    return transferAccount.commodityMnemonic !== account.commodityMnemonic;
  }, [transferAccount, account.commodityMnemonic, isInvestment, isMultiSplit]);

  // ── Pre-fill when editing ──────────────────────────────────────

  useEffect(() => {
    if (!editingTransaction) return;
    setDate(editingTransaction.date);
    setNum(editingTransaction.num);
    setDescription(editingTransaction.description);

    const accountSplit = editingTransaction.splits.find((s) => s.accountGuid === account.guid);
    const transferSplits = editingTransaction.splits.filter((s) => s.accountGuid !== account.guid);

    if (transferSplits.length === 1 && accountSplit) {
      setTransferAccountGuid(transferSplits[0].accountGuid);
      setTransferAccountPath(transferSplits[0].accountFullPath);
      const qty = isCredit ? -accountSplit.quantity : accountSplit.quantity;
      if (qty > 0) {
        setIncrease(Math.abs(qty).toFixed(2));
        setDecrease("");
      } else {
        setDecrease(Math.abs(qty).toFixed(2));
        setIncrease("");
      }
      setIsMultiSplit(false);
    } else if (editingTransaction.splits.length > 2) {
      // Multi-split editing
      setIsMultiSplit(true);
      const rows: SplitEntryRow[] = editingTransaction.splits.map((s, i) => ({
        id: i + 1,
        accountGuid: s.accountGuid,
        accountPath: s.accountFullPath,
        debit: s.amount >= 0 ? Math.abs(s.amount).toFixed(2) : "",
        credit: s.amount < 0 ? Math.abs(s.amount).toFixed(2) : "",
        memo: s.memo,
      }));
      setExtraSplits(rows);
      nextSplitId.current = rows.length + 1;
    }
    setIsDirty(false);
  }, [editingTransaction, account.guid, isCredit]);

  // ── Click-away detection ───────────────────────────────────────

  useEffect(() => {
    if (!isDirty && !isEditing) return;

    function handleMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;

      // Don't dismiss if clicking within any inline entry element
      if (target.closest("[data-inline-entry]")) return;

      // Don't dismiss if clicking within portaled dropdowns/menus (autocomplete, context menu)
      // These are rendered at the top level of <body> with fixed positioning
      if (target.closest("[data-autocomplete-dropdown]") || target.closest("[data-context-menu]")) return;

      // Check if click is inside our main row ref
      if (rowRef.current && rowRef.current.contains(target)) return;

      // Click was outside - dismiss
      if (isEditing) {
        onCancelEdit?.();
      } else {
        resetFormQuiet();
      }
    }

    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isDirty, isEditing, onCancelEdit]);

  // ── Focus helpers ──────────────────────────────────────────────

  const focusField = useCallback((field: FieldName) => {
    requestAnimationFrame(() => {
      const el = fieldRefs[field].current;
      if (el) {
        el.focus();
        el.select();
      }
    });
  }, []);

  /** Reset without refocusing (used for click-away) */
  const resetFormQuiet = useCallback(() => {
    setDate(getDefaultDate());
    setNum("");
    setDescription("");
    setTransferAccountGuid("");
    setTransferAccountPath("");
    setIncrease("");
    setDecrease("");
    setForeignAmount("");
    setShares("");
    setPrice("");
    setValue("");
    setIsBuy(true);
    setShowRecalcPicker(false);
    setIsMultiSplit(false);
    setExtraSplits([]);
    setError(null);
    setIsDirty(false);
  }, []);

  // ── Investment auto-compute ────────────────────────────────────

  function parseNum(s: string): number | null {
    const n = parseFloat(s);
    return isNaN(n) || n <= 0 ? null : n;
  }

  function investmentAutoCompute(changedField: "shares" | "price" | "value", s: string, p: string, v: string) {
    const sN = parseNum(s);
    const pN = parseNum(p);
    const vN = parseNum(v);

    if (sN != null && pN != null && vN == null) {
      return { shares: s, price: p, value: (sN * pN).toFixed(2) };
    }
    if (sN != null && vN != null && pN == null) {
      return { shares: s, value: v, price: sN > 0 ? (vN / sN).toFixed(4) : "" };
    }
    if (pN != null && vN != null && sN == null) {
      return { price: p, value: v, shares: pN > 0 ? (vN / pN).toFixed(4) : "" };
    }
    return { shares: s, price: p, value: v };
  }

  function handleInvestmentFieldChange(field: "shares" | "price" | "value", val: string) {
    const newS = field === "shares" ? val : shares;
    const newP = field === "price" ? val : price;
    const newV = field === "value" ? val : value;

    // If all three are already filled, ask which to recalculate
    if (parseNum(shares) != null && parseNum(price) != null && parseNum(value) != null && parseNum(val) != null) {
      pendingInvChange.current = { field, val };
      setShowRecalcPicker(true);
      return;
    }

    const result = investmentAutoCompute(field, newS, newP, newV);
    setShares(result.shares);
    setPrice(result.price);
    setValue(result.value);
    markDirty();
  }

  function handleRecalcPick(recalcField: "shares" | "price" | "value") {
    if (!pendingInvChange.current) return;
    const { field, val } = pendingInvChange.current;
    let s = field === "shares" ? val : shares;
    let p = field === "price" ? val : price;
    let v = field === "value" ? val : value;
    // Clear the field to be recalculated
    if (recalcField === "shares") s = "";
    else if (recalcField === "price") p = "";
    else v = "";
    const result = investmentAutoCompute(field, s, p, v);
    setShares(result.shares);
    setPrice(result.price);
    setValue(result.value);
    setShowRecalcPicker(false);
    pendingInvChange.current = null;
    markDirty();
  }

  const resetForm = useCallback(() => {
    resetFormQuiet();
    focusField("date");
  }, [resetFormQuiet, focusField]);

  /** Flash a toast message that auto-dismisses after 3 seconds */
  const showToast = useCallback((msg: string, type: "success" | "warning" | "error") => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // Expose imperative handle to parent
  useEffect(() => {
    if (entryRef) {
      (entryRef as React.MutableRefObject<InlineEntryHandle | null>).current = { showToast };
    }
  }, [entryRef, showToast]);

  // Track dirty state
  const markDirty = useCallback(() => {
    if (!isDirty) setIsDirty(true);
  }, [isDirty]);

  // ── Keyboard navigation ────────────────────────────────────────

  function handleFieldKeyDown(field: FieldName, e: React.KeyboardEvent) {
    if (e.key === "Tab") {
      e.preventDefault();
      const idx = FIELD_ORDER.indexOf(field);
      const nextIdx = e.shiftKey ? Math.max(0, idx - 1) : Math.min(FIELD_ORDER.length - 1, idx + 1);
      if (nextIdx !== idx) focusField(FIELD_ORDER[nextIdx]);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      submitRef.current();
      return;
    }
    if (e.key === "Escape") {
      if (isEditing) {
        onCancelEdit?.();
      } else {
        resetForm();
      }
    }
  }

  // ── Auto-fill from description match ───────────────────────────

  const handleDescriptionConfirm = useCallback((match: QuickFillMatch | null) => {
    if (!match) return;

    if (match.isMultiSplit) {
      // Copy all splits from the matched multi-split transaction
      const rows: SplitEntryRow[] = match.allSplits.map((s, i) => ({
        id: i + 1,
        accountGuid: s.accountGuid,
        accountPath: s.accountFullPath,
        debit: s.amount >= 0 ? Math.abs(s.amount).toFixed(2) : "",
        credit: s.amount < 0 ? Math.abs(s.amount).toFixed(2) : "",
        memo: s.memo,
      }));
      setExtraSplits(rows);
      nextSplitId.current = rows.length + 1;
      setIsMultiSplit(true);
      setTransferAccountGuid("");
      setTransferAccountPath("");
      setIncrease("");
      setDecrease("");
    } else {
      // Simple 2-split: fill transfer and amount
      setTransferAccountGuid(match.transferAccountGuid);
      setTransferAccountPath(match.transferAccountPath);
      if (match.amount > 0) {
        setIncrease(Math.abs(match.amount).toFixed(2));
        setDecrease("");
      } else if (match.amount < 0) {
        setDecrease(Math.abs(match.amount).toFixed(2));
        setIncrease("");
      }
      setIsMultiSplit(false);
      setExtraSplits([]);
    }
    markDirty();
  }, [markDirty]);

  const handleTransferSelect = useCallback((acct: FlatAccount) => {
    setTransferAccountGuid(acct.guid);
    setTransferAccountPath(acct.fullPath);
    markDirty();
  }, [markDirty]);

  // ── Multi-split ────────────────────────────────────────────────

  const enterMultiSplitMode = useCallback(() => {
    const currentSplit: SplitEntryRow = {
      id: 1,
      accountGuid: account.guid,
      accountPath: account.fullPath || account.name,
      debit: increase || "",
      credit: decrease || "",
      memo: "",
    };
    const transferSplit: SplitEntryRow = {
      id: 2,
      accountGuid: transferAccountGuid,
      accountPath: transferAccountPath,
      debit: decrease || "",
      credit: increase || "",
      memo: "",
    };
    setExtraSplits([currentSplit, transferSplit]);
    nextSplitId.current = 3;
    setIsMultiSplit(true);
    setContextMenu(null);
    markDirty();
  }, [account, increase, decrease, transferAccountGuid, transferAccountPath, markDirty]);

  // ── Submission ─────────────────────────────────────────────────

  const canSubmit = useMemo(() => {
    if (!description.trim() || !date) return false;

    if (isMultiSplit) {
      if (extraSplits.length < 2) return false;
      for (const s of extraSplits) {
        if (!s.accountGuid) return false;
        const d = parseFloat(s.debit) || 0;
        const c = parseFloat(s.credit) || 0;
        if (d === 0 && c === 0) return false;
      }
      let totalD = 0, totalC = 0;
      for (const s of extraSplits) {
        totalD += parseFloat(s.debit) || 0;
        totalC += parseFloat(s.credit) || 0;
      }
      return Math.round(totalD * 100) === Math.round(totalC * 100);
    }

    if (!transferAccountGuid) return false;

    if (isInvestment) {
      const sh = parseNum(shares);
      const v = parseNum(value);
      return sh != null && v != null;
    }

    const inc = parseFloat(increase) || 0;
    const dec = parseFloat(decrease) || 0;
    if (inc === 0 && dec === 0) return false;

    // Cross-currency requires a foreign amount
    if (isCrossCurrency) {
      const fa = parseFloat(foreignAmount) || 0;
      return fa > 0;
    }

    return true;
  }, [description, date, transferAccountGuid, increase, decrease, isMultiSplit, extraSplits, isInvestment, shares, value, isCrossCurrency, foreignAmount]);

  async function handleSubmit() {
    if (!canSubmit || !data) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const fraction = data.currencyFraction;
      let splitPayloads: CreateTransactionPayload["splits"];

      if (isMultiSplit) {
        splitPayloads = extraSplits.map((s) => {
          const d = parseFloat(s.debit) || 0;
          const c = parseFloat(s.credit) || 0;
          const amount = d > 0 ? d : -c;
          return buildCurrencySplitPayload(s.accountGuid, amount, fraction, s.memo);
        });
      } else if (isInvestment) {
        // Investment transaction: stock split has quantity=shares, value=cost in currency
        const sharesVal = parseFloat(shares) || 0;
        const totalVal = parseFloat(value) || 0;
        const sign = isBuy ? 1 : -1;
        const valueNum = Math.round(sign * totalVal * fraction);
        const quantityNum = Math.round(sign * sharesVal * 10000);

        splitPayloads = [
          {
            accountGuid: account.guid,
            valueNum,
            valueDenom: fraction,
            quantityNum,
            quantityDenom: 10000,
          },
          // Counter-split: cash account gets opposite value, quantity=value (same currency)
          {
            accountGuid: transferAccountGuid,
            valueNum: -valueNum,
            valueDenom: fraction,
            quantityNum: -valueNum,
            quantityDenom: fraction,
          },
        ];
      } else {
        const inc = parseFloat(increase) || 0;
        const dec = parseFloat(decrease) || 0;

        let currentAccountAmount: number;
        if (isCredit) {
          currentAccountAmount = inc > 0 ? -inc : dec;
        } else {
          currentAccountAmount = inc > 0 ? inc : -dec;
        }

        if (isCrossCurrency && transferAccount) {
          // Cross-currency: value is in register account's currency (= tx currency)
          // Transfer split's quantity is in its own currency (foreignAmount)
          const fa = parseFloat(foreignAmount) || 0;
          const transferCommodity = data.commodities?.find(
            (c) => c.mnemonic === transferAccount.commodityMnemonic
          );
          const transferFraction = transferCommodity?.fraction ?? 100;

          splitPayloads = [
            // Register account split: value = quantity (same currency as tx)
            buildCurrencySplitPayload(account.guid, currentAccountAmount, fraction),
            // Transfer account split: value in tx currency, quantity in foreign currency
            {
              accountGuid: transferAccountGuid,
              valueNum: Math.round(-currentAccountAmount * fraction),
              valueDenom: fraction,
              quantityNum: Math.round((currentAccountAmount > 0 ? -fa : fa) * transferFraction),
              quantityDenom: transferFraction,
            },
          ];
        } else {
          splitPayloads = [
            buildCurrencySplitPayload(account.guid, currentAccountAmount, fraction),
            buildCurrencySplitPayload(transferAccountGuid, -currentAccountAmount, fraction),
          ];
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
        onCancelEdit?.();
        showToast("Transaction updated", "warning");
      } else {
        await createTransaction({
          currencyGuid: data.currencyGuid,
          postDate: date,
          description: description.trim(),
          num: num.trim() || undefined,
          splits: splitPayloads,
        });
        resetForm();
        showToast("Transaction added", "success");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save transaction");
    } finally {
      setIsSubmitting(false);
    }
  }

  submitRef.current = handleSubmit;

  if (!data) return null;

  if (!isWritable && !isEditing) {
    return (
      <tr className="border-b border-[#EFEFEF] bg-[#F9FAFB]">
        <td colSpan={colSpan} className="py-3 text-center">
          <button
            onClick={toggleWritable}
            className="text-xs text-[#3B6B8A] hover:text-[#2D5570] transition-colors hover:underline"
          >
            Enable editing to add transactions
          </button>
        </td>
      </tr>
    );
  }

  const bgColor = isEditing ? "bg-[#E8F0FE]" : "bg-[#EBF5EC]";
  const hoverColor = isEditing ? "hover:bg-[#DCE8F8]" : "hover:bg-[#E0EDDF]";
  const borderColor = isEditing ? "border-[#3B6B8A]/30" : "border-[#6C9B8B]/30";

  return (
    <>
      {/* Main entry row */}
      <tr
        ref={rowRef}
        data-inline-entry
        className={`border-b-2 ${borderColor} ${bgColor} ${hoverColor} transition-colors`}
        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY }); }}
      >
        {/* Expand placeholder */}
        <td className="py-1.5 pl-1 pr-1 w-8" />

        {/* Date */}
        <td className="py-1.5 pr-1">
          <SmartDateInput
            value={date}
            onChange={(v) => { setDate(v); markDirty(); }}
            onKeyDown={(e) => handleFieldKeyDown("date", e)}
            inputRef={dateRef}
            className={CELL_INPUT + " max-w-[120px]"}
          />
        </td>

        {/* Num */}
        <td className="py-1.5 pr-1 w-16">
          <input
            ref={numRef}
            data-inline-entry
            type="text"
            value={num}
            onChange={(e) => { setNum(e.target.value); markDirty(); }}
            onKeyDown={(e) => handleFieldKeyDown("num", e)}
            placeholder="Num"
            className={CELL_INPUT + " max-w-[60px]"}
          />
        </td>

        {/* Description */}
        <td className="py-1.5 pr-1" data-inline-entry>
          <DescriptionAutocomplete
            value={description}
            onChange={(v) => { setDescription(v); markDirty(); }}
            onConfirm={handleDescriptionConfirm}
            transactions={transactions}
            currentAccountGuid={account.guid}
            isCredit={isCredit}
            inputRef={descriptionRef}
            onKeyDown={(e) => handleFieldKeyDown("description", e)}
            className={CELL_INPUT}
          />
        </td>

        {/* Transfer account */}
        <td className="py-1.5 pr-1 hidden md:table-cell" data-inline-entry>
          {isMultiSplit ? (
            <span className="px-2 text-xs italic text-[#9A9FA5]">-- Split --</span>
          ) : (
            <AccountAutocomplete
              value={transferAccountPath}
              onChange={(v) => { setTransferAccountPath(v); markDirty(); }}
              onSelect={handleTransferSelect}
              accounts={flatAccounts}
              inputRef={transferRef}
              onKeyDown={(e) => handleFieldKeyDown("transfer", e)}
              className={CELL_INPUT}
            />
          )}
        </td>

        {/* R (reconcile - empty for new entry) */}
        <td className="py-1.5 text-center hidden sm:table-cell w-10">
          {isInvestment && !isMultiSplit && (
            <button
              onClick={() => { setIsBuy(!isBuy); markDirty(); }}
              className={`text-[9px] font-bold rounded px-1 py-0.5 ${isBuy ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-[#E87C6B]"}`}
              title={isBuy ? "Buy (click to toggle)" : "Sell (click to toggle)"}
            >
              {isBuy ? "B" : "S"}
            </button>
          )}
        </td>

        {isInvestment && !isMultiSplit ? (
          <>
            {/* Shares */}
            <td className="py-1.5 pr-1" data-inline-entry>
              <input
                ref={sharesRef}
                data-inline-entry
                type="text"
                inputMode="decimal"
                value={shares}
                onChange={(e) => handleInvestmentFieldChange("shares", e.target.value)}
                onBlur={(e) => { const v = evalExpr(e.target.value); if (v !== shares) handleInvestmentFieldChange("shares", v); }}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => handleFieldKeyDown("shares", e)}
                placeholder="Shares"
                className={AMOUNT_CELL_INPUT}
              />
            </td>

            {/* Price */}
            <td className="py-1.5 pr-1" data-inline-entry>
              <input
                ref={priceRef}
                data-inline-entry
                type="text"
                inputMode="decimal"
                value={price}
                onChange={(e) => handleInvestmentFieldChange("price", e.target.value)}
                onBlur={(e) => { const v = evalExpr(e.target.value); if (v !== price) handleInvestmentFieldChange("price", v); }}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => handleFieldKeyDown("price", e)}
                placeholder="Price"
                className={AMOUNT_CELL_INPUT}
              />
            </td>

            {/* Value (total cost) */}
            <td className="py-1.5 pr-1 hidden lg:table-cell" data-inline-entry>
              <input
                ref={valueRef}
                data-inline-entry
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => handleInvestmentFieldChange("value", e.target.value)}
                onBlur={(e) => { const v = evalExpr(e.target.value); if (v !== value) handleInvestmentFieldChange("value", v); }}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => handleFieldKeyDown("value", e)}
                placeholder="Value"
                className={AMOUNT_CELL_INPUT}
              />
            </td>
          </>
        ) : (
          <>
            {/* Increase */}
            <td className="py-1.5 pr-1" data-inline-entry>
              {isMultiSplit ? (
                <span className="block px-2 text-right text-xs text-[#9A9FA5]">--</span>
              ) : (
                <input
                  ref={increaseRef}
                  data-inline-entry
                  type="text"
                  inputMode="decimal"
                  value={increase}
                  onChange={(e) => {
                    setIncrease(e.target.value);
                    if (e.target.value) setDecrease("");
                    markDirty();
                  }}
                  onBlur={(e) => { const v = evalExpr(e.target.value); if (v !== increase) { setIncrease(v); if (v) setDecrease(""); } }}
                  onKeyDown={(e) => handleFieldKeyDown("increase", e)}
                  placeholder="0.00"
                  className={AMOUNT_CELL_INPUT}
                />
              )}
            </td>

            {/* Decrease */}
            <td className="py-1.5 pr-1" data-inline-entry>
              {isMultiSplit ? (
                <span className="block px-2 text-right text-xs text-[#9A9FA5]">--</span>
              ) : (
                <input
                  ref={decreaseRef}
                  data-inline-entry
                  type="text"
                  inputMode="decimal"
                  value={decrease}
                  onChange={(e) => {
                    setDecrease(e.target.value);
                    if (e.target.value) setIncrease("");
                    markDirty();
                  }}
                  onBlur={(e) => { const v = evalExpr(e.target.value); if (v !== decrease) { setDecrease(v); if (v) setIncrease(""); } }}
                  onKeyDown={(e) => handleFieldKeyDown("decrease", e)}
                  placeholder="0.00"
                  className={AMOUNT_CELL_INPUT}
                />
              )}
            </td>

            {/* Balance (empty for entry row) */}
            <td className="py-1.5 hidden lg:table-cell" />
          </>
        )}
      </tr>

      {/* Cross-currency exchange rate row */}
      {isCrossCurrency && !isMultiSplit && transferAccount && (
        <tr className={`${bgColor} border-b border-[#D4E8D6]`} data-inline-entry>
          <td colSpan={colSpan} className="px-3 py-1.5">
            <div className="flex items-center gap-3">
              <span className="text-xs text-[#6F767E]">
                Amount in {transferAccount.commodityMnemonic}:
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={foreignAmount}
                onChange={(e) => { setForeignAmount(e.target.value); markDirty(); }}
                onBlur={(e) => { const v = evalExpr(e.target.value); if (v !== foreignAmount) setForeignAmount(v); }}
                onFocus={(e) => e.target.select()}
                onKeyDown={(e) => handleFieldKeyDown("increase", e)}
                placeholder="0.00"
                className={AMOUNT_CELL_INPUT + " max-w-[120px]"}
              />
              {(parseFloat(increase) || parseFloat(decrease)) > 0 && parseFloat(foreignAmount) > 0 && (
                <span className="text-[10px] text-[#9A9FA5]">
                  Rate: {(parseFloat(foreignAmount) / (parseFloat(increase) || parseFloat(decrease))).toFixed(4)}
                </span>
              )}
            </div>
          </td>
        </tr>
      )}

      {/* Error row */}
      {error && (
        <tr className={isEditing ? "bg-red-50" : "bg-red-50"} data-inline-entry>
          <td colSpan={colSpan} className="px-3 py-1.5 text-xs text-red-600">
            {error}
          </td>
        </tr>
      )}

      {/* Multi-split rows */}
      {isMultiSplit && (
        <SplitEntryRows
          splits={extraSplits}
          onUpdateSplit={(id, updates) => { setExtraSplits((prev) => prev.map((s) => s.id === id ? { ...s, ...updates } : s)); markDirty(); }}
          onAddSplit={() => { setExtraSplits((prev) => [...prev, { id: nextSplitId.current++, accountGuid: "", accountPath: "", debit: "", credit: "", memo: "" }]); markDirty(); }}
          onRemoveSplit={(id) => { setExtraSplits((prev) => prev.filter((s) => s.id !== id)); markDirty(); }}
          accounts={flatAccounts}
          currency={account.commodityMnemonic || data.currency}
          colSpan={colSpan}
        />
      )}

      {/* Submission hint row */}
      <tr className={`${bgColor}/50`} data-inline-entry>
        <td colSpan={colSpan} className="px-3 py-1">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-[#9A9FA5]">
              {isSubmitting ? "Saving..." : (
                <>
                  <kbd className="rounded border border-[#D1D5DB] bg-white px-1 py-0.5 text-[9px] font-mono">Tab</kbd>
                  {" next "}
                  <kbd className="rounded border border-[#D1D5DB] bg-white px-1 py-0.5 text-[9px] font-mono">Enter</kbd>
                  {isEditing ? " update " : " save "}
                  <kbd className="rounded border border-[#D1D5DB] bg-white px-1 py-0.5 text-[9px] font-mono">Esc</kbd>
                  {" cancel"}
                  {!isEditing && (
                    <span className="hidden sm:inline">
                      {" | Right-click for splits"}
                    </span>
                  )}
                </>
              )}
            </span>
            {canSubmit && !isSubmitting && (
              <button
                onClick={handleSubmit}
                data-inline-entry
                className="rounded bg-[#3B6B8A] px-2.5 py-0.5 text-[10px] font-medium text-white hover:bg-[#2D5570] transition-colors"
              >
                {isEditing ? "Update" : "Save"}
              </button>
            )}
          </div>
        </td>
      </tr>

      {/* Confirmation toast */}
      {toast && (
        <tr data-inline-entry>
          <td colSpan={colSpan} className="px-3 py-1.5">
            <div className={`flex items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium ${
              toast.type === "success" ? "bg-emerald-50 border-emerald-200 text-emerald-700" :
              toast.type === "warning" ? "bg-amber-50 border-amber-200 text-amber-700" :
              "bg-red-50 border-red-200 text-red-700"
            }`}>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {toast.type === "success" ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                ) : toast.type === "warning" ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-7 7-7-7" />
                )}
              </svg>
              {toast.msg}
            </div>
          </td>
        </tr>
      )}

      {/* Investment recalc picker */}
      {showRecalcPicker && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" data-inline-entry onClick={() => { setShowRecalcPicker(false); pendingInvChange.current = null; }}>
            <div className="w-full max-w-xs rounded-xl bg-white p-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-sm font-semibold text-[#1A1D1F]">Recalculate which field?</h3>
              <p className="mt-1 text-xs text-[#6F767E]">All three values are set. Which should be recalculated?</p>
              <div className="mt-3 flex gap-2">
                {(["shares", "price", "value"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => handleRecalcPick(f)}
                    className="flex-1 rounded-lg border border-[#EFEFEF] px-2 py-2 text-xs font-medium text-[#6F767E] capitalize transition-colors hover:bg-[#3B6B8A]/10 hover:text-[#3B6B8A]"
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}

      {/* Right-click context menu */}
      {contextMenu && typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[99]" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null); }} />
            <div
              data-context-menu
              className="fixed z-[100] min-w-[160px] rounded-lg border border-[#EFEFEF] bg-white py-1 shadow-lg"
              style={{ top: contextMenu.y, left: contextMenu.x }}
            >
              <button
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-[#6F767E] transition-colors hover:bg-[#F4F5F7] hover:text-[#1A1D1F]"
                onClick={enterMultiSplitMode}
              >
                <Split className="h-3.5 w-3.5" />
                Add splits
              </button>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
