"use client";

import { useState } from "react";
import { Menu, Eye, EyeOff, Pencil, Lock } from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { PrivacyProvider, usePrivacy } from "@/lib/privacy-context";
import { FileUpload } from "@/components/upload/file-upload";
import { Sidebar } from "@/components/dashboard/sidebar";

function DashboardInner({ children }: { children: React.ReactNode }) {
  const { data, isWritable, toggleWritable } = useDashboard();
  const { hideValues, toggleHideValues } = usePrivacy();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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

      {/* Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-40 transition-transform duration-200 md:static md:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onNavigate={() => setSidebarOpen(false)} />
      </div>

      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-[#EFEFEF] bg-white px-4 sm:h-16 sm:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="rounded-lg p-1.5 text-[#6F767E] transition-colors hover:bg-[#F4F5F7] md:hidden"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className="text-sm font-medium text-[#1A1D1F] sm:text-[15px]">Home page</h1>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            {isWritable && (
              <button
                onClick={toggleWritable}
                className="flex items-center gap-1.5 rounded-lg border border-[#3B6B8A] bg-[#3B6B8A]/10 px-3 py-1.5 text-xs font-medium text-[#3B6B8A] transition-colors hover:bg-[#3B6B8A]/20"
                title="Click to switch to read-only mode"
              >
                <Pencil className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Editing</span>
              </button>
            )}
            {!isWritable && data && (
              <button
                onClick={toggleWritable}
                className="flex items-center gap-1.5 rounded-lg border border-[#EFEFEF] px-3 py-1.5 text-xs font-medium text-[#9A9FA5] transition-colors hover:bg-[#F4F5F7] hover:text-[#6F767E]"
                title="Click to enable editing"
              >
                <Lock className="h-3 w-3" />
                <span className="hidden sm:inline">Read-only</span>
              </button>
            )}
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
    <PrivacyProvider>
      <DashboardInner>{children}</DashboardInner>
    </PrivacyProvider>
  );
}
