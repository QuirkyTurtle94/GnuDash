"use client";

import { useState } from "react";

// ── Depth control ─────────────────────────────────────────────────────

interface DepthSliderProps {
  depth: number;
  onChange: (d: number) => void;
}

export function DepthSlider({ depth, onChange }: DepthSliderProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs text-[#6F767E] whitespace-nowrap">Depth</span>
      <button
        onClick={() => onChange(Math.max(1, depth - 1))}
        disabled={depth <= 1}
        className="flex h-6 w-6 items-center justify-center rounded border border-[#EFEFEF] text-sm text-[#6F767E] transition-colors hover:bg-[#F4F5F7] disabled:opacity-30 disabled:cursor-default"
      >
        −
      </button>
      <span className="w-4 text-center text-xs font-medium text-[#1A1D1F]">{depth}</span>
      <button
        onClick={() => onChange(Math.min(6, depth + 1))}
        disabled={depth >= 6}
        className="flex h-6 w-6 items-center justify-center rounded border border-[#EFEFEF] text-sm text-[#6F767E] transition-colors hover:bg-[#F4F5F7] disabled:opacity-30 disabled:cursor-default"
      >
        +
      </button>
    </div>
  );
}

// ── Category checkboxes ───────────────────────────────────────────────

interface CategoryFilterProps {
  label: string;
  categories: string[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
  colors: Record<string, string>;
}

export function CategoryFilter({ label, categories, selected, onChange, colors }: CategoryFilterProps) {
  const [expanded, setExpanded] = useState(false);
  const allSelected = categories.every((c) => selected.has(c));

  function toggleAll() {
    if (allSelected) {
      onChange(new Set());
    } else {
      onChange(new Set(categories));
    }
  }

  function toggle(cat: string) {
    const next = new Set(selected);
    if (next.has(cat)) {
      next.delete(cat);
    } else {
      next.add(cat);
    }
    onChange(next);
  }

  return (
    <div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-1.5 text-xs text-[#6F767E] hover:text-[#1A1D1F] transition-colors"
      >
        <svg
          className={`h-3 w-3 transition-transform ${expanded ? "rotate-90" : ""}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {label}
        <span className="text-[#9A9FA5]">({selected.size}/{categories.length})</span>
      </button>

      {expanded && (
        <div className="mt-1.5 ml-4 flex flex-col gap-1">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={toggleAll}
              className="h-3 w-3 rounded border-[#EFEFEF] accent-[#6C9B8B]"
            />
            <span className="text-xs text-[#6F767E]">Select all</span>
          </label>
          {categories.map((cat) => (
            <label key={cat} className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={selected.has(cat)}
                onChange={() => toggle(cat)}
                className="h-3 w-3 rounded border-[#EFEFEF] accent-[#6C9B8B]"
              />
              <div
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: colors[cat] ?? "#9A9FA5" }}
              />
              <span className="text-xs text-[#6F767E]">{cat}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

