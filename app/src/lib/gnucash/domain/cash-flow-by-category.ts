import type { MonthlyExpenseByCategory } from "@/lib/types/gnucash";
import type { ParseContext } from "../context";
import { sqlMonth } from "../shared/dates";
import { EXCLUDE_CLOSING_JOIN, EXCLUDE_CLOSING_WHERE } from "./closing";

/**
 * Compute monthly cash inflows and outflows grouped by counterparty category.
 *
 * For each BANK/CASH split we know exactly how much cash moved (the split's
 * quantity).  To decide *what category* the cash flow belongs to we look at the
 * counterparty splits **that flow in the same direction**:
 *
 *   Bank inflow  (+qty) → attribute to counterparties with negative value
 *                          (credits / sources, e.g. Income accounts)
 *   Bank outflow (−qty) → attribute to counterparties with positive value
 *                          (debits / destinations, e.g. Expense accounts)
 *
 * This means that in a salary transaction where gross pay is split into taxes,
 * pension and net-to-bank, only the income account is picked as the inflow
 * source — taxes and pension never touched the bank so they don't appear.
 *
 * When multiple same-direction counterparties exist (e.g. a split expense),
 * the bank amount is distributed proportionally by their absolute values.
 *
 * @param excludeClosing – exclude year-end book-closing transactions
 */
export function computeCashFlowByCategory(
  ctx: ParseContext,
  excludeClosing = false,
): {
  inflow: MonthlyExpenseByCategory[];
  outflow: MonthlyExpenseByCategory[];
  inflowColors: Record<string, string>;
  outflowColors: Record<string, string>;
} {
  const { db, accounts, accountMap, commodityMap, fxRates, rootAccount } = ctx;

  const closingJoin = excludeClosing ? EXCLUDE_CLOSING_JOIN : "";
  const closingWhere = excludeClosing ? `AND ${EXCLUDE_CLOSING_WHERE}` : "";

  // Fetch every (bank-split, counterparty-split) pair.
  // We process proportional distribution in JS.
  const rows = db
    .prepare(
      `SELECT
        cs.guid AS cs_guid,
        CAST(cs.quantity_num AS REAL) / cs.quantity_denom AS cs_quantity,
        ca.commodity_guid AS cs_commodity_guid,
        cp.account_guid AS cp_account_guid,
        CAST(cp.value_num AS REAL) / cp.value_denom AS cp_value,
        ${sqlMonth("t.post_date", ctx.dialect)} AS month
      FROM splits cs
      JOIN accounts ca ON cs.account_guid = ca.guid
      JOIN transactions t ON cs.tx_guid = t.guid
      JOIN splits cp ON cp.tx_guid = t.guid AND cp.guid != cs.guid
      JOIN accounts cpa ON cp.account_guid = cpa.guid
      ${closingJoin}
      WHERE ca.account_type IN ('BANK', 'CASH')
        AND cpa.account_type NOT IN ('EQUITY', 'BANK', 'CASH')
      ${closingWhere}
      ORDER BY cs.guid`
    )
    .all() as {
      cs_guid: string;
      cs_quantity: number;
      cs_commodity_guid: string;
      cp_account_guid: string;
      cp_value: number;
      month: string;
    }[];

  // ── Group rows by bank split and distribute proportionally ─────────

  // Keyed by "cp_account_guid\tmonth" → accumulated cash amount (in base currency)
  const cashByCategory = new Map<string, number>();

  let i = 0;
  while (i < rows.length) {
    const csGuid = rows[i].cs_guid;
    const csQuantity = rows[i].cs_quantity;
    const csCommodityGuid = rows[i].cs_commodity_guid;
    const month = rows[i].month;

    // Collect all counterparty rows for this bank split
    const counterparties: { accountGuid: string; value: number }[] = [];
    while (i < rows.length && rows[i].cs_guid === csGuid) {
      counterparties.push({ accountGuid: rows[i].cp_account_guid, value: rows[i].cp_value });
      i++;
    }

    if (csQuantity === 0) continue;

    // FX-convert bank quantity to base currency
    const csCommodity = commodityMap.get(csCommodityGuid);
    const csRate = csCommodity?.namespace === "CURRENCY" ? fxRates.rate(csCommodityGuid) : 1;
    const cashBase = csQuantity * csRate; // positive = inflow, negative = outflow

    // Pick only counterparties that flow in the same direction as the bank split:
    //   inflow  (cashBase > 0) → counterparties with negative value (credits/sources)
    //   outflow (cashBase < 0) → counterparties with positive value (debits/destinations)
    const isInflow = cashBase > 0;
    const sameDir = counterparties.filter((cp) =>
      isInflow ? cp.value < 0 : cp.value > 0,
    );

    // Fallback: if no same-direction counterparties, use all of them
    const targets = sameDir.length > 0 ? sameDir : counterparties;
    const totalAbsValue = targets.reduce((s, cp) => s + Math.abs(cp.value), 0);
    if (totalAbsValue === 0) continue;

    for (const cp of targets) {
      const proportion = Math.abs(cp.value) / totalAbsValue;
      const attributed = cashBase * proportion;
      const key = `${cp.accountGuid}\t${month}`;
      cashByCategory.set(key, (cashByCategory.get(key) ?? 0) + attributed);
    }
  }

  // ── Build output arrays ────────────────────────────────────────────

  const topLevelGuids = new Set(
    accounts
      .filter((a) => a.parent_guid === rootAccount.guid && a.account_type !== "ROOT")
      .map((a) => a.guid),
  );

  function getPath(accountGuid: string): string[] | null {
    const parts: string[] = [];
    let current = accountMap.get(accountGuid);
    if (!current) return null;
    while (current) {
      if (current.account_type === "ROOT" || current.guid === rootAccount.guid) return null;
      parts.unshift(current.name);
      if (topLevelGuids.has(current.guid)) return parts;
      if (!current.parent_guid) return null;
      current = accountMap.get(current.parent_guid);
    }
    return null;
  }

  const inflow: MonthlyExpenseByCategory[] = [];
  const outflow: MonthlyExpenseByCategory[] = [];
  const inflowTopTotals = new Map<string, number>();
  const outflowTopTotals = new Map<string, number>();

  for (const [key, cashAmount] of cashByCategory) {
    if (Math.abs(cashAmount) < 0.005) continue;

    const [accountGuid, month] = key.split("\t");
    const account = accountMap.get(accountGuid);
    if (!account) continue;
    if (topLevelGuids.has(account.guid)) continue;

    const pathParts = getPath(accountGuid);
    if (!pathParts || pathParts.length === 0) continue;

    const amount = Math.abs(cashAmount);
    const entry: MonthlyExpenseByCategory = {
      month,
      category: account.name,
      fullPath: pathParts.join(":"),
      pathParts,
      amount,
    };

    // positive cashAmount = inflow, negative = outflow
    if (cashAmount > 0) {
      inflow.push(entry);
      inflowTopTotals.set(pathParts[0], (inflowTopTotals.get(pathParts[0]) ?? 0) + amount);
    } else {
      outflow.push(entry);
      outflowTopTotals.set(pathParts[0], (outflowTopTotals.get(pathParts[0]) ?? 0) + amount);
    }
  }

  // ── Colour palettes ────────────────────────────────────────────────

  const inflowPalette = [
    "#3B6B8A", "#4A7A9A", "#5889A9", "#6798B8", "#76A7C7",
    "#85B6D6", "#94C5E5", "#A3D0EE", "#B8DCF3", "#CDE8F8",
  ];
  const outflowPalette = [
    "#4A7A6B", "#5C8C7C", "#6C9B8B", "#7DAA9A", "#8FB9A9",
    "#A0C8B8", "#B2D7C8", "#C3E5D7", "#D5F0E4", "#E0F5EC",
  ];

  const inflowColors: Record<string, string> = {};
  const outflowColors: Record<string, string> = {};

  [...inflowTopTotals.entries()].sort((a, b) => b[1] - a[1]).forEach(([name], i) => {
    inflowColors[name] = inflowPalette[i % inflowPalette.length];
  });
  [...outflowTopTotals.entries()].sort((a, b) => b[1] - a[1]).forEach(([name], i) => {
    outflowColors[name] = outflowPalette[i % outflowPalette.length];
  });

  return { inflow, outflow, inflowColors, outflowColors };
}
