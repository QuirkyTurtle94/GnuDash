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
  Wand2,
} from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { ReuploadButton } from "@/components/upload/reupload-button";

const mainNav = [
  { icon: Home, label: "Dashboard", href: "/" },
  { icon: List, label: "Accounts", href: "/accounts" },
  { icon: Receipt, label: "Income / Expenses", href: "/income-expenses" },
  { icon: Banknote, label: "Cash Flow", href: "/cash-flow" },
  { icon: TrendingUp, label: "Investment", href: "/investment" },
  { icon: Wand2, label: "Special functions", href: "/special-functions" },
];


interface SidebarProps {
  onNavigate?: () => void;
  expanded?: boolean;
}

export function Sidebar({ onNavigate, expanded }: SidebarProps) {
  const { clearData, uploadedAt, exportFile, backend } = useDashboard();
  const pathname = usePathname();

  return (
    <aside
      className={`flex h-full flex-col border-r border-border bg-card transition-[width] duration-200 overflow-hidden ${
        expanded ? "w-[260px]" : "w-[60px]"
      }`}
    >
      <div className={`flex flex-col gap-6 ${expanded ? "p-5" : "p-2 pt-5"}`}>
        {/* Main Menu */}
        <div>
          {expanded && (
            <p className="mb-2 px-3 text-xs text-muted-foreground/70">Main menu</p>
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
                      ? "bg-[#6C9B8B]/10 text-foreground dark:bg-[#8FBCA9]/10"
                      : "text-muted-foreground hover:bg-muted"
                  }`}
                >
                  <item.icon
                    className={`h-[18px] w-[18px] shrink-0 ${isActive ? "text-[#6C9B8B] dark:text-[#8FBCA9]" : "text-muted-foreground/70"}`}
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

      {/* Bottom: Export + Reupload (PG only) + Upload new file */}
      <div className={`mt-auto border-t border-border ${expanded ? "p-5" : "p-2"}`}>
        <button
          onClick={exportFile}
          title="Export .gnucash file"
          className={`flex items-center rounded-[10px] text-sm text-muted-foreground transition-colors hover:bg-muted whitespace-nowrap ${
            expanded
              ? "w-full gap-2.5 px-3 py-2"
              : "h-[42px] w-[42px] mx-auto justify-center"
          }`}
        >
          <Download className="h-[18px] w-[18px] shrink-0 text-muted-foreground/70" />
          {expanded && "Export .gnucash file"}
        </button>
        {backend === "postgres" && <ReuploadButton expanded={expanded} />}
        <button
          onClick={clearData}
          title={backend === "postgres" ? "Disconnect" : "Upload new file"}
          className={`flex items-center rounded-[10px] text-sm text-muted-foreground transition-colors hover:bg-muted whitespace-nowrap ${
            expanded
              ? "w-full gap-2.5 px-3 py-2"
              : "h-[42px] w-[42px] mx-auto justify-center"
          }`}
        >
          <LogOut className="h-[18px] w-[18px] shrink-0 text-muted-foreground/70" />
          {expanded && (backend === "postgres" ? "Disconnect" : "Upload new file")}
        </button>
        {expanded && uploadedAt && (
          <p className="mt-1.5 px-3 text-xs text-muted-foreground/70">
            Loaded {uploadedAt.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}{" "}
            {uploadedAt.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </div>
    </aside>
  );
}
