/**
 * BookClient — the single interface UI code uses to talk to a book's storage backend.
 *
 * This is the seam between UI and storage layers. Two implementations exist:
 *   - OpfsBookClient: wraps the existing Web Worker + SQLite WASM + OPFS path.
 *   - ApiBookClient: fetches from /api/books/... (added with the server-mode PR).
 *
 * The interface is deliberately semantic — one method per dashboard operation,
 * never raw SQL. This keeps the API surface narrow and makes the future
 * server-mode route handlers easy to secure (see
 * docs/architecture/storage-adapters.md §3 for the reasoning).
 *
 * Mutation methods return refreshed DashboardData so callers avoid a second
 * round-trip — this is load-bearing for UI snappiness and is preserved from
 * the pre-refactor worker-client contract.
 */
import type { DashboardData } from "@/lib/types/gnucash";
import type {
  AddPricePayload,
  BulkEditTransactionsPayload,
  CreateAccountPayload,
  CreateCommodityPayload,
  CreateTransactionPayload,
  DeleteAccountPayload,
  DeletePricePayload,
  DeleteTransactionPayload,
  EditPricePayload,
  EditTransactionPayload,
  UpdateAccountPayload,
} from "@/lib/gnucash/worker/messages";

/**
 * Result of opening a .gnucash file.
 * XML files are forced read-only because we don't round-trip the XML layer
 * losslessly. Callers should reflect this back to the UI.
 */
export interface OpenFileResult {
  isXml: boolean;
}

export interface BookClient {
  /** Wait for the backend to finish initialising (e.g. SQLite WASM ready). */
  waitForReady(): Promise<void>;

  /** Upload a new .gnucash file and open it. */
  openFile(file: File, writable?: boolean): Promise<OpenFileResult>;

  /**
   * Attempt to restore a previously-opened book (e.g. from OPFS on reload,
   * or from a server session cookie).
   * Returns true if a book was restored, false if none existed.
   */
  restoreSession(writable?: boolean): Promise<boolean>;

  /** Full dashboard snapshot — every panel's data in a single round-trip. */
  getFullDashboardData(): Promise<DashboardData>;

  /** Switch the display currency; returns refreshed dashboard data. */
  setCurrency(currencyGuid: string): Promise<DashboardData>;

  // Mutations — each returns refreshed DashboardData.
  createTransaction(payload: CreateTransactionPayload): Promise<DashboardData>;
  deleteTransaction(payload: DeleteTransactionPayload): Promise<DashboardData>;
  editTransaction(payload: EditTransactionPayload): Promise<DashboardData>;
  bulkEditTransactions(payload: BulkEditTransactionsPayload): Promise<DashboardData>;

  createAccount(payload: CreateAccountPayload): Promise<DashboardData>;
  updateAccount(payload: UpdateAccountPayload): Promise<DashboardData>;
  deleteAccount(payload: DeleteAccountPayload): Promise<DashboardData>;

  createCommodity(payload: CreateCommodityPayload): Promise<DashboardData>;

  addPrice(payload: AddPricePayload): Promise<DashboardData>;
  editPrice(payload: EditPricePayload): Promise<DashboardData>;
  deletePrice(payload: DeletePricePayload): Promise<DashboardData>;

  /**
   * Export the current book as a raw SQLite ArrayBuffer.
   * The result is a valid .gnucash file that opens in GnuCash desktop.
   */
  exportDatabase(): Promise<ArrayBuffer>;

  /** Release backend resources (worker, pool client, etc.). */
  close(): void;
}
