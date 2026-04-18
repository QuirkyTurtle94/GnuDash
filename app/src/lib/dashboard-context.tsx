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
import type { BookClient } from "@/lib/client/book-client";
import { createBookClient } from "@/lib/client/factory";
import type { CreateTransactionPayload, DeleteTransactionPayload, EditTransactionPayload, BulkEditTransactionsPayload, CreateAccountPayload, UpdateAccountPayload, DeleteAccountPayload, CreateCommodityPayload, AddPricePayload, EditPricePayload, DeletePricePayload } from "@/lib/gnucash/worker/messages";
import { generateDemoData } from "@/lib/demo-data";

const STORAGE_KEY = "gnucash-dashboard-data";
const STORAGE_VERSION = "v14"; // bumped: WASM migration
const VERSION_KEY = "gnucash-dashboard-version";
const UPLOADED_AT_KEY = "gnucash-dashboard-uploaded-at";
const WRITABLE_KEY = "gnucash-dashboard-writable";
const BACKEND_KEY = "gnucash-dashboard-backend";

/**
 * Compile-time flag: server-mode builds expose the "Server (Postgres)"
 * option on the upload page. Local builds stay OPFS-only — nothing to
 * toggle, no login flow.
 */
const SERVER_MODE = process.env.NEXT_PUBLIC_SERVER_MODE === "1";

export type BookBackend = "opfs" | "api";

interface DashboardContextType {
  data: DashboardData | null;
  isLoading: boolean;
  error: string | null;
  uploadedAt: Date | null;
  isWritable: boolean;
  isXmlSource: boolean;
  /** Where the current book lives. */
  backend: BookBackend;
  /** True iff server backend is selected but no active session. */
  needsLogin: boolean;
  /** Whether the current build supports the API backend at all. */
  serverModeAvailable: boolean;
  setBackend: (b: BookBackend) => void;
  login: (passphrase: string) => Promise<void>;
  logout: () => Promise<void>;
  toggleWritable: () => Promise<void>;
  uploadFile: (file: File, writable?: boolean) => Promise<void>;
  loadDemo: () => Promise<void>;
  clearData: () => void;
  createTransaction: (payload: CreateTransactionPayload) => Promise<void>;
  deleteTransaction: (payload: DeleteTransactionPayload) => Promise<void>;
  editTransaction: (payload: EditTransactionPayload) => Promise<void>;
  bulkEditTransactions: (payload: BulkEditTransactionsPayload) => Promise<void>;
  createAccount: (payload: CreateAccountPayload) => Promise<void>;
  updateAccount: (payload: UpdateAccountPayload) => Promise<void>;
  deleteAccountWithReallocation: (payload: DeleteAccountPayload) => Promise<void>;
  createCommodity: (payload: CreateCommodityPayload) => Promise<void>;
  addPrice: (payload: AddPricePayload) => Promise<void>;
  editPrice: (payload: EditPricePayload) => Promise<void>;
  deletePrice: (payload: DeletePricePayload) => Promise<void>;
  exportFile: () => Promise<void>;
  setCurrency: (currencyGuid: string) => Promise<void>;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadedAt, setUploadedAt] = useState<Date | null>(null);
  const [isWritable, setIsWritable] = useState(false);
  const [isXmlSource, setIsXmlSource] = useState(false);
  const [backend, setBackendState] = useState<BookBackend>("opfs");
  const [needsLogin, setNeedsLogin] = useState(false);
  const clientRef = useRef<BookClient | null>(null);
  const backendRef = useRef<BookBackend>("opfs");

  /**
   * Build (or reuse) a BookClient for the currently-selected backend.
   * `setBackend` disposes the previous client before flipping state so
   * this always returns one pointed at the current backend.
   */
  function getClient(): BookClient {
    if (!clientRef.current) {
      clientRef.current = createBookClient({ backend: backendRef.current });
    }
    return clientRef.current;
  }

  /**
   * Ping /api/auth/me to tell "not logged in" apart from "logged in but
   * no book yet" — the former surfaces the login form, the latter surfaces
   * the upload form.
   */
  async function probeSession(): Promise<boolean> {
    try {
      const res = await fetch("/api/auth/me", {
        method: "GET",
        credentials: "same-origin",
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // On mount: pick backend from sessionStorage, probe session if api,
  // then try to restore a previously-opened book.
  useEffect(() => {
    let cancelled = false;

    async function boot() {
      const stored = sessionStorage.getItem(BACKEND_KEY);
      const chosen: BookBackend =
        SERVER_MODE && stored === "api" ? "api" : "opfs";
      if (cancelled) return;
      backendRef.current = chosen;
      setBackendState(chosen);

      if (chosen === "api") {
        const authed = await probeSession();
        if (cancelled) return;
        if (!authed) {
          setNeedsLogin(true);
          return;
        }
      }

      try {
        const storedWritable = sessionStorage.getItem(WRITABLE_KEY) === "true";
        const client = getClient();
        await client.waitForReady();
        const loaded = await client.restoreSession(storedWritable);
        if (loaded && !cancelled) {
          const dashboardData = await client.getFullDashboardData();
          if (!cancelled) {
            setData(dashboardData);
            setIsWritable(chosen === "api" ? true : storedWritable);
            const stored = sessionStorage.getItem(UPLOADED_AT_KEY);
            if (stored) setUploadedAt(new Date(stored));
            return;
          }
        }
      } catch {
        // Restoration failure isn't fatal — user can upload a fresh file.
      }

      // Fall back to the sessionStorage data cache (OPFS only).
      if (chosen === "opfs") {
        try {
          const storedVersion = sessionStorage.getItem(VERSION_KEY);
          if (storedVersion !== STORAGE_VERSION) {
            sessionStorage.removeItem(STORAGE_KEY);
            sessionStorage.setItem(VERSION_KEY, STORAGE_VERSION);
            return;
          }
          const stored = sessionStorage.getItem(STORAGE_KEY);
          if (stored && !cancelled) {
            setData(JSON.parse(stored));
            const storedAt = sessionStorage.getItem(UPLOADED_AT_KEY);
            if (storedAt) setUploadedAt(new Date(storedAt));
          }
        } catch {
          // ignore parse errors
        }
      }
    }

    boot();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cache DashboardData in sessionStorage for fast restore on the OPFS path.
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

  function setBackend(b: BookBackend) {
    if (b === backend) return;
    if (clientRef.current) {
      clientRef.current.close();
      clientRef.current = null;
    }
    backendRef.current = b;
    setBackendState(b);
    sessionStorage.setItem(BACKEND_KEY, b);
    setData(null);
    setError(null);
    setUploadedAt(null);
    setIsWritable(false);
    setIsXmlSource(false);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(UPLOADED_AT_KEY);
    sessionStorage.removeItem(WRITABLE_KEY);
    if (b === "api") {
      probeSession().then((authed) => setNeedsLogin(!authed));
    } else {
      setNeedsLogin(false);
    }
  }

  async function login(passphrase: string): Promise<void> {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ passphrase }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Login failed (${res.status})`);
    }
    setNeedsLogin(false);
    try {
      const client = getClient();
      await client.waitForReady();
      const loaded = await client.restoreSession(true);
      if (loaded) {
        const dashboardData = await client.getFullDashboardData();
        setData(dashboardData);
        setIsWritable(true);
        setUploadedAt(new Date());
      }
    } catch {
      // No existing book is fine — user will upload one.
    }
  }

  async function logout(): Promise<void> {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } finally {
      if (clientRef.current) {
        clientRef.current.close();
        clientRef.current = null;
      }
      setData(null);
      setUploadedAt(null);
      setIsWritable(false);
      setIsXmlSource(false);
      setNeedsLogin(true);
    }
  }

  async function toggleWritable() {
    // API mode is always writable once authed; no-op here.
    if (backend === "api") return;
    const newWritable = !isWritable;
    try {
      const client = getClient();
      await client.waitForReady();
      const loaded = await client.restoreSession(newWritable);
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
      const { isXml } = await client.openFile(file, writable);
      const dashboardData = await client.getFullDashboardData();
      const now = new Date();
      setData(dashboardData);
      setUploadedAt(now);
      setIsXmlSource(isXml);
      const effectiveWritable =
        backend === "api" ? true : isXml ? false : writable;
      setIsWritable(effectiveWritable);
      sessionStorage.setItem(UPLOADED_AT_KEY, now.toISOString());
      sessionStorage.setItem(WRITABLE_KEY, String(effectiveWritable));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      // A 401 mid-upload means the session expired; bounce back to login.
      if (/401|unauthori[sz]ed/i.test(msg) && backend === "api") {
        setNeedsLogin(true);
      }
      setError(msg);
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
    setIsXmlSource(false);
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(UPLOADED_AT_KEY);
    sessionStorage.removeItem(WRITABLE_KEY);
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

  async function bulkEditTransactionsFn(payload: BulkEditTransactionsPayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");

    const client = getClient();
    const dashboardData = await client.bulkEditTransactions(payload);
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

  async function addPriceFn(payload: AddPricePayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");
    const client = getClient();
    setData(await client.addPrice(payload));
  }

  async function editPriceFn(payload: EditPricePayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");
    const client = getClient();
    setData(await client.editPrice(payload));
  }

  async function deletePriceFn(payload: DeletePricePayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");
    const client = getClient();
    setData(await client.deletePrice(payload));
  }

  async function setCurrencyFn(currencyGuid: string) {
    const client = getClient();
    const dashboardData = await client.setCurrency(currencyGuid);
    setData(dashboardData);
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
      value={{ data, isLoading, error, uploadedAt, isWritable, isXmlSource, backend, needsLogin, serverModeAvailable: SERVER_MODE, setBackend, login, logout, toggleWritable, uploadFile, loadDemo, clearData, createTransaction, deleteTransaction: deleteTransactionFn, editTransaction, bulkEditTransactions: bulkEditTransactionsFn, createAccount: createAccountFn, updateAccount: updateAccountFn, deleteAccountWithReallocation: deleteAccountWithReallocationFn, createCommodity: createCommodityFn, addPrice: addPriceFn, editPrice: editPriceFn, deletePrice: deletePriceFn, exportFile, setCurrency: setCurrencyFn }}
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
