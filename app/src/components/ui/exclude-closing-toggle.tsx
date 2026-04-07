"use client";

interface ExcludeClosingToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function ExcludeClosingToggle({ checked, onChange }: ExcludeClosingToggleProps) {
  return (
    <label className="flex items-center gap-1.5 cursor-pointer select-none" title="Exclude book-closing transactions">
      <div
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(!checked); } }}
        tabIndex={0}
        className={`relative h-4 w-7 rounded-full transition-colors ${
          checked ? "bg-[#6C9B8B]" : "bg-[#D0D5DD]"
        }`}
      >
        <div
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </div>
      <span className="text-[11px] text-[#6F767E] whitespace-nowrap">Exclude closing</span>
    </label>
  );
}
