"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboard } from "@/lib/dashboard-context";
import type {
  AccountNode,
  BudgetInfo,
  BudgetPeriodType,
  RawBudgetCell,
} from "@/lib/types/gnucash";
import { ArrowLeft, AlertTriangle, ChevronDown, ChevronRight, Save, Target, Trash2 } from "lucide-react";

/**
 * Inline budget editor: set any budget amount for any EXPENSE or INCOME
 * account, for any period. No modals — each cell is a direct input that
 * writes through on blur. Parent accounts left blank show a greyed rollup
 * from their children; a parent with an explicit amount that differs from
 * its children's sum is flagged with an imbalance warning, mirroring the
 * existing /cash-flow read-only view.
 *
 * URL: /special-functions/budgets/edit?guid=<budgetGuid>
 *
 * Intentionally a search-param route, not a dynamic `[guid]` segment: static
 * export needs every dynamic route pre-listed by `generateStaticParams`, and
 * the guids here are only known client-side (they live in the user's OPFS
 * book). A flat route with a query param sidesteps the issue entirely.
 */

const PERIOD_TYPE_OPTIONS: { value: BudgetPeriodType; label: string }[] = [
  { value: "day", label: "day" },
  { value: "week", label: "week" },
  { value: "month", label: "month" },
  { value: "year", label: "year" },
];

const MONTH_LABELS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Turn a budget's recurrence shape into an array of column labels. The
 * goal is human-readable, not machine-parsable — GnuCash desktop uses
 * equivalent short labels in its budget window.
 */
function buildPeriodLabels(budget: BudgetInfo): string[] {
  const start = budget.recurrenceStart;
  const startDate = start && /^\d{4}-\d{2}-\d{2}$/.test(start)
    ? new Date(`${start}T00:00:00`)
    : null;
  const labels: string[] = [];
  for (let i = 0; i < budget.numPeriods; i++) {
    if (!startDate) {
      labels.push(`Period ${i + 1}`);
      continue;
    }
    const d = new Date(startDate);
    switch (budget.periodType) {
      case "day":
        d.setDate(d.getDate() + i * budget.recurrenceMult);
        labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        break;
      case "week":
        d.setDate(d.getDate() + i * 7 * budget.recurrenceMult);
        labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
        break;
      case "month":
        d.setMonth(d.getMonth() + i * budget.recurrenceMult);
        if (budget.recurrenceMult === 3) {
          labels.push(`Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`);
        } else if (budget.recurrenceMult === 1) {
          labels.push(`${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`);
        } else {
          labels.push(`${MONTH_LABELS[d.getMonth()]} ${d.getFullYear()}`);
        }
        break;
      case "year":
        d.setFullYear(d.getFullYear() + i * budget.recurrenceMult);
        labels.push(`${d.getFullYear()}`);
        break;
    }
  }
  return labels;
}

interface FlatRow {
  node: AccountNode;
  depth: number;
  isIncomeSection: boolean;
  /** True if the account has at least one EXPENSE/INCOME child in the tree. */
  hasBudgetableChildren: boolean;
}


/**
 * Flatten an account tree into a depth-indexed list, keeping only EXPENSE
 * and INCOME subtrees (matching the read-side filter in `computeBudgetData`).
 * Placeholders are included — a GnuCash budget can legally target a
 * placeholder account as a roll-up destination.
 *
 * `expandedGuids` controls which parents reveal their children; a parent
 * whose guid is absent from the set is collapsed and its descendants are
 * elided from the output. The top-level EXPENSE / INCOME container rows
 * are always included so the user can see the two sections even when
 * everything is fully collapsed.
 */
/**
 * `expandedGuids = null` flattens every budgetable account (used when
 * computing rollups that must see the full tree regardless of the user's
 * collapse choices); passing a Set only reveals children of parents whose
 * guid is in the set.
 */
function flattenBudgetableAccounts(
  nodes: AccountNode[],
  expandedGuids: Set<string> | null,
): FlatRow[] {
  const out: FlatRow[] = [];

  function walk(node: AccountNode, depth: number, isIncomeSection: boolean) {
    if (node.type !== "EXPENSE" && node.type !== "INCOME") {
      // Descend through ROOT / TRADING to find the EXPENSE and INCOME
      // subtrees; skip the rest of the chart of accounts.
      for (const c of node.children) walk(c, depth, c.type === "INCOME");
      return;
    }
    const hasChildren = node.children.some(
      (c) => c.type === "EXPENSE" || c.type === "INCOME",
    );
    out.push({ node, depth, isIncomeSection, hasBudgetableChildren: hasChildren });
    if (!hasChildren) return;
    if (expandedGuids !== null && !expandedGuids.has(node.guid)) return;
    for (const c of node.children) walk(c, depth + 1, isIncomeSection);
  }

  for (const n of nodes) walk(n, 0, n.type === "INCOME");
  return out;
}

function cellKey(accountGuid: string, periodNum: number) {
  return `${accountGuid}|${periodNum}`;
}

function parseDecimal(value: string): { num: number; denom: number } | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const match = /^(-?)(\d+)(?:\.(\d+))?$/.exec(trimmed);
  if (!match) return null;
  const sign = match[1] === "-" ? -1 : 1;
  const intPart = match[2];
  const fracPart = match[3] ?? "";
  const denom = 10 ** fracPart.length || 1;
  const num = sign * (parseInt(intPart) * denom + (fracPart ? parseInt(fracPart) : 0));
  return { num, denom };
}

function formatAmount(num: number, denom: number): string {
  if (denom === 0) return "";
  const v = num / denom;
  // Preserve the stored decimal scale: denom=100 ⇒ 2dp, denom=1000 ⇒ 3dp, etc.
  const scale = Math.max(0, Math.round(Math.log10(denom)));
  return v.toFixed(scale);
}

export default function BudgetEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const budgetGuid = searchParams.get("guid") ?? "";
  const {
    data,
    isWritable,
    updateBudget,
    deleteBudget,
    setBudgetAmount,
    clearBudgetAmount,
  } = useDashboard();

  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  // Tracks which parent accounts are currently expanded in the grid.
  // Default is fully collapsed — the user sees top-level EXPENSE/INCOME
  // containers with their child rollups, and clicks a chevron to drill in.
  const [expandedGuids, setExpandedGuids] = useState<Set<string>>(() => new Set());
  const toggleExpanded = useCallback((guid: string) => {
    setExpandedGuids((prev) => {
      const next = new Set(prev);
      if (next.has(guid)) next.delete(guid);
      else next.add(guid);
      return next;
    });
  }, []);

  const budget = data?.budgetData?.budgets.find((b) => b.guid === budgetGuid);
  const rawCells: RawBudgetCell[] = useMemo(
    () => data?.budgetData?.rawAmountsByBudget[budgetGuid] ?? [],
    [data, budgetGuid],
  );

  // Amounts indexed by accountGuid|periodNum for O(1) cell lookup.
  const amounts = useMemo(() => {
    const m = new Map<string, { num: number; denom: number }>();
    for (const c of rawCells) {
      m.set(cellKey(c.accountGuid, c.periodNum), { num: c.amountNum, denom: c.amountDenom });
    }
    return m;
  }, [rawCells]);

  // Every budgetable account, regardless of expansion — used as input to
  // the rollup computation so that a collapsed parent's placeholder value
  // doesn't disappear when its children are hidden from the grid.
  const allBudgetableAccounts = useMemo(
    () => (data ? flattenBudgetableAccounts(data.accounts, null) : []),
    [data],
  );

  // The visible subset — applies the user's expand/collapse choices.
  const flatAccounts = useMemo(
    () => (data ? flattenBudgetableAccounts(data.accounts, expandedGuids) : []),
    [data, expandedGuids],
  );

  // For each (parent, period), sum the explicit amounts of all descendants.
  // Used to render greyed rollup placeholders and to flag imbalance when a
  // parent has its own explicit amount that differs from the child sum.
  const rollup = useMemo(() => {
    if (!data) return new Map<string, number>();
    // Build descendantsOf for every account in the full budgetable list.
    const byGuid = new Map<string, AccountNode>();
    function collect(n: AccountNode) {
      byGuid.set(n.guid, n);
      for (const c of n.children) collect(c);
    }
    for (const n of data.accounts) collect(n);

    const descendantsOf = new Map<string, string[]>();
    function getDescendants(guid: string): string[] {
      const cached = descendantsOf.get(guid);
      if (cached) return cached;
      const n = byGuid.get(guid);
      if (!n) return [];
      const out: string[] = [];
      for (const c of n.children) {
        out.push(c.guid, ...getDescendants(c.guid));
      }
      descendantsOf.set(guid, out);
      return out;
    }

    const out = new Map<string, number>();
    const numPeriods = budget?.numPeriods ?? 0;
    for (const { node } of allBudgetableAccounts) {
      const descendants = getDescendants(node.guid);
      if (descendants.length === 0) continue;
      for (let p = 0; p < numPeriods; p++) {
        let sum = 0;
        for (const d of descendants) {
          const explicit = amounts.get(cellKey(d, p));
          if (explicit) sum += explicit.num / explicit.denom;
        }
        if (sum !== 0) out.set(cellKey(node.guid, p), sum);
      }
    }
    return out;
  }, [data, allBudgetableAccounts, amounts, budget?.numPeriods]);

  const periodLabels = useMemo(
    () => (budget ? buildPeriodLabels(budget) : []),
    [budget],
  );

  // ── Meta form local state ─────────────────────────────────────────
  const [metaName, setMetaName] = useState("");
  const [metaDescription, setMetaDescription] = useState("");
  const [metaPeriodType, setMetaPeriodType] = useState<BudgetPeriodType>("month");
  const [metaMult, setMetaMult] = useState(1);
  const [metaNumPeriods, setMetaNumPeriods] = useState(12);
  const [metaStart, setMetaStart] = useState("");
  // Hydrate the meta form whenever the budget changes. Using a useMemo to
  // detect first-load vs. user-edit would over-complicate things; a plain
  // reset-on-identity-change keyed on budget.guid is clearer.
  const [hydratedForGuid, setHydratedForGuid] = useState<string | null>(null);
  if (budget && hydratedForGuid !== budget.guid) {
    setMetaName(budget.name);
    setMetaDescription(budget.description);
    setMetaPeriodType(budget.periodType);
    setMetaMult(budget.recurrenceMult);
    setMetaNumPeriods(budget.numPeriods);
    setMetaStart(budget.recurrenceStart);
    setHydratedForGuid(budget.guid);
  }

  const handleSaveMeta = useCallback(async () => {
    if (!budget) return;
    if (!metaName.trim()) {
      setError("Budget name is required");
      return;
    }
    setSavingMeta(true);
    try {
      await updateBudget({
        budgetGuid: budget.guid,
        name: metaName.trim(),
        description: metaDescription.trim(),
        periodType: metaPeriodType,
        recurrenceMult: metaMult,
        numPeriods: metaNumPeriods,
        recurrenceStart: metaStart,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingMeta(false);
    }
  }, [budget, metaName, metaDescription, metaPeriodType, metaMult, metaNumPeriods, metaStart, updateBudget]);

  const handleCellCommit = useCallback(
    async (accountGuid: string, periodNum: number, raw: string) => {
      if (!budget) return;
      const parsed = parseDecimal(raw);
      try {
        if (parsed === null) {
          await clearBudgetAmount({ budgetGuid: budget.guid, accountGuid, periodNum });
        } else {
          await setBudgetAmount({
            budgetGuid: budget.guid,
            accountGuid,
            periodNum,
            amountNum: parsed.num,
            amountDenom: parsed.denom,
          });
        }
      } catch (err) {
        setError((err as Error).message);
      }
    },
    [budget, clearBudgetAmount, setBudgetAmount],
  );

  const handleDelete = useCallback(async () => {
    if (!budget) return;
    try {
      await deleteBudget({ budgetGuid: budget.guid });
      router.push("/special-functions/budgets");
    } catch (err) {
      setError((err as Error).message);
      setConfirmingDelete(false);
    }
  }, [budget, deleteBudget, router]);

  if (!data) return null;

  if (!budget) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <BreadcrumbBar />
        <Card>
          <CardContent className="p-6 text-sm text-[#6F767E]">
            Budget not found. It may have been deleted in another session.
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!isWritable) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <BreadcrumbBar />
        <Card>
          <CardContent className="p-6 text-sm text-[#6F767E]">
            Budget editing requires the database to be open in editing mode.
            Click the
            <span className="mx-1 font-medium text-[#3B6B8A]">Read-only</span>
            button in the top bar to enable editing.
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1400px] space-y-4">
      <BreadcrumbBar />

      <header className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-1 rounded-lg bg-[#6C9B8B]/10 p-2 text-[#6C9B8B]">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[#1A1D1F]">{budget.name}</h1>
            <p className="mt-1 text-sm text-[#6F767E]">
              Set amounts in each account&apos;s own commodity. Blank cells on
              parent accounts auto-sum from their children.
            </p>
          </div>
        </div>
        <button
          onClick={() => setConfirmingDelete(true)}
          className="flex items-center gap-1.5 rounded-lg border border-[#C86A6A]/30 px-3 py-1.5 text-sm font-medium text-[#C86A6A] hover:bg-[#C86A6A]/10"
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </button>
      </header>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* ── Metadata section ────────────────────────────────────── */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-medium text-[#6F767E]">
              Name
              <input
                type="text"
                value={metaName}
                onChange={(e) => setMetaName(e.target.value)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-[#1A1D1F]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[#6F767E] sm:col-span-2">
              Description
              <input
                type="text"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-[#1A1D1F]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[#6F767E]">
              Period type
              <select
                value={metaPeriodType}
                onChange={(e) => setMetaPeriodType(e.target.value as BudgetPeriodType)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-[#1A1D1F]"
              >
                {PERIOD_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[#6F767E]">
              Every N {metaPeriodType}s
              <input
                type="number"
                min={1}
                value={metaMult}
                onChange={(e) => setMetaMult(Math.max(1, parseInt(e.target.value) || 1))}
                className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-[#1A1D1F]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[#6F767E]">
              Number of periods
              <input
                type="number"
                min={1}
                value={metaNumPeriods}
                onChange={(e) => setMetaNumPeriods(Math.max(1, parseInt(e.target.value) || 1))}
                className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-[#1A1D1F]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-[#6F767E]">
              First period starts
              <input
                type="date"
                value={metaStart}
                onChange={(e) => setMetaStart(e.target.value)}
                className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-[#1A1D1F]"
              />
            </label>
          </div>
          <div className="mt-3 flex items-center justify-end">
            <button
              onClick={handleSaveMeta}
              disabled={savingMeta}
              className="flex items-center gap-1.5 rounded-lg bg-[#6C9B8B] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#5A8475] disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {savingMeta ? "Saving…" : "Save metadata"}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* ── Grid ────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#FAFAFA] text-xs uppercase tracking-wide text-[#9A9FA5]">
                  <th className="sticky left-0 z-10 bg-[#FAFAFA] px-4 py-3 text-left">
                    Account
                  </th>
                  {periodLabels.map((label, i) => (
                    <th key={i} className="px-2 py-3 text-right font-medium">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {flatAccounts.map(({ node, depth, isIncomeSection, hasBudgetableChildren }) => (
                  <BudgetRow
                    key={node.guid}
                    node={node}
                    depth={depth}
                    isIncomeSection={isIncomeSection}
                    hasBudgetableChildren={hasBudgetableChildren}
                    isExpanded={expandedGuids.has(node.guid)}
                    onToggleExpanded={toggleExpanded}
                    numPeriods={budget.numPeriods}
                    amounts={amounts}
                    rollup={rollup}
                    onCommit={handleCellCommit}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {confirmingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-5">
              <h3 className="text-base font-semibold text-[#1A1D1F]">Delete budget?</h3>
              <p className="mt-2 text-sm text-[#6F767E]">
                This removes the budget and every amount row attached to it.
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-[#6F767E] hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  className="rounded-lg bg-[#C86A6A] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#B45555]"
                >
                  Delete
                </button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function BreadcrumbBar() {
  return (
    <div className="flex items-center text-sm text-[#6F767E]">
      <Link
        href="/special-functions/budgets"
        className="flex items-center gap-1 hover:text-[#1A1D1F]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to budgets
      </Link>
    </div>
  );
}

/**
 * One row in the grid. Each cell is an uncontrolled input keyed by
 * `${accountGuid}|${periodNum}` — the input's `defaultValue` is re-keyed
 * whenever the underlying amount changes, so an external mutation (another
 * tab editing the same book, a meta update that drops a period) resets the
 * visible value. Writes happen on blur; changes propagate back through the
 * dashboard context and the parent recomputes `amounts` + `rollup`.
 */
function BudgetRow({
  node,
  depth,
  isIncomeSection,
  hasBudgetableChildren,
  isExpanded,
  onToggleExpanded,
  numPeriods,
  amounts,
  rollup,
  onCommit,
}: {
  node: AccountNode;
  depth: number;
  isIncomeSection: boolean;
  hasBudgetableChildren: boolean;
  isExpanded: boolean;
  onToggleExpanded: (guid: string) => void;
  numPeriods: number;
  amounts: Map<string, { num: number; denom: number }>;
  rollup: Map<string, number>;
  onCommit: (accountGuid: string, periodNum: number, raw: string) => void;
}) {
  // `hasChildren` below drives the imbalance badge — uses the generic
  // AccountNode check (not just budgetable children) because a parent with
  // a non-EXPENSE child still has a rollup to reconcile against. In
  // practice the two agree for EXPENSE/INCOME subtrees.
  const hasChildren = node.children.length > 0;
  return (
    <tr className="border-b border-[#F4F4F4] last:border-b-0">
      <td
        className="sticky left-0 z-10 whitespace-nowrap bg-white px-4 py-2"
        style={{ paddingLeft: 16 + depth * 20 }}
      >
        {hasBudgetableChildren ? (
          <button
            onClick={() => onToggleExpanded(node.guid)}
            className="mr-1 inline-flex h-4 w-4 items-center justify-center rounded text-[#6F767E] hover:bg-[#EFEFEF] hover:text-[#1A1D1F] align-middle"
            title={isExpanded ? "Collapse" : "Expand"}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </button>
        ) : (
          <span className="mr-1 inline-block h-4 w-4 align-middle" />
        )}
        <span className={`${depth === 0 ? "font-semibold text-[#1A1D1F]" : "text-[#1A1D1F]"}`}>
          {node.name}
        </span>
        <span className="ml-2 text-xs text-[#9A9FA5]">
          {isIncomeSection ? "INCOME" : "EXPENSE"} · {node.commodityMnemonic}
        </span>
      </td>
      {Array.from({ length: numPeriods }).map((_, p) => {
        const key = cellKey(node.guid, p);
        const explicit = amounts.get(key);
        const rollupVal = rollup.get(key);
        const hasImbalance = !!explicit && hasChildren && rollupVal !== undefined && Math.abs(explicit.num / explicit.denom - rollupVal) > 1e-9;
        const placeholder = !explicit && hasChildren && rollupVal !== undefined
          ? rollupVal.toFixed(2)
          : "";
        // Re-key the input whenever the stored value changes so the DOM
        // default value tracks external mutations (e.g. deleting a row,
        // switching budgets). Without this, the input keeps the user's last
        // typed value after a server-side clear.
        const inputKey = explicit ? `${key}:${explicit.num}:${explicit.denom}` : `${key}:empty`;
        return (
          <td key={p} className="px-1 py-1">
            <div className="relative">
              <input
                key={inputKey}
                type="text"
                inputMode="decimal"
                defaultValue={explicit ? formatAmount(explicit.num, explicit.denom) : ""}
                placeholder={placeholder}
                onBlur={(e) => {
                  const raw = e.currentTarget.value;
                  const prev = explicit ? formatAmount(explicit.num, explicit.denom) : "";
                  if (raw.trim() === prev.trim()) return;
                  onCommit(node.guid, p, raw);
                }}
                className={`w-24 rounded border px-1.5 py-1 text-right text-sm ${
                  hasImbalance
                    ? "border-amber-400 bg-amber-50 text-amber-900"
                    : explicit
                    ? "border-border text-[#1A1D1F]"
                    : "border-transparent bg-transparent text-[#BDBDBD] hover:border-border hover:bg-white focus:border-border focus:bg-white focus:text-[#1A1D1F]"
                }`}
              />
              {hasImbalance && (
                <span
                  className="pointer-events-none absolute -right-0.5 -top-0.5"
                  title={`Children sum to ${rollupVal?.toFixed(2)} — differs from this parent's explicit amount`}
                >
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                </span>
              )}
            </div>
          </td>
        );
      })}
    </tr>
  );
}
