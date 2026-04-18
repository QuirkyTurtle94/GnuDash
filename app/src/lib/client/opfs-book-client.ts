/**
 * OPFS-backed BookClient: the local-mode implementation.
 *
 * Thin wrapper around the existing GnuCashWorkerClient, which runs SQLite
 * WASM inside a Web Worker and persists to the browser's OPFS. All storage
 * and compute happens in the browser — no network, no server.
 *
 * This class is intentionally minimal: every method forwards to the worker
 * client. The BookClient abstraction lives here so that UI code can be
 * written against a single interface regardless of whether the backing
 * store is OPFS (this class) or Postgres (ApiBookClient, in a later PR).
 */
import type { BookClient, OpenFileResult } from "./book-client";
import { GnuCashWorkerClient } from "@/lib/gnucash/worker/client";
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

export class OpfsBookClient implements BookClient {
  private readonly worker: GnuCashWorkerClient;

  constructor() {
    this.worker = new GnuCashWorkerClient();
  }

  waitForReady(): Promise<void> {
    return this.worker.waitForReady();
  }

  openFile(file: File, writable = false): Promise<OpenFileResult> {
    return this.worker.openFile(file, writable);
  }

  /**
   * OPFS flavour of session restore: probe the persistent OPFS handle for an
   * existing DB file. Returns false cleanly when nothing is persisted yet.
   */
  restoreSession(writable = false): Promise<boolean> {
    return this.worker.openFromOPFS(writable);
  }

  getFullDashboardData(): Promise<DashboardData> {
    return this.worker.getFullDashboardData();
  }

  setCurrency(currencyGuid: string): Promise<DashboardData> {
    return this.worker.setCurrency(currencyGuid);
  }

  createTransaction(payload: CreateTransactionPayload): Promise<DashboardData> {
    return this.worker.createTransaction(payload);
  }

  deleteTransaction(payload: DeleteTransactionPayload): Promise<DashboardData> {
    return this.worker.deleteTransaction(payload);
  }

  editTransaction(payload: EditTransactionPayload): Promise<DashboardData> {
    return this.worker.editTransaction(payload);
  }

  bulkEditTransactions(payload: BulkEditTransactionsPayload): Promise<DashboardData> {
    return this.worker.bulkEditTransactions(payload);
  }

  createAccount(payload: CreateAccountPayload): Promise<DashboardData> {
    return this.worker.createAccount(payload);
  }

  updateAccount(payload: UpdateAccountPayload): Promise<DashboardData> {
    return this.worker.updateAccount(payload);
  }

  deleteAccount(payload: DeleteAccountPayload): Promise<DashboardData> {
    return this.worker.deleteAccount(payload);
  }

  createCommodity(payload: CreateCommodityPayload): Promise<DashboardData> {
    return this.worker.createCommodity(payload);
  }

  addPrice(payload: AddPricePayload): Promise<DashboardData> {
    return this.worker.addPrice(payload);
  }

  editPrice(payload: EditPricePayload): Promise<DashboardData> {
    return this.worker.editPrice(payload);
  }

  deletePrice(payload: DeletePricePayload): Promise<DashboardData> {
    return this.worker.deletePrice(payload);
  }

  exportDatabase(): Promise<ArrayBuffer> {
    return this.worker.exportDatabase();
  }

  close(): void {
    this.worker.close();
  }
}
