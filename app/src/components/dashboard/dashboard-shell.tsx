"use client";

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { NetWorthChart } from "./charts/net-worth-chart";
import { CashFlowChart } from "./charts/cash-flow-chart";
import { SpendingOverview } from "./charts/spending-overview";
import { TopBalances } from "./charts/top-balances";
import { useDashboard } from "@/lib/dashboard-context";

export function DashboardShell() {
  const { data } = useDashboard();
  const [activeTab, setActiveTab] = useState("dashboard");

  if (!data) return null;

  const c = data.currency;

  return (
    <div className="flex h-screen bg-[#F4F5F7]">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-[#EFEFEF] bg-white px-8">
          <h1 className="text-[15px] font-medium text-[#1A1D1F]">Home page</h1>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-[#D4DAE0]" />
            <span className="text-sm font-medium text-[#1A1D1F]">
              My Dashboard
            </span>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="flex flex-col gap-6">
            {/* Row 1: Net Worth (full width) */}
            <NetWorthChart
              series={data.netWorthSeries}
              currentNetWorth={data.currentNetWorth}
              currency={c}
            />

            {/* Row 2: Spending Overview + Cash Flow (equal halves, matched height) */}
            <div className="grid grid-cols-2 gap-5">
              <SpendingOverview
                monthlyExpenses={data.monthlyExpensesByCategory}
                categoryColors={data.expenseCategoryColors}
                currency={c}
              />
              <CashFlowChart
                series={data.cashFlowSeries}
                currentIncome={data.currentMonthIncome}
                currentExpenses={data.currentMonthExpenses}
                currency={c}
              />
            </div>

            {/* Row 3: Account Balances */}
            {data.topBalances?.length > 0 && (
              <TopBalances balances={data.topBalances} currency={c} />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
