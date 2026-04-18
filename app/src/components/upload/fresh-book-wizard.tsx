"use client";

import { useCallback, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ChevronRight, Loader2, Sparkles } from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import type {
  InitEmptyBookPayload,
  PostgresConnectionInfo,
  TemplateAccountNode,
} from "@/lib/gnucash/worker/messages";
import {
  TEMPLATES,
  getTemplateById,
  type TemplateAccount,
} from "@/lib/gnucash/templates";
import {
  COMMON_CURRENCIES,
  findCurrency,
  isIsoCurrencyCode,
} from "@/lib/gnucash/templates/currencies";

type BackendTarget =
  | { kind: "local" }
  | { kind: "postgres"; connection: PostgresConnectionInfo; bookId: string };

interface FreshBookWizardProps {
  /** Which backend the resulting book lives on. Set by the launching panel. */
  target: BackendTarget;
  /** Called when the user backs out — returns them to the panel that launched the wizard. */
  onCancel: () => void;
}

type Step = 1 | 2 | 3 | 4;

/**
 * Editable mirror of the immutable template tree. `included` lets users drop
 * branches they don't want, `name` captures in-place renames. Children are
 * recursively walked into the same node shape.
 */
interface EditableNode {
  /** Stable path string ("Assets/Current Assets/Cash") — used as React key and diff handle. */
  path: string;
  name: string;
  type: TemplateAccount["type"];
  placeholder: boolean;
  description?: string;
  included: boolean;
  children: EditableNode[];
}

/**
 * Stepped inline wizard for creating a fresh book. Rendered in place of the
 * launching panel (Local or Server) — never a modal — so the flow matches the
 * "no modals for entry" preference.
 *
 * The component is backend-agnostic in its UI: the only difference between
 * Local and Postgres targets is which context method fires on Create. Until
 * that moment the user sees the same four steps either way.
 */
export function FreshBookWizard({ target, onCancel }: FreshBookWizardProps) {
  const {
    createFreshLocalBook,
    createFreshPostgresBook,
    isLoading,
    error,
  } = useDashboard();

  const [step, setStep] = useState<Step>(1);
  const [bookName, setBookName] = useState("My Book");
  const [currencyMnemonic, setCurrencyMnemonic] = useState("USD");
  const [templateId, setTemplateId] = useState(TEMPLATES[0].id);
  const [editable, setEditable] = useState<EditableNode[]>(() =>
    toEditable(TEMPLATES[0].accounts),
  );
  const [localError, setLocalError] = useState<string | null>(null);

  const selectedTemplate = useMemo(
    () => getTemplateById(templateId) ?? TEMPLATES[0],
    [templateId],
  );

  // Regenerating the editable tree on template change is a straight reset —
  // we don't try to carry over edits, because template shapes diverge too
  // much for name/toggle heuristics to feel predictable.
  const onTemplateChange = useCallback((id: string) => {
    setTemplateId(id);
    const tpl = getTemplateById(id);
    if (tpl) setEditable(toEditable(tpl.accounts));
  }, []);

  const canAdvanceFromStep1 =
    bookName.trim().length > 0 && isIsoCurrencyCode(currencyMnemonic);

  const hasAnyIncluded = useMemo(
    () => editable.some(hasIncludedDescendant),
    [editable],
  );

  const handleCreate = useCallback(async () => {
    setLocalError(null);
    if (!hasAnyIncluded) {
      setLocalError("At least one account must be included.");
      return;
    }

    const currency = findCurrency(currencyMnemonic) ?? {
      mnemonic: currencyMnemonic.trim().toUpperCase(),
      fullname: currencyMnemonic.trim().toUpperCase(),
    };
    const spec: InitEmptyBookPayload = {
      bookName: bookName.trim(),
      baseCurrencyMnemonic: currency.mnemonic,
      baseCurrencyFullname: currency.fullname,
      accounts: editable
        .filter((n) => n.included || hasIncludedDescendant(n))
        .map(toPayloadNode)
        .filter((n): n is TemplateAccountNode => n !== null),
    };

    if (target.kind === "local") {
      await createFreshLocalBook(spec);
    } else {
      await createFreshPostgresBook(target.connection, target.bookId, spec);
    }
  }, [
    bookName,
    currencyMnemonic,
    editable,
    hasAnyIncluded,
    target,
    createFreshLocalBook,
    createFreshPostgresBook,
  ]);

  const displayedError = localError ?? error;

  return (
    <div className="rounded-2xl border border-[#D4DAE0] bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#6C9B8B]" />
          <span className="text-sm font-medium text-[#1A1D1F]">
            Start a fresh book
          </span>
        </div>
        <button
          onClick={onCancel}
          className="text-xs text-[#6F767E] hover:text-[#1A1D1F]"
        >
          Cancel
        </button>
      </div>

      <StepIndicator step={step} />

      {step === 1 && (
        <Step1BookBasics
          bookName={bookName}
          onBookNameChange={setBookName}
          currencyMnemonic={currencyMnemonic}
          onCurrencyChange={setCurrencyMnemonic}
        />
      )}

      {step === 2 && (
        <Step2Template
          selectedId={templateId}
          onSelect={onTemplateChange}
        />
      )}

      {step === 3 && (
        <Step3Customize
          template={selectedTemplate.name}
          nodes={editable}
          onChange={setEditable}
        />
      )}

      {step === 4 && (
        <Step4Review
          bookName={bookName}
          currencyMnemonic={currencyMnemonic}
          templateName={selectedTemplate.name}
          includedCount={countIncluded(editable)}
          target={target}
        />
      )}

      {displayedError && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-center text-sm text-red-600">
          {displayedError}
        </div>
      )}

      <div className="mt-5 flex items-center justify-between gap-2">
        <button
          onClick={() => {
            if (step === 1) onCancel();
            else setStep((step - 1) as Step);
          }}
          disabled={isLoading}
          className="flex items-center gap-1.5 rounded-xl border border-[#D4DAE0] px-3 py-2 text-sm text-[#6F767E] hover:border-[#6C9B8B]/50 hover:bg-[#6C9B8B]/5 hover:text-[#1A1D1F] disabled:opacity-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {step === 1 ? "Back" : "Previous"}
        </button>
        {step < 4 ? (
          <button
            onClick={() => setStep((step + 1) as Step)}
            disabled={step === 1 && !canAdvanceFromStep1}
            className="flex items-center gap-1.5 rounded-xl bg-[#6C9B8B] px-3 py-2 text-sm font-medium text-white hover:bg-[#5A8877] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Next
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={isLoading || !hasAnyIncluded}
            className="flex items-center gap-1.5 rounded-xl bg-[#6C9B8B] px-4 py-2 text-sm font-medium text-white hover:bg-[#5A8877] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Creating...
              </>
            ) : (
              "Create book"
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const labels = ["Basics", "Template", "Customise", "Review"];
  return (
    <div className="mb-5 flex items-center gap-2 text-xs">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = n === step;
        const done = n < step;
        return (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                active
                  ? "bg-[#6C9B8B] text-white"
                  : done
                    ? "bg-[#6C9B8B]/20 text-[#6C9B8B]"
                    : "bg-[#F4F5F7] text-[#9A9FA5]"
              }`}
            >
              {n}
            </div>
            <span
              className={
                active
                  ? "font-medium text-[#1A1D1F]"
                  : done
                    ? "text-[#6C9B8B]"
                    : "text-[#9A9FA5]"
              }
            >
              {label}
            </span>
            {i < labels.length - 1 && (
              <ChevronRight className="h-3 w-3 text-[#D4DAE0]" />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface Step1Props {
  bookName: string;
  onBookNameChange: (v: string) => void;
  currencyMnemonic: string;
  onCurrencyChange: (v: string) => void;
}

function Step1BookBasics({
  bookName,
  onBookNameChange,
  currencyMnemonic,
  onCurrencyChange,
}: Step1Props) {
  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-xs font-medium text-[#6F767E]">
          Book name
        </label>
        <input
          type="text"
          value={bookName}
          onChange={(e) => onBookNameChange(e.target.value)}
          className="w-full rounded-lg border border-[#D4DAE0] bg-white px-3 py-2 text-sm text-[#1A1D1F] focus:border-[#6C9B8B] focus:outline-none focus:ring-2 focus:ring-[#6C9B8B]/20"
          placeholder="My Book"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-[#6F767E]">
          Base currency
        </label>
        <select
          value={currencyMnemonic}
          onChange={(e) => onCurrencyChange(e.target.value)}
          className="w-full rounded-lg border border-[#D4DAE0] bg-white px-3 py-2 text-sm text-[#1A1D1F] focus:border-[#6C9B8B] focus:outline-none focus:ring-2 focus:ring-[#6C9B8B]/20"
        >
          {COMMON_CURRENCIES.map((c) => (
            <option key={c.mnemonic} value={c.mnemonic}>
              {c.mnemonic} — {c.fullname}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-[#9A9FA5]">
          This is the currency every account will use by default. You can add
          other currencies afterwards.
        </p>
      </div>
    </div>
  );
}

interface Step2Props {
  selectedId: string;
  onSelect: (id: string) => void;
}

function Step2Template({ selectedId, onSelect }: Step2Props) {
  return (
    <div className="space-y-2">
      {TEMPLATES.map((tpl) => {
        const active = tpl.id === selectedId;
        return (
          <button
            key={tpl.id}
            onClick={() => onSelect(tpl.id)}
            className={`w-full rounded-xl border p-3 text-left transition-colors ${
              active
                ? "border-[#6C9B8B] bg-[#6C9B8B]/5"
                : "border-[#D4DAE0] hover:border-[#6C9B8B]/50"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-[#1A1D1F]">
                {tpl.name}
              </span>
              <span className="text-xs text-[#9A9FA5]">
                {countTemplateAccounts(tpl.accounts)} accounts
              </span>
            </div>
            <p className="mt-1 text-xs text-[#6F767E]">{tpl.description}</p>
          </button>
        );
      })}
    </div>
  );
}

interface Step3Props {
  template: string;
  nodes: EditableNode[];
  onChange: (next: EditableNode[]) => void;
}

function Step3Customize({ template, nodes, onChange }: Step3Props) {
  return (
    <div>
      <p className="mb-3 text-xs text-[#6F767E]">
        Preview of the <span className="font-medium">{template}</span> template.
        Uncheck any account to skip it, or rename inline. Parent accounts stay
        in the tree as long as any descendant is included.
      </p>
      <div className="max-h-[300px] overflow-y-auto rounded-xl border border-[#D4DAE0] bg-[#F4F5F7]/30 p-2">
        {nodes.map((n, i) => (
          <TreeRow
            key={n.path}
            node={n}
            depth={0}
            onChange={(next) => {
              const copy = [...nodes];
              copy[i] = next;
              onChange(copy);
            }}
          />
        ))}
      </div>
    </div>
  );
}

interface TreeRowProps {
  node: EditableNode;
  depth: number;
  onChange: (next: EditableNode) => void;
}

function TreeRow({ node, depth, onChange }: TreeRowProps) {
  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white"
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        <input
          type="checkbox"
          checked={node.included}
          onChange={(e) =>
            onChange({ ...node, included: e.target.checked })
          }
          className="h-3.5 w-3.5 rounded border-[#D4DAE0] text-[#6C9B8B] accent-[#6C9B8B]"
        />
        <input
          type="text"
          value={node.name}
          onChange={(e) => onChange({ ...node, name: e.target.value })}
          className={`flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm focus:border-[#D4DAE0] focus:bg-white focus:outline-none ${
            node.included ? "text-[#1A1D1F]" : "text-[#9A9FA5] line-through"
          }`}
        />
        <span className="shrink-0 rounded bg-[#F4F5F7] px-1.5 py-0.5 font-mono text-[10px] text-[#6F767E]">
          {node.type}
        </span>
      </div>
      {node.children.map((child, i) => (
        <TreeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          onChange={(next) => {
            const copy = [...node.children];
            copy[i] = next;
            onChange({ ...node, children: copy });
          }}
        />
      ))}
    </div>
  );
}

interface Step4Props {
  bookName: string;
  currencyMnemonic: string;
  templateName: string;
  includedCount: number;
  target: BackendTarget;
}

function Step4Review({
  bookName,
  currencyMnemonic,
  templateName,
  includedCount,
  target,
}: Step4Props) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-[#6F767E]">
        Ready to create. This will {target.kind === "local"
          ? "seed a new book in your browser's local storage"
          : `push a new empty book schema to your Postgres server at ${target.connection.host} (book id: ${target.bookId})`}.
      </p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 rounded-xl bg-[#F4F5F7]/60 p-3 text-sm">
        <dt className="text-xs text-[#6F767E]">Book name</dt>
        <dd className="text-[#1A1D1F]">{bookName}</dd>
        <dt className="text-xs text-[#6F767E]">Base currency</dt>
        <dd className="text-[#1A1D1F]">{currencyMnemonic.toUpperCase()}</dd>
        <dt className="text-xs text-[#6F767E]">Template</dt>
        <dd className="text-[#1A1D1F]">{templateName}</dd>
        <dt className="text-xs text-[#6F767E]">Accounts</dt>
        <dd className="text-[#1A1D1F]">{includedCount}</dd>
        <dt className="text-xs text-[#6F767E]">Backend</dt>
        <dd className="text-[#1A1D1F]">
          {target.kind === "local" ? "Local (OPFS)" : "Postgres"}
        </dd>
      </dl>
    </div>
  );
}

// ── Tree helpers ───────────────────────────────────────────────────

function toEditable(
  accounts: TemplateAccount[],
  prefix = "",
): EditableNode[] {
  return accounts.map((a) => {
    const path = prefix ? `${prefix}/${a.name}` : a.name;
    return {
      path,
      name: a.name,
      type: a.type,
      placeholder: a.placeholder ?? false,
      description: a.description,
      included: true,
      children: a.children ? toEditable(a.children, path) : [],
    };
  });
}

/**
 * Convert an editable node back to the serialisable payload shape the worker
 * consumes. A node survives the transform if it is itself included OR any of
 * its descendants is — this keeps placeholder parents around when the user
 * unchecks only the parent but keeps children.
 */
function toPayloadNode(node: EditableNode): TemplateAccountNode | null {
  const kids = node.children
    .map(toPayloadNode)
    .filter((c): c is TemplateAccountNode => c !== null);
  if (!node.included && kids.length === 0) return null;
  return {
    name: node.name,
    type: node.type,
    placeholder: !node.included || node.placeholder,
    description: node.description,
    children: kids.length > 0 ? kids : undefined,
  };
}

function hasIncludedDescendant(node: EditableNode): boolean {
  if (node.included) return true;
  return node.children.some(hasIncludedDescendant);
}

function countIncluded(nodes: EditableNode[]): number {
  let n = 0;
  for (const node of nodes) {
    if (node.included) n++;
    n += countIncluded(node.children);
  }
  return n;
}

function countTemplateAccounts(accounts: TemplateAccount[]): number {
  let n = 0;
  for (const a of accounts) {
    n++;
    if (a.children) n += countTemplateAccounts(a.children);
  }
  return n;
}
