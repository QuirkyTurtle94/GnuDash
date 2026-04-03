import type { InvestmentHolding, MonthlyInvestmentValue } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { parseGnuCashDate, sqlMonth } from "../shared/dates";

export function computeInvestments(ctx: ParseContext): InvestmentHolding[] {
  const { db, commodityMap, prices, latestPrices } = ctx;

  // Price 12 months ago per commodity
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
  const price12mMap = new Map<string, number>();
  for (const p of prices) {
    const pDate = parseGnuCashDate(p.date);
    if (pDate <= twelveMonthsAgo && !price12mMap.has(p.commodity_guid)) {
      price12mMap.set(p.commodity_guid, p.value_num / p.value_denom);
    }
  }

  const holdings = db
    .prepare(
      `SELECT
        a.guid AS account_guid,
        a.name AS account_name,
        a.commodity_guid,
        SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS shares_held,
        SUM(CAST(s.value_num AS REAL) / s.value_denom) AS cost_basis
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      WHERE a.account_type IN ('STOCK', 'MUTUAL')
      GROUP BY a.guid`
    )
    .all() as {
    account_guid: string;
    account_name: string;
    commodity_guid: string;
    shares_held: number;
    cost_basis: number;
  }[];

  return holdings.map((h) => {
    const commodity = commodityMap.get(h.commodity_guid);
    const latestPrice = latestPrices.get(h.commodity_guid) ?? 0;
    const price12m = price12mMap.get(h.commodity_guid);
    const marketValue = h.shares_held * latestPrice;
    const gainLoss = marketValue - h.cost_basis;
    const gainLossPct = h.cost_basis !== 0 ? (gainLoss / Math.abs(h.cost_basis)) * 100 : 0;

    let change12mPct: number | null = null;
    if (price12m && price12m > 0) {
      change12mPct = ((latestPrice - price12m) / price12m) * 100;
    }

    return {
      accountName: h.account_name,
      ticker: commodity?.mnemonic ?? "???",
      sharesHeld: h.shares_held,
      costBasis: h.cost_basis,
      marketValue,
      gainLoss,
      gainLossPct,
      change12m: change12mPct !== null ? latestPrice - (price12m ?? 0) : null,
      change12mPct,
    };
  });
}

export function computeInvestmentValueSeries(ctx: ParseContext): MonthlyInvestmentValue[] {
  const { db, commodityMap } = ctx;

  const splits = db
    .prepare(
      `SELECT
        a.guid AS account_guid,
        a.name AS account_name,
        a.commodity_guid,
        ${sqlMonth("t.post_date")} AS month,
        CAST(s.quantity_num AS REAL) / s.quantity_denom AS shares,
        CAST(s.value_num AS REAL) / s.value_denom AS cost
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type IN ('STOCK', 'MUTUAL')
      ORDER BY t.post_date`
    )
    .all() as { account_guid: string; account_name: string; commodity_guid: string; month: string; shares: number; cost: number }[];

  const accountMonthly = new Map<string, Map<string, { shares: number; cost: number; commodity_guid: string }>>();
  for (const s of splits) {
    if (!accountMonthly.has(s.account_guid)) accountMonthly.set(s.account_guid, new Map());
    const months = accountMonthly.get(s.account_guid)!;
    const existing = months.get(s.month);
    if (existing) {
      existing.shares += s.shares;
      existing.cost += s.cost;
    } else {
      months.set(s.month, { shares: s.shares, cost: s.cost, commodity_guid: s.commodity_guid });
    }
  }

  const allPrices = db
    .prepare(
      `SELECT commodity_guid, ${sqlMonth("date")} AS month, CAST(value_num AS REAL) / value_denom AS price
      FROM prices ORDER BY date`
    )
    .all() as { commodity_guid: string; month: string; price: number }[];

  const priceByMonth = new Map<string, Map<string, number>>();
  for (const p of allPrices) {
    if (!priceByMonth.has(p.commodity_guid)) priceByMonth.set(p.commodity_guid, new Map());
    priceByMonth.get(p.commodity_guid)!.set(p.month, p.price);
  }

  const allMonths = new Set<string>();
  for (const months of accountMonthly.values()) for (const m of months.keys()) allMonths.add(m);
  for (const months of priceByMonth.values()) for (const m of months.keys()) allMonths.add(m);
  const sortedMonths = [...allMonths].sort();

  const result: MonthlyInvestmentValue[] = [];

  for (const [accountGuid, monthlyData] of accountMonthly) {
    const firstEntry = [...monthlyData.values()][0];
    if (!firstEntry) continue;
    const commodity = commodityMap.get(firstEntry.commodity_guid);
    const ticker = commodity?.mnemonic ?? "???";
    const commodityPrices = priceByMonth.get(firstEntry.commodity_guid);

    let cumulativeShares = 0;
    let cumulativeCost = 0;
    let lastKnownPrice = 0;

    for (const month of sortedMonths) {
      const delta = monthlyData.get(month);
      if (delta) {
        cumulativeShares += delta.shares;
        cumulativeCost += delta.cost;
      }

      const priceThisMonth = commodityPrices?.get(month);
      if (priceThisMonth !== undefined) lastKnownPrice = priceThisMonth;

      if (cumulativeShares === 0 && cumulativeCost === 0 && !delta) continue;

      result.push({
        month,
        ticker,
        value: cumulativeShares * lastKnownPrice,
        costBasis: cumulativeCost,
      });
    }
  }

  return result;
}
