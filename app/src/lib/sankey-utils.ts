import type { MonthlyExpenseByCategory, MonthlyCashFlow } from "@/lib/types/gnucash";
import { formatCurrencyShort } from "@/lib/format";
import { type CustomRange, dateToMonth } from "@/lib/period-utils";

// ── Library-agnostic intermediate format ──────────────────────────────

export interface SankeyNode {
  id: string;
  label: string;
  color: string;
  depth?: number; // explicit column position (0-indexed from left)
}

export interface SankeyLink {
  source: string; // node id
  target: string; // node id
  value: number;
  sourceColor: string; // colour of the source node (for faded mode)
}

export interface SankeyData {
  nodes: SankeyNode[];
  links: SankeyLink[];
}

// ── Time period helpers ───────────────────────────────────────────────

export type SankeyPeriod = "this-month" | "last-month" | "last-3m" | "last-6m" | "last-12m" | "all-time" | "custom";

export const SANKEY_PERIOD_LABELS: Record<SankeyPeriod, string> = {
  "this-month": "This Month",
  "last-month": "Last Month",
  "last-3m": "Last 3 Months",
  "last-6m": "Last 6 Months",
  "last-12m": "Last 12 Months",
  "all-time": "All Time",
  "custom": "Custom",
};

/**
 * Derive the set of months to include by slicing from the end of the
 * cashFlowSeries array — the same approach the Cash Flow chart uses.
 * This ensures the Sankey always matches the dashboard totals.
 */
export function getMonthsForPeriod(
  cashFlowSeries: MonthlyCashFlow[],
  period: SankeyPeriod,
  customRange?: CustomRange,
): Set<string> {
  if (cashFlowSeries.length === 0) return new Set();

  // Anchor relative periods to the current calendar month, not the latest
  // month in the dataset. This prevents future-dated transactions from
  // shifting "This Month" to a future period. (Fixes #42)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  /** Build a YYYY-MM string offset from the current month. */
  const monthAtOffset = (offset: number): string => {
    const d = new Date(currentYear, currentMonth + offset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  /** Build a Set of YYYY-MM strings for a range of month offsets. */
  const monthRange = (count: number): Set<string> =>
    new Set(Array.from({ length: count }, (_, i) => monthAtOffset(i - count + 1)));

  switch (period) {
    case "this-month":
      return new Set([monthAtOffset(0)]);
    case "last-month":
      return new Set([monthAtOffset(-1)]);
    case "last-3m":
      return monthRange(3);
    case "last-6m":
      return monthRange(6);
    case "last-12m":
      return monthRange(12);
    case "all-time":
      return new Set(cashFlowSeries.map((s) => s.month));
    case "custom":
      if (!customRange) return new Set();
      return new Set(
        cashFlowSeries
          .filter((s) => s.month >= dateToMonth(customRange.start) && s.month <= dateToMonth(customRange.end))
          .map((s) => s.month),
      );
  }
}

// ── Colour constants ──────────────────────────────────────────────────

const INCOME_NODE_COLOR = "#6C9B8B";
const EXPENSE_NODE_COLOR = "#F87171";
const TOTAL_INCOME_COLOR = "#4A7A6B";
const TOTAL_EXPENSE_COLOR = "#DC2626";
const POSITIVE_CASHFLOW_COLOR = "#22C55E";
const NEGATIVE_CASHFLOW_COLOR = "#EF4444";
const FILTERED_OUT_COLOR = "#D1D5DB";

// ── Link colour modes ────────────────────────────────────────────────

export type LinkColorMode = "source" | "grey";

/** Convert a hex colour (#RRGGBB) to rgba with the given alpha (0–1). */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function resolveLinkColor(
  link: SankeyLink,
  mode: LinkColorMode,
  greyColor: string,
): string {
  if (mode === "grey") return hexToRgba(greyColor, 0.3);
  // "source" mode: faded version of the source node colour
  return hexToRgba(link.sourceColor, 0.35);
}

// ── Build Sankey data ─────────────────────────────────────────────────

interface BuildOptions {
  incomeByCategory: MonthlyExpenseByCategory[];
  expenseByCategory: MonthlyExpenseByCategory[];
  cashFlowSeries: MonthlyCashFlow[];
  incomeCategoryColors: Record<string, string>;
  expenseCategoryColors: Record<string, string>;
  period: SankeyPeriod;
  depth: number; // 1–6
  selectedIncomeCategories: Set<string> | null; // null = all
  selectedExpenseCategories: Set<string> | null; // null = all
  customRange?: CustomRange;
}

interface AggResult {
  selected: Map<string, number>;   // categories the user has selected
  filteredOut: number;              // total of deselected categories
}

/** Aggregate rows for the given set of months, grouped at the requested depth. */
function aggregateByDepth(
  rows: MonthlyExpenseByCategory[],
  months: Set<string>,
  depth: number,
  selected: Set<string> | null,
): AggResult {
  const totals = new Map<string, number>();
  let filteredOut = 0;

  for (const row of rows) {
    if (!months.has(row.month)) continue;

    const parts = row.pathParts.slice(0, depth);
    const key = parts.join(":");

    if (selected && !selected.has(parts[0])) {
      filteredOut += row.amount;
      continue;
    }

    totals.set(key, (totals.get(key) ?? 0) + row.amount);
  }

  return { selected: totals, filteredOut };
}

export function buildSankeyData(opts: BuildOptions): SankeyData {
  const { period, depth, incomeCategoryColors, expenseCategoryColors } = opts;
  const months = getMonthsForPeriod(opts.cashFlowSeries, period, opts.customRange);

  // Aggregate ALL categories (ignoring selection filter) to get true totals
  const incomeAll = aggregateByDepth(opts.incomeByCategory, months, depth, null);
  const expenseAll = aggregateByDepth(opts.expenseByCategory, months, depth, null);

  // Totals derived from the category data itself — this ensures the Sankey
  // always balances (inflows = outflows at every node).
  const totalIncome = Array.from(incomeAll.selected.values()).reduce((a, b) => a + b, 0);
  const totalExpenses = Array.from(expenseAll.selected.values()).reduce((a, b) => a + b, 0);
  const netCashFlow = totalIncome - totalExpenses;

  // Now aggregate with the user's category selection applied
  const incomeResult = aggregateByDepth(opts.incomeByCategory, months, depth, opts.selectedIncomeCategories);
  const expenseResult = aggregateByDepth(opts.expenseByCategory, months, depth, opts.selectedExpenseCategories);

  const categoryIncomeTotal = Array.from(incomeResult.selected.values()).reduce((a, b) => a + b, 0);
  const categoryExpenseTotal = Array.from(expenseResult.selected.values()).reduce((a, b) => a + b, 0);
  const incomeRemainder = totalIncome - categoryIncomeTotal;
  const expenseRemainder = totalExpenses - categoryExpenseTotal;

  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  // Income category nodes + links to "Total Income"
  for (const [category, amount] of incomeResult.selected) {
    if (amount <= 0) continue;
    const topLevel = category.split(":")[0];
    const color = incomeCategoryColors[topLevel] ?? INCOME_NODE_COLOR;
    const nodeId = `income:${category}`;
    nodes.push({ id: nodeId, label: category.split(":").pop()!, color });
    links.push({
      source: nodeId,
      target: "total-income",
      value: amount,
      sourceColor: color,
    });
  }

  // "Other Income" node for filtered-out categories + any query discrepancy
  if (incomeRemainder > 0) {
    nodes.push({ id: "income:__other__", label: "Other Income", color: FILTERED_OUT_COLOR });
    links.push({
      source: "income:__other__",
      target: "total-income",
      value: incomeRemainder,
      sourceColor: FILTERED_OUT_COLOR,
    });
  }

  // Total Income node (column 1)
  nodes.push({ id: "total-income", label: "Total Income", color: TOTAL_INCOME_COLOR, depth: 1 });

  // Total Expenses node (column 2)
  nodes.push({ id: "total-expenses", label: "Total Expenses", color: TOTAL_EXPENSE_COLOR, depth: 2 });

  // Expense category nodes + links from "Total Expenses"
  for (const [category, amount] of expenseResult.selected) {
    if (amount <= 0) continue;
    const topLevel = category.split(":")[0];
    const color = expenseCategoryColors[topLevel] ?? EXPENSE_NODE_COLOR;
    const nodeId = `expense:${category}`;
    nodes.push({ id: nodeId, label: category.split(":").pop()!, color });
    links.push({
      source: "total-expenses",
      target: nodeId,
      value: amount,
      sourceColor: TOTAL_EXPENSE_COLOR,
    });
  }

  // "Other Expenses" node for filtered-out categories + any query discrepancy
  if (expenseRemainder > 0) {
    nodes.push({ id: "expense:__other__", label: "Other Expenses", color: FILTERED_OUT_COLOR });
    links.push({
      source: "total-expenses",
      target: "expense:__other__",
      value: expenseRemainder,
      sourceColor: FILTERED_OUT_COLOR,
    });
  }

  // Link from Total Income → Total Expenses (the main flow)
  if (totalExpenses > 0 && totalIncome > 0) {
    const flowAmount = Math.min(totalIncome, totalExpenses);
    links.push({
      source: "total-income",
      target: "total-expenses",
      value: flowAmount,
      sourceColor: TOTAL_INCOME_COLOR,
    });
  }

  // Balancing node: positive or negative cash flow
  // Placed at depth 2 (same column as Total Expenses) so it aligns visually
  if (netCashFlow > 0) {
    nodes.push({ id: "net-cashflow", label: "Positive Cash Flow", color: POSITIVE_CASHFLOW_COLOR, depth: 2 });
    links.push({
      source: "total-income",
      target: "net-cashflow",
      value: netCashFlow,
      sourceColor: POSITIVE_CASHFLOW_COLOR,
    });
  } else if (netCashFlow < 0) {
    nodes.push({ id: "net-cashflow", label: "Negative Cash Flow", color: NEGATIVE_CASHFLOW_COLOR, depth: 1 });
    links.push({
      source: "net-cashflow",
      target: "total-expenses",
      value: Math.abs(netCashFlow),
      sourceColor: NEGATIVE_CASHFLOW_COLOR,
    });
  }

  return { nodes, links };
}

// ── ECharts format converter ──────────────────────────────────────────

export interface EChartsSankeyNode {
  name: string;
  label: string;
  itemStyle: { color: string };
  depth?: number;
}

export interface EChartsSankeyData {
  nodes: EChartsSankeyNode[];
  links: Array<{ source: string; target: string; value: number; lineStyle: { color: string } }>;
}

export function toEChartsFormat(
  data: SankeyData,
  linkColorMode: LinkColorMode,
  greyColor: string,
): EChartsSankeyData {
  return {
    nodes: data.nodes.map((n) => ({
      name: n.id,
      label: n.label,
      itemStyle: { color: n.color },
      ...(n.depth !== undefined ? { depth: n.depth } : {}),
    })),
    links: data.links.map((l) => ({
      source: l.source,
      target: l.target,
      value: l.value,
      lineStyle: { color: resolveLinkColor(l, linkColorMode, greyColor) },
    })),
  };
}

// ── Build Cash Flow Sankey (Inflow → Outflow) ────────────────────────

interface CashFlowBuildOptions {
  inflowByCategory: MonthlyExpenseByCategory[];
  outflowByCategory: MonthlyExpenseByCategory[];
  cashFlowSeries: MonthlyCashFlow[];
  inflowCategoryColors: Record<string, string>;
  outflowCategoryColors: Record<string, string>;
  period: SankeyPeriod;
  depth: number;
  selectedInflowCategories: Set<string> | null;
  selectedOutflowCategories: Set<string> | null;
  customRange?: CustomRange;
}

/**
 * Build Sankey data for cash flow (inflow → outflow) visualization.
 * Unlike `buildSankeyData` which shows income→expenses, this shows actual
 * cash movements through BANK/CASH accounts grouped by counterparty category.
 * Structure: inflow sources → "Total Inflow" → "Total Outflow" → outflow destinations,
 * with a surplus/deficit node for the balance.
 */
export function buildCashFlowSankeyData(opts: CashFlowBuildOptions): SankeyData {
  const { period, depth, inflowCategoryColors, outflowCategoryColors } = opts;
  const months = getMonthsForPeriod(opts.cashFlowSeries, period, opts.customRange);

  const inflowAll = aggregateByDepth(opts.inflowByCategory, months, depth, null);
  const outflowAll = aggregateByDepth(opts.outflowByCategory, months, depth, null);

  const totalInflow = Array.from(inflowAll.selected.values()).reduce((a, b) => a + b, 0);
  const totalOutflow = Array.from(outflowAll.selected.values()).reduce((a, b) => a + b, 0);
  const netCashFlow = totalInflow - totalOutflow;

  const inflowResult = aggregateByDepth(opts.inflowByCategory, months, depth, opts.selectedInflowCategories);
  const outflowResult = aggregateByDepth(opts.outflowByCategory, months, depth, opts.selectedOutflowCategories);

  const categoryInflowTotal = Array.from(inflowResult.selected.values()).reduce((a, b) => a + b, 0);
  const categoryOutflowTotal = Array.from(outflowResult.selected.values()).reduce((a, b) => a + b, 0);
  const inflowRemainder = totalInflow - categoryInflowTotal;
  const outflowRemainder = totalOutflow - categoryOutflowTotal;

  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  // Inflow category nodes → "Total Inflow"
  for (const [category, amount] of inflowResult.selected) {
    if (amount <= 0) continue;
    const topLevel = category.split(":")[0];
    const color = inflowCategoryColors[topLevel] ?? INCOME_NODE_COLOR;
    const nodeId = `inflow:${category}`;
    nodes.push({ id: nodeId, label: category.split(":").pop()!, color });
    links.push({ source: nodeId, target: "total-inflow", value: amount, sourceColor: color });
  }

  if (inflowRemainder > 0) {
    nodes.push({ id: "inflow:__other__", label: "Other Inflows", color: FILTERED_OUT_COLOR });
    links.push({ source: "inflow:__other__", target: "total-inflow", value: inflowRemainder, sourceColor: FILTERED_OUT_COLOR });
  }

  nodes.push({ id: "total-inflow", label: "Total Inflow", color: TOTAL_INCOME_COLOR, depth: 1 });
  nodes.push({ id: "total-outflow", label: "Total Outflow", color: TOTAL_EXPENSE_COLOR, depth: 2 });

  // "Total Outflow" → outflow category nodes
  for (const [category, amount] of outflowResult.selected) {
    if (amount <= 0) continue;
    const topLevel = category.split(":")[0];
    const color = outflowCategoryColors[topLevel] ?? EXPENSE_NODE_COLOR;
    const nodeId = `outflow:${category}`;
    nodes.push({ id: nodeId, label: category.split(":").pop()!, color });
    links.push({ source: "total-outflow", target: nodeId, value: amount, sourceColor: TOTAL_EXPENSE_COLOR });
  }

  if (outflowRemainder > 0) {
    nodes.push({ id: "outflow:__other__", label: "Other Outflows", color: FILTERED_OUT_COLOR });
    links.push({ source: "total-outflow", target: "outflow:__other__", value: outflowRemainder, sourceColor: FILTERED_OUT_COLOR });
  }

  // Main flow: Total Inflow → Total Outflow
  if (totalOutflow > 0 && totalInflow > 0) {
    links.push({
      source: "total-inflow",
      target: "total-outflow",
      value: Math.min(totalInflow, totalOutflow),
      sourceColor: TOTAL_INCOME_COLOR,
    });
  }

  // Net cash flow balance node
  if (netCashFlow > 0) {
    nodes.push({ id: "net-cashflow", label: "Cash Surplus", color: POSITIVE_CASHFLOW_COLOR, depth: 2 });
    links.push({ source: "total-inflow", target: "net-cashflow", value: netCashFlow, sourceColor: POSITIVE_CASHFLOW_COLOR });
  } else if (netCashFlow < 0) {
    nodes.push({ id: "net-cashflow", label: "Cash Deficit", color: NEGATIVE_CASHFLOW_COLOR, depth: 1 });
    links.push({ source: "net-cashflow", target: "total-outflow", value: Math.abs(netCashFlow), sourceColor: NEGATIVE_CASHFLOW_COLOR });
  }

  return { nodes, links };
}

// ── Extract unique top-level categories ───────────────────────────────

export function getTopLevelCategories(rows: MonthlyExpenseByCategory[]): string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.pathParts.length > 0) seen.add(row.pathParts[0]);
  }
  return Array.from(seen).sort();
}
