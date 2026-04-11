"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import type { TimePeriod } from "@/lib/spending-utils";
import type { CustomRange } from "@/lib/period-utils";

interface SpendingFilterState {
  period: TimePeriod;
  setPeriod: (p: TimePeriod) => void;
  customRange: CustomRange | null;
  setCustomRange: (r: CustomRange) => void;
  /** Currently selected category path (e.g. "Food" or "Food:Groceries"), null = all */
  selectedCategory: string | null;
  setSelectedCategory: (path: string | null) => void;
  /** Selected month from bar chart (e.g. "2025-03"), null = all months in period */
  selectedMonth: string | null;
  setSelectedMonth: (month: string | null) => void;
  /** Leaf account selected in pie chart sidebar — filters table and bar chart */
  selectedAccount: string | null;
  setSelectedAccount: (path: string | null) => void;
  /** Categories excluded from charts */
  excluded: Set<string>;
  toggleExcluded: (fullPath: string) => void;
  clearExcluded: () => void;
}

const SpendingFilterContext = createContext<SpendingFilterState | null>(null);

interface SpendingFilterProviderProps {
  children: ReactNode;
  /** When provided, the period is controlled externally instead of internally. */
  externalPeriod?: TimePeriod;
  externalSetPeriod?: (p: TimePeriod) => void;
  externalCustomRange?: CustomRange | null;
  externalSetCustomRange?: (r: CustomRange) => void;
  /** When provided, selection state is controlled externally. */
  externalSelectedCategory?: string | null;
  externalSetSelectedCategory?: (path: string | null) => void;
  externalSelectedMonth?: string | null;
  externalSetSelectedMonth?: (month: string | null) => void;
  externalSelectedAccount?: string | null;
  externalSetSelectedAccount?: (path: string | null) => void;
  externalExcluded?: Set<string>;
  externalToggleExcluded?: (fullPath: string) => void;
  externalClearExcluded?: () => void;
}

export function SpendingFilterProvider({
  children,
  externalPeriod,
  externalSetPeriod,
  externalCustomRange,
  externalSetCustomRange,
  externalSelectedCategory,
  externalSetSelectedCategory,
  externalSelectedMonth,
  externalSetSelectedMonth,
  externalSelectedAccount,
  externalSetSelectedAccount,
  externalExcluded,
  externalToggleExcluded,
  externalClearExcluded,
}: SpendingFilterProviderProps) {
  const [internalPeriod, setInternalPeriod] = useState<TimePeriod>("last-12m");
  const [internalCustomRange, setInternalCustomRange] = useState<CustomRange | null>(null);

  const period = externalPeriod ?? internalPeriod;
  const setPeriod = externalSetPeriod ?? setInternalPeriod;
  const customRange = externalCustomRange ?? internalCustomRange;
  const setCustomRange = externalSetCustomRange ?? setInternalCustomRange;
  const [internalSelectedCategory, setInternalSelectedCategory] = useState<string | null>(null);
  const [internalSelectedMonth, setInternalSelectedMonth] = useState<string | null>(null);
  const [internalSelectedAccount, setInternalSelectedAccount] = useState<string | null>(null);

  const selectedCategory = externalSelectedCategory !== undefined ? externalSelectedCategory : internalSelectedCategory;
  const setSelectedCategory = externalSetSelectedCategory ?? setInternalSelectedCategory;
  const selectedMonth = externalSelectedMonth !== undefined ? externalSelectedMonth : internalSelectedMonth;
  const setSelectedMonth = externalSetSelectedMonth ?? setInternalSelectedMonth;
  const selectedAccount = externalSelectedAccount !== undefined ? externalSelectedAccount : internalSelectedAccount;
  const setSelectedAccount = externalSetSelectedAccount ?? setInternalSelectedAccount;
  const [internalExcluded, setInternalExcluded] = useState<Set<string>>(new Set());

  const internalToggleExcluded = useCallback((fullPath: string) => {
    setInternalExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(fullPath)) {
        next.delete(fullPath);
      } else {
        next.add(fullPath);
      }
      return next;
    });
  }, []);

  const internalClearExcluded = useCallback(() => setInternalExcluded(new Set()), []);

  const excluded = externalExcluded ?? internalExcluded;
  const toggleExcluded = externalToggleExcluded ?? internalToggleExcluded;
  const clearExcluded = externalClearExcluded ?? internalClearExcluded;

  return (
    <SpendingFilterContext.Provider
      value={{
        period,
        setPeriod,
        customRange,
        setCustomRange,
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
