import type { TopBalance } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { buildFullPath } from "../shared/accounts";

export function computeTopBalances(ctx: ParseContext): TopBalance[] {
  const { db, accountMap, commodityMap, baseCurrencyGuid, fxRates, latestPrices } = ctx;

  // Investment market values
  const invRows = db
    .prepare(
      `SELECT
        a.guid AS account_guid,
        a.commodity_guid,
        SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS shares_held
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      WHERE a.account_type IN ('STOCK', 'MUTUAL')
      GROUP BY a.guid
      HAVING shares_held != 0`
    )
    .all() as { account_guid: string; commodity_guid: string; shares_held: number }[];

  const investmentValueMap = new Map<string, number>();
  for (const row of invRows) {
    const price = latestPrices.get(row.commodity_guid) ?? 0;
    investmentValueMap.set(row.account_guid, row.shares_held * price);
  }

  // Non-investment balances using quantity
  const nonInvBalances = db
    .prepare(
      `SELECT
        s.account_guid,
        a.commodity_guid,
        SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS balance_in_commodity
      FROM splits s
      JOIN accounts a ON s.account_guid = a.guid
      WHERE a.account_type NOT IN ('STOCK', 'MUTUAL', 'ROOT', 'INCOME', 'EXPENSE', 'EQUITY', 'TRADING')
        AND a.placeholder = 0
      GROUP BY s.account_guid`
    )
    .all() as { account_guid: string; commodity_guid: string; balance_in_commodity: number }[];

  const results: TopBalance[] = [];

  for (const row of nonInvBalances) {
    if (Math.abs(row.balance_in_commodity) < 0.01) continue;
    const account = accountMap.get(row.account_guid);
    if (!account) continue;
    const commodity = commodityMap.get(account.commodity_guid);
    const isForeignCurrency =
      account.commodity_guid !== baseCurrencyGuid &&
      commodity?.namespace === "CURRENCY";

    let valueInBase = row.balance_in_commodity;
    if (isForeignCurrency) {
      valueInBase = fxRates.toBase(account.commodity_guid, row.balance_in_commodity);
    }

    if (Math.abs(valueInBase) < 0.01) continue;

    results.push({
      accountName: account.name,
      fullPath: buildFullPath(account, accountMap),
      type: account.account_type,
      value: valueInBase,
      commodityMnemonic: commodity?.mnemonic ?? "???",
    });
  }

  for (const row of invRows) {
    const marketValue = investmentValueMap.get(row.account_guid) ?? 0;
    if (Math.abs(marketValue) < 0.01) continue;
    const account = accountMap.get(row.account_guid);
    if (!account) continue;
    const commodity = commodityMap.get(account.commodity_guid);
    results.push({
      accountName: account.name,
      fullPath: buildFullPath(account, accountMap),
      type: account.account_type,
      value: marketValue,
      commodityMnemonic: commodity?.mnemonic ?? "???",
    });
  }

  results.sort((a, b) => {
    if (a.value > 0 && b.value <= 0) return -1;
    if (a.value <= 0 && b.value > 0) return 1;
    return Math.abs(b.value) - Math.abs(a.value);
  });

  return results;
}
