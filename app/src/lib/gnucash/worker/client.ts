/**
 * Main-thread client that wraps the DB Web Worker with a typed, promise-based API.
 */
import type {
  AccountNode,
  MonthlyNetWorth,
  MonthlyCashFlow,
  MonthlyExpenseByCategory,
  ExpenseCategory,
  ExpenseTransaction,
  InvestmentHolding,
  MonthlyInvestmentValue,
  TopBalance,
  RecentTransaction,
  LedgerTransaction,
  UpcomingBill,
  BudgetData,
  DashboardData,
} from "@/lib/types/gnucash";
import type { WorkerRequest, WorkerResponse, DomainFunction, MutationAction, CreateTransactionPayload, DeleteTransactionPayload, EditTransactionPayload, CreateAccountPayload, UpdateAccountPayload, DeleteAccountPayload, CreateCommodityPayload } from "./messages";

type PendingRequest = {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
};

export class GnuCashWorkerClient {
  private worker: Worker;
  private pending = new Map<string, PendingRequest>();
  private idCounter = 0;
  private wasmReady: Promise<void>;
  private resolveWasmReady!: () => void;
  private rejectWasmReady!: (err: Error) => void;

  constructor() {
    this.wasmReady = new Promise((resolve, reject) => {
      this.resolveWasmReady = resolve;
      this.rejectWasmReady = reject;
    });

    this.worker = new Worker(
      new URL("./db-worker.ts", import.meta.url),
      { type: "module" }
    );

    this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
      this.handleMessage(e.data);
    };

    this.worker.onerror = (e) => {
      this.rejectWasmReady(new Error(`Worker error: ${e.message}`));
    };
  }

  private handleMessage(msg: WorkerResponse): void {
    switch (msg.type) {
      case "ready":
        this.resolveWasmReady();
        break;

      case "init-error":
        // If WASM hasn't initialized yet, reject that promise
        this.rejectWasmReady(new Error(msg.message));
        break;

      case "result": {
        const req = this.pending.get(msg.id);
        if (req) {
          this.pending.delete(msg.id);
          req.resolve(msg.data);
        }
        break;
      }

      case "export-result": {
        const req = this.pending.get(msg.id);
        if (req) {
          this.pending.delete(msg.id);
          req.resolve(msg.buffer);
        }
        break;
      }

      case "error": {
        const req = this.pending.get(msg.id);
        if (req) {
          this.pending.delete(msg.id);
          req.reject(new Error(msg.message));
        }
        break;
      }
    }
  }

  private send(msg: WorkerRequest, transfer?: Transferable[]): void {
    if (transfer) {
      this.worker.postMessage(msg, transfer);
    } else {
      this.worker.postMessage(msg);
    }
  }

  private query<T>(fn: DomainFunction): Promise<T> {
    const id = String(++this.idCounter);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
      });
      this.send({ type: "query", id, fn });
    });
  }

  private mutate<T>(action: MutationAction, payload: unknown): Promise<T> {
    const id = String(++this.idCounter);
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
      });
      this.send({ type: "mutation", id, action, payload });
    });
  }

  /**
   * Wait for SQLite WASM to finish initializing.
   */
  async waitForReady(): Promise<void> {
    return this.wasmReady;
  }

  /**
   * Open a .gnucash file by reading it into an ArrayBuffer and sending to the Worker.
   * The Worker persists it to OPFS if available.
   */
  async openFile(file: File, writable: boolean = false): Promise<void> {
    await this.wasmReady;

    const buffer = await file.arrayBuffer();

    return new Promise<void>((resolve, reject) => {
      // Temporarily override message handler to catch the init response
      const prevHandler = this.worker.onmessage;
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.type === "ready") {
          this.worker.onmessage = prevHandler;
          resolve();
        } else if (msg.type === "init-error") {
          this.worker.onmessage = prevHandler;
          reject(new Error(msg.message));
        } else {
          // Delegate other messages to normal handler
          this.handleMessage(msg);
        }
      };

      this.send({ type: "init", fileBuffer: buffer, writable }, [buffer]);
    });
  }

  /**
   * Try to open a previously persisted DB from OPFS.
   * Returns true if successful, false if no file found.
   */
  async openFromOPFS(writable: boolean = false): Promise<boolean> {
    await this.wasmReady;

    return new Promise<boolean>((resolve) => {
      const prevHandler = this.worker.onmessage;
      this.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const msg = e.data;
        if (msg.type === "ready") {
          this.worker.onmessage = prevHandler;
          resolve(true);
        } else if (msg.type === "init-error") {
          this.worker.onmessage = prevHandler;
          resolve(false);
        } else {
          this.handleMessage(msg);
        }
      };

      this.send({ type: "init-opfs", fileName: "gnucash-dashboard.db", writable });
    });
  }

  // ── Mutations ──────────────────────────────────────────────────

  /**
   * Create a transaction and return fully refreshed dashboard data.
   * The accounting engine validates all invariants (balance, denoms, etc.)
   * before committing atomically.
   */
  /**
   * Export the current database as a raw SQLite ArrayBuffer.
   * The result is a valid .gnucash file that opens in GNUCash desktop.
   */
  async exportDatabase(): Promise<ArrayBuffer> {
    const id = String(++this.idCounter);
    return new Promise<ArrayBuffer>((resolve, reject) => {
      this.pending.set(id, {
        resolve: resolve as (data: unknown) => void,
        reject,
      });
      this.send({ type: "export", id });
    });
  }

  async createTransaction(payload: CreateTransactionPayload): Promise<DashboardData> {
    return this.mutate("createTransaction", payload);
  }

  /**
   * Delete a transaction and return fully refreshed dashboard data.
   * Throws if any split is reconciled.
   */
  async deleteTransaction(payload: DeleteTransactionPayload): Promise<DashboardData> {
    return this.mutate("deleteTransaction", payload);
  }

  /**
   * Edit a transaction by deleting the original and creating a replacement.
   * Returns fully refreshed dashboard data.
   */
  async editTransaction(payload: EditTransactionPayload): Promise<DashboardData> {
    return this.mutate("editTransaction", payload);
  }

  async createAccount(payload: CreateAccountPayload): Promise<DashboardData> {
    return this.mutate("createAccount", payload);
  }

  async updateAccount(payload: UpdateAccountPayload): Promise<DashboardData> {
    return this.mutate("updateAccount", payload);
  }

  async deleteAccount(payload: DeleteAccountPayload): Promise<DashboardData> {
    return this.mutate("deleteAccount", payload);
  }

  async createCommodity(payload: CreateCommodityPayload): Promise<DashboardData> {
    return this.mutate("createCommodity", payload);
  }

  // ── Domain queries ─────────────────────────────────────────────

  async getAccountTree(): Promise<AccountNode[]> {
    return this.query("buildAccountTree");
  }

  async getNetWorthSeries(): Promise<MonthlyNetWorth[]> {
    return this.query("computeNetWorthSeries");
  }

  async getCurrentNetWorth(): Promise<number> {
    return this.query("computeCurrentNetWorth");
  }

  async getCashFlowSeries(): Promise<MonthlyCashFlow[]> {
    return this.query("computeCashFlowSeries");
  }

  async getExpenseBreakdown(): Promise<{
    categories: ExpenseCategory[];
    monthly: MonthlyExpenseByCategory[];
    colors: Record<string, string>;
  }> {
    return this.query("computeExpenseBreakdown");
  }

  async getExpenseTransactions(): Promise<ExpenseTransaction[]> {
    return this.query("getExpenseTransactions");
  }

  async getIncomeBreakdown(): Promise<{
    monthly: MonthlyExpenseByCategory[];
    colors: Record<string, string>;
  }> {
    return this.query("computeIncomeBreakdown");
  }

  async getIncomeTransactions(): Promise<ExpenseTransaction[]> {
    return this.query("getIncomeTransactions");
  }

  async getInvestments(): Promise<InvestmentHolding[]> {
    return this.query("computeInvestments");
  }

  async getInvestmentValueSeries(): Promise<MonthlyInvestmentValue[]> {
    return this.query("computeInvestmentValueSeries");
  }

  async getTopBalances(): Promise<TopBalance[]> {
    return this.query("computeTopBalances");
  }

  async getLedgerTransactions(): Promise<LedgerTransaction[]> {
    return this.query("getLedgerTransactions");
  }

  async getRecentTransactions(): Promise<RecentTransaction[]> {
    return this.query("getRecentTransactions");
  }

  async getBudgetData(): Promise<BudgetData | null> {
    return this.query("computeBudgetData");
  }

  async getUpcomingBills(): Promise<UpcomingBill[]> {
    return this.query("getUpcomingBills");
  }

  async getFullDashboardData(): Promise<DashboardData> {
    return this.query("getFullDashboardData");
  }

  close(): void {
    this.send({ type: "close" });
    this.worker.terminate();
  }
}
