"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { TimePeriod } from "@/lib/spending-utils";

interface SpendingFilterState {
  period: TimePeriod;
  setPeriod: (p: TimePeriod) => void;
  /** Currently selected category path (e.g. "Food" or "Food:Groceries"), null = all */
  selectedCategory: string | null;
  setSelectedCategory: (path: string | null) => void;
  /** Selected month from bar chart (e.g. "2025-03"), null = all months in period */
  selectedMonth: string | null;
  setSelectedMonth: (month: string | null) => void;
  /** Leaf account selected in pie chart sidebar — filters table only, not the pie */
  selectedAccount: string | null;
  setSelectedAccount: (path: string | null) => void;
  /** Categories excluded from charts */
  excluded: Set<string>;
  toggleExcluded: (fullPath: string) => void;
  clearExcluded: () => void;
}

const SpendingFilterContext = createContext<SpendingFilterState | null>(null);

export function SpendingFilterProvider({ children }: { children: ReactNode }) {
  const [period, setPeriod] = useState<TimePeriod>("last-12m");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const toggleExcluded = useCallback((fullPath: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(fullPath)) {
        next.delete(fullPath);
      } else {
        next.add(fullPath);
      }
      return next;
    });
  }, []);

  const clearExcluded = useCallback(() => setExcluded(new Set()), []);

  return (
    <SpendingFilterContext.Provider
      value={{
        period,
        setPeriod,
        selectedCategory,
        setSelectedCategory,
        selectedMonth,
        setSelectedMonth,
        selectedAccount,
        setSelectedAccount,
        excluded,
        toggleExcluded,
        clearExcluded,
      }}
    >
      {children}
    </SpendingFilterContext.Provider>
  );
}

export function useSpendingFilter() {
  const ctx = useContext(SpendingFilterContext);
  if (!ctx) throw new Error("useSpendingFilter must be used within SpendingFilterProvider");
  return ctx;
}
