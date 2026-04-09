import type { DbAdapter } from "./db/adapter";
import type {
  GnuCashAccount,
  GnuCashCommodity,
  GnuCashPrice,
} from "@/lib/types/gnucash";
import { buildFxRateMap, type FxRateMap } from "./domain/fx";

export interface ParseContext {
  db: DbAdapter;
  accounts: GnuCashAccount[];
  accountMap: Map<string, GnuCashAccount>;
  commodities: GnuCashCommodity[];
  commodityMap: Map<string, GnuCashCommodity>;
  prices: GnuCashPrice[];
  rootAccount: GnuCashAccount;
  baseCurrencyGuid: string;
  baseCurrencyMnemonic: string;
  fxRates: FxRateMap;
  /** Latest price per commodity GUID, normalized to base currency */
  latestPrices: Map<string, number>;
  /** Raw latest price info per commodity GUID (price in its denomination currency) */
  latestPriceInfo: Map<string, { rawPrice: number; currencyGuid: string }>;
  /** Top-level expense account GUIDs (direct children of ROOT with type EXPENSE) */
  topExpenseGuids: Set<string>;
  /** Top-level income account GUIDs (direct children of ROOT with type INCOME) */
  topIncomeGuids: Set<string>;
  /** Currencies available in this file (CURRENCY-namespace commodities) */
  availableCurrencies: { guid: string; mnemonic: string; fullname: string }[];
}

/**
 * Build a parse context from a database.
 * @param overrideBaseCurrencyGuid - Optional currency GUID to use instead of auto-detected base currency.
 */
export function buildParseContext(db: DbAdapter, overrideBaseCurrencyGuid?: string): ParseContext {
  const accounts = db
    .prepare(
      `SELECT guid, name, account_type, commodity_guid, parent_guid,
              code, description, hidden, placeholder
       FROM accounts`
    )
    .all() as GnuCashAccount[];

  const commodities = db
    .prepare(
      `SELECT guid, namespace, mnemonic, fullname, cusip, fraction
       FROM commodities`
    )
    .all() as GnuCashCommodity[];

  const prices = db
    .prepare(
      `SELECT guid, commodity_guid, currency_guid, date, source, type,
              value_num, value_denom
       FROM prices
       ORDER BY date DESC`
    )
    .all() as GnuCashPrice[];

  const accountMap = new Map(accounts.map((a) => [a.guid, a]));
  const commodityMap = new Map(commodities.map((c) => [c.guid, c]));

  // Detect base currency from root account
  const book = db
    .prepare(`SELECT root_account_guid FROM books LIMIT 1`)
    .get() as { root_account_guid: string } | undefined;

  const rootAccount = book
    ? accounts.find((a) => a.guid === book.root_account_guid)
    : undefined;

  if (!rootAccount) {
    throw new Error("Could not find root account in GNUCash file");
  }

  // Use override if provided, otherwise auto-detect
  let baseCurrencyGuid: string;
  let baseCurrencyMnemonic: string;

  if (overrideBaseCurrencyGuid) {
    baseCurrencyGuid = overrideBaseCurrencyGuid;
    const overrideCommodity = commodityMap.get(overrideBaseCurrencyGuid);
    baseCurrencyMnemonic = overrideCommodity?.mnemonic ?? "USD";
  } else {
    baseCurrencyGuid = rootAccount.commodity_guid;
    const baseCommodity = commodityMap.get(baseCurrencyGuid);
    baseCurrencyMnemonic = baseCommodity?.mnemonic ?? "USD";

    // Fallback currency detection if root doesn't have a CURRENCY commodity
    if (baseCommodity && baseCommodity.namespace !== "CURRENCY") {
      const row = db
        .prepare(
          `SELECT c.mnemonic
           FROM accounts a
           JOIN commodities c ON a.commodity_guid = c.guid
           WHERE a.account_type IN ('BANK', 'CASH') AND c.namespace = 'CURRENCY'
           GROUP BY c.mnemonic
           ORDER BY COUNT(*) DESC
           LIMIT 1`
        )
        .get() as { mnemonic: string } | undefined;
      if (row) baseCurrencyMnemonic = row.mnemonic;
    }
  }

  const fxRates = buildFxRateMap(db, baseCurrencyGuid);

  // Build latest price maps: normalized to base + raw info
  const latestPrices = new Map<string, number>();
  const latestPriceInfo = new Map<string, { rawPrice: number; currencyGuid: string }>();
  for (const p of prices) {
    if (!latestPriceInfo.has(p.commodity_guid)) {
      const rawPrice = p.value_num / p.value_denom;
      latestPriceInfo.set(p.commodity_guid, { rawPrice, currencyGuid: p.currency_guid });
      // Normalize to base currency: rawPrice is in p.currency_guid, convert to base
      latestPrices.set(p.commodity_guid, fxRates.toBase(p.currency_guid, rawPrice));
    }
  }

  // Top-level category GUIDs
  const topExpenseGuids = new Set(
    accounts
      .filter(
        (a) =>
          a.account_type === "EXPENSE" && a.parent_guid === rootAccount.guid
      )
      .map((a) => a.guid)
  );

  const topIncomeGuids = new Set(
    accounts
      .filter(
        (a) =>
          a.account_type === "INCOME" && a.parent_guid === rootAccount.guid
      )
      .map((a) => a.guid)
  );

  // Available currencies
  const availableCurrencies = commodities
    .filter((c) => c.namespace === "CURRENCY")
    .map((c) => ({ guid: c.guid, mnemonic: c.mnemonic, fullname: c.fullname }))
    .sort((a, b) => a.mnemonic.localeCompare(b.mnemonic));

  return {
    db,
    accounts,
    accountMap,
    commodities,
    commodityMap,
    prices,
    rootAccount,
    baseCurrencyGuid,
    baseCurrencyMnemonic,
    fxRates,
    latestPrices,
    latestPriceInfo,
    topExpenseGuids,
    topIncomeGuids,
    availableCurrencies,
  };
}
