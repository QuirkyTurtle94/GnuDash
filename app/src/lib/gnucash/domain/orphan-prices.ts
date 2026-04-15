/**
 * Orphaned transaction-linked price detection.
 *
 * GnuCash optionally records an "implied price" when a stock buy/sell or
 * FX transfer is entered (source = "user:xfer-dialog", type = "transaction").
 * Those rows have no FK back to the transaction that created them, so if the
 * originating transaction is later edited or deleted, the price is left behind
 * as an orphan with no way to tell it apart from still-live ones.
 *
 * This module performs a best-effort heuristic match: for each transaction-
 * linked price we look for any existing split whose (commodity, currency,
 * post-date) line up and whose value/quantity ratio is within a small
 * tolerance of the stored price. If no such split exists the price is flagged
 * as orphaned.
 *
 * The result is only used to surface a badge and an opt-in cleanup button in
 * the prices table — nothing is deleted automatically.
 */

import type { ParseContext } from "../context";
import type { GnuCashPrice } from "@/lib/types/gnucash";

/** Relative tolerance when matching a price against a split's value/quantity ratio. */
const PRICE_MATCH_TOLERANCE = 0.005; // 0.5%

/** A price row is considered transaction-linked if GnuCash tagged it as such. */
export function isTransactionLinkedPrice(price: GnuCashPrice): boolean {
  return price.source === "user:xfer-dialog" || price.type === "transaction";
}

/** Normalise a GnuCash timestamp ("YYYY-MM-DD HH:MM:SS") or ISO date to "YYYY-MM-DD". */
function toDayKey(date: string): string {
  return date.slice(0, 10);
}

interface SplitRatioRow {
  post_date: string;
  currency_guid: string;
  account_guid: string;
  value_num: number;
  value_denom: number;
  quantity_num: number;
  quantity_denom: number;
}

/**
 * Build the set of orphaned transaction-linked price GUIDs.
 *
 * An orphan is a price flagged as transaction-linked (per
 * {@link isTransactionLinkedPrice}) for which no current split on the same
 * day, commodity and currency has a value/quantity ratio within
 * {@link PRICE_MATCH_TOLERANCE} of the stored price.
 */
export function computeOrphanedPriceGuids(ctx: ParseContext): Set<string> {
  const linkedPrices = ctx.prices.filter(isTransactionLinkedPrice);
  if (linkedPrices.length === 0) return new Set();

  // Pull every split that could plausibly have produced an implied price —
  // i.e. ones with a non-zero quantity. Joining transactions gives us the
  // tx-level currency and post-date needed for the lookup key.
  const rows = ctx.db
    .prepare(
      `SELECT t.post_date, t.currency_guid, s.account_guid,
              s.value_num, s.value_denom, s.quantity_num, s.quantity_denom
       FROM splits s
       JOIN transactions t ON s.tx_guid = t.guid
       WHERE s.quantity_num != 0`,
    )
    .all() as SplitRatioRow[];

  // Bucket the split ratios by (commodity, currency, day) for O(1) matching.
  const bucket = new Map<string, number[]>();
  for (const row of rows) {
    const account = ctx.accountMap.get(row.account_guid);
    if (!account) continue;
    // A split only implies a price when its account commodity differs from
    // the transaction currency — otherwise value == quantity and there's no
    // conversion to record.
    if (account.commodity_guid === row.currency_guid) continue;
    if (row.quantity_denom === 0 || row.value_denom === 0) continue;

    const value = Math.abs(row.value_num / row.value_denom);
    const quantity = Math.abs(row.quantity_num / row.quantity_denom);
    if (quantity === 0 || value === 0) continue;

    const ratio = value / quantity;
    const key = `${account.commodity_guid}|${row.currency_guid}|${toDayKey(row.post_date)}`;
    const list = bucket.get(key);
    if (list) list.push(ratio);
    else bucket.set(key, [ratio]);
  }

  const orphans = new Set<string>();
  for (const price of linkedPrices) {
    if (price.value_denom === 0) continue;
    const priceValue = price.value_num / price.value_denom;
    if (priceValue === 0) continue;

    const key = `${price.commodity_guid}|${price.currency_guid}|${toDayKey(price.date)}`;
    const ratios = bucket.get(key);
    const matched = ratios?.some(
      (r) => Math.abs(r - priceValue) / priceValue < PRICE_MATCH_TOLERANCE,
    );
    if (!matched) orphans.add(price.guid);
  }

  return orphans;
}
