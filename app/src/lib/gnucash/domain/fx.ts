import type { DbAdapter } from "../db/adapter";

export interface FxRateMap {
  /** Convert an amount in the given commodity to the base currency. */
  toBase(commodityGuid: string, amount: number): number;
  /** Get the raw rate for a commodity (1 unit of commodity = rate units of base). */
  rate(commodityGuid: string): number;
  /** Convert an amount from one commodity to another via base currency. */
  convert(amount: number, fromGuid: string, toGuid: string): number;
}

/**
 * Build a foreign exchange rate lookup from the prices table.
 * Uses the most recent price for each currency pair, supporting:
 * - Direct rates (commodity → base)
 * - Inverse rates (base → commodity)
 * - Transitive/cross rates (commodity → intermediate → base)
 * Returns an FxRateMap with `toBase()`, `rate()`, and `convert()` methods.
 */
export function buildFxRateMap(
  db: DbAdapter,
  baseCurrencyGuid: string
): FxRateMap {
  const allFxPrices = db
    .prepare(
      `SELECT p.commodity_guid, p.currency_guid,
              CAST(p.value_num AS REAL) / p.value_denom AS price
       FROM prices p
       JOIN commodities c1 ON p.commodity_guid = c1.guid
       JOIN commodities c2 ON p.currency_guid = c2.guid
       WHERE c1.namespace = 'CURRENCY' AND c2.namespace = 'CURRENCY'
       ORDER BY p.date DESC`
    )
    .all() as { commodity_guid: string; currency_guid: string; price: number }[];

  const rates = new Map<string, number>();
  rates.set(baseCurrencyGuid, 1.0);

  // Phase 1: direct rates to/from base currency
  for (const fx of allFxPrices) {
    if (
      fx.currency_guid === baseCurrencyGuid &&
      !rates.has(fx.commodity_guid)
    ) {
      rates.set(fx.commodity_guid, fx.price);
    } else if (
      fx.commodity_guid === baseCurrencyGuid &&
      !rates.has(fx.currency_guid)
    ) {
      rates.set(fx.currency_guid, 1 / fx.price);
    }
  }

  // Phase 2: transitive/cross rates through any already-known currency
  // A price row means: 1 unit of commodity_guid = price units of currency_guid
  // If we know rate(commodity) and not rate(currency):
  //   1 currency = (1/price) commodity = (1/price) * rate(commodity) base
  //   → rate(currency) = rate(commodity) / price
  // If we know rate(currency) and not rate(commodity):
  //   1 commodity = price * currency = price * rate(currency) base
  //   → rate(commodity) = price * rate(currency)
  let changed = true;
  while (changed) {
    changed = false;
    for (const fx of allFxPrices) {
      if (rates.has(fx.commodity_guid) && !rates.has(fx.currency_guid)) {
        rates.set(fx.currency_guid, rates.get(fx.commodity_guid)! / fx.price);
        changed = true;
      } else if (rates.has(fx.currency_guid) && !rates.has(fx.commodity_guid)) {
        rates.set(fx.commodity_guid, fx.price * rates.get(fx.currency_guid)!);
        changed = true;
      }
    }
  }

  return {
    toBase(commodityGuid: string, amount: number): number {
      return amount * (rates.get(commodityGuid) ?? 1);
    },
    rate(commodityGuid: string): number {
      return rates.get(commodityGuid) ?? 1;
    },
    convert(amount: number, fromGuid: string, toGuid: string): number {
      if (fromGuid === toGuid) return amount;
      const fromRate = rates.get(fromGuid) ?? 1;
      const toRate = rates.get(toGuid) ?? 1;
      return amount * fromRate / toRate;
    },
  };
}
