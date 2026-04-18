"use client";

import { Cloud, HardDrive } from "lucide-react";

/**
 * Radio-style toggle letting the user pick where a book lives.
 * Only rendered in server-mode builds — the local-mode static build has
 * exactly one option (OPFS) so there's nothing to toggle.
 */
export function BackendSelector({
  backend,
  onChange,
}: {
  backend: "opfs" | "api";
  onChange: (b: "opfs" | "api") => void;
}) {
  return (
    <div className="mb-4 grid grid-cols-2 gap-2">
      <button
        onClick={() => onChange("opfs")}
        className={`flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all ${
          backend === "opfs"
            ? "border-[#6C9B8B] bg-[#6C9B8B]/5"
            : "border-[#D4DAE0] bg-white hover:border-[#6C9B8B]/50"
        }`}
      >
        <div className="flex items-center gap-2">
          <HardDrive className="h-4 w-4 text-[#6C9B8B]" />
          <span className="text-sm font-medium text-[#1A1D1F]">Browser</span>
        </div>
        <p className="text-xs text-[#9A9FA5]">
          Stored in this browser. Private. Single device.
        </p>
      </button>
      <button
        onClick={() => onChange("api")}
        className={`flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all ${
          backend === "api"
            ? "border-[#3B6B8A] bg-[#3B6B8A]/5"
            : "border-[#D4DAE0] bg-white hover:border-[#3B6B8A]/50"
        }`}
      >
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-[#3B6B8A]" />
          <span className="text-sm font-medium text-[#1A1D1F]">Server</span>
        </div>
        <p className="text-xs text-[#9A9FA5]">
          Stored in Postgres. Access from any device.
        </p>
      </button>
    </div>
  );
}
