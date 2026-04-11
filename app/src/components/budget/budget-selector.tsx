"use client";

import { useState } from "react";

export function BudgetSelector({
  budgets,
  selected,
  onSelect,
}: {
  budgets: { guid: string; name: string }[];
  selected: string;
  onSelect: (guid: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = budgets.find((b) => b.guid === selected);

  if (budgets.length <= 1) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-[#EFEFEF] bg-white px-4 py-2 transition-colors hover:bg-[#F4F5F7]"
      >
        <span className="text-sm font-medium text-[#6F767E]">{current?.name ?? "Budget"}</span>
        <svg className="h-4 w-4 text-[#9A9FA5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-56 rounded-lg border border-[#EFEFEF] bg-white py-1 shadow-lg">
          {budgets.map((b) => (
            <button
              key={b.guid}
              onClick={() => { onSelect(b.guid); setOpen(false); }}
              className={`w-full px-4 py-2 text-left text-sm transition-colors hover:bg-[#F4F5F7] ${
                selected === b.guid ? "font-medium text-[#6C9B8B]" : "text-[#6F767E]"
              }`}
            >
              {b.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
