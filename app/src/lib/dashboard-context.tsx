"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import type { DashboardData } from "@/lib/types/gnucash";
import { GnuCashWorkerClient } from "@/lib/gnucash/worker/client";
import { generateDemoData } from "@/lib/demo-data";

const STORAGE_KEY = "gnucash-dashboard-data";
const STORAGE_VERSION = "v14"; // bumped: WASM migration
const VERSION_KEY = "gnucash-dashboard-version";

interface DashboardContextType {
  data: DashboardData | null;
  isLoading: boolean;
  error: string | null;
  uploadFile: (file: File) => Promise<void>;
  loadDemo: () => Promise<void>;
  clearData: () => void;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientRef = useRef<GnuCashWorkerClient | null>(null);

  function getClient(): GnuCashWorkerClient {
    if (!clientRef.current) {
      clientRef.current = new GnuCashWorkerClient();
    }
    return clientRef.current;
  }

  // On mount: try OPFS first, then fall back to sessionStorage
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      // Try loading from OPFS via the Worker
      try {
        const client = getClient();
        await client.waitForReady();
        const loaded = await client.openFromOPFS();
        if (loaded && !cancelled) {
          const dashboardData = await client.getFullDashboardData();
          if (!cancelled) {
            setData(dashboardData);
            return;
          }
        }
      } catch {
        // OPFS not available or no persisted file -- fall through
      }

      // Fall back to sessionStorage
      if (cancelled) return;
      try {
        const storedVersion = sessionStorage.getItem(VERSION_KEY);
        if (storedVersion !== STORAGE_VERSION) {
          sessionStorage.removeItem(STORAGE_KEY);
          sessionStorage.setItem(VERSION_KEY, STORAGE_VERSION);
          return;
        }
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored) {
          setData(JSON.parse(stored));
        }
      } catch {
        // ignore parse errors
      }
    }

    restore();
    return () => { cancelled = true; };
  }, []);

  // Persist to sessionStorage when data changes (fast restore cache)
  useEffect(() => {
    if (data) {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        sessionStorage.setItem(VERSION_KEY, STORAGE_VERSION);
      } catch {
        // ignore quota errors
      }
    }
  }, [data]);

  async function uploadFile(file: File) {
    setIsLoading(true);
    setError(null);

    try {
      const client = getClient();
      await client.waitForReady();
      await client.openFile(file);
      const dashboardData = await client.getFullDashboardData();
      setData(dashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsLoading(false);
    }
  }

  async function loadDemo() {
    setIsLoading(true);
    setError(null);

    try {
      const dashboardData = generateDemoData();
      setData(dashboardData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load demo");
    } finally {
      setIsLoading(false);
    }
  }

  function clearData() {
    setData(null);
    setError(null);
    sessionStorage.removeItem(STORAGE_KEY);
    // Close the worker DB but keep the worker alive
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
    }
  }

  return (
    <DashboardContext.Provider
      value={{ data, isLoading, error, uploadFile, loadDemo, clearData }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx)
    throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
