"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  List,
  Receipt,
  TrendingUp,
  Banknote,
  LogOut,
  Download,
} from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";

const mainNav = [
  { icon: Home, label: "Dashboard", href: "/" },
  { icon: List, label: "Accounts", href: "/accounts" },
  { icon: Receipt, label: "Income / Expenses", href: "/income-expenses" },
  { icon: Banknote, label: "Cash Flow", href: "/cash-flow" },
  { icon: TrendingUp, label: "Investment", href: "/investment" },
];


interface SidebarProps {
  onNavigate?: () => void;
  expanded?: boolean;
}

export function Sidebar({ onNavigate, expanded }: SidebarProps) {
  const { clearData, uploadedAt, exportFile } = useDashboard();
  const pathname = usePathname();

  return (
    <aside
      className={`flex h-full flex-col border-r border-[#EFEFEF] bg-white transition-[width] duration-200 overflow-hidden ${
        expanded ? "w-[260px]" : "w-[60px]"
      }`}
    >
      <div className={`flex flex-col gap-6 ${expanded ? "p-5" : "p-2 pt-5"}`}>
        {/* Main Menu */}
        <div>
          {expanded && (
            <p className="mb-2 px-3 text-xs text-[#9A9FA5]">Main menu</p>
          )}
          <nav className="flex flex-col gap-0.5">
            {mainNav.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavigate}
                  title={item.label}
                  className={`flex items-center rounded-[10px] transition-colors whitespace-nowrap ${
                    expanded
                      ? "h-[42px] gap-2.5 px-3"
                      : "h-[42px] w-[42px] mx-auto justify-center"
                  } ${
                    isActive
                      ? "bg-[#6C9B8B]/10 text-[#1A1D1F]"
                      : "text-[#6F767E] hover:bg-[#F4F5F7]"
                  }`}
                >
                  <item.icon
                    className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-[#6C9B8B]" : "text-[#9A9FA5]"}`}
                  />
                  {expanded && (
                    <span className={`text-sm ${isActive ? "font-medium" : ""}`}>
                      {item.label}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Bottom: Export + Upload new file */}
      <div className={`mt-auto border-t border-[#EFEFEF] ${expanded ? "p-5" : "p-2"}`}>
        <button
          onClick={exportFile}
          title="Export .gnucash file"
          className={`flex items-center rounded-[10px] text-sm text-[#6F767E] transition-colors hover:bg-[#F4F5F7] whitespace-nowrap ${
            expanded
              ? "w-full gap-2.5 px-3 py-2"
              : "h-[42px] w-[42px] mx-auto justify-center"
          }`}
        >
          <Download className="h-[18px] w-[18px] shrink-0 text-[#9A9FA5]" />
          {expanded && "Export .gnucash file"}
        </button>
        <button
          onClick={clearData}
          title="Upload new file"
          className={`flex items-center rounded-[10px] text-sm text-[#6F767E] transition-colors hover:bg-[#F4F5F7] whitespace-nowrap ${
            expanded
              ? "w-full gap-2.5 px-3 py-2"
              : "h-[42px] w-[42px] mx-auto justify-center"
          }`}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0 text-[#9A9FA5]" />
          {expanded && "Upload new file"}
        </button>
        {expanded && uploadedAt && (
          <p className="mt-1.5 px-3 text-xs text-[#9A9FA5]">
            Loaded {uploadedAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}{" "}
            {uploadedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </aside>
  );
}
