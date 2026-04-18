"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { Upload, Loader2, Play } from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";
import { BackendSelector } from "./backend-selector";
import { LoginForm } from "./login-form";

export function FileUpload() {
  const {
    uploadFile,
    loadDemo,
    isLoading,
    error,
    backend,
    setBackend,
    needsLogin,
    serverModeAvailable,
    login,
  } = useDashboard();

  // Server mode + no session → login form owns the screen.
  if (serverModeAvailable && backend === "api" && needsLogin) {
    return <LoginForm login={login} />;
  }
  const [isDragging, setIsDragging] = useState(false);
  const [readOnly, setReadOnly] = useState(false);

  const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200 MB
  const [fileSizeError, setFileSizeError] = useState<string | null>(null);

  const handleFile = useCallback(
    (file: File) => {
      setFileSizeError(null);
      if (!file.name.endsWith(".gnucash")) {
        return;
      }
      if (file.size > MAX_FILE_SIZE) {
        setFileSizeError(
          `File is too large (${(file.size / 1024 / 1024).toFixed(0)} MB). Maximum supported size is 200 MB.`
        );
        return;
      }
      uploadFile(file, !readOnly);
    },
    [uploadFile, readOnly]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".gnucash";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) handleFile(file);
    };
    input.click();
  }, [handleFile]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#F4F5F7] p-4 sm:p-8">
      <div className="w-full max-w-lg">
        <div className="mb-6 text-center sm:mb-8">
          <Image
            src="/logo.png"
            alt="GnuDash"
            width={900}
            height={600}
            className="mx-auto mb-4 rounded-2xl"
            loading="eager"
            style={{ width: "auto", height: "auto" }}
          />
          <p className="mt-2 text-sm text-[#6F767E]">
            Upload your .gnucash file to view your financial dashboard
          </p>
        </div>

        {serverModeAvailable && (
          <BackendSelector backend={backend} onChange={setBackend} />
        )}

        <div
          onClick={handleClick}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-8 text-center transition-all sm:p-12 ${
            isDragging
              ? "border-[#6C9B8B] bg-[#6C9B8B]/5"
              : "border-[#D4DAE0] bg-white hover:border-[#6C9B8B]/50 hover:bg-[#6C9B8B]/5"
          }`}
        >
          {isLoading ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-[#6C9B8B]" />
              <p className="text-sm font-medium text-[#1A1D1F]">
                Analysing your GNUCash file...
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Upload className="h-10 w-10 text-[#9A9FA5]" />
              <div>
                <p className="text-sm font-medium text-[#1A1D1F]">
                  Drag & drop your .gnucash file here
                </p>
                <p className="mt-1 text-xs text-[#9A9FA5]">
                  or click to browse
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Read-write toggle */}
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-[#D4DAE0] bg-white p-3 cursor-pointer transition-all hover:border-[#6C9B8B]/50">
          <input
            type="checkbox"
            checked={readOnly}
            onChange={(e) => setReadOnly(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-[#D4DAE0] text-[#6C9B8B] accent-[#6C9B8B]"
          />
          <div>
            <span className="text-sm font-medium text-[#1A1D1F]">Read-only mode</span>
            <p className="mt-0.5 text-xs text-[#9A9FA5]">
              Prevents any changes. Uncheck to allow adding transactions and editing.
            </p>
          </div>
        </label>

        <div className="mt-4 flex items-center gap-3">
          <div className="h-px flex-1 bg-[#D4DAE0]" />
          <span className="text-xs text-[#9A9FA5]">or</span>
          <div className="h-px flex-1 bg-[#D4DAE0]" />
        </div>

        <button
          onClick={loadDemo}
          disabled={isLoading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-[#D4DAE0] bg-white px-4 py-3 text-sm font-medium text-[#6F767E] transition-all hover:border-[#6C9B8B]/50 hover:bg-[#6C9B8B]/5 hover:text-[#6C9B8B] disabled:opacity-50"
        >
          <Play className="h-4 w-4" />
          Try with demo data
        </button>

        {(error || fileSizeError) && (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-center">
            <p className="text-sm text-red-600">{fileSizeError || error}</p>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-[#9A9FA5]">
          {backend === "api"
            ? "Your data is stored on the server in Postgres — available from any device you sign into."
            : "Your financial data never leaves your device. Everything runs locally in your browser."}
        </p>
      </div>
    </div>
  );
}
