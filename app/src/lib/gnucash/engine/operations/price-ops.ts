/**
 * Price operations: add, delete.
 */

import type { WritableDbAdapter } from "../db/writable-adapter";
import type { GncNumeric } from "../gnc-numeric";
import { generateGuid } from "../guid";

/**
 * Format a Date as "YYYY-MM-DD HH:MM:SS" for GNUCash SQLite storage.
 */
function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

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
    formatDate(date),
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
