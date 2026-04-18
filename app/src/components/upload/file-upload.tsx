"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { LocalUploadPanel } from "./local-upload-panel";
import { ServerConnectPanel } from "./server-connect-panel";

const TAB_PREF_KEY = "gnudash-upload-backend";
/**
 * When DashboardContext decides the last session was on Postgres, it keeps
 * this session-storage marker in place so the upload screen can auto-select
 * the Server tab — distinct from the localStorage tab preference because
 * we want "was on PG last time" to beat a stale localStorage value from
 * before the user ever touched Server.
 */
const BACKEND_KEY = "gnucash-dashboard-backend";
type TabId = "local" | "server";
const DEFAULT_TAB: TabId = "local";

/**
 * Whether the Server (Postgres) backend is reachable in this build. `false`
 * for static-export builds where `/api/pg/*` routes were parked out by
 * scripts/next-build.mjs, `true` for standalone builds (and dev servers,
 * which default to true via Next.js env handling).
 *
 * Inlined at build time, so the upload UI can pretend the Server tab never
 * existed rather than showing a tab whose Connect button would 404.
 */
const HAS_SERVER_BACKEND =
  process.env.NEXT_PUBLIC_HAS_SERVER_BACKEND !== "false";

/**
 * Upload wizard shown when no book is loaded. The two backend choices
 * (Local OPFS / Server Postgres) live behind tabs so the familiar drag-drop
 * experience stays the default for the public pages deployment, and
 * self-hosters get the Server tab alongside. The active tab is mirrored to
 * localStorage so revisiting the app lands on whichever backend the user
 * last reached for.
 */
export function FileUpload() {
  const [tab, setTab] = useState<TabId>(DEFAULT_TAB);

  // Hydrate the saved tab preference after mount. Done in an effect rather
  // than a lazy useState initializer so the server-rendered HTML and the
  // first client render stay identical — a `localStorage` read during
  // render would mismatch SSR. The one-shot `setTab` that follows is the
  // hydration pattern Next.js recommends; the linter flags it as a
  // cascading render but there isn't a cleaner way short of
  // useSyncExternalStore, which is overkill for a single tab preference.
  useEffect(() => {
    // Static-export builds don't have the Server backend at all, so every
    // saved preference collapses to Local. Skip the hydration entirely.
    if (!HAS_SERVER_BACKEND) return;
    try {
      // Session-level backend marker wins: a user returning after a failed
      // Postgres auto-reconnect should land on the Server tab even if they'd
      // previously picked Local. The marker is only set after a successful
      // open/import, so a first-time visitor sees their localStorage pref.
      const sessionBackend = sessionStorage.getItem(BACKEND_KEY);
      if (sessionBackend === "postgres") {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTab("server");
        return;
      }
      const saved = localStorage.getItem(TAB_PREF_KEY);
      if (saved === "local" || saved === "server") {
        setTab(saved);
      }
    } catch {
      // localStorage / sessionStorage unavailable — stay on DEFAULT_TAB.
    }
  }, []);

  const handleTabChange = (value: TabId) => {
    setTab(value);
    try {
      localStorage.setItem(TAB_PREF_KEY, value);
    } catch {
      // Non-fatal — the tab choice just won't persist.
    }
  };

  // Static-export builds collapse to the single Local panel — rendering the
  // tab shell at all would be misleading because the Server panel has no
  // API routes to talk to. Standalone builds and dev servers show both.
  if (!HAS_SERVER_BACKEND) {
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
              Upload your .gnucash file to view your financial dashboard.
            </p>
          </div>
          <LocalUploadPanel />
        </div>
      </div>
    );
  }

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
            Load a .gnucash file from your device, or connect to a Postgres
            server for cross-device access.
          </p>
        </div>

        <Tabs
          value={tab}
          onValueChange={(v) => handleTabChange(v as TabId)}
          className="w-full"
        >
          <TabsList className="mx-auto mb-5 grid w-full max-w-xs grid-cols-2">
            <TabsTrigger value="local">Local file</TabsTrigger>
            <TabsTrigger value="server">Server (Postgres)</TabsTrigger>
          </TabsList>
          <TabsContent value="local">
            <LocalUploadPanel />
          </TabsContent>
          <TabsContent value="server">
            <ServerConnectPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
