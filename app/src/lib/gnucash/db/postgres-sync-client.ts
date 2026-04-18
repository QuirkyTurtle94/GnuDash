/**
 * Browser-side sync client for the Postgres backend (#48).
 *
 * The engine's WritableDbAdapter interface is synchronous (`run` returns
 * RunResult, not Promise), but sending writes to the server is inherently
 * async. We bridge that by having the adapter apply each write locally first
 * *and* enqueue it here; the worker then awaits `flush()` once at the end of
 * every mutation handler, before posting the response back to the UI.
 *
 * Net effect: writes are "cache-and-sync" — the local WASM DB is updated
 * immediately (engine stays sync), and the response to the UI only arrives
 * after the server round-trip has succeeded.
 *
 * ## Transaction stacking
 *
 * The engine wraps most mutations in `adapter.transaction(fn)`. Those calls
 * can nest (e.g. one domain op calls another). To keep the pending queue
 * consistent with the local DB on rollback, `beginTx()` pushes the current
 * queue length as a savepoint, `commitTx()` pops it (keeping the statements),
 * and `rollbackTx()` pops AND truncates the queue back to that length so the
 * aborted statements never reach the server.
 */

import type { PgConnection } from "@/lib/pg/connect";

interface PendingStatement {
  sql: string;
  params: unknown[];
}

export interface SyncExecResponse {
  results?: { changes: number }[];
  error?: string;
}

/**
 * Minimal fetch-compatible signature so tests can inject a stub without
 * touching the global.
 */
export type FetchLike = (
  input: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<Response>;

export class PostgresSyncClient {
  private readonly connection: PgConnection;
  private readonly bookId: string;
  private readonly fetchImpl: FetchLike;
  private pending: PendingStatement[] = [];
  /**
   * Stack of pending-queue lengths captured at each `beginTx`. On rollback
   * we truncate `pending` back to the top of this stack.
   */
  private txStack: number[] = [];

  constructor(
    connection: PgConnection,
    bookId: string,
    fetchImpl: FetchLike = globalThis.fetch.bind(globalThis) as FetchLike,
  ) {
    this.connection = connection;
    this.bookId = bookId;
    this.fetchImpl = fetchImpl;
  }

  /** Number of statements waiting to be flushed to the server. */
  get pendingCount(): number {
    return this.pending.length;
  }

  /** Depth of nested transactions currently open. Zero means no tx. */
  get transactionDepth(): number {
    return this.txStack.length;
  }

  /**
   * Queue a mutation for the next flush. The adapter calls this after
   * applying the same SQL locally. Never awaits — the worker awaits
   * `flush()` once per UI mutation.
   */
  enqueue(sql: string, params: unknown[]): void {
    this.pending.push({ sql, params });
  }

  /**
   * Mark the start of an engine-level transaction. Records the current
   * queue length so a subsequent rollback can truncate back to it.
   */
  beginTx(): void {
    this.txStack.push(this.pending.length);
  }

  /**
   * Mark the end of an engine-level transaction. Keeps the enqueued
   * statements (they'll be flushed to the server as part of the next batch).
   * No-op if we weren't in a transaction — the adapter guards against that
   * but we stay defensive since the worker may surface misuse during wiring.
   */
  commitTx(): void {
    this.txStack.pop();
  }

  /**
   * Discard every statement enqueued since the matching `beginTx`. The
   * caller is responsible for rolling back the local DB — this side just
   * keeps the server queue consistent with what the local DB ended up with.
   */
  rollbackTx(): void {
    const savepoint = this.txStack.pop();
    if (savepoint !== undefined) {
      this.pending.length = savepoint;
    }
  }

  /**
   * POST every pending statement to /api/pg/book/exec and clear the queue.
   * The route wraps the batch in a single PG transaction, so the flush is
   * all-or-nothing on the server side.
   *
   * On non-2xx response or network failure, the queue is drained anyway (the
   * local DB already committed, so leaving stale statements in the queue
   * would only make the next flush worse). The caller is expected to surface
   * the error to the user — a reload will re-fetch the authoritative server
   * state.
   */
  async flush(): Promise<void> {
    if (this.pending.length === 0) return;
    const batch = this.pending;
    this.pending = [];

    const res = await this.fetchImpl("/api/pg/book/exec", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        connection: this.connection,
        bookId: this.bookId,
        statements: batch,
      }),
    });

    if (!res.ok) {
      let message = `Sync failed: HTTP ${res.status}`;
      try {
        const body = (await res.json()) as SyncExecResponse;
        if (body.error) message = `Sync failed: ${body.error}`;
      } catch {
        // Body wasn't JSON — keep the HTTP-status message.
      }
      throw new Error(message);
    }
  }
}
