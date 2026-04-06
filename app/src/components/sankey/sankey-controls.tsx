"use client";

import { useState } from "react";
import {
  type SankeyPeriod,
  type LinkColorMode,
  SANKEY_PERIOD_LABELS,
} from "@/lib/sankey-utils";

// ── Period selector ───────────────────────────────────────────────────

interface PeriodSelectorProps {
  period: SankeyPeriod;
  onChange: (p: SankeyPeriod) => void;
}

export function PeriodSelector({ period, onChange }: PeriodSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-[#EFEFEF] px-3 py-1.5 transition-colors hover:bg-[#F4F5F7]"
      >
        <span className="text-xs font-medium text-[#6F767E]">
          {SANKEY_PERIOD_LABELS[period]}
        </span>
        <svg className="h-3.5 w-3.5 text-[#9A9FA5]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-40 rounded-lg border border-[#EFEFEF] bg-white py-1 shadow-lg">
          {(Object.keys(SANKEY_PERIOD_LABELS) as SankeyPeriod[]).map((p) => (
            <button
              key={p}
              onClick={() => { onChange(p); setOpen(false); }}
              className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-[#F4F5F7] ${
                period === p ? "font-medium text-[#6C9B8B]" : "text-[#6F767E]"
              }`}
            >
              {SANKEY_PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Depth slider ──────────────────────────────────────────────────────

interface DepthSliderProps {
  depth: number;
  onChange: (d: number) => void;
}

export function DepthSlider({ depth, onChange }: DepthSliderProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#6F767E] whitespace-nowrap">Depth</span>
      <input
        type="range"
        min={1}
        max={6}
        value={depth}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-[#EFEFEF] accent-[#6C9B8B]"
      />
      <span className="w-4 text-center text-xs font-medium text-[#1A1D1F]">{depth}</span>
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

// ── Link colour control ───────────────────────────────────────────────

interface LinkColorControlProps {
  mode: LinkColorMode;
  greyColor: string;
  onModeChange: (m: LinkColorMode) => void;
  onGreyColorChange: (c: string) => void;
}

export function LinkColorControl({ mode, greyColor, onModeChange, onGreyColorChange }: LinkColorControlProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[#6F767E] whitespace-nowrap">Flows</span>
      <div className="flex rounded-lg border border-[#EFEFEF] overflow-hidden">
        <button
          onClick={() => onModeChange("source")}
          className={`px-2.5 py-1 text-xs transition-colors ${
            mode === "source"
              ? "bg-[#6C9B8B] text-white"
              : "text-[#6F767E] hover:bg-[#F4F5F7]"
          }`}
        >
          Colour
        </button>
        <button
          onClick={() => onModeChange("grey")}
          className={`px-2.5 py-1 text-xs transition-colors ${
            mode === "grey"
              ? "bg-[#6C9B8B] text-white"
              : "text-[#6F767E] hover:bg-[#F4F5F7]"
          }`}
        >
          Grey
        </button>
      </div>
      {mode === "grey" && (
        <input
          type="color"
          value={greyColor}
          onChange={(e) => onGreyColorChange(e.target.value)}
          className="h-6 w-6 cursor-pointer rounded border border-[#EFEFEF] p-0.5"
          title="Pick flow grey shade"
        />
      )}
    </div>
  );
}
