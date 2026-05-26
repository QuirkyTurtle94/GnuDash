import type { AccountNode } from "@/lib/types/gnucash";

// ── Types ───────────────────────────────────────────────────────

export type FlatAccount = {
  guid: string;
  name: string;
  fullPath: string;
  type: string;
  commodityMnemonic: string;
};

// ── Account helpers ─────────────────────────────────────────────

export function flattenAccounts(nodes: AccountNode[], path: string[] = []): FlatAccount[] {
  const results: FlatAccount[] = [];
  for (const node of nodes) {
    const currentPath = [...path, node.name];
    if (node.type !== "ROOT" && !node.placeholder) {
      results.push({
        guid: node.guid,
        name: node.name,
        fullPath: currentPath.join(":"),
        type: node.type,
        commodityMnemonic: node.commodityMnemonic,
      });
    }
    if (node.children.length > 0) {
      results.push(...flattenAccounts(node.children, currentPath));
    }
  }
  return results;
}

export function isInvestmentType(type: string): boolean {
  return type === "STOCK" || type === "MUTUAL";
}

// ── Fuzzy search ────────────────────────────────────────────────

export function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();
  if (t.includes(q)) {
    return { match: true, score: 1000 - t.indexOf(q) };
  }
  let qi = 0;
  let consecutive = 0;
  let maxConsecutive = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) { qi++; consecutive++; maxConsecutive = Math.max(maxConsecutive, consecutive); }
    else { consecutive = 0; }
  }
  if (qi === q.length) return { match: true, score: maxConsecutive * 10 };
  return { match: false, score: 0 };
}

// ── Split payload helpers ───────────────────────────────────────

export function buildCurrencySplitPayload(
  accountGuid: string,
  amount: number,
  fraction: number,
  memo?: string,
) {
  const valueNum = Math.round(amount * fraction);
  return {
    accountGuid,
    valueNum,
    valueDenom: fraction,
    quantityNum: valueNum,
    quantityDenom: fraction,
    memo: memo || undefined,
  };
}

// ── Arithmetic expression evaluation ────────────────────────────

/**
 * Evaluate simple arithmetic in a string (e.g. "500-100" → "400", "10*5.5" → "55").
 * Supports +, -, *, /. Returns the original string if not a valid expression.
 */
export function evalExpr(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return trimmed;
  if (!/^[\d.+\-*/() ]+$/.test(trimmed)) return trimmed;
  try {
    const result = new Function(`"use strict"; return (${trimmed});`)();
    if (typeof result === "number" && isFinite(result)) {
      return String(Math.round(result * 10000) / 10000);
    }
  } catch {
    // Parse failed
  }
  return trimmed;
}

export const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  BANK: "Bank", CASH: "Cash", ASSET: "Assets", STOCK: "Stocks", MUTUAL: "Funds",
  INCOME: "Income", EXPENSE: "Expenses", EQUITY: "Equity", LIABILITY: "Liabilities",
  CREDIT: "Credit", RECEIVABLE: "Receivable", PAYABLE: "Payable", TRADING: "Trading",
};
