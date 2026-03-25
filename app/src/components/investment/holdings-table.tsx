"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import type { GroupedHolding } from "@/app/(dashboard)/investment/page";

interface HoldingsTableProps {
  activeItems: GroupedHolding[];
  allItems: GroupedHolding[];
  currency: string;
  selectedTicker: string | null;
  grouped: boolean;
}

type SortKey = "ticker" | "marketValue" | "costBasis" | "gainLoss" | "gainLossPct";
type SortDir = "asc" | "desc";

export function HoldingsTable({ activeItems, allItems, currency, selectedTicker, grouped }: HoldingsTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("marketValue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [showZero, setShowZero] = useState(false);
  const hasZero = allItems.length > activeItems.length;
  const items = showZero ? allItems : activeItems;

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  };

  const sorted = useMemo(() => {
    const filtered = selectedTicker
      ? items.filter((h) => h.ticker === selectedTicker)
      : items;

    return [...filtered].sort((a, b) => {
      if (sortKey === "ticker") {
        return sortDir === "asc"
          ? a.ticker.localeCompare(b.ticker)
          : b.ticker.localeCompare(a.ticker);
      }
      const av = a[sortKey];
      const bv = b[sortKey];
      return sortDir === "asc" ? av - bv : bv - av;
    });
  }, [items, selectedTicker, sortKey, sortDir]);

  const arrow = (key: SortKey) =>
    sortKey === key ? (sortDir === "asc" ? " \u2191" : " \u2193") : "";

  return (
    <Card className="shadow-sm border-[#EFEFEF]">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 pb-2">
        <CardTitle className="text-lg font-semibold text-[#1A1D1F]">
          Holdings
          <span className="ml-2 text-sm font-normal text-[#9A9FA5]">
            {sorted.length} {sorted.length === 1 ? "position" : "positions"}
          </span>
        </CardTitle>
        {hasZero && (
          <button
            onClick={() => setShowZero((v) => !v)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              showZero
                ? "border-[#6C9B8B] bg-[#6C9B8B]/10 text-[#6C9B8B]"
                : "border-[#EFEFEF] text-[#6F767E] hover:bg-[#F4F5F7]"
            }`}
          >
            {showZero ? "Hide" : "Show"} fully sold / 0 value
          </button>
        )}
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#9A9FA5]">No investment holdings</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#EFEFEF]">
                  <Th onClick={() => handleSort("ticker")}>Holding{arrow("ticker")}</Th>
                  <Th onClick={() => handleSort("marketValue")} align="right">Value{arrow("marketValue")}</Th>
                  <Th onClick={() => handleSort("costBasis")} align="right" className="hidden sm:table-cell">Cost Basis{arrow("costBasis")}</Th>
                  <Th onClick={() => handleSort("gainLoss")} align="right">Gain/Loss{arrow("gainLoss")}</Th>
                  <Th onClick={() => handleSort("gainLossPct")} align="right" className="hidden md:table-cell">Return{arrow("gainLossPct")}</Th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((h) => (
                  <tr key={h.key} className="border-b border-[#EFEFEF] last:border-0">
                    <td className="py-2.5 pr-4">
                      <div className="text-xs font-medium text-[#1A1D1F]">{h.ticker}</div>
                      <div className="text-[11px] text-[#9A9FA5]">{h.accountName}</div>
                    </td>
                    <td className="whitespace-nowrap py-2.5 text-right text-xs font-medium text-[#1A1D1F]" data-v>
                      {formatCurrency(h.marketValue, currency)}
                    </td>
                    <td className="hidden whitespace-nowrap py-2.5 text-right text-xs text-[#6F767E] sm:table-cell" data-v>
                      {formatCurrency(h.costBasis, currency)}
                    </td>
                    <td className="whitespace-nowrap py-2.5 text-right text-xs font-medium">
                      <span className={h.gainLoss >= 0 ? "text-[#6C9B8B]" : "text-[#F87171]"} data-v>
                        {h.gainLoss >= 0 ? "+" : ""}{formatCurrency(h.gainLoss, currency)}
                      </span>
                    </td>
                    <td className="hidden whitespace-nowrap py-2.5 text-right text-xs font-medium md:table-cell">
                      <span className={h.gainLossPct >= 0 ? "text-[#6C9B8B]" : "text-[#F87171]"} data-v>
                        {h.gainLossPct >= 0 ? "+" : ""}{h.gainLossPct.toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Th({
  children,
  onClick,
  align = "left",
  className = "",
}: {
  children: React.ReactNode;
  onClick: () => void;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      onClick={onClick}
      className={`cursor-pointer select-none whitespace-nowrap pb-2 pr-4 text-xs font-medium text-[#9A9FA5] transition-colors hover:text-[#6F767E] ${
        align === "right" ? "text-right" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}
