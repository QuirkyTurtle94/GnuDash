"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Home,
  BookOpen,
  List,
  Receipt,
  CreditCard,
  TrendingUp,
  Target,
  LogOut,
  Download,
} from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";

const mainNav = [
  { icon: Home, label: "Dashboard", href: "/" },
  { icon: List, label: "Accounts", href: "/accounts" },
  { icon: BookOpen, label: "Transactions", href: "/transactions" },
  { icon: Receipt, label: "Income", href: "/income" },
  { icon: CreditCard, label: "Spending", href: "/spending" },
  { icon: TrendingUp, label: "Investment", href: "/investment" },
  { icon: Target, label: "Budget", href: "/budget" },
];


interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { clearData, uploadedAt, exportFile } = useDashboard();
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-[#EFEFEF] bg-white">
      <div className="flex flex-col gap-6 p-5">
        {/* Logo */}
        <div className="flex items-center">
          <Image
            src="/logo.png"
            alt="GnuDash"
            width={230}
            height={153}
            className="rounded-2xl"
            style={{ width: "auto", height: "auto" }}
          />
        </div>

        {/* Main Menu */}
        <div>
          <p className="mb-2 px-3 text-xs text-[#9A9FA5]">Main menu</p>
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
                </Link>
              );
            })}
          </nav>
        </div>

      </div>

      {/* Bottom: Export + Upload new file */}
      <div className="mt-auto border-t border-[#EFEFEF] p-5">
        <button
          onClick={exportFile}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm text-[#6F767E] transition-colors hover:bg-[#F4F5F7]"
        >
          <Download className="h-[18px] w-[18px] text-[#9A9FA5]" />
          Export .gnucash file
        </button>
        <button
          onClick={clearData}
          className="flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm text-[#6F767E] transition-colors hover:bg-[#F4F5F7]"
        >
          <LogOut className="h-[18px] w-[18px] text-[#9A9FA5]" />
          Upload new file
        </button>
        {uploadedAt && (
          <p className="mt-1.5 px-3 text-xs text-[#9A9FA5]">
            Loaded {uploadedAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}{" "}
            {uploadedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </aside>
  );
}
