import type { DbAdapter } from "../db/adapter";

export interface FxRateMap {
  /** Convert an amount in the given commodity to the base currency. */
  toBase(commodityGuid: string, amount: number): number;
  /** Get the raw rate for a commodity. */
  rate(commodityGuid: string): number;
}

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

  return {
    toBase(commodityGuid: string, amount: number): number {
      return amount * (rates.get(commodityGuid) ?? 1);
    },
    rate(commodityGuid: string): number {
      return rates.get(commodityGuid) ?? 1;
    },
  };
}
