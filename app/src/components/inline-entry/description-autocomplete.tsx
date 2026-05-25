"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import type { LedgerTransaction, LedgerSplit } from "@/lib/types/gnucash";

/** Data about a previous transaction for auto-fill */
export interface QuickFillMatch {
  description: string;
  transferAccountGuid: string;
  transferAccountPath: string;
  /** Positive = increase for the register account, negative = decrease */
  amount: number;
  /** All splits from the matched transaction (for multi-split copy) */
  allSplits: LedgerSplit[];
  /** Whether the matched transaction had more than 2 splits */
  isMultiSplit: boolean;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** Called when user confirms a suggestion (Tab, Enter, or click) */
  onConfirm: (match: QuickFillMatch | null) => void;
  /** All ledger transactions for building the QuickFill index */
  transactions: LedgerTransaction[];
  /** The account GUID of the current register */
  currentAccountGuid: string;
  /** Whether this is a credit-type account (INCOME, LIABILITY, etc.) */
  isCredit: boolean;
  inputRef: React.RefObject<HTMLInputElement | null>;
  /** Forward key events not handled by autocomplete (e.g. Tab with no dropdown) */
  onKeyDown: (e: React.KeyboardEvent) => void;
  className?: string;
}

export function DescriptionAutocomplete({
  value,
  onChange,
  onConfirm,
  transactions,
  currentAccountGuid,
  isCredit,
  inputRef,
  onKeyDown,
  className,
}: Props) {
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [dropdownDismissed, setDropdownDismissed] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Build QuickFill index: map description → most recent transaction's full data
  const quickFillIndex = useMemo(() => {
    const index = new Map<string, QuickFillMatch>();

    // Transactions are already sorted date DESC from the data source
    for (const tx of transactions) {
      const key = tx.description.toLowerCase();
      if (!key || index.has(key)) continue;

      const accountSplit = tx.splits.find((s) => s.accountGuid === currentAccountGuid);
      if (!accountSplit) continue;

      const transferSplits = tx.splits.filter((s) => s.accountGuid !== currentAccountGuid);
      if (transferSplits.length === 0) continue;

      const transfer = transferSplits[0];
      const quantity = isCredit ? -accountSplit.quantity : accountSplit.quantity;

      index.set(key, {
        description: tx.description,
        transferAccountGuid: transfer.accountGuid,
        transferAccountPath: transfer.accountFullPath,
        amount: quantity,
        allSplits: tx.splits,
        isMultiSplit: tx.splits.length > 2,
      });
    }

    return index;
  }, [transactions, currentAccountGuid, isCredit]);

  // Filter suggestions based on current input
  const suggestions = useMemo(() => {
    if (!value.trim()) return [];
    const query = value.toLowerCase();
    const matches: QuickFillMatch[] = [];

    for (const [key, match] of quickFillIndex) {
      if (key.startsWith(query)) {
        matches.push(match);
      }
    }

    // If no prefix matches, try substring
    if (matches.length === 0) {
      for (const [key, match] of quickFillIndex) {
        if (key.includes(query)) {
          matches.push(match);
        }
      }
    }

    return matches.slice(0, 10);
  }, [value, quickFillIndex]);

  const showDropdown = !dropdownDismissed && suggestions.length > 0 && Boolean(value.trim());
  const activeHighlightIndex =
    showDropdown && suggestions.length > 0
      ? Math.min(Math.max(highlightIndex, 0), suggestions.length - 1)
      : -1;

  // Update dropdown position when shown
  useEffect(() => {
    if (showDropdown && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, 300),
      });
    }
  }, [showDropdown, inputRef]);

  // Close on outside click
  useEffect(() => {
    if (!showDropdown) return;
    function handleClick(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) {
        setDropdownDismissed(true);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown, inputRef]);

  const confirmSuggestion = useCallback((index: number) => {
    if (index >= 0 && index < suggestions.length) {
      const match = suggestions[index];
      onChange(match.description);
      onConfirm(match);
      setDropdownDismissed(true);
    }
  }, [suggestions, onChange, onConfirm]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (showDropdown && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, suggestions.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Tab") {
        // Confirm the highlighted suggestion, then let Tab propagate for field navigation
        if (activeHighlightIndex >= 0) {
          confirmSuggestion(activeHighlightIndex);
        }
        // Don't prevent default - let the parent handle Tab navigation
        onKeyDown(e);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (activeHighlightIndex >= 0) {
          confirmSuggestion(activeHighlightIndex);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setDropdownDismissed(true);
        return;
      }
    }

    // Forward all other keys to parent
    onKeyDown(e);
  }

  // Scroll highlighted item into view
  useEffect(() => {
    if (!showDropdown || highlightIndex < 0) return;
    const el = dropdownRef.current?.children[highlightIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, showDropdown]);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          setDropdownDismissed(false);
          setHighlightIndex(0);
          onChange(e.target.value);
        }}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          e.target.select();
          if (suggestions.length > 0 && value.trim()) setDropdownDismissed(false);
        }}
        placeholder="Description"
        className={className}
        autoComplete="off"
      />

      {showDropdown && dropdownPos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={dropdownRef}
            data-autocomplete-dropdown
            className="fixed z-[100] max-h-60 overflow-y-auto rounded-lg border border-[#EFEFEF] bg-white py-1 shadow-lg"
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
            }}
          >
            {suggestions.map((match, i) => (
              <button
                key={match.description}
                className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs transition-colors ${
                  i === activeHighlightIndex ? "bg-[#3B6B8A]/10 text-[#1A1D1F]" : "text-[#6F767E] hover:bg-[#F4F5F7]"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault(); // Don't blur the input
                  confirmSuggestion(i);
                }}
                onMouseEnter={() => setHighlightIndex(i)}
              >
                <span className="truncate font-medium">{match.description}</span>
                <span className="shrink-0 text-[10px] text-[#9A9FA5] truncate max-w-[150px]">
                  {match.transferAccountPath}
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
