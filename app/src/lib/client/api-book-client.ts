/**
 * Server-mode BookClient: calls /api/book/... endpoints.
 *
 * In a local build this module is never imported at runtime — the factory
 * short-circuits to OpfsBookClient when NEXT_PUBLIC_SERVER_MODE is unset,
 * and the dynamic import stays out of the static bundle.
 *
 * Mutations aren't wired yet — they'll land with the server-side mutation
 * dispatcher. For now this covers reads: the dashboard can load data over
 * HTTP just like it does over postMessage in local mode.
 */
import type { BookClient, OpenFileResult } from "./book-client";
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
  DomainFunction,
} from "@/lib/gnucash/worker/messages";

async function query<T>(fn: DomainFunction): Promise<T> {
  const res = await fetch("/api/book/query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ fn }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Query failed: ${res.status}`);
  }
  const body = (await res.json()) as { data: T };
  return body.data;
}

function unimplementedMutation(name: string): Promise<DashboardData> {
  return Promise.reject(
    new Error(
      `Server-mode mutation "${name}" is not yet wired. ` +
        "The mutation dispatcher lands in a follow-up PR; " +
        "use OPFS mode for writes in the meantime."
    )
  );
}

export class ApiBookClient implements BookClient {
  async waitForReady(): Promise<void> {
    // Server is always ready if the cookie is valid; no WASM init needed.
  }

  async openFile(file: File, _writable = false): Promise<OpenFileResult> {
    const form = await file.arrayBuffer();
    const res = await fetch("/api/book/import?overwrite=true", {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      credentials: "same-origin",
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Import failed: ${res.status}`);
    }
    return { isXml: false };
  }

  async restoreSession(_writable = false): Promise<boolean> {
    // The dashboard will decide whether a book exists by probing a query.
    try {
      await query("computeCurrentNetWorth");
      return true;
    } catch {
      return false;
    }
  }

  getFullDashboardData(): Promise<DashboardData> {
    return query<DashboardData>("getFullDashboardData");
  }

  async setCurrency(_currencyGuid: string): Promise<DashboardData> {
    // Currency switch currently lives in the worker; server-mode equivalent
    // needs a per-request currency override in buildParseContext. Follow-up.
    throw new Error("setCurrency not implemented in server mode yet");
  }

  createTransaction(_p: CreateTransactionPayload): Promise<DashboardData> {
    return unimplementedMutation("createTransaction");
  }
  deleteTransaction(_p: DeleteTransactionPayload): Promise<DashboardData> {
    return unimplementedMutation("deleteTransaction");
  }
  editTransaction(_p: EditTransactionPayload): Promise<DashboardData> {
    return unimplementedMutation("editTransaction");
  }
  bulkEditTransactions(_p: BulkEditTransactionsPayload): Promise<DashboardData> {
    return unimplementedMutation("bulkEditTransactions");
  }
  createAccount(_p: CreateAccountPayload): Promise<DashboardData> {
    return unimplementedMutation("createAccount");
  }
  updateAccount(_p: UpdateAccountPayload): Promise<DashboardData> {
    return unimplementedMutation("updateAccount");
  }
  deleteAccount(_p: DeleteAccountPayload): Promise<DashboardData> {
    return unimplementedMutation("deleteAccount");
  }
  createCommodity(_p: CreateCommodityPayload): Promise<DashboardData> {
    return unimplementedMutation("createCommodity");
  }
  addPrice(_p: AddPricePayload): Promise<DashboardData> {
    return unimplementedMutation("addPrice");
  }
  editPrice(_p: EditPricePayload): Promise<DashboardData> {
    return unimplementedMutation("editPrice");
  }
  deletePrice(_p: DeletePricePayload): Promise<DashboardData> {
    return unimplementedMutation("deletePrice");
  }

  async exportDatabase(): Promise<ArrayBuffer> {
    const res = await fetch("/api/book/export", {
      method: "GET",
      credentials: "same-origin",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Export failed: ${res.status}`);
    }
    return await res.arrayBuffer();
  }

  close(): void {
    // Nothing to clean up — cookie lives in the browser, server client is pooled.
  }
}
