"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { FileUpload } from "@/components/upload/file-upload";
import { Sidebar } from "@/components/dashboard/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { data } = useDashboard();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (!data) {
    return <FileUpload />;
  }

  return (
    <div className="flex h-screen bg-[#F4F5F7]">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar — always visible on md+, drawer on mobile */}
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
            <div className="h-8 w-8 rounded-full bg-[#D4DAE0] sm:h-9 sm:w-9" />
            <span className="hidden text-sm font-medium text-[#1A1D1F] sm:block">
              My Dashboard
            </span>
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
