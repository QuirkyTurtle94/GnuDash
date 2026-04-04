"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useDashboard } from "@/lib/dashboard-context";
import { Search, Check, Plus } from "lucide-react";
import type { AccountNode, CommodityInfo } from "@/lib/types/gnucash";

// ── Constants ───────────────────────────────────────────────────

const ACCOUNT_TYPE_GROUPS = [
  { label: "Assets", types: ["ASSET", "BANK", "CASH", "STOCK", "MUTUAL"] },
  { label: "Liabilities", types: ["LIABILITY", "CREDIT"] },
  { label: "Income", types: ["INCOME"] },
  { label: "Expenses", types: ["EXPENSE"] },
  { label: "Other", types: ["EQUITY", "RECEIVABLE", "PAYABLE", "TRADING"] },
];

const TYPE_LABELS: Record<string, string> = {
  ASSET: "Asset", BANK: "Bank Account", CASH: "Cash", STOCK: "Stock", MUTUAL: "Mutual Fund / ETF",
  LIABILITY: "Liability", CREDIT: "Credit Card",
  INCOME: "Income", EXPENSE: "Expense", EQUITY: "Equity",
  RECEIVABLE: "Accounts Receivable", PAYABLE: "Accounts Payable", TRADING: "Trading",
};

const INVESTMENT_TYPES = new Set(["STOCK", "MUTUAL"]);

const STOCK_NAMESPACES = [
  { value: "NASDAQ", label: "NASDAQ" },
  { value: "NYSE", label: "NYSE" },
  { value: "AMEX", label: "AMEX" },
  { value: "LSE", label: "LSE (London)" },
  { value: "TSE", label: "TSE (Tokyo)" },
  { value: "ASX", label: "ASX (Australia)" },
];

// ── Helpers ─────────────────────────────────────────────────────

function flattenAccounts(nodes: AccountNode[], path: string[] = []): { guid: string; fullPath: string; type: string }[] {
  const results: { guid: string; fullPath: string; type: string }[] = [];
  for (const node of nodes) {
    const currentPath = [...path, node.name];
    if (node.type !== "ROOT") {
      results.push({ guid: node.guid, fullPath: currentPath.join(":"), type: node.type });
    }
    if (node.children.length > 0) {
      results.push(...flattenAccounts(node.children, currentPath));
    }
  }
  return results;
}

// ── Simple Combobox ─────────────────────────────────────────────

function SimpleCombobox({
  items,
  value,
  onChange,
  placeholder,
}: {
  items: { guid: string; label: string; sublabel?: string }[];
  value: string;
  onChange: (guid: string, label: string) => void;
  placeholder: string;
}) {
  const selected = items.find((i) => i.guid === value);
  const [query, setQuery] = useState(selected?.label ?? "");
  const [open, setOpen] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(selected?.label ?? "");
  }, [selected]);

  const filtered = useMemo(() => {
    if (!query.trim()) return items.slice(0, 50);
    const q = query.toLowerCase();
    return items.filter((i) =>
      i.label.toLowerCase().includes(q) || (i.sublabel?.toLowerCase().includes(q))
    ).slice(0, 30);
  }, [items, query]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[#9A9FA5]" />
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) onChange("", ""); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          placeholder={placeholder}
          className="h-8 w-full rounded-md border border-[#EFEFEF] bg-white pl-7 pr-2 text-xs text-[#1A1D1F] placeholder:text-[#9A9FA5] focus:border-[#3B6B8A] focus:outline-none focus:ring-1 focus:ring-[#3B6B8A]"
        />
      </div>
      {open && filtered.length > 0 && (
        <div ref={listRef} className="absolute left-0 top-full z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-[#EFEFEF] bg-white shadow-lg">
          {filtered.map((item) => (
            <div
              key={item.guid}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(item.guid, item.label); setQuery(item.label); setOpen(false); }}
              className={`cursor-pointer px-2.5 py-1.5 text-xs hover:bg-[#3B6B8A]/10 ${item.guid === value ? "font-medium text-[#3B6B8A]" : "text-[#1A1D1F]"}`}
            >
              <div>{item.label}</div>
              {item.sublabel && <div className="text-[10px] text-[#9A9FA5]">{item.sublabel}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────

export function AccountEditorSheet({
  open,
  onOpenChange,
  editingAccount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingAccount?: AccountNode | null;
}) {
  const { data, createAccount, updateAccount, createCommodity } = useDashboard();

  const isEditing = !!editingAccount;

  // Form state
  const [name, setName] = useState("");
  const [accountType, setAccountType] = useState("EXPENSE");
  const [parentGuid, setParentGuid] = useState("");
  const [parentPath, setParentPath] = useState("");
  const [commodityGuid, setCommodityGuid] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [hidden, setHidden] = useState(false);
  const [placeholder, setPlaceholder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // New commodity form (for STOCK/MUTUAL)
  const [showNewCommodity, setShowNewCommodity] = useState(false);
  const [newTicker, setNewTicker] = useState("");
  const [newFullname, setNewFullname] = useState("");
  const [newNamespace, setNewNamespace] = useState("NASDAQ");
  const [newNamespaceCustom, setNewNamespaceCustom] = useState("");
  const [newFraction, setNewFraction] = useState("10000");
  const [newCusip, setNewCusip] = useState("");

  const accounts = useMemo(() => {
    if (!data) return [];
    return flattenAccounts(data.accounts);
  }, [data]);

  const commodities = data?.commodities ?? [];
  const isInvestment = INVESTMENT_TYPES.has(accountType);

  // Filter commodities based on account type
  const filteredCommodities = useMemo(() => {
    if (isInvestment) {
      return commodities.filter((c) => c.namespace !== "CURRENCY");
    }
    return commodities.filter((c) => c.namespace === "CURRENCY");
  }, [commodities, isInvestment]);

  const commodityItems = useMemo(() => {
    return filteredCommodities.map((c) => ({
      guid: c.guid,
      label: `${c.mnemonic} — ${c.fullname}`,
      sublabel: `${c.namespace} (fraction: ${c.fraction})`,
    }));
  }, [filteredCommodities]);

  const parentItems = useMemo(() => {
    return accounts.map((a) => ({ guid: a.guid, label: a.fullPath }));
  }, [accounts]);

  // Pre-fill when editing
  useEffect(() => {
    if (editingAccount && open) {
      setName(editingAccount.name);
      setAccountType(editingAccount.type);
      setParentGuid(editingAccount.parentGuid ?? "");
      const parent = accounts.find((a) => a.guid === editingAccount.parentGuid);
      setParentPath(parent?.fullPath ?? "");
      setCommodityGuid(editingAccount.commodityGuid);
      setCode(""); // code not on AccountNode, will be preserved in DB
      setDescription("");
      setHidden(editingAccount.hidden);
      setPlaceholder(editingAccount.placeholder);
      setShowNewCommodity(false);
      setSaveError(null);
    } else if (!editingAccount && open) {
      // Set default commodity to base currency for new accounts
      if (data?.currencyGuid) {
        setCommodityGuid(data.currencyGuid);
      }
    }
  }, [editingAccount, open, accounts, data]);

  // When type changes, reset commodity if switching between investment/currency
  useEffect(() => {
    if (isInvestment) {
      // Switching to investment type — clear currency commodity
      const currentCommodity = commodities.find((c) => c.guid === commodityGuid);
      if (currentCommodity?.namespace === "CURRENCY") {
        setCommodityGuid("");
      }
    } else {
      // Switching to currency type — set to base currency if current is a security
      const currentCommodity = commodities.find((c) => c.guid === commodityGuid);
      if (!currentCommodity || currentCommodity.namespace !== "CURRENCY") {
        setCommodityGuid(data?.currencyGuid ?? "");
      }
      setShowNewCommodity(false);
    }
  }, [accountType]);

  function resetForm() {
    setName("");
    setAccountType("EXPENSE");
    setParentGuid("");
    setParentPath("");
    setCommodityGuid(data?.currencyGuid ?? "");
    setCode("");
    setDescription("");
    setHidden(false);
    setPlaceholder(false);
    setShowNewCommodity(false);
    setNewTicker("");
    setNewFullname("");
    setNewNamespace("NASDAQ");
    setNewNamespaceCustom("");
    setNewFraction("10000");
    setNewCusip("");
    setSaveError(null);
  }

  const canSave =
    name.trim().length > 0 &&
    parentGuid.length > 0 &&
    (commodityGuid.length > 0 || showNewCommodity) &&
    (!showNewCommodity || (newTicker.trim().length > 0 && newFullname.trim().length > 0));

  async function handleSave() {
    if (!canSave || !data) return;
    setSaving(true);
    setSaveError(null);

    try {
      let finalCommodityGuid = commodityGuid;

      // Create new commodity if needed
      if (showNewCommodity && isInvestment) {
        const ns = newNamespace === "OTHER" ? newNamespaceCustom.trim() : newNamespace;
        await createCommodity({
          namespace: ns,
          mnemonic: newTicker.trim().toUpperCase(),
          fullname: newFullname.trim(),
          fraction: parseInt(newFraction) || 10000,
          cusip: newCusip.trim() || undefined,
        });
        // After creating, find the new commodity in the refreshed data
        // The createCommodity call refreshes data, so we need to find it
        // Since we can't await the state update, we'll use the returned data
        // Actually, the context setData is async, so we need another approach.
        // Let's create the commodity first, then read back.
        // For now, we'll save the account in a second step after the commodity is created.
        setSaving(false);
        setSaveError("Commodity created. Please select it from the dropdown and save again.");
        setShowNewCommodity(false);
        return;
      }

      if (isEditing && editingAccount) {
        await updateAccount({
          accountGuid: editingAccount.guid,
          name: name.trim(),
          accountType,
          commodityGuid: finalCommodityGuid,
          parentGuid,
          code: code.trim() || undefined,
          description: description.trim() || undefined,
          hidden,
          placeholder,
        });
      } else {
        await createAccount({
          name: name.trim(),
          accountType,
          commodityGuid: finalCommodityGuid,
          parentGuid,
          code: code.trim() || undefined,
          description: description.trim() || undefined,
          hidden,
          placeholder,
        });
      }

      resetForm();
      onOpenChange(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save account");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-md w-full overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{isEditing ? "Edit Account" : "Add Account"}</SheetTitle>
          <SheetDescription>
            {isEditing ? "Modify account properties." : "Create a new account in the chart of accounts."}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 pb-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[#6F767E]">Account Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Groceries, Savings Account, AAPL"
              className="h-8 w-full rounded-md border border-[#EFEFEF] bg-white px-2 text-xs text-[#1A1D1F] placeholder:text-[#9A9FA5] focus:border-[#3B6B8A] focus:outline-none focus:ring-1 focus:ring-[#3B6B8A]"
            />
          </div>

          {/* Account Type */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[#6F767E]">Account Type</label>
            <select
              value={accountType}
              onChange={(e) => setAccountType(e.target.value)}
              className="h-8 w-full rounded-md border border-[#EFEFEF] bg-white px-2 text-xs text-[#1A1D1F] focus:border-[#3B6B8A] focus:outline-none"
            >
              {ACCOUNT_TYPE_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.types.map((t) => (
                    <option key={t} value={t}>{TYPE_LABELS[t] ?? t}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Parent Account */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[#6F767E]">Parent Account</label>
            <SimpleCombobox
              items={parentItems}
              value={parentGuid}
              onChange={(guid) => setParentGuid(guid)}
              placeholder="Search parent account..."
            />
          </div>

          {/* Commodity */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[#6F767E]">
              {isInvestment ? "Security / Commodity" : "Currency"}
            </label>
            {!showNewCommodity ? (
              <div className="flex gap-1.5">
                <div className="flex-1">
                  <SimpleCombobox
                    items={commodityItems}
                    value={commodityGuid}
                    onChange={(guid) => setCommodityGuid(guid)}
                    placeholder={isInvestment ? "Search securities..." : "Search currencies..."}
                  />
                </div>
                {isInvestment && (
                  <button
                    onClick={() => setShowNewCommodity(true)}
                    className="flex h-8 items-center gap-1 rounded-md border border-[#EFEFEF] px-2 text-[10px] font-medium text-[#3B6B8A] hover:bg-[#3B6B8A]/10"
                  >
                    <Plus className="h-3 w-3" />
                    New
                  </button>
                )}
              </div>
            ) : (
              /* New commodity inline form */
              <div className="rounded-lg border border-[#3B6B8A]/30 bg-[#3B6B8A]/5 p-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-medium uppercase tracking-wider text-[#3B6B8A]">New Security</span>
                  <button
                    onClick={() => setShowNewCommodity(false)}
                    className="text-[10px] text-[#9A9FA5] hover:text-[#6F767E]"
                  >
                    Cancel
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[#6F767E]">Ticker</label>
                    <input
                      type="text"
                      value={newTicker}
                      onChange={(e) => setNewTicker(e.target.value)}
                      placeholder="AAPL"
                      className="h-7 w-full rounded border border-[#EFEFEF] bg-white px-2 text-xs text-[#1A1D1F] uppercase placeholder:text-[#D4DAE0] placeholder:normal-case focus:border-[#3B6B8A] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[#6F767E]">Exchange</label>
                    <select
                      value={newNamespace}
                      onChange={(e) => setNewNamespace(e.target.value)}
                      className="h-7 w-full rounded border border-[#EFEFEF] bg-white px-1 text-xs text-[#1A1D1F] focus:border-[#3B6B8A] focus:outline-none"
                    >
                      {STOCK_NAMESPACES.map((ns) => (
                        <option key={ns.value} value={ns.value}>{ns.label}</option>
                      ))}
                      <option value="OTHER">Other...</option>
                    </select>
                  </div>
                </div>
                {newNamespace === "OTHER" && (
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[#6F767E]">Custom Exchange</label>
                    <input
                      type="text"
                      value={newNamespaceCustom}
                      onChange={(e) => setNewNamespaceCustom(e.target.value)}
                      placeholder="e.g., XETRA, HKEX"
                      className="h-7 w-full rounded border border-[#EFEFEF] bg-white px-2 text-xs text-[#1A1D1F] placeholder:text-[#D4DAE0] focus:border-[#3B6B8A] focus:outline-none"
                    />
                  </div>
                )}
                <div>
                  <label className="mb-0.5 block text-[10px] text-[#6F767E]">Full Name</label>
                  <input
                    type="text"
                    value={newFullname}
                    onChange={(e) => setNewFullname(e.target.value)}
                    placeholder="Apple Inc"
                    className="h-7 w-full rounded border border-[#EFEFEF] bg-white px-2 text-xs text-[#1A1D1F] placeholder:text-[#D4DAE0] focus:border-[#3B6B8A] focus:outline-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[#6F767E]">Fraction</label>
                    <select
                      value={newFraction}
                      onChange={(e) => setNewFraction(e.target.value)}
                      className="h-7 w-full rounded border border-[#EFEFEF] bg-white px-1 text-xs text-[#1A1D1F] focus:border-[#3B6B8A] focus:outline-none"
                    >
                      <option value="10000">10000 (4 decimals — stocks)</option>
                      <option value="1000000">1000000 (6 decimals — crypto)</option>
                      <option value="100">100 (2 decimals — currency)</option>
                      <option value="1">1 (whole units)</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-0.5 block text-[10px] text-[#6F767E]">CUSIP/ISIN</label>
                    <input
                      type="text"
                      value={newCusip}
                      onChange={(e) => setNewCusip(e.target.value)}
                      placeholder="Optional"
                      className="h-7 w-full rounded border border-[#EFEFEF] bg-white px-2 text-xs text-[#1A1D1F] placeholder:text-[#D4DAE0] focus:border-[#3B6B8A] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Code & Description */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-[#6F767E]">Code</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="Optional"
                className="h-8 w-full rounded-md border border-[#EFEFEF] bg-white px-2 text-xs text-[#1A1D1F] placeholder:text-[#9A9FA5] focus:border-[#3B6B8A] focus:outline-none focus:ring-1 focus:ring-[#3B6B8A]"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#6F767E]">Description</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional"
                className="h-8 w-full rounded-md border border-[#EFEFEF] bg-white px-2 text-xs text-[#1A1D1F] placeholder:text-[#9A9FA5] focus:border-[#3B6B8A] focus:outline-none focus:ring-1 focus:ring-[#3B6B8A]"
              />
            </div>
          </div>

          {/* Flags */}
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={placeholder}
                onChange={(e) => setPlaceholder(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-[#D4DAE0] accent-[#3B6B8A]"
              />
              <div>
                <span className="text-xs text-[#1A1D1F]">Placeholder</span>
                <p className="text-[10px] text-[#9A9FA5]">Grouping only, no transactions</p>
              </div>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={hidden}
                onChange={(e) => setHidden(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-[#D4DAE0] accent-[#3B6B8A]"
              />
              <div>
                <span className="text-xs text-[#1A1D1F]">Hidden</span>
                <p className="text-[10px] text-[#9A9FA5]">Hide from default views</p>
              </div>
            </label>
          </div>

          {/* Error */}
          {saveError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-xs text-red-600">{saveError}</p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => { resetForm(); onOpenChange(false); }}>
              Cancel
            </Button>
            <Button size="sm" className="flex-1" disabled={!canSave || saving} onClick={handleSave}>
              {saving ? "Saving..." : isEditing ? "Update Account" : "Create Account"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
