"use client";

import { useState, useCallback, useEffect } from "react";

/**
 * Detects whether the user's locale uses month-first (US) or day-first format.
 * Returns "mdy" for month/day/year or "dmy" for day/month/year.
 */
function detectLocaleOrder(): "mdy" | "dmy" {
  // Format a known date and check which number comes first
  // Jan 13 → if "1" appears before "13", it's month-first
  const formatted = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "numeric",
  }).format(new Date(2000, 0, 13)); // Jan 13, 2000

  const idx1 = formatted.indexOf("1");
  const idx13 = formatted.indexOf("13");

  // If "1" appears at a different position than the start of "13", month came first
  if (idx1 >= 0 && idx13 >= 0 && idx1 < idx13 && idx1 !== idx13) {
    return "mdy";
  }
  return "dmy";
}

/** Get the separator used in the user's locale */
function detectLocaleSeparator(): string {
  const formatted = new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(new Date(2000, 0, 15));
  // Find the first non-digit character
  const match = formatted.match(/\d([^\d])\d/);
  return match ? match[1] : "/";
}

/** Format a YYYY-MM-DD string for display in the user's locale */
function formatForDisplay(isoDate: string): string {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d.getTime())) return isoDate;
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(d);
}

/** Format a YYYY-MM-DD as short display (no year if same year) */
function formatShort(isoDate: string): string {
  if (!isoDate) return "";
  const d = new Date(isoDate + "T00:00:00");
  if (isNaN(d.getTime())) return isoDate;
  const now = new Date();
  const sameYear = d.getFullYear() === now.getFullYear();
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(d);
}

/**
 * Parse partial user input into an ISO date string.
 * Supports: "9" → 9th this month, "9/3" → 9th March (dmy) or Sept 3 (mdy),
 * "9/3/25" or "9/3/2025" → full date.
 */
function parsePartialDate(input: string, localeOrder: "mdy" | "dmy"): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Split on common separators
  const parts = trimmed.split(/[/\-.]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  const nums = parts.map((p) => parseInt(p, 10));
  if (nums.some(isNaN)) return null;

  let day: number, month: number, year: number;

  if (parts.length === 1) {
    // Just a day number
    day = nums[0];
    month = currentMonth + 1; // 1-based
    year = currentYear;
  } else if (parts.length === 2) {
    if (localeOrder === "mdy") {
      month = nums[0];
      day = nums[1];
    } else {
      day = nums[0];
      month = nums[1];
    }
    year = currentYear;
  } else {
    // 3 parts
    if (localeOrder === "mdy") {
      month = nums[0];
      day = nums[1];
      year = nums[2];
    } else {
      day = nums[0];
      month = nums[1];
      year = nums[2];
    }
    // Handle 2-digit years
    if (year < 100) {
      year += year < 50 ? 2000 : 1900;
    }
  }

  // Validate
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2100) return null;

  // Check the day is valid for the month
  const testDate = new Date(year, month - 1, day);
  if (testDate.getFullYear() !== year || testDate.getMonth() !== month - 1 || testDate.getDate() !== day) {
    return null;
  }

  // Return ISO format
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// Module-level state to remember the last used date across component instances
let lastUsedDate: string | null = null;

interface Props {
  value: string; // ISO YYYY-MM-DD
  onChange: (isoDate: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
  className?: string;
}

export function SmartDateInput({ value, onChange, onKeyDown, inputRef, className }: Props) {
  // The raw text the user is typing (shown while focused)
  const [rawText, setRawText] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [localeOrder] = useState<"mdy" | "dmy">(() => detectLocaleOrder());
  const [separator] = useState(() => detectLocaleSeparator());

  // Placeholder hint showing the expected format
  const placeholder = localeOrder === "mdy"
    ? `mm${separator}dd${separator}yy`
    : `dd${separator}mm${separator}yy`;

  const handleFocus = useCallback((e: React.FocusEvent<HTMLInputElement>) => {
    setIsFocused(true);
    // Select all text so typing overwrites
    requestAnimationFrame(() => e.target.select());
    // Show the current date in locale format for editing
    if (value) {
      setRawText(formatForDisplay(value));
    } else {
      setRawText("");
    }
  }, [value]);

  const commitDate = useCallback(() => {
    const trimmed = rawText.trim();
    if (!trimmed) {
      // Empty → keep current value
      setIsFocused(false);
      return;
    }
    const parsed = parsePartialDate(trimmed, localeOrder);
    if (parsed) {
      onChange(parsed);
      lastUsedDate = parsed;
    }
    // If parse failed, revert to previous value
    setIsFocused(false);
  }, [rawText, onChange, localeOrder]);

  const handleBlur = useCallback(() => {
    commitDate();
  }, [commitDate]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Tab" || e.key === "Enter") {
      commitDate();
    }
    // Forward to parent for navigation
    onKeyDown(e);
  }, [commitDate, onKeyDown]);

  // Set initial value from lastUsedDate if available
  useEffect(() => {
    if (!value && lastUsedDate) {
      onChange(lastUsedDate);
    }
  }, []); // Only on mount

  return (
    <input
      ref={inputRef}
      type="text"
      value={isFocused ? rawText : (value ? formatShort(value) : "")}
      onChange={(e) => setRawText(e.target.value)}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      placeholder={placeholder}
      className={className}
      autoComplete="off"
    />
  );
}

/** Get the default date for a new entry (last used or today) */
export function getDefaultDate(): string {
  return lastUsedDate || new Date().toISOString().slice(0, 10);
}
