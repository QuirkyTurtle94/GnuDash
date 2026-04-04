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
import type { CreateTransactionPayload, DeleteTransactionPayload, EditTransactionPayload, CreateAccountPayload, UpdateAccountPayload, DeleteAccountPayload, CreateCommodityPayload } from "@/lib/gnucash/worker/messages";
import { generateDemoData } from "@/lib/demo-data";

const STORAGE_KEY = "gnucash-dashboard-data";
const STORAGE_VERSION = "v14"; // bumped: WASM migration
const VERSION_KEY = "gnucash-dashboard-version";
const UPLOADED_AT_KEY = "gnucash-dashboard-uploaded-at";
const WRITABLE_KEY = "gnucash-dashboard-writable";

interface DashboardContextType {
  data: DashboardData | null;
  isLoading: boolean;
  error: string | null;
  uploadedAt: Date | null;
  isWritable: boolean;
  toggleWritable: () => Promise<void>;
  uploadFile: (file: File, writable?: boolean) => Promise<void>;
  loadDemo: () => Promise<void>;
  clearData: () => void;
  createTransaction: (payload: CreateTransactionPayload) => Promise<void>;
  deleteTransaction: (payload: DeleteTransactionPayload) => Promise<void>;
  editTransaction: (payload: EditTransactionPayload) => Promise<void>;
  createAccount: (payload: CreateAccountPayload) => Promise<void>;
  updateAccount: (payload: UpdateAccountPayload) => Promise<void>;
  deleteAccountWithReallocation: (payload: DeleteAccountPayload) => Promise<void>;
  createCommodity: (payload: CreateCommodityPayload) => Promise<void>;
  exportFile: () => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedAt, setUploadedAt] = useState<Date | null>(null);
  const [isWritable, setIsWritable] = useState(false);
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
      // Check if previously opened as writable
      const storedWritable = sessionStorage.getItem(WRITABLE_KEY) === "true";

      // Try loading from OPFS via the Worker
      try {
        const client = getClient();
        await client.waitForReady();
        const loaded = await client.openFromOPFS(storedWritable);
        if (loaded && !cancelled) {
          const dashboardData = await client.getFullDashboardData();
          if (!cancelled) {
            setData(dashboardData);
            setIsWritable(storedWritable);
            const stored = sessionStorage.getItem(UPLOADED_AT_KEY);
            if (stored) setUploadedAt(new Date(stored));
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
          const storedAt = sessionStorage.getItem(UPLOADED_AT_KEY);
          if (storedAt) setUploadedAt(new Date(storedAt));
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

  async function toggleWritable() {
    const newWritable = !isWritable;
    try {
      const client = getClient();
      await client.waitForReady();
      const loaded = await client.openFromOPFS(newWritable);
      if (loaded) {
        const dashboardData = await client.getFullDashboardData();
        setData(dashboardData);
        setIsWritable(newWritable);
        sessionStorage.setItem(WRITABLE_KEY, String(newWritable));
      }
    } catch {
      // If toggling fails (e.g., no OPFS file), silently ignore
    }
  }

  async function uploadFile(file: File, writable: boolean = false) {
    setIsLoading(true);
    setError(null);

    try {
      const client = getClient();
      await client.waitForReady();
      await client.openFile(file, writable);
      const dashboardData = await client.getFullDashboardData();
      const now = new Date();
      setData(dashboardData);
      setUploadedAt(now);
      setIsWritable(writable);
      sessionStorage.setItem(UPLOADED_AT_KEY, now.toISOString());
      sessionStorage.setItem(WRITABLE_KEY, String(writable));
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
      setIsWritable(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load demo");
    } finally {
      setIsLoading(false);
    }
  }

  function clearData() {
    setData(null);
    setError(null);
    setUploadedAt(null);
    setIsWritable(false);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(UPLOADED_AT_KEY);
    sessionStorage.removeItem(WRITABLE_KEY);
    // Close the worker DB but keep the worker alive
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
    }
  }

  async function createTransaction(payload: CreateTransactionPayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");

    const client = getClient();
    const dashboardData = await client.createTransaction(payload);
    setData(dashboardData);
  }

  async function deleteTransactionFn(payload: DeleteTransactionPayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");

    const client = getClient();
    const dashboardData = await client.deleteTransaction(payload);
    setData(dashboardData);
  }

  async function editTransaction(payload: EditTransactionPayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");

    const client = getClient();
    const dashboardData = await client.editTransaction(payload);
    setData(dashboardData);
  }

  async function createAccountFn(payload: CreateAccountPayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");
    const client = getClient();
    setData(await client.createAccount(payload));
  }

  async function updateAccountFn(payload: UpdateAccountPayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");
    const client = getClient();
    setData(await client.updateAccount(payload));
  }

  async function deleteAccountWithReallocationFn(payload: DeleteAccountPayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");
    const client = getClient();
    setData(await client.deleteAccount(payload));
  }

  async function createCommodityFn(payload: CreateCommodityPayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");
    const client = getClient();
    setData(await client.createCommodity(payload));
  }

  async function exportFile() {
    const client = getClient();
    const buffer = await client.exportDatabase();
    const blob = new Blob([buffer], { type: "application/x-sqlite3" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "gnucash-export.gnucash";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <DashboardContext.Provider
      value={{ data, isLoading, error, uploadedAt, isWritable, toggleWritable, uploadFile, loadDemo, clearData, createTransaction, deleteTransaction: deleteTransactionFn, editTransaction, createAccount: createAccountFn, updateAccount: updateAccountFn, deleteAccountWithReallocation: deleteAccountWithReallocationFn, createCommodity: createCommodityFn, exportFile }}
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
