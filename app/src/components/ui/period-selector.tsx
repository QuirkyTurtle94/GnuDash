"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  type CustomRange,
  formatDate,
  isValidDate,
  monthToFirstDay,
  monthToLastDay,
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
      onCustomRangeChange({
        start: monthToFirstDay(dataRange.min),
        end: monthToLastDay(dataRange.max),
      });
    }
    onChange("custom" as T);
    onPeriodSideEffect?.();
    setOpen(false);
  }, [customRange, dataRange, onChange, onCustomRangeChange, onPeriodSideEffect]);

  const isCustom = period === "custom";

  // Display label
  const displayLabel = isCustom && customRange
    ? `${formatDate(customRange.start)} – ${formatDate(customRange.end)}`
    : labels[period] ?? period;

  const presetKeys = Object.keys(labels).filter((k) => k !== "custom") as T[];

  return (
    <div className="flex items-center gap-2">
      {isCustom && customRange && (
        <CustomDateRange
          range={customRange}
          onChange={onCustomRangeChange}
          dataRange={dataRange}
        />
      )}

      <div ref={containerRef} className="relative">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 rounded-lg border border-[#EFEFEF] px-3 py-1.5 transition-colors hover:bg-[#F4F5F7]"
        >
          <span className="text-xs font-medium text-[#6F767E] whitespace-nowrap">
            {isCustom ? "Custom" : displayLabel}
          </span>
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
      </div>
    </div>
  );
}

// ── Custom date range with calendar pickers ──────────────────────────

interface CustomDateRangeProps {
  range: CustomRange;
  onChange: (range: CustomRange) => void;
  dataRange: { min: string; max: string };
}

function CustomDateRange({ range, onChange, dataRange }: CustomDateRangeProps) {
  const [editingField, setEditingField] = useState<"start" | "end" | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const minDate = monthToFirstDay(dataRange.min);
  const maxDate = monthToLastDay(dataRange.max);

  const handleDateSelect = useCallback(
    (date: string) => {
      if (editingField === "start") {
        onChange({ ...range, start: date <= range.end ? date : range.end });
      } else if (editingField === "end") {
        onChange({ ...range, end: date >= range.start ? date : range.start });
      }
      setEditingField(null);
    },
    [editingField, range, onChange],
  );

  // Close calendar on click outside
  useEffect(() => {
    if (!editingField) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setEditingField(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [editingField]);

  return (
    <div ref={containerRef} className="relative flex items-center gap-2">
      <DateInput
        value={range.start}
        active={editingField === "start"}
        onClick={() => setEditingField(editingField === "start" ? null : "start")}
        onDateChange={(date) => {
          onChange({ ...range, start: date <= range.end ? date : range.end });
          setEditingField(null);
        }}
        minDate={minDate}
        maxDate={range.end}
      />
      <span className="text-xs text-[#9A9FA5]">to</span>
      <DateInput
        value={range.end}
        active={editingField === "end"}
        onClick={() => setEditingField(editingField === "end" ? null : "end")}
        onDateChange={(date) => {
          onChange({ ...range, end: date >= range.start ? date : range.start });
          setEditingField(null);
        }}
        minDate={range.start}
        maxDate={maxDate}
      />

      {editingField && (
        <div className="absolute right-0 top-full z-20 mt-1">
          <CalendarPicker
            selected={editingField === "start" ? range.start : range.end}
            minDate={editingField === "start" ? minDate : range.start}
            maxDate={editingField === "end" ? maxDate : range.end}
            onSelect={handleDateSelect}
          />
        </div>
      )}
    </div>
  );
}

function DateInput({
  value,
  active,
  onClick,
  onDateChange,
  minDate,
  maxDate,
}: {
  value: string; // YYYY-MM-DD
  active: boolean;
  onClick: () => void;
  onDateChange: (date: string) => void;
  minDate: string;
  maxDate: string;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function startEditing() {
    setText(value);
    setEditing(true);
    // Focus after render
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    if (isValidDate(text) && text >= minDate && text <= maxDate) {
      onDateChange(text);
    }
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        placeholder="YYYY-MM-DD"
        className="w-[7.5rem] rounded-md border border-[#6C9B8B] bg-[#F0F7F5] px-2 py-1.5 text-xs text-[#4A7A6B] font-medium outline-none"
      />
    );
  }

  return (
    <button
      onClick={onClick}
      onDoubleClick={startEditing}
      className={`w-[7.5rem] whitespace-nowrap rounded-md border px-2 py-1.5 text-xs transition-colors cursor-pointer ${
        active
          ? "border-[#6C9B8B] bg-[#F0F7F5] text-[#4A7A6B] font-medium"
          : "border-[#EFEFEF] text-[#6F767E] hover:border-[#D0D5DD]"
      }`}
    >
      {formatDate(value)}
    </button>
  );
}

// ── Calendar picker ─────────────────────────────────────────────────

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

interface CalendarPickerProps {
  selected: string; // YYYY-MM-DD
  minDate: string;
  maxDate: string;
  onSelect: (date: string) => void;
}

function CalendarPicker({ selected, minDate, maxDate, onSelect }: CalendarPickerProps) {
  const [sy, sm] = selected.split("-").map(Number);
  const [viewYear, setViewYear] = useState(sy);
  const [viewMonth, setViewMonth] = useState(sm); // 1-indexed

  const firstDayOfWeek = new Date(viewYear, viewMonth - 1, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();

  const canPrev = `${viewYear}-${String(viewMonth).padStart(2, "0")}` > minDate.slice(0, 7);
  const canNext = `${viewYear}-${String(viewMonth).padStart(2, "0")}` < maxDate.slice(0, 7);

  function prev() {
    if (!canPrev) return;
    if (viewMonth === 1) { setViewYear(viewYear - 1); setViewMonth(12); }
    else setViewMonth(viewMonth - 1);
  }

  function next() {
    if (!canNext) return;
    if (viewMonth === 12) { setViewYear(viewYear + 1); setViewMonth(1); }
    else setViewMonth(viewMonth + 1);
  }

  function toDateStr(day: number): string {
    return `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDayOfWeek; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) days.push(d);

  return (
    <div className="rounded-lg border border-[#EFEFEF] bg-white p-3 shadow-lg">
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={prev}
          disabled={!canPrev}
          className="flex h-6 w-6 items-center justify-center rounded text-[#6F767E] transition-colors hover:bg-[#F4F5F7] disabled:opacity-30 disabled:cursor-default"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-xs font-medium text-[#1A1D1F]">
          {MONTH_NAMES[viewMonth - 1]} {viewYear}
        </span>
        <button
          onClick={next}
          disabled={!canNext}
          className="flex h-6 w-6 items-center justify-center rounded text-[#6F767E] transition-colors hover:bg-[#F4F5F7] disabled:opacity-30 disabled:cursor-default"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DAY_HEADERS.map((d) => (
          <div key={d} className="text-center text-[10px] font-medium text-[#9A9FA5] py-0.5">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} />;

          const dateStr = toDateStr(day);
          const isSelected = dateStr === selected;
          const isDisabled = dateStr < minDate || dateStr > maxDate;

          return (
            <button
              key={day}
              onClick={() => !isDisabled && onSelect(dateStr)}
              disabled={isDisabled}
              className={`flex h-7 w-7 items-center justify-center rounded-full text-[11px] transition-colors mx-auto ${
                isSelected
                  ? "bg-[#6C9B8B] text-white font-medium"
                  : isDisabled
                    ? "text-[#D0D5DD] cursor-default"
                    : "text-[#1A1D1F] hover:bg-[#F0F7F5] cursor-pointer"
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
