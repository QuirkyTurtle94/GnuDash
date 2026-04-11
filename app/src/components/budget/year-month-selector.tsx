"use client";

import { MONTH_LABELS } from "./budget-utils";

export function YearMonthSelector({
  selectedMonth,
  selectedYear,
  onSelectMonth,
  onSelectYear,
  numPeriods,
  availableYears,
  showMonths,
}: {
  selectedMonth: number;
  selectedYear: number;
  onSelectMonth: (m: number) => void;
  onSelectYear: (y: number) => void;
  numPeriods: number;
  availableYears: number[];
  showMonths: boolean;
}) {
  const months = MONTH_LABELS.slice(0, numPeriods);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap gap-1">
        {availableYears.map((year) => (
          <button
            key={year}
            onClick={() => onSelectYear(year)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              selectedYear === year
                ? "bg-[#1A1D1F] text-white"
                : "bg-white text-[#6F767E] hover:bg-[#F4F5F7]"
            }`}
          >
            {year}
          </button>
        ))}
      </div>
      {showMonths && (
        <>
          <div className="h-4 w-px bg-[#EFEFEF]" />
          <div className="flex flex-wrap gap-1">
            {months.map((label, i) => (
              <button
                key={i}
                onClick={() => onSelectMonth(i)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  selectedMonth === i
                    ? "bg-[#6C9B8B] text-white"
                    : "bg-white text-[#6F767E] hover:bg-[#F4F5F7]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
