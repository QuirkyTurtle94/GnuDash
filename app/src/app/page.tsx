"use client";

import { useDashboard } from "@/lib/dashboard-context";
import { FileUpload } from "@/components/upload/file-upload";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";

export default function Home() {
  const { data } = useDashboard();

  if (!data) {
    return <FileUpload />;
  }

  return <DashboardShell />;
}
