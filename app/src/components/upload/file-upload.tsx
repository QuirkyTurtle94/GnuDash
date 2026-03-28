"use client";

import { useCallback, useState } from "react";
import Image from "next/image";
import { Upload, Loader2 } from "lucide-react";
import { useDashboard } from "@/lib/dashboard-context";

export function FileUpload() {
  const { uploadFile, isLoading, error } = useDashboard();
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".gnucash")) {
        return;
      }
      uploadFile(file);
    },
    [uploadFile]
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
                Parsing your GNUCash file...
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

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 p-4 text-center">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <p className="mt-6 text-center text-xs text-[#9A9FA5]">
          Your financial data is processed in memory and never stored on our servers.
        </p>
      </div>
    </div>
  );
}
