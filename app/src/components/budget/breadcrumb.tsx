"use client";

import type { BudgetCategoryRow } from "@/lib/types/gnucash";

export function Breadcrumb({
  path,
  allCategories,
  onNavigate,
  accentColor = "#6C9B8B",
}: {
  path: string[];
  allCategories: BudgetCategoryRow[];
  onNavigate: (depth: number) => void;
  accentColor?: string;
}) {
  if (path.length === 0) return null;

  const categoryMap = new Map(allCategories.map((c) => [c.accountGuid, c]));

  return (
    <nav className="flex items-center gap-1 text-sm">
      <button
        onClick={() => onNavigate(-1)}
        className="font-medium hover:underline"
        style={{ color: accentColor }}
      >
        All Categories
      </button>
      {path.map((guid, i) => {
        const cat = categoryMap.get(guid);
        const isLast = i === path.length - 1;
        return (
          <span key={guid} className="flex items-center gap-1">
            <svg className="h-3 w-3 text-[#9A9FA5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            {isLast ? (
              <span className="font-medium text-[#1A1D1F]">{cat?.accountName ?? guid}</span>
            ) : (
              <button
                onClick={() => onNavigate(i)}
                className="font-medium hover:underline"
                style={{ color: accentColor }}
              >
                {cat?.accountName ?? guid}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
