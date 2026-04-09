import type { AccountNode } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { buildFullPath } from "../shared/accounts";

/**
 * Build a hierarchical account tree from the flat accounts table.
 * Each node includes:
 * - `balance`: in base currency (own splits + all descendants)
 * - `nativeBalance`: in the account's own commodity (children converted to parent's commodity)
 * Investment accounts (STOCK/MUTUAL) are valued at latest market price.
 * Foreign currency accounts are converted via FX rates.
 */
export function buildAccountTree(ctx: ParseContext): AccountNode[] {
  const { db, accounts, accountMap, commodityMap, baseCurrencyGuid, fxRates, latestPrices, latestPriceInfo, rootAccount } = ctx;

  // Per-account balances using quantity (native commodity)
  const balanceRows = db
    .prepare(
      `SELECT s.account_guid, SUM(CAST(s.quantity_num AS REAL) / s.quantity_denom) AS balance
       FROM splits s
       GROUP BY s.account_guid`
    )
    .all() as { account_guid: string; balance: number }[];
  const rawBalanceMap = new Map(balanceRows.map((b) => [b.account_guid, b.balance]));

  function toBaseCurrency(accountGuid: string, rawBalance: number): number {
    const account = accountMap.get(accountGuid);
    if (!account) return rawBalance;
    const commodity = commodityMap.get(account.commodity_guid);
    if (!commodity) return rawBalance;

    if (account.account_type === "STOCK" || account.account_type === "MUTUAL") {
      return rawBalance * (latestPrices.get(account.commodity_guid) ?? 0);
    }

    if (commodity.namespace === "CURRENCY" && account.commodity_guid !== baseCurrencyGuid) {
      return fxRates.toBase(account.commodity_guid, rawBalance);
    }

    return rawBalance;
  }

  // Build children lookup
  const childrenMap = new Map<string, string[]>();
  for (const a of accounts) {
    const key = a.parent_guid ?? "ROOT";
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(a.guid);
  }

  function buildNode(accountGuid: string): AccountNode {
    const account = accountMap.get(accountGuid)!;
    const commodity = commodityMap.get(account.commodity_guid);
    const childGuids = childrenMap.get(account.guid) ?? [];
    const children = childGuids
      .filter((g) => accountMap.get(g)?.account_type !== "ROOT")
      .map(buildNode);

    const rawBalance = rawBalanceMap.get(account.guid) ?? 0;
    const ownBalance = toBaseCurrency(account.guid, rawBalance);
    const childrenTotal = children.reduce((sum, c) => sum + c.balance, 0);

    // Native balance computation
    let ownNativeBalance: number;
    let nativeCurrencyMnemonic: string;

    if (account.account_type === "STOCK" || account.account_type === "MUTUAL") {
      // Stocks: market value in the price's denomination currency
      const info = latestPriceInfo.get(account.commodity_guid);
      if (info) {
        const priceCommodity = commodityMap.get(info.currencyGuid);
        ownNativeBalance = rawBalance * info.rawPrice;
        nativeCurrencyMnemonic = priceCommodity?.mnemonic ?? commodity?.mnemonic ?? "???";
      } else {
        ownNativeBalance = 0;
        nativeCurrencyMnemonic = commodity?.mnemonic ?? "???";
      }
    } else {
      // Currency accounts: raw balance in own commodity
      ownNativeBalance = rawBalance;
      nativeCurrencyMnemonic = commodity?.mnemonic ?? "???";
    }

    // For parent accounts, convert children's base-currency total to parent's commodity
    const isCurrency = commodity?.namespace === "CURRENCY";
    const parentRate = isCurrency ? fxRates.rate(account.commodity_guid) : 1;
    const childrenInParentCurrency = parentRate > 0 ? childrenTotal / parentRate : 0;
    const nativeBalance = ownNativeBalance + childrenInParentCurrency;

    return {
      guid: account.guid,
      name: account.name,
      fullPath: buildFullPath(account, accountMap),
      type: account.account_type,
      commodityGuid: account.commodity_guid,
      commodityMnemonic: commodity?.mnemonic ?? "???",
      parentGuid: account.parent_guid,
      hidden: account.hidden === 1,
      placeholder: account.placeholder === 1,
      balance: ownBalance + childrenTotal,
      nativeBalance,
      nativeCurrencyMnemonic,
      children,
    };
  }

  const topLevelGuids = childrenMap.get(rootAccount.guid) ?? [];
  return topLevelGuids.map(buildNode);
}
