"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import { Menu, Eye, EyeOff, Pencil, Lock, BookX, ChevronDown } from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { PrivacyProvider, usePrivacy } from "@/lib/privacy-context";
import { ClosingProvider, useClosing } from "@/lib/closing-context";
import { FileUpload } from "@/components/upload/file-upload";
import { Sidebar } from "@/components/dashboard/sidebar";

function CurrencySelector() {
  const { data, setCurrency } = useDashboard();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!data || !data.availableCurrencies || data.availableCurrencies.length <= 1) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 rounded-lg border border-[#EFEFEF] px-2.5 py-1.5 text-xs font-medium text-[#6F767E] transition-colors hover:bg-[#F4F5F7]"
        title="Change display currency"
      >
        {data.currency}
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 max-h-60 w-48 overflow-y-auto rounded-lg border border-[#EFEFEF] bg-white py-1 shadow-lg">
          {data.availableCurrencies.map((c) => (
            <button
              key={c.guid}
              onClick={() => {
                setCurrency(c.guid);
                setOpen(false);
              }}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-[#F4F5F7] ${
                c.mnemonic === data.currency ? "font-semibold text-[#3B6B8A]" : "text-[#6F767E]"
              }`}
            >
              <span className="w-10 font-mono">{c.mnemonic}</span>
              <span className="truncate text-[#9A9FA5]">{c.fullname}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardInner({ children }: { children: React.ReactNode }) {
  const { data, isWritable, isXmlSource, toggleWritable } = useDashboard();
  const { hideValues, toggleHideValues } = usePrivacy();
  const { excludeClosing, toggleExcludeClosing } = useClosing();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);

  if (!data) {
    return <FileUpload />;
  }

  return (
    <div className={`flex h-screen bg-[#F4F5F7] ${hideValues ? "privacy-mode" : ""}`}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - collapsed by default, expands on hover */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        <Sidebar
          onNavigate={() => setSidebarOpen(false)}
          expanded={sidebarHovered}
        />
      </div>

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-[68px] shrink-0 items-center justify-between border-b border-[#EFEFEF] bg-white px-4 sm:px-8">
          <div className="flex items-center gap-3 -ml-6">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-1.5 text-[#6F767E] transition-colors hover:bg-[#F4F5F7] md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <Image
              src="/logo.png"
              alt="GnuDash"
              width={360}
              height={96}
              className="rounded-lg"
              style={{ width: "auto", height: "88px" }}
            />
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {isXmlSource && data && (
              <span
                className="flex items-center gap-1.5 rounded-lg border border-[#EFEFEF] px-3 py-1.5 text-xs font-medium text-[#9A9FA5]"
                title="XML files are read-only. Re-save as SQLite3 in GNUCash to enable editing."
              >
                <Lock className="h-3 w-3" />
                <span className="hidden sm:inline">XML &middot; Read-only</span>
              </span>
            )}
            {!isXmlSource && isWritable && (
              <button
                onClick={toggleWritable}
                className="flex items-center gap-1.5 rounded-lg border border-[#3B6B8A] bg-[#3B6B8A]/10 px-3 py-1.5 text-xs font-medium text-[#3B6B8A] transition-colors hover:bg-[#3B6B8A]/20"
                title="Click to switch to read-only mode"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Editing</span>
              </button>
            )}
            {!isXmlSource && !isWritable && data && (
              <button
                onClick={toggleWritable}
                className="flex items-center gap-1.5 rounded-lg border border-[#EFEFEF] px-3 py-1.5 text-xs font-medium text-[#9A9FA5] transition-colors hover:bg-[#F4F5F7] hover:text-[#6F767E]"
                title="Click to enable editing"
              >
                <Lock className="h-3 w-3" />
                <span className="hidden sm:inline">Read-only</span>
              </button>
            )}
            {data?.hasClosingTransactions && (
              <button
                onClick={toggleExcludeClosing}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  excludeClosing
                    ? "border-[#6C9B8B] bg-[#6C9B8B]/10 text-[#6C9B8B]"
                    : "border-[#EFEFEF] text-[#6F767E] hover:bg-[#F4F5F7]"
                }`}
                title={excludeClosing ? "Show closing transactions" : "Exclude closing transactions"}
              >
                <BookX className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{excludeClosing ? "Closing excluded" : "Exclude closing"}</span>
              </button>
            )}
            <CurrencySelector />
            <button
              onClick={toggleHideValues}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                hideValues
                  ? "border-[#6C9B8B] bg-[#6C9B8B]/10 text-[#6C9B8B]"
                  : "border-[#EFEFEF] text-[#6F767E] hover:bg-[#F4F5F7]"
              }`}
              title={hideValues ? "Show values" : "Hide values"}
            >
              {hideValues ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{hideValues ? "Show values" : "Hide values"}</span>
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClosingProvider>
      <PrivacyProvider>
        <DashboardInner>{children}</DashboardInner>
      </PrivacyProvider>
    </ClosingProvider>
  );
}
