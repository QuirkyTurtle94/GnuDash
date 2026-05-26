"use client";

import { useState, useMemo } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { formatAmount } from "@/lib/format";
import { useDashboard } from "@/lib/dashboard-context";
import { parseGnuCashDate } from "@/lib/gnucash/shared/dates";
import type { GnuCashPrice, CommodityInfo } from "@/lib/types/gnucash";
import { Plus, Pencil, Trash2, AlertTriangle } from "lucide-react";

/** Human-readable labels for price source fields (non-transaction sources only). */
const SOURCE_LABELS: Record<string, { label: string; color: string }> = {
  "user:price-editor": { label: "User", color: "bg-blue-50 text-blue-700" },
  "user:price": { label: "User", color: "bg-blue-50 text-blue-700" },
  "Finance::Quote": { label: "API", color: "bg-purple-50 text-purple-700" },
};

/** Badge describing a price's provenance. Transaction-linked prices are split
 *  into "Linked" (originating tx still exists) and "Orphaned" (the tx has been
 *  edited away or deleted), driven by the {@link orphaned} flag. */
function getSourceBadge(
  price: GnuCashPrice,
  orphaned: boolean,
): { label: string; color: string; title: string } {
  if (isTransactionLinked(price)) {
    return orphaned
      ? {
          label: "Orphaned",
          color: "bg-amber-50 text-amber-700",
          title:
            "The transaction that created this price no longer exists or was changed. Safe to delete.",
        }
      : {
          label: "Linked",
          color: "bg-emerald-50 text-emerald-700",
          title: "Auto-generated from a transaction. Editing here may drift from the source transaction.",
        };
  }
  if (SOURCE_LABELS[price.source]) return { ...SOURCE_LABELS[price.source], title: price.source };
  if (price.source.startsWith("user:"))
    return { label: "User", color: "bg-blue-50 text-blue-700", title: price.source };
  return {
    label: price.source || price.type || "Unknown",
    color: "bg-gray-50 text-gray-600",
    title: price.source || price.type || "Unknown",
  };
}

function formatPriceDate(dateStr: string): string {
  const d = parseGnuCashDate(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** Check if a price was generated from a transaction (editing would break the link). */
function isTransactionLinked(price: GnuCashPrice): boolean {
  return price.source === "user:xfer-dialog" || price.type === "transaction";
}

interface Props {
  currency: string;
  selectedTicker?: string | null;
}

export function PricesTable({ currency, selectedTicker }: Props) {
  const { data, isWritable, addPrice, editPrice, deletePrice } = useDashboard();
  const [commodityFilter, setCommodityFilter] = useState("");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingPrice, setEditingPrice] = useState<GnuCashPrice | null>(null);
  const [deletingPrice, setDeletingPrice] = useState<GnuCashPrice | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Set of price guids flagged by the worker as orphaned (transaction-linked
  // but with no matching transaction). Used to render the "Orphaned" badge.
  const orphanSet = useMemo(
    () => new Set(data?.orphanedPriceGuids ?? []),
    [data?.orphanedPriceGuids],
  );

  // Build commodity lookup
  const commodityMap = useMemo(() => {
    if (!data) return new Map<string, CommodityInfo>();
    const m = new Map<string, CommodityInfo>();
    for (const c of data.commodities) m.set(c.guid, c);
    return m;
  }, [data]);

  // Get unique non-currency commodities that have prices
  const pricedCommodities = useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, string>();
    for (const p of data.prices) {
      const c = commodityMap.get(p.commodity_guid);
      if (c && c.namespace !== "CURRENCY") {
        seen.set(p.commodity_guid, c.mnemonic);
      }
    }
    // Also include currency pairs
    for (const p of data.prices) {
      const c = commodityMap.get(p.commodity_guid);
      if (c && c.namespace === "CURRENCY") {
        const cur = commodityMap.get(p.currency_guid);
        seen.set(p.commodity_guid, `${c.mnemonic}/${cur?.mnemonic ?? "?"}`);
      }
    }
    return Array.from(seen.entries())
      .map(([guid, label]) => ({ guid, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data, commodityMap]);

  // Filter prices
  const filteredPrices = useMemo(() => {
    if (!data) return [];
    const filter = selectedTicker
      ? data.commodities.find((c) => c.mnemonic === selectedTicker)?.guid
      : commodityFilter || null;

    return data.prices
      .filter((p) => !filter || p.commodity_guid === filter)
      .slice(0, 200); // Limit for performance
  }, [data, commodityFilter, selectedTicker]);

  if (!data) return null;

  return (
    <Card className="shadow-sm border-[#EFEFEF]">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-semibold text-[#1A1D1F]">Price Database</h3>
          <div className="flex items-center gap-2">
            {/* Commodity filter */}
            <select
              value={selectedTicker ? "" : commodityFilter}
              onChange={(e) => setCommodityFilter(e.target.value)}
              disabled={!!selectedTicker}
              className="h-8 rounded-lg border border-[#EFEFEF] bg-white px-2 text-xs text-[#6F767E] focus:border-[#3B6B8A] focus:outline-none"
            >
              <option value="">All commodities</option>
              {pricedCommodities.map((c) => (
                <option key={c.guid} value={c.guid}>{c.label}</option>
              ))}
            </select>
            {isWritable && (
              <button
                onClick={() => { setEditingPrice(null); setShowAddDialog(true); setError(null); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#3B6B8A] text-white transition-colors hover:bg-[#2D5570]"
                title="Add price"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#EFEFEF]">
                <th className="pb-2 text-left text-xs font-medium text-[#9A9FA5]">Date</th>
                <th className="pb-2 text-left text-xs font-medium text-[#9A9FA5]">Commodity</th>
                <th className="pb-2 text-left text-xs font-medium text-[#9A9FA5]">Currency</th>
                <th className="pb-2 text-right text-xs font-medium text-[#9A9FA5]">Price</th>
                <th className="pb-2 text-center text-xs font-medium text-[#9A9FA5]">Source</th>
                {isWritable && <th className="pb-2 w-16" />}
              </tr>
            </thead>
            <tbody>
              {filteredPrices.length === 0 ? (
                <tr>
                  <td colSpan={isWritable ? 6 : 5} className="py-8 text-center text-sm text-[#9A9FA5]">
                    No prices found
                  </td>
                </tr>
              ) : (
                filteredPrices.map((p) => {
                  const commodity = commodityMap.get(p.commodity_guid);
                  const priceCurrency = commodityMap.get(p.currency_guid);
                  const priceValue = p.value_num / p.value_denom;
                  const source = getSourceBadge(p, orphanSet.has(p.guid));

                  return (
                    <tr key={p.guid} className="group border-b border-[#EFEFEF] hover:bg-[#F9FAFB] transition-colors">
                      <td className="py-2 pr-3 text-xs text-[#6F767E]">{formatPriceDate(p.date)}</td>
                      <td className="py-2 pr-3 text-xs font-medium text-[#1A1D1F]">
                        {commodity?.mnemonic ?? p.commodity_guid.slice(0, 8)}
                        {commodity?.fullname && (
                          <span className="ml-1.5 text-[#9A9FA5] font-normal">{commodity.fullname}</span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-xs text-[#6F767E]">{priceCurrency?.mnemonic ?? "?"}</td>
                      <td className="py-2 pr-3 text-right text-xs font-medium text-[#1A1D1F]">
                        {formatAmount(priceValue, priceCurrency?.mnemonic ?? currency, 6)}
                      </td>
                      <td className="py-2 text-center">
                        <span
                          title={source.title}
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${source.color}`}
                        >
                          {source.label}
                        </span>
                      </td>
                      {isWritable && (
                        <td className="py-2">
                          <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => { setEditingPrice(p); setShowAddDialog(true); setError(null); }}
                              className="flex h-6 w-6 items-center justify-center rounded text-[#9A9FA5] hover:bg-[#3B6B8A]/10 hover:text-[#3B6B8A]"
                              title="Edit price"
                            >
                              <Pencil className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => setDeletingPrice(p)}
                              className="flex h-6 w-6 items-center justify-center rounded text-[#9A9FA5] hover:bg-red-50 hover:text-[#E87C6B]"
                              title="Delete price"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {filteredPrices.length >= 200 && (
          <p className="mt-2 text-center text-[10px] text-[#9A9FA5]">Showing first 200 prices. Use the filter to narrow results.</p>
        )}
      </CardContent>

      {/* Add/Edit Price Dialog */}
      {showAddDialog && (
        <PriceDialog
          editingPrice={editingPrice}
          commodities={data.commodities}
          currency={currency}
          onSave={async (payload) => {
            try {
              setError(null);
              if (editingPrice) {
                await editPrice({
                  originalGuid: editingPrice.guid,
                  ...payload,
                });
              } else {
                await addPrice(payload);
              }
              setShowAddDialog(false);
              setEditingPrice(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to save price");
            }
          }}
          onAddAsNew={editingPrice && isTransactionLinked(editingPrice) ? async (payload) => {
            try {
              setError(null);
              await addPrice(payload);
              setShowAddDialog(false);
              setEditingPrice(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Failed to add price");
            }
          } : undefined}
          onClose={() => { setShowAddDialog(false); setEditingPrice(null); setError(null); }}
          error={error}
        />
      )}

      {/* Delete confirmation */}
      {deletingPrice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setDeletingPrice(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#1A1D1F]">Delete Price</h3>
            <p className="mt-2 text-xs text-[#6F767E]">
              Are you sure you want to delete this price entry? This cannot be undone.
            </p>
            {isTransactionLinked(deletingPrice) && !orphanSet.has(deletingPrice.guid) && (
              <div className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600" />
                <p className="text-[11px] text-amber-700">
                  This price is linked to a transaction. Deleting it may affect portfolio valuations.
                </p>
              </div>
            )}
            {orphanSet.has(deletingPrice.guid) && (
              <div className="mt-2 flex items-start gap-2 rounded-md bg-emerald-50 border border-emerald-200 px-3 py-2">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-emerald-600" />
                <p className="text-[11px] text-emerald-700">
                  This price is orphaned — the originating transaction no longer exists. Safe to delete.
                </p>
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setDeletingPrice(null)}
                className="flex-1 rounded-lg border border-[#EFEFEF] px-3 py-2 text-xs font-medium text-[#6F767E] transition-colors hover:bg-[#F4F5F7]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await deletePrice({ priceGuid: deletingPrice.guid });
                    setDeletingPrice(null);
                  } catch {
                    // stay open on error
                  }
                }}
                className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Add/Edit Price Dialog ────────────────────────────────────────

function PriceDialog({
  editingPrice,
  commodities,
  currency,
  onSave,
  onAddAsNew,
  onClose,
  error,
}: {
  editingPrice: GnuCashPrice | null;
  commodities: CommodityInfo[];
  currency: string;
  onSave: (payload: { commodityGuid: string; currencyGuid: string; date: string; value: number; source?: string; type?: string }) => Promise<void>;
  /** If set, show "Add as new price" option (for transaction-linked prices) */
  onAddAsNew?: (payload: { commodityGuid: string; currencyGuid: string; date: string; value: number; source?: string; type?: string }) => Promise<void>;
  onClose: () => void;
  error: string | null;
}) {
  const isEditing = !!editingPrice;
  const isLinked = isEditing && isTransactionLinked(editingPrice!);

  const nonCurrencyComms = commodities.filter((c) => c.namespace !== "CURRENCY" && c.namespace !== "template");
  const currencyComms = commodities.filter((c) => c.namespace === "CURRENCY");

  const [commodityGuid, setCommodityGuid] = useState(editingPrice?.commodity_guid ?? "");
  const [currencyGuid, setCurrencyGuid] = useState(editingPrice?.currency_guid ?? (currencyComms.find((c) => c.mnemonic === currency)?.guid ?? ""));
  const [date, setDate] = useState(() => {
    if (editingPrice?.date) {
      const d = parseGnuCashDate(editingPrice.date);
      if (isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    }
    return new Date().toISOString().slice(0, 10);
  });
  const [value, setValue] = useState(() => {
    if (editingPrice) return String(editingPrice.value_num / editingPrice.value_denom);
    return "";
  });
  const [saving, setSaving] = useState(false);

  const canSave = commodityGuid && currencyGuid && date && parseFloat(value) > 0;

  async function handleSave(asCopy: boolean) {
    if (!canSave) return;
    setSaving(true);
    const payload = {
      commodityGuid,
      currencyGuid,
      date,
      value: parseFloat(value),
      source: asCopy ? "user:price-editor" : undefined,
      type: asCopy ? "last" : undefined,
    };
    if (asCopy && onAddAsNew) {
      await onAddAsNew(payload);
    } else {
      await onSave(payload);
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-sm font-semibold text-[#1A1D1F]">
          {isEditing ? "Edit Price" : "Add Price"}
        </h3>

        {/* Transaction-linked warning */}
        {isLinked && (
          <div className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-600" />
            <div className="text-[11px] text-amber-700">
              <p className="font-medium">This price was generated from a transaction.</p>
              <p className="mt-0.5">Editing it may cause the transaction and this price to diverge.
              Consider adding a new price for the same date instead, which will be used for reporting only.</p>
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-col gap-3">
          {/* Commodity */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[#6F767E]">Commodity</label>
            <select
              value={commodityGuid}
              onChange={(e) => setCommodityGuid(e.target.value)}
              className="h-8 w-full rounded-md border border-[#EFEFEF] bg-white px-2 text-xs text-[#1A1D1F] focus:border-[#3B6B8A] focus:outline-none"
            >
              <option value="">Select commodity...</option>
              {nonCurrencyComms.length > 0 && (
                <optgroup label="Securities">
                  {nonCurrencyComms.map((c) => (
                    <option key={c.guid} value={c.guid}>{c.mnemonic} - {c.fullname}</option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Currencies">
                {currencyComms.map((c) => (
                  <option key={c.guid} value={c.guid}>{c.mnemonic} - {c.fullname}</option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Currency */}
          <div>
            <label className="mb-1 block text-xs font-medium text-[#6F767E]">Priced in</label>
            <select
              value={currencyGuid}
              onChange={(e) => setCurrencyGuid(e.target.value)}
              className="h-8 w-full rounded-md border border-[#EFEFEF] bg-white px-2 text-xs text-[#1A1D1F] focus:border-[#3B6B8A] focus:outline-none"
            >
              <option value="">Select currency...</option>
              {currencyComms.map((c) => (
                <option key={c.guid} value={c.guid}>{c.mnemonic} - {c.fullname}</option>
              ))}
            </select>
          </div>

          {/* Date + Value */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[#6F767E]">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-8 w-full rounded-md border border-[#EFEFEF] bg-white px-2 text-xs text-[#1A1D1F] focus:border-[#3B6B8A] focus:outline-none"
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-[#6F767E]">Price</label>
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="0.0000"
                className="h-8 w-full rounded-md border border-[#EFEFEF] bg-white px-2 text-right text-xs text-[#1A1D1F] focus:border-[#3B6B8A] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-lg border border-[#EFEFEF] px-3 py-2 text-xs font-medium text-[#6F767E] transition-colors hover:bg-[#F4F5F7]"
          >
            Cancel
          </button>
          {isLinked && onAddAsNew && (
            <button
              onClick={() => handleSave(true)}
              disabled={!canSave || saving}
              className="flex-1 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
            >
              Add as new
            </button>
          )}
          <button
            onClick={() => handleSave(false)}
            disabled={!canSave || saving}
            className="flex-1 rounded-lg bg-[#3B6B8A] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#2D5570] disabled:opacity-50"
          >
            {saving ? "Saving..." : isEditing ? "Update" : "Add Price"}
          </button>
        </div>
      </div>
    </div>
  );
}
