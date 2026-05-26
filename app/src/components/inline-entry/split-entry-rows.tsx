"use client";

import { useRef, useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { type FlatAccount, evalExpr } from "@/lib/transaction-helpers";
import { AccountAutocomplete } from "./account-autocomplete";
import { formatAmount } from "@/lib/format";

export interface SplitEntryRow {
  id: number;
  accountGuid: string;
  accountPath: string;
  debit: string;
  credit: string;
  memo: string;
}

interface Props {
  splits: SplitEntryRow[];
  onUpdateSplit: (id: number, updates: Partial<SplitEntryRow>) => void;
  onAddSplit: () => void;
  onRemoveSplit: (id: number) => void;
  accounts: FlatAccount[];
  currency: string;
  colSpan: number;
}

export function SplitEntryRows({
  splits,
  onUpdateSplit,
  onAddSplit,
  onRemoveSplit,
  accounts,
  currency,
  colSpan,
}: Props) {
  const { isBalanced, imbalance } = useMemo(() => {
    let totalDebit = 0;
    let totalCredit = 0;
    for (const s of splits) {
      const d = parseFloat(s.debit);
      const c = parseFloat(s.credit);
      if (!isNaN(d) && d > 0) totalDebit += d;
      if (!isNaN(c) && c > 0) totalCredit += c;
    }
    totalDebit = Math.round(totalDebit * 100) / 100;
    totalCredit = Math.round(totalCredit * 100) / 100;
    const isBalanced = totalDebit === totalCredit && totalDebit > 0;
    const imbalance = Math.round((totalDebit - totalCredit) * 100) / 100;
    return { totalDebit, totalCredit, isBalanced, imbalance };
  }, [splits]);

  return (
    <>
      {/* Split header */}
      <tr className="bg-[#EBF5EC]" data-inline-entry>
        <td colSpan={colSpan} className="px-3 py-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-medium uppercase tracking-wider text-[#6F767E]">
              Split Transaction
            </span>
            <span className={`text-[10px] font-medium ${isBalanced ? "text-emerald-600" : "text-[#E87C6B]"}`}>
              {isBalanced ? "Balanced" : `Imbalance: ${formatAmount(Math.abs(imbalance), currency)}`}
            </span>
          </div>
        </td>
      </tr>

      {/* Column labels */}
      <tr className="bg-[#EBF5EC]" data-inline-entry>
        <td colSpan={colSpan} className="px-2 py-0.5">
          <div className="flex items-center gap-1">
            <span className="flex-[3] text-[10px] font-medium text-[#9A9FA5] px-1">Account</span>
            <span className="w-20 text-[10px] font-medium text-[#9A9FA5] px-1">Memo</span>
            <span className="w-28 text-right text-[10px] font-medium text-[#9A9FA5] px-1">Debit</span>
            <span className="w-28 text-right text-[10px] font-medium text-[#9A9FA5] px-1">Credit</span>
            <span className="w-8" />
          </div>
        </td>
      </tr>

      {/* Individual split rows */}
      {splits.map((split) => (
        <SplitRow
          key={split.id}
          split={split}
          onUpdate={(updates) => onUpdateSplit(split.id, updates)}
          onRemove={splits.length > 2 ? () => onRemoveSplit(split.id) : undefined}
          accounts={accounts}
        />
      ))}

      {/* Imbalance row - always at bottom, shows live imbalance in red */}
      {!isBalanced && (
        <tr className="bg-[#FEF2F2] border-b border-[#FECACA]" data-inline-entry>
          <td colSpan={colSpan} className="px-2 py-1">
            <div className="flex items-center gap-1">
              <span className="flex-[3] px-1 text-xs font-medium text-[#E87C6B]">
                Imbalance-{currency}
              </span>
              <span className="w-20 px-1" />
              <span className="w-28 px-1 text-right text-xs font-medium text-[#E87C6B]">
                {imbalance < 0 ? formatAmount(Math.abs(imbalance), currency) : ""}
              </span>
              <span className="w-28 px-1 text-right text-xs font-medium text-[#E87C6B]">
                {imbalance > 0 ? formatAmount(Math.abs(imbalance), currency) : ""}
              </span>
              <span className="w-8" />
            </div>
          </td>
        </tr>
      )}

      {/* Add split row */}
      <tr className="bg-[#EBF5EC]" data-inline-entry>
        <td colSpan={colSpan} className="px-3 py-1.5">
          <button
            onClick={onAddSplit}
            className="flex items-center gap-1 text-xs text-[#3B6B8A] hover:text-[#2D5570] transition-colors"
          >
            <Plus className="h-3 w-3" />
            Add split
          </button>
        </td>
      </tr>
    </>
  );
}

function SplitRow({
  split,
  onUpdate,
  onRemove,
  accounts,
}: {
  split: SplitEntryRow;
  onUpdate: (updates: Partial<SplitEntryRow>) => void;
  onRemove?: () => void;
  accounts: FlatAccount[];
}) {
  const accountRef = useRef<HTMLInputElement>(null);

  const inputClass = "h-7 w-full rounded border border-[#C8DFC9] bg-white px-2 text-xs text-[#1A1D1F] placeholder:text-[#B8C4B9] focus:border-[#3B6B8A] focus:outline-none focus:ring-1 focus:ring-[#3B6B8A]";
  const amountClass = inputClass + " text-right [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

  return (
    <tr className="bg-[#EBF5EC] border-b border-[#D4E8D6]" data-inline-entry>
      <td colSpan={9} className="py-1 px-2">
        <div className="flex items-center gap-1">
          {/* Account - flex grow */}
          <div className="flex-[3]">
            <AccountAutocomplete
              value={split.accountPath}
              onChange={(v) => onUpdate({ accountPath: v })}
              onSelect={(a) => onUpdate({ accountGuid: a.guid, accountPath: a.fullPath })}
              accounts={accounts}
              inputRef={accountRef}
              onKeyDown={() => {}}
              className={inputClass}
              placeholder="Account"
            />
          </div>

          {/* Memo - narrow */}
          <div className="w-20">
            <input
              type="text"
              value={split.memo}
              onChange={(e) => onUpdate({ memo: e.target.value })}
              placeholder="Memo"
              className={inputClass}
            />
          </div>

          {/* Debit */}
          <div className="w-28">
            <input
              type="text"
              inputMode="decimal"
              value={split.debit}
              onChange={(e) => {
                const v = e.target.value;
                onUpdate({ debit: v, credit: v ? "" : split.credit });
              }}
              onBlur={(e) => { const v = evalExpr(e.target.value); if (v !== split.debit) onUpdate({ debit: v, credit: v ? "" : split.credit }); }}
              placeholder="0.00"
              className={amountClass}
            />
          </div>

          {/* Credit */}
          <div className="w-28">
            <input
              type="text"
              inputMode="decimal"
              value={split.credit}
              onChange={(e) => {
                const v = e.target.value;
                onUpdate({ credit: v, debit: v ? "" : split.debit });
              }}
              onBlur={(e) => { const v = evalExpr(e.target.value); if (v !== split.credit) onUpdate({ credit: v, debit: v ? "" : split.debit }); }}
              placeholder="0.00"
              className={amountClass}
            />
          </div>

          {/* Remove button */}
          <div className="w-8 flex justify-center">
            {onRemove ? (
              <button
                onClick={onRemove}
                className="flex h-6 w-6 items-center justify-center rounded text-[#9A9FA5] hover:bg-red-50 hover:text-[#E87C6B] transition-colors"
                title="Remove split"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            ) : <span className="w-6" />}
          </div>
        </div>
      </td>
    </tr>
  );
}
