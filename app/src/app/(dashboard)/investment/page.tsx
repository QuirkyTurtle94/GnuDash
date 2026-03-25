"use client";

import { useState, useMemo } from "react";
import { useDashboard } from "@/lib/dashboard-context";
import { PortfolioSummary } from "@/components/investment/portfolio-summary";
import { AllocationPie } from "@/components/investment/allocation-pie";
import { HoldingsTable } from "@/components/investment/holdings-table";
import { ValueOverTimeChart } from "@/components/investment/value-over-time-chart";
import type { InvestmentHolding } from "@/lib/types/gnucash";

export interface GroupedHolding {
  key: string;
  ticker: string;
  accountName: string;
  accounts: string[];
  sharesHeld: number;
  costBasis: number;
  marketValue: number;
  gainLoss: number;
  gainLossPct: number;
}

function toUngrouped(holdings: InvestmentHolding[]): GroupedHolding[] {
  return holdings.map((h) => ({
    key: `${h.ticker}:${h.accountName}`,
    ticker: h.ticker || h.accountName,
    accountName: h.accountName,
    accounts: [h.accountName],
    sharesHeld: h.sharesHeld,
    costBasis: h.costBasis,
    marketValue: h.marketValue,
    gainLoss: h.gainLoss,
    gainLossPct: h.gainLossPct,
  }));
}

function toGrouped(holdings: InvestmentHolding[]): GroupedHolding[] {
  const map = new Map<string, { accounts: string[]; shares: number; cost: number; market: number }>();

  for (const h of holdings) {
    const key = h.ticker || h.accountName;
    const existing = map.get(key);
    if (existing) {
      existing.accounts.push(h.accountName);
      existing.shares += h.sharesHeld;
      existing.cost += h.costBasis;
      existing.market += h.marketValue;
    } else {
      map.set(key, {
        accounts: [h.accountName],
        shares: h.sharesHeld,
        cost: h.costBasis,
        market: h.marketValue,
      });
    }
  }

  return [...map.entries()].map(([ticker, g]) => {
    const gainLoss = g.market - g.cost;
    const gainLossPct = g.cost !== 0 ? (gainLoss / Math.abs(g.cost)) * 100 : 0;
    return {
      key: ticker,
      ticker,
      accountName: g.accounts.length === 1 ? g.accounts[0] : `${g.accounts.length} accounts`,
      accounts: g.accounts,
      sharesHeld: g.shares,
      costBasis: g.cost,
      marketValue: g.market,
      gainLoss,
      gainLossPct,
    };
  });
}

function filterActive(items: GroupedHolding[]): GroupedHolding[] {
  return items.filter((g) => Math.abs(g.marketValue) >= 0.01 || Math.abs(g.sharesHeld) >= 0.0001);
}

export default function InvestmentPage() {
  const { data } = useDashboard();
  const [selectedTicker, setSelectedTicker] = useState<string | null>(null);
  const [grouped, setGrouped] = useState(true);

  if (!data) return null;

  const c = data.currency;
  const allHoldings = data.investments ?? [];
  const activeHoldings = useMemo(
    () => allHoldings.filter((h) => Math.abs(h.marketValue) >= 0.01 || Math.abs(h.sharesHeld) >= 0.0001),
    [allHoldings]
  );

  const allItems = useMemo(() => (grouped ? toGrouped(allHoldings) : toUngrouped(allHoldings)), [allHoldings, grouped]);
  const activeItems = useMemo(() => (grouped ? filterActive(toGrouped(allHoldings)) : filterActive(toUngrouped(allHoldings))), [allHoldings, grouped]);

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[#1A1D1F] sm:text-xl">Investments</h2>
        {selectedTicker && (
          <button
            onClick={() => setSelectedTicker(null)}
            className="flex items-center gap-1 rounded-full bg-[#6C9B8B]/10 px-2.5 py-1 text-xs font-medium text-[#6C9B8B] transition-colors hover:bg-[#6C9B8B]/20"
          >
            {selectedTicker}
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {activeHoldings.length === 0 ? (
        <p className="py-12 text-center text-sm text-[#9A9FA5]">
          No investment accounts found in this GNUCash file
        </p>
      ) : (
        <>
          <PortfolioSummary holdings={activeHoldings} currency={c} />

          <ValueOverTimeChart
            series={data.investmentValueSeries}
            currency={c}
            selectedTicker={selectedTicker}
          />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
            <AllocationPie
              items={activeItems}
              currency={c}
              selectedTicker={selectedTicker}
              onSelect={setSelectedTicker}
              grouped={grouped}
              onToggleGrouped={() => { setGrouped((v) => !v); setSelectedTicker(null); }}
            />
            <HoldingsTable
              activeItems={activeItems}
              allItems={allItems}
              currency={c}
              selectedTicker={selectedTicker}
              grouped={grouped}
            />
          </div>
        </>
      )}
    </div>
  );
}
