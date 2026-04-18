/**
 * Price operations: add, delete.
 */

import type { WritableDbAdapter } from "../db/writable-adapter";
import type { GncNumeric } from "../gnc-numeric";
import { generateGuid } from "../guid";
import { formatGnuCashDate } from "../../shared/dates";

/**
 * Add a price entry for a commodity.
 *
 * @param commodityGuid - What's being priced (e.g., AAPL stock GUID)
 * @param currencyGuid  - Priced in what (e.g., GBP currency GUID)
 * @param date          - Price date
 * @param value         - Price as GncNumeric (e.g., 13500/100 = 135.00 GBP)
 * @param source        - Price source (default: "user:price")
 * @param type          - Price type (default: "last")
 */
export function addPrice(
  db: WritableDbAdapter,
  commodityGuid: string,
  currencyGuid: string,
  date: Date,
  value: GncNumeric,
  source: string = "user:price",
  type: string = "last"
): { priceGuid: string } {
  const priceGuid = generateGuid();

  db.run(
    `INSERT INTO prices (guid, commodity_guid, currency_guid, date, source, type, value_num, value_denom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    priceGuid,
    commodityGuid,
    currencyGuid,
    formatGnuCashDate(date),
    source,
    type,
    value.num,
    value.denom
  );

  return { priceGuid };
}

/**
 * Delete a price entry.
 */
export function deletePrice(
  db: WritableDbAdapter,
  priceGuid: string
): void {
  db.run(`DELETE FROM prices WHERE guid = ?`, priceGuid);
}
