"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";

export function SummaryCard({
  totalBudgeted,
  totalActual,
  currency,
  isIncome = false,
  parentName,
  childCount,
  titleLabel,
  budgetedLabel,
  actualLabel,
}: {
  totalBudgeted: number;
  totalActual: number;
  currency: string;
  isIncome?: boolean;
  parentName?: string;
  childCount?: number;
  titleLabel?: string;
  budgetedLabel?: string;
  actualLabel?: string;
}) {
  const remaining = totalBudgeted - totalActual;
  const pct = totalBudgeted > 0 ? (totalActual / totalBudgeted) * 100 : 0;
  const isOver = totalActual > totalBudgeted;
  const overColor = isIncome ? "#6C9B8B" : "#E87C6B";
  const underColor = isIncome ? "#E87C6B" : "#6C9B8B";
  const ringColor = isOver ? overColor : underColor;
  const statusColor = isOver ? overColor : underColor;

  const defaultTitle = parentName
    ? <span>{parentName} <span className="text-[#9A9FA5]">— {childCount} sub-budget{childCount !== 1 ? "s" : ""}</span></span>
    : (titleLabel ?? (isIncome ? "Income Summary" : "Budget Summary"));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-[#6F767E]">
          {defaultTitle}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-6">
            <div className="relative h-28 w-28 shrink-0">
              <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#F4F5F7" strokeWidth="10" />
                <circle
                  cx="50" cy="50" r="40"
                  fill="none"
                  stroke={ringColor}
                  strokeWidth="10"
                  strokeDasharray={`${Math.min(pct, 100) * 2.51327} ${251.327}`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-lg font-bold text-[#1A1D1F]" data-v>
                  {Math.round(pct)}%
                </span>
                <span className="text-[10px] text-[#9A9FA5]">{isIncome ? "earned" : "used"}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 text-sm">
              <div>
                <span className="text-[#9A9FA5]">{budgetedLabel ?? (isIncome ? "Target" : "Budgeted")}</span>
                <p className="font-semibold text-[#1A1D1F]" data-v>{formatCurrency(totalBudgeted, currency)}</p>
              </div>
              <div>
                <span className="text-[#9A9FA5]">{actualLabel ?? (isIncome ? "Earned" : "Spent")}</span>
                <p className="font-semibold text-[#1A1D1F]" data-v>{formatCurrency(totalActual, currency)}</p>
              </div>
              <div>
                <span className="text-[#9A9FA5]">
                  {isIncome
                    ? (isOver ? "Above target" : "Below target")
                    : (isOver ? "Over budget" : "Remaining")}
                </span>
                <p className="font-semibold" style={{ color: statusColor }} data-v>
                  {formatCurrency(Math.abs(remaining), currency)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
