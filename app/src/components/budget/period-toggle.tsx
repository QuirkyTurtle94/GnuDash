"use client";

import type { ViewMode } from "./budget-utils";

export function PeriodToggle({
  mode,
  onToggle,
}: {
  mode: ViewMode;
  onToggle: (mode: ViewMode) => void;
}) {
  const options: { value: ViewMode; label: string }[] = [
    { value: "ytd", label: "Year to Date" },
    { value: "monthly", label: "Monthly" },
    { value: "year", label: "Full Year" },
  ];
  return (
    <div className="flex rounded-lg border border-[#EFEFEF] bg-white">
      {options.map((opt, i) => (
        <button
          key={opt.value}
          onClick={() => onToggle(opt.value)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            mode === opt.value
              ? "bg-[#6C9B8B]/10 text-[#6C9B8B]"
              : "text-[#6F767E] hover:bg-[#F4F5F7]"
          } ${i === 0 ? "rounded-l-lg" : ""} ${i === options.length - 1 ? "rounded-r-lg" : ""}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
