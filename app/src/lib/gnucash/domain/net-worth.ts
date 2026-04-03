import type { MonthlyNetWorth } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { sqlMonth } from "../shared/dates";

export function computeNetWorthSeries(ctx: ParseContext): MonthlyNetWorth[] {
  const { db, baseCurrencyGuid, fxRates, commodityMap } = ctx;

  // Monthly changes for non-investment accounts using quantity + FX conversion
  const nonInvRows = db
    .prepare(
      `SELECT
        ${sqlMonth("t.post_date")} AS month,
        a.commodity_guid,
        SUM(CASE WHEN a.account_type IN ('ASSET','BANK','CASH','RECEIVABLE')
            THEN CAST(s.quantity_num AS REAL) / s.quantity_denom ELSE 0 END) AS asset_change,
        SUM(CASE WHEN a.account_type IN ('LIABILITY','CREDIT','PAYABLE')
            THEN CAST(s.quantity_num AS REAL) / s.quantity_denom ELSE 0 END) AS liability_change
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type IN ('ASSET','BANK','CASH','RECEIVABLE','LIABILITY','CREDIT','PAYABLE')
        AND a.placeholder = 0
      GROUP BY ${sqlMonth("t.post_date")}, a.commodity_guid
      ORDER BY month`
    )
    .all() as { month: string; commodity_guid: string; asset_change: number; liability_change: number }[];

  const nonInvByMonth = new Map<string, { asset_change: number; liability_change: number }>();
  for (const row of nonInvRows) {
    const commodity = commodityMap.get(row.commodity_guid);
    const rate = commodity?.namespace === "CURRENCY" ? fxRates.rate(row.commodity_guid) : 1;
    const existing = nonInvByMonth.get(row.month) ?? { asset_change: 0, liability_change: 0 };
    existing.asset_change += row.asset_change * rate;
    existing.liability_change += row.liability_change * rate;
    nonInvByMonth.set(row.month, existing);
  }

  // Investment accounts and their shares over time
  const invAccounts = db
    .prepare(
      `SELECT a.guid, a.commodity_guid
       FROM accounts a
       WHERE a.account_type IN ('STOCK', 'MUTUAL')`
    )
    .all() as { guid: string; commodity_guid: string }[];

  const invShares = db
    .prepare(
      `SELECT
        s.account_guid,
        ${sqlMonth("t.post_date")} AS month,
        SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS shares_change
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      JOIN transactions t ON s.tx_guid = t.guid
      WHERE a.account_type IN ('STOCK', 'MUTUAL')
      GROUP BY s.account_guid, ${sqlMonth("t.post_date")}
      ORDER BY month`
    )
    .all() as { account_guid: string; month: string; shares_change: number }[];

  // Build cumulative shares per account
  const sharesMap = new Map<string, Map<string, number>>();
  const accountSharesRunning = new Map<string, number>();
  const allMonths = new Set<string>();

  for (const row of invShares) {
    allMonths.add(row.month);
    const running = (accountSharesRunning.get(row.account_guid) ?? 0) + row.shares_change;
    accountSharesRunning.set(row.account_guid, running);
    if (!sharesMap.has(row.account_guid)) sharesMap.set(row.account_guid, new Map());
    sharesMap.get(row.account_guid)!.set(row.month, running);
  }

  // Price lookup by commodity by month
  const allPrices = db
    .prepare(
      `SELECT commodity_guid, date, CAST(value_num AS REAL) / value_denom AS price
       FROM prices ORDER BY date`
    )
    .all() as { commodity_guid: string; date: string; price: number }[];

  const pricesByMonth = new Map<string, Map<string, number>>();
  for (const p of allPrices) {
    const pMonth = p.date.substring(0, 7);
    if (!pricesByMonth.has(p.commodity_guid)) pricesByMonth.set(p.commodity_guid, new Map());
    pricesByMonth.get(p.commodity_guid)!.set(pMonth, p.price);
  }

  function getPriceAtMonth(commodityGuid: string, month: string): number {
    const prices = pricesByMonth.get(commodityGuid);
    if (!prices) return 0;
    let lastPrice = 0;
    for (const [m, price] of prices) {
      if (m <= month) lastPrice = price;
    }
    return lastPrice;
  }

  function getSharesAtMonth(accountGuid: string, month: string): number {
    const monthMap = sharesMap.get(accountGuid);
    if (!monthMap) return 0;
    let lastShares = 0;
    for (const [m, shares] of monthMap) {
      if (m <= month) lastShares = shares;
    }
    return lastShares;
  }

  for (const [month] of nonInvByMonth) allMonths.add(month);
  const sortedMonths = [...allMonths].sort();

  let cumulativeNonInvAssets = 0;
  let cumulativeLiabilities = 0;

  return sortedMonths.map((month) => {
    const nonInv = nonInvByMonth.get(month);
    if (nonInv) {
      cumulativeNonInvAssets += nonInv.asset_change;
      cumulativeLiabilities += nonInv.liability_change;
    }

    let investmentValue = 0;
    for (const acc of invAccounts) {
      const shares = getSharesAtMonth(acc.guid, month);
      const price = getPriceAtMonth(acc.commodity_guid, month);
      investmentValue += shares * price;
    }

    const totalAssets = cumulativeNonInvAssets + investmentValue;

    return {
      month,
      netWorth: totalAssets + cumulativeLiabilities,
      assets: totalAssets,
      liabilities: Math.abs(cumulativeLiabilities),
    };
  });
}

export function computeCurrentNetWorth(ctx: ParseContext): number {
  const { db, commodityMap, baseCurrencyGuid, fxRates } = ctx;

  const nonInvRows = db
    .prepare(
      `SELECT
        a.commodity_guid,
        SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS balance
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      WHERE a.account_type NOT IN ('STOCK', 'MUTUAL', 'ROOT', 'INCOME', 'EXPENSE', 'EQUITY', 'TRADING')
        AND a.placeholder = 0
      GROUP BY a.commodity_guid`
    )
    .all() as { commodity_guid: string; balance: number }[];

  let nonInvTotal = 0;
  for (const row of nonInvRows) {
    const commodity = commodityMap.get(row.commodity_guid);
    if (commodity?.namespace === "CURRENCY") {
      nonInvTotal += fxRates.toBase(row.commodity_guid, row.balance);
    } else {
      nonInvTotal += row.balance;
    }
  }

  // Investment market value from context's latestPrices
  const invRows = db
    .prepare(
      `SELECT a.commodity_guid,
              SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS shares
       FROM splits s
       JOIN accounts a ON s.account_guid = a.guid
       WHERE a.account_type IN ('STOCK', 'MUTUAL')
       GROUP BY a.commodity_guid
       HAVING shares != 0`
    )
    .all() as { commodity_guid: string; shares: number }[];

  let investmentTotal = 0;
  for (const row of invRows) {
    investmentTotal += row.shares * (ctx.latestPrices.get(row.commodity_guid) ?? 0);
  }

  return nonInvTotal + investmentTotal;
}
