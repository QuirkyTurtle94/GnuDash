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
import type { CreateTransactionPayload, DeleteTransactionPayload, EditTransactionPayload, BulkEditTransactionsPayload, CreateAccountPayload, UpdateAccountPayload, DeleteAccountPayload, CreateCommodityPayload, AddPricePayload, EditPricePayload, DeletePricePayload, CreateBudgetPayload, UpdateBudgetPayload, DeleteBudgetPayload, SetBudgetAmountPayload, ClearBudgetAmountPayload, PostgresConnectionInfo, PostgresDumpPayload } from "@/lib/gnucash/worker/messages";
import { generateDemoData } from "@/lib/demo-data";
import { deleteFromOPFS } from "@/lib/gnucash/worker/opfs";
import {
  loadServerConfig,
  saveServerConfig,
  type ServerConfig,
} from "@/lib/storage/server-config";

const STORAGE_KEY = "gnucash-dashboard-data";
// Bumped to v15 when the Postgres backend landed (#48) — the new `backend`
// dimension means a v14-cached DashboardData may misrepresent its origin.
const STORAGE_VERSION = "v15";
const VERSION_KEY = "gnucash-dashboard-version";
const UPLOADED_AT_KEY = "gnucash-dashboard-uploaded-at";
const WRITABLE_KEY = "gnucash-dashboard-writable";
const BACKEND_KEY = "gnucash-dashboard-backend";

export type Backend = "local" | "postgres";

interface DashboardContextType {
  data: DashboardData | null;
  isLoading: boolean;
  error: string | null;
  uploadedAt: Date | null;
  isWritable: boolean;
  isXmlSource: boolean;
  /** Whether the active book is stored locally (OPFS) or on a Postgres server. */
  backend: Backend;
  /** The book id of the currently open gnudash-managed Postgres book, or null. */
  postgresBookId: string | null;
  /**
   * Raw Postgres schema name for the existing-GnuCash-DB read-only path, or
   * null. Non-null implies `backend === "postgres"` AND `isWritable === false`
   * AND the UI should show the amber "existing database — read only" banner.
   */
  postgresSchemaOverride: string | null;
  toggleWritable: () => Promise<void>;
  uploadFile: (file: File, writable?: boolean) => Promise<void>;
  /**
   * Open a book from a Postgres server: fetch the dump, restore into the
   * worker's in-memory SQLite cache, and switch the backend to "postgres".
   * Persists the connection to OPFS (plaintext — see server-config.ts) so
   * the next app load can auto-reconnect.
   *
   * Returns `true` on success and `false` if anything in the pipeline
   * failed (server unreachable, credentials rejected, book missing, etc.)
   * — failure is also surfaced via the `error` field on the context, so
   * UI callers can usually ignore the return value; the boolean exists for
   * the auto-reconnect path in `restore()` which needs to decide whether
   * to clear the "was on Postgres last time" marker.
   */
  openPostgresBook: (
    connection: PostgresConnectionInfo,
    bookId: string,
  ) => Promise<boolean>;
  /**
   * Upload a .gnucash file (SQLite or XML) to a Postgres server and then
   * open the resulting book. XML files are converted to SQLite client-side
   * first (via the existing worker pipeline) before upload.
   */
  importFileToPostgres: (
    file: File,
    connection: PostgresConnectionInfo,
    bookId: string,
  ) => Promise<void>;
  /**
   * Replace the currently-open Postgres book with the contents of `file`.
   * Reuses the connection + bookId captured on the most recent
   * openPostgresBook / importFileToPostgres call, so the sidebar can drive
   * the reupload without re-prompting for credentials. Throws if called
   * while not connected to a gnudash-managed Postgres backend — the
   * existing-DB interop path is read-only and has no reupload.
   */
  reuploadPostgresBook: (file: File) => Promise<void>;
  /**
   * Open a pre-existing GnuCash Postgres database in read-only mode. Unlike
   * `openPostgresBook`, the caller supplies a raw `schema` name (usually
   * "public") instead of a bookId; the schema is used as-is without the
   * `book_` prefix. The worker loads the dump into the local cache but
   * wires up a non-writable adapter, so every mutation path in the UI is
   * gated off by `isWritable: false`. No sync client is created.
   */
  openExistingGnuCashBook: (
    connection: PostgresConnectionInfo,
    schema: string,
  ) => Promise<boolean>;
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
  /** Create a budget and return its GUID so the UI can navigate into the editor. */
  createBudget: (payload: CreateBudgetPayload) => Promise<string>;
  updateBudget: (payload: UpdateBudgetPayload) => Promise<void>;
  deleteBudget: (payload: DeleteBudgetPayload) => Promise<void>;
  setBudgetAmount: (payload: SetBudgetAmountPayload) => Promise<void>;
  clearBudgetAmount: (payload: ClearBudgetAmountPayload) => Promise<void>;
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
  const [backend, setBackend] = useState<Backend>("local");
  const [postgresBookId, setPostgresBookId] = useState<string | null>(null);
  const [postgresSchemaOverride, setPostgresSchemaOverride] = useState<
    string | null
  >(null);
  const clientRef = useRef<GnuCashWorkerClient | null>(null);
  // Connection used by the currently-open Postgres book. Held in a ref, not
  // state, so reuploadPostgresBook can see the freshly-set value synchronously
  // even if React hasn't yet scheduled a re-render after openPostgresBook.
  const postgresConnectionRef = useRef<PostgresConnectionInfo | null>(null);

  function getClient(): GnuCashWorkerClient {
    if (!clientRef.current) {
      clientRef.current = new GnuCashWorkerClient();
    }
    return clientRef.current;
  }

  // On mount: try OPFS first, then fall back to sessionStorage.
  //
  // The Postgres backend's auto-reconnect path lives in a follow-up PR; for
  // now if the previous session was on Postgres we simply fall through to
  // the upload screen (the Server tab's defaultValue is wired to the saved
  // preference so the user lands back there).
  useEffect(() => {
    let cancelled = false;

    async function restore() {
      const storedWritable = sessionStorage.getItem(WRITABLE_KEY) === "true";
      const storedBackend =
        (sessionStorage.getItem(BACKEND_KEY) as Backend | null) ?? "local";

      // Postgres session: try to auto-reconnect from the OPFS-persisted
      // credentials (written by openPostgresBook via saveServerConfig).
      // On any failure (no config saved, server down, credentials rotated,
      // book gone) we fall through to the upload screen with the Server tab
      // preselected and fields prefilled so the user can retry without
      // retyping. The `isLoading` flag keeps the upload form hidden until
      // the auto-reconnect resolves one way or the other.
      if (storedBackend === "postgres") {
        sessionStorage.removeItem(STORAGE_KEY);
        const cfg = await loadServerConfig();
        if (cancelled || !cfg) {
          // Either the config never made it to OPFS or it's been cleared.
          // Fall through to the upload screen — the Server tab will preselect
          // from the same BACKEND_KEY marker.
          return;
        }
        const { mode, bookId, schema, ...connection } = cfg;
        let ok = false;
        if (mode === "existing" && schema) {
          ok = await openExistingGnuCashBook(connection, schema);
        } else if (mode !== "existing" && bookId) {
          // gnudash mode (explicit or legacy-null).
          ok = await openPostgresBook(connection, bookId);
        }
        if (!ok && !cancelled) {
          // Clear the session marker so a reload doesn't silently retry the
          // same broken auto-reconnect; next time the user must actively
          // Connect. The Server tab still preselects via the panel's own
          // loadServerConfig() read, so fields stay prefilled.
          sessionStorage.removeItem(BACKEND_KEY);
        }
        return;
      }

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
    // `openPostgresBook` is defined in the same render and doesn't capture
    // stale state (it reads everything through setters / refs), so the
    // mount-only semantics here are intentional — adding it to deps would
    // just re-run the whole restore-on-boot logic every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // Interop mode points at a schema gnudash doesn't own — flipping writable
    // would re-open the local OPFS cache read-write and expose every edit
    // affordance (top badge + per-row edit/delete), yet writes would never
    // reach Postgres (no sync client is wired) and could corrupt on reupload.
    if (postgresSchemaOverride !== null) return;
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
      const { isXml } = await client.openFile(file, writable);
      const dashboardData = await client.getFullDashboardData();
      const now = new Date();
      setData(dashboardData);
      setUploadedAt(now);
      setIsXmlSource(isXml);
      setIsWritable(isXml ? false : writable);
      setBackend("local");
      setPostgresBookId(null);
      setPostgresSchemaOverride(null);
      sessionStorage.setItem(UPLOADED_AT_KEY, now.toISOString());
      sessionStorage.setItem(WRITABLE_KEY, String(isXml ? false : writable));
      sessionStorage.setItem(BACKEND_KEY, "local");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Load an existing book from a Postgres server. The server's gzipped dump
   * is fetched, decompressed by the browser (via `Content-Encoding: gzip`),
   * parsed, and handed to the worker which rebuilds a local SQLite WASM
   * cache and wires up the write-through adapter from PR 4. Persists the
   * connection to OPFS so a future PR 8 load can auto-reconnect.
   */
  async function openPostgresBook(
    connection: PostgresConnectionInfo,
    bookId: string,
  ): Promise<boolean> {
    setIsLoading(true);
    setError(null);

    try {
      const client = getClient();
      await client.waitForReady();

      const res = await fetch("/api/pg/book/dump", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connection, bookId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Dump failed: HTTP ${res.status}`);
      }
      // The browser auto-decompresses `Content-Encoding: gzip` responses,
      // so `.json()` yields the parsed payload directly.
      const dump = (await res.json()) as PostgresDumpPayload;

      await client.openFromPostgresDump(dump, connection, bookId);
      const dashboardData = await client.getFullDashboardData();
      const now = new Date();

      // A local-backend session on this origin may have left a SQLite file in
      // OPFS; with Postgres as the source of truth it would only cause a
      // stale restore on next load. Clear it.
      await deleteFromOPFS().catch(() => {});

      setData(dashboardData);
      setUploadedAt(now);
      setIsXmlSource(false);
      setIsWritable(true);
      setBackend("postgres");
      setPostgresBookId(bookId);
      setPostgresSchemaOverride(null);
      postgresConnectionRef.current = connection;
      sessionStorage.setItem(UPLOADED_AT_KEY, now.toISOString());
      sessionStorage.setItem(WRITABLE_KEY, "true");
      sessionStorage.setItem(BACKEND_KEY, "postgres");

      // Persist the connection so a page refresh can reconnect without
      // prompting. Plaintext on disk — see server-config.ts security note.
      const cfg: ServerConfig = { ...connection, mode: "gnudash", bookId };
      await saveServerConfig(cfg).catch(() => {
        // If OPFS is unavailable the PG session is still fully usable —
        // the user will just have to re-enter credentials next time.
      });
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Open failed");
      return false;
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Upload a .gnucash file into a Postgres book. XML files are routed
   * through the worker's existing in-memory SQLite conversion and exported
   * as a SQLite buffer before upload, so the server-side import route only
   * has to handle one format. After a successful import, the freshly
   * populated book is loaded via `openPostgresBook`.
   */
  async function importFileToPostgres(
    file: File,
    connection: PostgresConnectionInfo,
    bookId: string,
  ) {
    setIsLoading(true);
    setError(null);

    try {
      const client = getClient();
      await client.waitForReady();

      // Parse the file client-side into the worker's in-memory SQLite, then
      // export it as a clean SQLite buffer. This collapses (raw SQLite,
      // gzipped SQLite, raw XML, gzipped XML) into one wire format.
      //
      // `openFile` in SQLite mode writes to OPFS for local persistence; we
      // don't want that here, so we explicitly delete the file after.
      await client.openFile(file, true);
      const sqliteBuffer = await client.exportDatabase();
      await deleteFromOPFS().catch(() => {});

      const form = new FormData();
      form.append("file", new Blob([sqliteBuffer]), file.name);
      form.append("connection", JSON.stringify(connection));
      form.append("bookId", bookId);

      const importRes = await fetch("/api/pg/book/import", {
        method: "POST",
        body: form,
      });
      if (!importRes.ok) {
        const body = (await importRes.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(
          body.error ?? `Import failed: HTTP ${importRes.status}`,
        );
      }

      // Load the authoritative server state into the worker.
      await openPostgresBook(connection, bookId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setIsLoading(false);
    }
  }

  /**
   * Replace the active Postgres book with `file`. The sidebar's Reupload
   * button calls this after confirming with the user; we reuse the connection
   * + book id captured on the most recent openPostgresBook, so the user never
   * has to retype credentials mid-session. The import route drops and
   * recreates the book schema inside a single transaction (see
   * fix/pg-import-schema-and-rollback), so a failure leaves the previous
   * book intact on the server — though the local cache may have been
   * clobbered by the conversion step, so on failure the UI should prompt a
   * fresh reconnect rather than claim the old data is still there.
   */
  async function reuploadPostgresBook(file: File) {
    const connection = postgresConnectionRef.current;
    if (
      backend !== "postgres" ||
      !connection ||
      !postgresBookId ||
      postgresSchemaOverride !== null
    ) {
      throw new Error(
        "Reupload is only available on a gnudash-managed Postgres book",
      );
    }
    await importFileToPostgres(file, connection, postgresBookId);
  }

  /**
   * Open a pre-existing GnuCash desktop Postgres database read-only. Same
   * fetch-dump → worker flow as `openPostgresBook` but:
   * - Uses the raw `schema` name instead of `book_{bookId}`.
   * - Initialises the worker via `openFromPostgresDumpReadOnly`, which wires
   *   a non-writable adapter. Every mutation method on this context is
   *   already gated by `isWritable`, so no engine SQL can reach the foreign
   *   schema.
   * - Persists the connection with `mode: "existing"` so auto-reconnect
   *   restores this path on next load.
   */
  async function openExistingGnuCashBook(
    connection: PostgresConnectionInfo,
    schema: string,
  ): Promise<boolean> {
    setIsLoading(true);
    setError(null);

    try {
      const client = getClient();
      await client.waitForReady();

      const res = await fetch("/api/pg/book/dump", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ connection, schema }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Dump failed: HTTP ${res.status}`);
      }
      const dump = (await res.json()) as PostgresDumpPayload;

      await client.openFromPostgresDumpReadOnly(dump);
      const dashboardData = await client.getFullDashboardData();
      const now = new Date();

      // Drop any stray OPFS SQLite a previous local session may have left.
      await deleteFromOPFS().catch(() => {});

      setData(dashboardData);
      setUploadedAt(now);
      setIsXmlSource(false);
      setIsWritable(false);
      setBackend("postgres");
      setPostgresBookId(null);
      setPostgresSchemaOverride(schema);
      postgresConnectionRef.current = connection;
      sessionStorage.setItem(UPLOADED_AT_KEY, now.toISOString());
      sessionStorage.setItem(WRITABLE_KEY, "false");
      sessionStorage.setItem(BACKEND_KEY, "postgres");

      const cfg: ServerConfig = { ...connection, mode: "existing", schema };
      await saveServerConfig(cfg).catch(() => {});

      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Open failed");
      return false;
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
    setBackend("local");
    setPostgresBookId(null);
    setPostgresSchemaOverride(null);
    postgresConnectionRef.current = null;
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(UPLOADED_AT_KEY);
    sessionStorage.removeItem(WRITABLE_KEY);
    sessionStorage.removeItem(BACKEND_KEY);
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

  /**
   * Create a budget and return its GUID so the caller can navigate into the
   * editor. Resolves after the write has been flushed to Postgres (sync
   * client) or persisted to OPFS (local backend).
   */
  async function createBudgetFn(payload: CreateBudgetPayload): Promise<string> {
    if (!isWritable) throw new Error("Database is not open in read-write mode");
    const client = getClient();
    const { budgetGuid, ...dashboardData } = await client.createBudget(payload);
    setData(dashboardData);
    return budgetGuid;
  }

  async function updateBudgetFn(payload: UpdateBudgetPayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");
    const client = getClient();
    setData(await client.updateBudget(payload));
  }

  async function deleteBudgetFn(payload: DeleteBudgetPayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");
    const client = getClient();
    setData(await client.deleteBudget(payload));
  }

  async function setBudgetAmountFn(payload: SetBudgetAmountPayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");
    const client = getClient();
    setData(await client.setBudgetAmount(payload));
  }

  async function clearBudgetAmountFn(payload: ClearBudgetAmountPayload) {
    if (!isWritable) throw new Error("Database is not open in read-write mode");
    const client = getClient();
    setData(await client.clearBudgetAmount(payload));
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
      value={{ data, isLoading, error, uploadedAt, isWritable, isXmlSource, backend, postgresBookId, postgresSchemaOverride, toggleWritable, uploadFile, openPostgresBook, importFileToPostgres, reuploadPostgresBook, openExistingGnuCashBook, loadDemo, clearData, createTransaction, deleteTransaction: deleteTransactionFn, editTransaction, bulkEditTransactions: bulkEditTransactionsFn, createAccount: createAccountFn, updateAccount: updateAccountFn, deleteAccountWithReallocation: deleteAccountWithReallocationFn, createCommodity: createCommodityFn, addPrice: addPriceFn, editPrice: editPriceFn, deletePrice: deletePriceFn, createBudget: createBudgetFn, updateBudget: updateBudgetFn, deleteBudget: deleteBudgetFn, setBudgetAmount: setBudgetAmountFn, clearBudgetAmount: clearBudgetAmountFn, exportFile, setCurrency: setCurrencyFn }}
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
