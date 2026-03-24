"use client";

import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { UpcomingBill } from "@/lib/types/gnucash";

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Assign colors based on name hash
const BILL_COLORS = ["#E50914", "#1DB954", "#FF3B30", "#5B5EA6", "#FF9500", "#6C9B8B"];

function getBillColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return BILL_COLORS[Math.abs(hash) % BILL_COLORS.length];
}

interface UpcomingBillsProps {
  bills: UpcomingBill[];
  currency: string;
}

export function UpcomingBills({ bills, currency }: UpcomingBillsProps) {
  const sortedBills = [...bills].sort(
    (a, b) => new Date(a.nextDate).getTime() - new Date(b.nextDate).getTime()
  );

  return (
    <Card className="shadow-sm border-[#EFEFEF]">
      <CardHeader className="flex flex-row items-center justify-between border-b border-[#EFEFEF] pb-4">
        <CardTitle className="text-base font-semibold text-[#1A1D1F]">
          Upcoming Bill & Payment
        </CardTitle>
        <Plus className="h-[18px] w-[18px] text-[#9A9FA5]" />
      </CardHeader>
      <CardContent className="p-0">
        {sortedBills.length === 0 ? (
          <div className="p-6 text-center text-sm text-[#9A9FA5]">
            No scheduled transactions found
          </div>
        ) : (
          <div className="divide-y divide-[#EFEFEF]">
            {sortedBills.slice(0, 5).map((bill) => {
              const color = getBillColor(bill.name);
              return (
                <div
                  key={bill.name}
                  className="flex items-center justify-between px-6 py-4"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-10 w-10 items-center justify-center rounded-[10px]"
                      style={{ backgroundColor: color }}
                    >
                      <span className="text-lg font-bold text-white">
                        {bill.name.charAt(0)}
                      </span>
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[#1A1D1F]">
                        {bill.name}
                      </p>
                      <p className="text-[11px] text-[#9A9FA5]">
                        {formatDate(bill.nextDate)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    {bill.amount !== null && (
                      <p className="text-[13px] font-semibold text-[#1A1D1F]">
                        {new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(bill.amount)}
                      </p>
                    )}
                    <p className="text-[11px] text-[#9A9FA5]">Scheduled</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {sortedBills.length > 5 && (
          <div className="border-t border-[#EFEFEF] p-4">
            <button className="flex h-12 w-full items-center justify-center rounded-xl border border-[#EFEFEF] text-[13px] font-medium text-[#6F767E] transition-colors hover:bg-[#F4F5F7]">
              View All
            </button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
