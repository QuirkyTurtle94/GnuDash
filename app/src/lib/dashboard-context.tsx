"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import type { DashboardData } from "@/lib/types/gnucash";

const STORAGE_KEY = "gnucash-dashboard-data";
const STORAGE_VERSION = "v12"; // bump this when DashboardData shape changes
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

  // Restore from sessionStorage on mount (clear if version mismatch)
  useEffect(() => {
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
  }, []);

  // Persist to sessionStorage when data changes
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
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Upload failed");
      }

      const dashboardData = await response.json();
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
      const response = await fetch("/api/demo");
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to load demo");
      }
      const dashboardData = await response.json();
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
