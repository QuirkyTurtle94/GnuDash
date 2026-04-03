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
  /** Latest price per commodity GUID */
  latestPrices: Map<string, number>;
  /** Top-level expense account GUIDs (direct children of ROOT with type EXPENSE) */
  topExpenseGuids: Set<string>;
  /** Top-level income account GUIDs (direct children of ROOT with type INCOME) */
  topIncomeGuids: Set<string>;
}

export function buildParseContext(db: DbAdapter): ParseContext {
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

  const baseCurrencyGuid = rootAccount.commodity_guid;
  const baseCommodity = commodityMap.get(baseCurrencyGuid);

  // Fallback currency detection if root doesn't have a CURRENCY commodity
  let baseCurrencyMnemonic = baseCommodity?.mnemonic ?? "USD";
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

  const fxRates = buildFxRateMap(db, baseCurrencyGuid);

  // Build latest price map
  const latestPrices = new Map<string, number>();
  for (const p of prices) {
    if (!latestPrices.has(p.commodity_guid)) {
      latestPrices.set(p.commodity_guid, p.value_num / p.value_denom);
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
    topExpenseGuids,
    topIncomeGuids,
  };
}
