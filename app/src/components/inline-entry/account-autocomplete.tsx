"use client";

import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { type FlatAccount, fuzzyMatch } from "@/lib/transaction-helpers";

const TYPE_DOT_COLORS: Record<string, string> = {
  ASSET: "#059669", BANK: "#059669", CASH: "#059669",
  STOCK: "#2563eb", MUTUAL: "#2563eb",
  INCOME: "#0d9488",
  EXPENSE: "#d97706",
  LIABILITY: "#dc2626", CREDIT: "#dc2626", PAYABLE: "#dc2626",
  EQUITY: "#7c3aed",
  RECEIVABLE: "#0891b2",
  TRADING: "#6b7280",
};

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (account: FlatAccount) => void;
  accounts: FlatAccount[];
  inputRef: React.RefObject<HTMLInputElement | null>;
  onKeyDown: (e: React.KeyboardEvent) => void;
  className?: string;
  placeholder?: string;
}

export function AccountAutocomplete({
  value,
  onChange,
  onSelect,
  accounts,
  inputRef,
  onKeyDown,
  className,
  placeholder = "Transfer account",
}: Props) {
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  // Tracks confirmed hierarchy prefix, e.g. "Expenses:" or "Expenses:Fun:"
  const [hierarchyPrefix, setHierarchyPrefix] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // The text the user is currently typing (after the hierarchy prefix)
  const typedText = value.startsWith(hierarchyPrefix) ? value.slice(hierarchyPrefix.length) : value;

  // Build filtered account list
  const suggestions = useMemo(() => {
    if (!value.trim() && !hierarchyPrefix) return [];

    const query = typedText.toLowerCase();

    // If we have a hierarchy prefix, show children at that level
    if (hierarchyPrefix) {
      const atLevel = accounts.filter((a) => {
        if (!a.fullPath.startsWith(hierarchyPrefix)) return false;
        const remaining = a.fullPath.slice(hierarchyPrefix.length);
        // Get the next segment name
        const nextSegment = remaining.split(":")[0];
        if (!query) return true;
        return nextSegment.toLowerCase().startsWith(query) || nextSegment.toLowerCase().includes(query);
      });

      // Deduplicate by next segment (show parent levels as well as leaves)
      const seen = new Map<string, FlatAccount>();
      for (const a of atLevel) {
        const remaining = a.fullPath.slice(hierarchyPrefix.length);
        const nextSegment = remaining.split(":")[0];
        // Prefer exact level match (the account whose path ends at this segment)
        const key = nextSegment.toLowerCase();
        if (!seen.has(key) || a.fullPath === hierarchyPrefix + nextSegment) {
          seen.set(key, a);
        }
      }

      return Array.from(seen.values()).slice(0, 15);
    }

    // Flat fuzzy search mode
    if (query.length < 1) return [];

    const scored = accounts
      .map((a) => ({ account: a, ...fuzzyMatch(query, a.fullPath) }))
      .filter((r) => r.match)
      .sort((a, b) => b.score - a.score)
      .slice(0, 15);

    return scored.map((s) => s.account);
  }, [value, typedText, hierarchyPrefix, accounts]);

  // Check if the current value already exactly matches a known account
  const isAlreadySelected = useMemo(() => {
    return accounts.some((a) => a.fullPath === value);
  }, [accounts, value]);

  // Show/hide dropdown - don't show if value already exactly matches an account
  useEffect(() => {
    if (isAlreadySelected) {
      setShowDropdown(false);
      setHighlightIndex(-1);
    } else if (suggestions.length > 0 && (value.trim() || hierarchyPrefix)) {
      setShowDropdown(true);
      setHighlightIndex(0);
    } else {
      setShowDropdown(false);
      setHighlightIndex(-1);
    }
  }, [suggestions, value, hierarchyPrefix, isAlreadySelected]);

  // Update dropdown position
  useEffect(() => {
    if (showDropdown && inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({
        top: rect.bottom + 2,
        left: rect.left,
        width: Math.max(rect.width, 280),
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
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showDropdown, inputRef]);

  const selectAccount = useCallback((account: FlatAccount) => {
    onChange(account.fullPath);
    onSelect(account);
    setShowDropdown(false);
    setHierarchyPrefix("");
  }, [onChange, onSelect]);

  /** Descend into a hierarchy level */
  const descendInto = useCallback((account: FlatAccount) => {
    const remaining = account.fullPath.slice(hierarchyPrefix.length);
    const nextSegment = remaining.split(":")[0];
    const newPrefix = hierarchyPrefix + nextSegment + ":";

    // Check if there are children below this level
    const hasChildren = accounts.some((a) => a.fullPath.startsWith(newPrefix) && a.fullPath !== hierarchyPrefix + nextSegment);

    if (hasChildren) {
      setHierarchyPrefix(newPrefix);
      onChange(newPrefix);
      setHighlightIndex(0);
    } else {
      // This is a leaf node, select it
      const exactAccount = accounts.find((a) => a.fullPath === hierarchyPrefix + nextSegment) ?? account;
      selectAccount(exactAccount);
    }
  }, [hierarchyPrefix, accounts, onChange, selectAccount]);

  function handleKeyDown(e: React.KeyboardEvent) {
    // If the value already matches a complete account, Tab/Enter should just pass through
    if (isAlreadySelected && (e.key === "Tab" || e.key === "Enter")) {
      setShowDropdown(false);
      onKeyDown(e);
      return;
    }

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

      // ":" key descends into hierarchy
      if (e.key === ":") {
        if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
          e.preventDefault();
          descendInto(suggestions[highlightIndex]);
          return;
        }
      }

      if (e.key === "Tab") {
        // Tab commits the highlighted suggestion as-is, advancing focus to the
        // next cell. Hierarchy drill-down is handled by the ":" key instead, so
        // typing "hob" + Down + Tab correctly commits Expenses:Fun:Hobbies
        // rather than collapsing to the highest-order parent.
        if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
          selectAccount(suggestions[highlightIndex]);
        }
        onKeyDown(e);
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < suggestions.length) {
          selectAccount(suggestions[highlightIndex]);
        }
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setShowDropdown(false);
        return;
      }

      // Backspace at the start of typed text: go up one hierarchy level
      if (e.key === "Backspace" && typedText === "" && hierarchyPrefix) {
        e.preventDefault();
        const parts = hierarchyPrefix.slice(0, -1).split(":");
        parts.pop();
        const newPrefix = parts.length > 0 ? parts.join(":") + ":" : "";
        setHierarchyPrefix(newPrefix);
        onChange(newPrefix);
        return;
      }
    }

    onKeyDown(e);
  }

  function handleChange(newValue: string) {
    // If user types ":" manually, try to confirm hierarchy
    if (newValue.endsWith(":") && !newValue.endsWith("::")) {
      const segment = newValue.slice(hierarchyPrefix.length, -1);
      if (segment) {
        const match = accounts.find((a) => {
          if (!a.fullPath.startsWith(hierarchyPrefix)) return false;
          const remaining = a.fullPath.slice(hierarchyPrefix.length);
          const nextSeg = remaining.split(":")[0];
          return nextSeg.toLowerCase() === segment.toLowerCase();
        });
        if (match) {
          const remaining = match.fullPath.slice(hierarchyPrefix.length);
          const nextSegment = remaining.split(":")[0];
          const newPrefix = hierarchyPrefix + nextSegment + ":";
          const hasChildren = accounts.some((a) => a.fullPath.startsWith(newPrefix) && a.fullPath !== hierarchyPrefix + nextSegment);
          if (hasChildren) {
            setHierarchyPrefix(newPrefix);
            onChange(newPrefix);
            return;
          }
        }
      }
    }
    onChange(newValue);
  }

  // Scroll highlighted into view
  useEffect(() => {
    if (!showDropdown || highlightIndex < 0) return;
    const el = dropdownRef.current?.children[highlightIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [highlightIndex, showDropdown]);

  // Reset hierarchy when value is cleared externally
  useEffect(() => {
    if (!value) setHierarchyPrefix("");
  }, [value]);

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={(e) => {
          e.target.select();
          if (!isAlreadySelected && (value.trim() || hierarchyPrefix)) {
            if (suggestions.length > 0) setShowDropdown(true);
          }
        }}
        placeholder={placeholder}
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
            {hierarchyPrefix && (
              <div className="px-3 py-1 text-[10px] text-[#9A9FA5] border-b border-[#EFEFEF]">
                {hierarchyPrefix}
              </div>
            )}
            {suggestions.map((account, i) => {
              const remaining = account.fullPath.slice(hierarchyPrefix.length);
              const nextSegment = remaining.split(":")[0];
              const hasChildren = accounts.some((a) =>
                a.fullPath.startsWith(hierarchyPrefix + nextSegment + ":") &&
                a.fullPath !== account.fullPath
              );
              const dotColor = TYPE_DOT_COLORS[account.type] ?? "#6b7280";

              return (
                <button
                  key={account.guid + "-" + i}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${
                    i === highlightIndex ? "bg-[#3B6B8A]/10 text-[#1A1D1F]" : "text-[#6F767E] hover:bg-[#F4F5F7]"
                  }`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (hasChildren) {
                      descendInto(account);
                    } else {
                      selectAccount(account);
                    }
                  }}
                  onMouseEnter={() => setHighlightIndex(i)}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />
                  <span className="truncate">
                    {hierarchyPrefix ? (
                      <>
                        <span className="font-medium">{nextSegment}</span>
                        {hasChildren && <span className="text-[#9A9FA5]"> :</span>}
                      </>
                    ) : (
                      account.fullPath
                    )}
                  </span>
                  {hasChildren && (
                    <span className="ml-auto text-[10px] text-[#9A9FA5]">▸</span>
                  )}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
