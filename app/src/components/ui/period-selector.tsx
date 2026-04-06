"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  type CustomRange,
  monthToIndex,
  indexToMonth,
  formatMonth,
  isValidMonth,
} from "@/lib/period-utils";

interface PeriodSelectorProps<T extends string> {
  period: T;
  labels: Record<T, string>;
  onChange: (period: T) => void;
  customRange: CustomRange | null;
  onCustomRangeChange: (range: CustomRange) => void;
  dataRange: { min: string; max: string };
  /** Callback when period changes (e.g., to clear related state). */
  onPeriodSideEffect?: () => void;
}

export function PeriodSelector<T extends string>({
  period,
  labels,
  onChange,
  customRange,
  onCustomRangeChange,
  dataRange,
  onPeriodSideEffect,
}: PeriodSelectorProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handlePresetClick = useCallback(
    (p: T) => {
      onChange(p);
      onPeriodSideEffect?.();
      setOpen(false);
    },
    [onChange, onPeriodSideEffect],
  );

  const handleCustomClick = useCallback(() => {
    if (!customRange) {
      onCustomRangeChange({ start: dataRange.min, end: dataRange.max });
    }
    onChange("custom" as T);
    onPeriodSideEffect?.();
    setOpen(false);
  }, [customRange, dataRange, onChange, onCustomRangeChange, onPeriodSideEffect]);

  const isCustom = period === "custom";

  // Display label
  const displayLabel = isCustom && customRange
    ? `${formatMonth(customRange.start)} – ${formatMonth(customRange.end)}`
    : labels[period] ?? period;

  const presetKeys = Object.keys(labels).filter((k) => k !== "custom") as T[];

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-[#EFEFEF] px-3 py-1.5 transition-colors hover:bg-[#F4F5F7]"
      >
        <span className="text-xs font-medium text-[#6F767E] whitespace-nowrap">{displayLabel}</span>
        <svg className="h-3.5 w-3.5 text-[#9A9FA5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-lg border border-[#EFEFEF] bg-white py-1 shadow-lg">
          {presetKeys.map((p) => (
            <button
              key={p}
              onClick={() => handlePresetClick(p)}
              className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-[#F4F5F7] ${
                period === p ? "font-medium text-[#6C9B8B]" : "text-[#6F767E]"
              }`}
            >
              {labels[p]}
            </button>
          ))}
          <div className="mx-2 my-1 border-t border-[#EFEFEF]" />
          <button
            onClick={handleCustomClick}
            className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-[#F4F5F7] ${
              isCustom ? "font-medium text-[#6C9B8B]" : "text-[#6F767E]"
            }`}
          >
            Custom
          </button>
        </div>
      )}

      {isCustom && customRange && (
        <CustomRangeSlider
          range={customRange}
          onChange={onCustomRangeChange}
          dataRange={dataRange}
        />
      )}
    </div>
  );
}

// ── Dual-handle range slider ──────────────────────────────────────────

interface CustomRangeSliderProps {
  range: CustomRange;
  onChange: (range: CustomRange) => void;
  dataRange: { min: string; max: string };
}

function CustomRangeSlider({ range, onChange, dataRange }: CustomRangeSliderProps) {
  const totalMonths = monthToIndex(dataRange.min, dataRange.max);
  const startIdx = monthToIndex(dataRange.min, range.start);
  const endIdx = monthToIndex(dataRange.min, range.end);

  function handleStartSlider(e: React.ChangeEvent<HTMLInputElement>) {
    const idx = Math.min(Number(e.target.value), endIdx);
    const month = indexToMonth(dataRange.min, idx);
    onChange({ ...range, start: month });
  }

  function handleEndSlider(e: React.ChangeEvent<HTMLInputElement>) {
    const idx = Math.max(Number(e.target.value), startIdx);
    const month = indexToMonth(dataRange.min, idx);
    onChange({ ...range, end: month });
  }

  function handleStartMonth(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (isValidMonth(v) && v >= dataRange.min && v <= range.end) {
      onChange({ ...range, start: v });
    }
  }

  function handleEndMonth(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    if (isValidMonth(v) && v <= dataRange.max && v >= range.start) {
      onChange({ ...range, end: v });
    }
  }

  // Percentage positions for the filled track
  const leftPct = totalMonths > 0 ? (startIdx / totalMonths) * 100 : 0;
  const rightPct = totalMonths > 0 ? ((totalMonths - endIdx) / totalMonths) * 100 : 0;

  return (
    <div className="mt-2 flex flex-col gap-2">
      {/* Slider */}
      <div className="relative h-6 flex items-center min-w-[200px]">
        {/* Track background */}
        <div className="absolute inset-x-0 h-1.5 rounded-full bg-[#EFEFEF]" />
        {/* Filled track */}
        <div
          className="absolute h-1.5 rounded-full bg-[#6C9B8B]"
          style={{ left: `${leftPct}%`, right: `${rightPct}%` }}
        />
        {/* Start handle */}
        <input
          type="range"
          min={0}
          max={totalMonths}
          value={startIdx}
          onChange={handleStartSlider}
          className="absolute inset-x-0 h-1.5 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#6C9B8B] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#6C9B8B] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:cursor-pointer"
          style={{ zIndex: startIdx > totalMonths - 5 ? 5 : 3 }}
        />
        {/* End handle */}
        <input
          type="range"
          min={0}
          max={totalMonths}
          value={endIdx}
          onChange={handleEndSlider}
          className="absolute inset-x-0 h-1.5 w-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#6C9B8B] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#6C9B8B] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:shadow [&::-moz-range-thumb]:cursor-pointer"
          style={{ zIndex: 4 }}
        />
      </div>

      {/* Month pickers */}
      <div className="flex items-center gap-2">
        <input
          type="month"
          value={range.start}
          min={dataRange.min}
          max={range.end}
          onChange={handleStartMonth}
          className="h-7 flex-1 rounded-md border border-[#EFEFEF] px-1.5 text-xs text-[#6F767E] outline-none focus:border-[#6C9B8B] cursor-pointer"
        />
        <span className="text-xs text-[#9A9FA5]">to</span>
        <input
          type="month"
          value={range.end}
          min={range.start}
          max={dataRange.max}
          onChange={handleEndMonth}
          className="h-7 flex-1 rounded-md border border-[#EFEFEF] px-1.5 text-xs text-[#6F767E] outline-none focus:border-[#6C9B8B] cursor-pointer"
        />
      </div>
    </div>
  );
}
