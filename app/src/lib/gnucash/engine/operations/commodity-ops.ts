/**
 * Commodity operations: create new commodities (currencies, securities).
 */

import type { WritableDbAdapter } from "../db/writable-adapter";
import { generateGuid } from "../guid";

/**
 * Create a new commodity (currency or security).
 *
 * @param namespace - "CURRENCY", "NASDAQ", "NYSE", "AMEX", "LSE", "TSE", "ASX", or custom
 * @param mnemonic  - Ticker symbol (e.g., "USD", "AAPL", "VWRL")
 * @param fullname  - Human-readable name (e.g., "Apple Inc", "US Dollar")
 * @param fraction  - Smallest unit (100 for currencies, 10000 for stocks)
 * @param cusip     - Optional CUSIP/ISIN identifier
 */
export function createCommodity(
  db: WritableDbAdapter,
  spec: {
    namespace: string;
    mnemonic: string;
    fullname: string;
    fraction: number;
    cusip?: string;
  }
): { commodityGuid: string } {
  if (!spec.mnemonic || spec.mnemonic.trim().length === 0) {
    throw new Error("Commodity mnemonic (ticker) is required");
  }
  if (!spec.fullname || spec.fullname.trim().length === 0) {
    throw new Error("Commodity full name is required");
  }
  if (!spec.namespace || spec.namespace.trim().length === 0) {
    throw new Error("Commodity namespace is required");
  }
  if (spec.fraction <= 0 || !Number.isInteger(spec.fraction)) {
    throw new Error("Commodity fraction must be a positive integer");
  }

  const commodityGuid = generateGuid();

  db.run(
    `INSERT INTO commodities (guid, namespace, mnemonic, fullname, cusip, fraction)
     VALUES (?, ?, ?, ?, ?, ?)`,
    commodityGuid,
    spec.namespace.trim(),
    spec.mnemonic.trim().toUpperCase(),
    spec.fullname.trim(),
    spec.cusip?.trim() ?? "",
    spec.fraction
  );

  return { commodityGuid };
}
