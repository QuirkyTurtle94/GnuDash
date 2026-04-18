"use client";

import { useCallback } from "react";
import { Upload } from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";

interface ReuploadButtonProps {
  /** True when the sidebar is expanded so we show the label; icon-only otherwise. */
  expanded?: boolean;
}

/**
 * Sidebar button shown only when the active book is on the Postgres backend.
 *
 * Clicking prompts for confirmation (this destroys the server book), then a
 * file picker, then calls `reuploadPostgresBook` which drops+imports+reloads
 * in one go. The import route (PR 3 + fix/pg-import-schema-and-rollback)
 * does the drop+recreate atomically in a single transaction, so a mid-import
 * failure leaves the previous book intact on the server — the user just sees
 * an inline error and can retry.
 *
 * Kept sibling to local-upload-panel / server-connect-panel so all
 * upload-adjacent UI lives in one folder.
 */
export function ReuploadButton({ expanded = true }: ReuploadButtonProps) {
  const { reuploadPostgresBook, isLoading } = useDashboard();

  const handleClick = useCallback(() => {
    if (isLoading) return;
    if (
      !window.confirm(
        "This will drop the existing Postgres book and replace it with the " +
          "file you pick. Continue?",
      )
    ) {
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".gnucash";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        await reuploadPostgresBook(file);
      }
    };
    input.click();
  }, [isLoading, reuploadPostgresBook]);

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      title="Reupload to Postgres"
      className={`flex items-center rounded-[10px] text-sm text-muted-foreground transition-colors hover:bg-muted whitespace-nowrap disabled:opacity-50 ${
        expanded
          ? "w-full gap-2.5 px-3 py-2"
          : "h-[42px] w-[42px] mx-auto justify-center"
      }`}
    >
      <Upload className="h-[18px] w-[18px] shrink-0 text-muted-foreground/70" />
      {expanded && "Reupload to Postgres"}
    </button>
  );
}
