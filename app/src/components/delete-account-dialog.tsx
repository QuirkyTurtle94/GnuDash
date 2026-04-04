"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useDashboard } from "@/lib/dashboard-context";
import { AlertTriangle, Search, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AccountNode } from "@/lib/types/gnucash";

/** Account type families for reallocation filtering. */
const TYPE_FAMILIES: Record<string, string[]> = {
  ASSET: ["ASSET", "BANK", "CASH", "STOCK", "MUTUAL"],
  BANK: ["ASSET", "BANK", "CASH", "STOCK", "MUTUAL"],
  CASH: ["ASSET", "BANK", "CASH", "STOCK", "MUTUAL"],
  STOCK: ["ASSET", "BANK", "CASH", "STOCK", "MUTUAL"],
  MUTUAL: ["ASSET", "BANK", "CASH", "STOCK", "MUTUAL"],
  LIABILITY: ["LIABILITY", "CREDIT"],
  CREDIT: ["LIABILITY", "CREDIT"],
  INCOME: ["INCOME"],
  EXPENSE: ["EXPENSE"],
  EQUITY: ["EQUITY"],
  RECEIVABLE: ["RECEIVABLE"],
  PAYABLE: ["PAYABLE"],
  TRADING: ["TRADING"],
};

function flattenForPicker(
  nodes: AccountNode[],
  excludeGuid: string,
  allowedTypes: string[],
  path: string[] = []
): { guid: string; fullPath: string; type: string }[] {
  const results: { guid: string; fullPath: string; type: string }[] = [];
  for (const node of nodes) {
    const currentPath = [...path, node.name];
    // Exclude the account being deleted, its descendants, ROOT, and placeholders
    if (node.guid === excludeGuid || node.type === "ROOT") {
      // Skip this node but still recurse children (they might be valid after reparenting)
      continue;
    }
    if (!node.placeholder && allowedTypes.includes(node.type)) {
      results.push({ guid: node.guid, fullPath: currentPath.join(":"), type: node.type });
    }
    if (node.children.length > 0) {
      results.push(...flattenForPicker(
        node.children.filter((c) => c.guid !== excludeGuid),
        excludeGuid,
        allowedTypes,
        currentPath
      ));
    }
  }
  return results;
}

function countDescendants(node: AccountNode): { children: number; totalDescendants: number } {
  let total = node.children.length;
  for (const child of node.children) {
    total += countDescendants(child).totalDescendants;
  }
  return { children: node.children.length, totalDescendants: total };
}

export function DeleteAccountDialog({
  account,
  onClose,
}: {
  account: AccountNode;
  onClose: () => void;
}) {
  const { data, deleteAccountWithReallocation } = useDashboard();
  const [targetGuid, setTargetGuid] = useState("");
  const [targetPath, setTargetPath] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allowedTypes = TYPE_FAMILIES[account.type] ?? [account.type];
  const { children: childCount, totalDescendants } = countDescendants(account);

  const targets = useMemo(() => {
    if (!data) return [];
    return flattenForPicker(data.accounts, account.guid, allowedTypes);
  }, [data, account.guid, allowedTypes]);

  const filtered = useMemo(() => {
    if (!query.trim()) return targets.slice(0, 50);
    const q = query.toLowerCase();
    return targets
      .filter((t) => t.fullPath.toLowerCase().includes(q))
      .slice(0, 30);
  }, [targets, query]);

  const selectTarget = useCallback((t: { guid: string; fullPath: string }) => {
    setTargetGuid(t.guid);
    setTargetPath(t.fullPath);
    setQuery(t.fullPath);
    setOpen(false);
  }, []);

  async function handleDelete() {
    if (!targetGuid) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAccountWithReallocation({ accountGuid: account.guid, targetAccountGuid: targetGuid });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-[#1A1D1F]">Delete Account</h3>
            <p className="text-xs text-[#6F767E]">{account.fullPath}</p>
          </div>
        </div>

        {/* Impact summary */}
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs text-amber-800">
            {childCount > 0 && (
              <span><strong>{totalDescendants}</strong> child account{totalDescendants !== 1 ? "s" : ""} will be moved. </span>
            )}
            All splits and budget amounts in this account will be reassigned to the target account below.
          </p>
        </div>

        {/* Target account picker */}
        <div className="mb-4">
          <label className="mb-1 block text-xs font-medium text-[#6F767E]">
            Move everything to:
          </label>
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9A9FA5]" />
              <input
                type="text"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setOpen(true); if (!e.target.value) { setTargetGuid(""); setTargetPath(""); } }}
                onFocus={() => setOpen(true)}
                onBlur={() => setTimeout(() => setOpen(false), 200)}
                placeholder="Search for target account..."
                className="h-9 w-full rounded-lg border border-[#EFEFEF] bg-white pl-8 pr-3 text-xs text-[#1A1D1F] placeholder:text-[#9A9FA5] focus:border-[#3B6B8A] focus:outline-none focus:ring-1 focus:ring-[#3B6B8A]"
              />
            </div>
            {open && filtered.length > 0 && (
              <div ref={listRef} className="absolute left-0 top-full z-50 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-[#EFEFEF] bg-white shadow-lg">
                {filtered.map((t) => (
                  <div
                    key={t.guid}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => selectTarget(t)}
                    className={`cursor-pointer px-3 py-1.5 text-xs hover:bg-[#3B6B8A]/10 ${t.guid === targetGuid ? "font-medium text-[#3B6B8A]" : "text-[#1A1D1F]"}`}
                  >
                    <span>{t.fullPath}</span>
                    {t.guid === targetGuid && <Check className="ml-2 inline h-3 w-3 text-[#3B6B8A]" />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <p className="text-xs text-red-600">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            className="flex-1 bg-red-600 hover:bg-red-700"
            disabled={!targetGuid || deleting}
            onClick={handleDelete}
          >
            {deleting ? "Deleting..." : "Delete & Reassign"}
          </Button>
        </div>
      </div>
    </div>
  );
}
