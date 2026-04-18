"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboard } from "@/lib/dashboard-context";
import type { BudgetInfo, BudgetPeriodType } from "@/lib/types/gnucash";
import { ArrowLeft, Pencil, Plus, Target, Trash2, X } from "lucide-react";

/**
 * Budgets list view under /special-functions.
 *
 * Each row represents one GnuCash budget (guid + name + description + the
 * attached `recurrences` row describing its period shape). Creating a new
 * budget is done through an inline expander at the foot of the table — no
 * modals, per the project's no-modal-for-entry convention — and the user is
 * immediately navigated into the per-account editor on success. Edit and
 * Delete are per-row controls; edit navigates into the same editor, delete
 * removes the budget + its amounts + recurrence row after a confirm.
 */

const PERIOD_TYPE_OPTIONS: { value: BudgetPeriodType; label: string }[] = [
  { value: "day", label: "day" },
  { value: "week", label: "week" },
  { value: "month", label: "month" },
  { value: "year", label: "year" },
];

function formatPeriodSummary(b: BudgetInfo): string {
  const unit = b.recurrenceMult === 1 ? b.periodType : `${b.recurrenceMult} ${b.periodType}s`;
  const periodWord = b.numPeriods === 1 ? "period" : "periods";
  const start = b.recurrenceStart || "—";
  return `${b.numPeriods} ${periodWord} of 1 ${unit} starting ${start}`;
}

function BreadcrumbBar() {
  return (
    <div className="flex items-center text-sm text-[#6F767E]">
      <Link
        href="/special-functions"
        className="flex items-center gap-1 hover:text-[#1A1D1F]"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to special functions
      </Link>
    </div>
  );
}

export default function BudgetsListPage() {
  const { data, isWritable, deleteBudget } = useDashboard();
  const [deletingGuid, setDeletingGuid] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!data) return null;

  const budgets = data.budgetData?.budgets ?? [];

  async function handleDelete(guid: string) {
    try {
      await deleteBudget({ budgetGuid: guid });
      setDeletingGuid(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (!isWritable) {
    return (
      <div className="mx-auto max-w-4xl space-y-4">
        <BreadcrumbBar />
        <header className="flex items-start gap-3">
          <div className="mt-1 rounded-lg bg-[#6C9B8B]/10 p-2 text-[#6C9B8B]">
            <Target className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-[#1A1D1F]">Budgets</h1>
            <p className="mt-1 text-sm text-[#6F767E]">
              Budget editing requires the database to be open in editing mode.
              Click the
              <span className="mx-1 font-medium text-[#3B6B8A]">Read-only</span>
              button in the top bar to enable editing.
            </p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <BreadcrumbBar />

      <header className="flex items-start gap-3">
        <div className="mt-1 rounded-lg bg-[#6C9B8B]/10 p-2 text-[#6C9B8B]">
          <Target className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1D1F]">Budgets</h1>
          <p className="mt-1 text-sm text-[#6F767E]">
            Create budgets against any EXPENSE or INCOME account. Parent accounts
            auto-sum from their children when left blank, and cells where the
            parent&apos;s explicit total differs from the children are flagged.
          </p>
        </div>
      </header>

      {error && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {budgets.length === 0 && !showNewForm && (
            <div className="p-8 text-center text-sm text-[#6F767E]">
              No budgets defined yet. Use the button below to create one.
            </div>
          )}

          {budgets.length > 0 && (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#EFEFEF] text-left text-xs uppercase tracking-wide text-[#9A9FA5]">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Description</th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3 w-24" />
                </tr>
              </thead>
              <tbody>
                {budgets.map((b) => (
                  <tr key={b.guid} className="border-b border-[#F4F4F4] last:border-b-0">
                    <td className="px-4 py-3 font-medium text-[#1A1D1F]">{b.name}</td>
                    <td className="px-4 py-3 text-[#6F767E]">
                      {b.description || <span className="text-[#BDBDBD]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-[#6F767E]">{formatPeriodSummary(b)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/special-functions/budgets/edit?guid=${b.guid}`}
                          className="rounded p-1.5 text-[#3B6B8A] hover:bg-[#3B6B8A]/10"
                          title="Edit budget"
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                        <button
                          onClick={() => setDeletingGuid(b.guid)}
                          className="rounded p-1.5 text-[#C86A6A] hover:bg-[#C86A6A]/10"
                          title="Delete budget"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {!showNewForm ? (
        <button
          onClick={() => setShowNewForm(true)}
          className="flex items-center gap-2 rounded-lg border border-dashed border-[#6C9B8B]/40 bg-[#6C9B8B]/5 px-4 py-3 text-sm font-medium text-[#6C9B8B] hover:bg-[#6C9B8B]/10"
        >
          <Plus className="h-4 w-4" />
          New budget
        </button>
      ) : (
        <NewBudgetRow
          onCancel={() => setShowNewForm(false)}
          onCreated={() => setShowNewForm(false)}
          onError={setError}
        />
      )}

      {deletingGuid && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <Card className="w-full max-w-md">
            <CardContent className="p-5">
              <h3 className="text-base font-semibold text-[#1A1D1F]">Delete budget?</h3>
              <p className="mt-2 text-sm text-[#6F767E]">
                This removes the budget and every amount row attached to it.
                Actuals and transactions are unaffected.
              </p>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  onClick={() => setDeletingGuid(null)}
                  className="rounded-lg border border-border px-3 py-1.5 text-sm text-[#6F767E] hover:bg-muted"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deletingGuid)}
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

/**
 * Inline "new budget" entry row. Appears below the list when toggled; hides
 * itself on successful save and navigates the user into the per-account
 * editor for the freshly-created budget.
 */
function NewBudgetRow({
  onCancel,
  onCreated,
  onError,
}: {
  onCancel: () => void;
  onCreated: () => void;
  onError: (msg: string) => void;
}) {
  const router = useRouter();
  const { createBudget } = useDashboard();
  const currentYear = new Date().getFullYear();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [periodType, setPeriodType] = useState<BudgetPeriodType>("month");
  const [recurrenceMult, setRecurrenceMult] = useState(1);
  const [numPeriods, setNumPeriods] = useState(12);
  const [recurrenceStart, setRecurrenceStart] = useState(`${currentYear}-01-01`);
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    if (!name.trim()) {
      onError("Budget name is required");
      return;
    }
    setSaving(true);
    try {
      const budgetGuid = await createBudget({
        name: name.trim(),
        description: description.trim(),
        numPeriods,
        periodType,
        recurrenceMult,
        recurrenceStart,
      });
      onCreated();
      router.push(`/special-functions/budgets/edit?guid=${budgetGuid}`);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardContent className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-[#1A1D1F]">New budget</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-xs font-medium text-[#6F767E]">
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="2026 Budget"
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-[#1A1D1F]"
              autoFocus
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[#6F767E]">
            Description
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Annual household budget"
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-[#1A1D1F]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[#6F767E]">
            Period type
            <select
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value as BudgetPeriodType)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-[#1A1D1F]"
            >
              {PERIOD_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[#6F767E]">
            Every N {periodType}s (multiplier)
            <input
              type="number"
              min={1}
              value={recurrenceMult}
              onChange={(e) => setRecurrenceMult(Math.max(1, parseInt(e.target.value) || 1))}
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-[#1A1D1F]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[#6F767E]">
            Number of periods
            <input
              type="number"
              min={1}
              value={numPeriods}
              onChange={(e) => setNumPeriods(Math.max(1, parseInt(e.target.value) || 1))}
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-[#1A1D1F]"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-[#6F767E]">
            First period starts
            <input
              type="date"
              value={recurrenceStart}
              onChange={(e) => setRecurrenceStart(e.target.value)}
              className="rounded-lg border border-border px-2.5 py-1.5 text-sm text-[#1A1D1F]"
            />
          </label>
        </div>
        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-border px-3 py-1.5 text-sm text-[#6F767E] hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="rounded-lg bg-[#6C9B8B] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#5A8475] disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create and edit"}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
