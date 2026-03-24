"use client";

import { useState } from "react";
import {
  Home,
  Receipt,
  CreditCard,
  TrendingUp,
  FileText,
  Settings,
  Bookmark,
  Search,
  LogOut,
} from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";

const mainNav = [
  { icon: Home, label: "Dashboard", id: "dashboard" },
  { icon: Receipt, label: "Transactions", id: "transactions" },
  { icon: CreditCard, label: "Spending", id: "spending" },
  { icon: TrendingUp, label: "Investment", id: "investment" },
];

const mgmtNav = [
  { icon: FileText, label: "Financial Planning", id: "planning" },
  { icon: Settings, label: "Management", id: "management" },
  { icon: Bookmark, label: "Subscriptions", id: "subscriptions" },
];

interface SidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
  const { clearData } = useDashboard();

  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-[#EFEFEF] bg-white">
      <div className="flex flex-col gap-6 p-5">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[#6C9B8B]">
            <span className="text-base font-bold text-white">G</span>
          </div>
          <span className="text-[17px] font-bold tracking-tight text-[#1A1D1F]">
            GNUCash
          </span>
        </div>

        {/* Search */}
        <div className="flex h-10 items-center gap-2 rounded-[10px] bg-[#F4F5F7] px-3">
          <Search className="h-4 w-4 text-[#9A9FA5]" />
          <span className="text-sm text-[#9A9FA5]">Search</span>
          <div className="ml-auto rounded-md border border-[#EFEFEF] px-2 py-0.5">
            <span className="text-[11px] text-[#9A9FA5]">⌘K</span>
          </div>
        </div>

        {/* Main Menu */}
        <div>
          <p className="mb-2 px-3 text-xs text-[#9A9FA5]">Main menu</p>
          <nav className="flex flex-col gap-0.5">
            {mainNav.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`flex h-[42px] items-center gap-2.5 rounded-[10px] px-3 text-left transition-colors ${
                    isActive
                      ? "bg-[#6C9B8B]/10 text-[#1A1D1F]"
                      : "text-[#6F767E] hover:bg-[#F4F5F7]"
                  }`}
                >
                  <item.icon
                    className={`h-[18px] w-[18px] ${isActive ? "text-[#6C9B8B]" : "text-[#9A9FA5]"}`}
                  />
                  <span className={`text-sm ${isActive ? "font-medium" : ""}`}>
                    {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Managements */}
        <div>
          <p className="mb-2 px-3 text-xs text-[#9A9FA5]">Managements</p>
          <nav className="flex flex-col gap-0.5">
            {mgmtNav.map((item) => (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`flex h-[42px] items-center gap-2.5 rounded-[10px] px-3 text-left transition-colors ${
                  activeTab === item.id
                    ? "bg-[#6C9B8B]/10 text-[#1A1D1F]"
                    : "text-[#6F767E] hover:bg-[#F4F5F7]"
                }`}
              >
                <item.icon className="h-[18px] w-[18px] text-[#9A9FA5]" />
                <span className="text-sm">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Bottom: Upload new file */}
      <div className="mt-auto border-t border-[#EFEFEF] p-5">
        <button
          onClick={clearData}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm text-[#6F767E] transition-colors hover:bg-[#F4F5F7]"
        >
          <LogOut className="h-[18px] w-[18px] text-[#9A9FA5]" />
          Upload new file
        </button>
      </div>
    </aside>
  );
}
