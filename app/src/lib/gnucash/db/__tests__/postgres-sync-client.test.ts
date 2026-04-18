import { describe, expect, it, vi } from "vitest";
import {
  PostgresSyncClient,
  type FetchLike,
} from "../postgres-sync-client";
import type { PgConnection } from "@/lib/pg/connect";

const connection: PgConnection = {
  host: "localhost",
  port: 5432,
  user: "gnudash",
  password: "gnudash",
  database: "gnudash",
};

function fakeOkResponse(): Response {
  return new Response(JSON.stringify({ results: [] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function fakeErrorResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("PostgresSyncClient", () => {
  describe("enqueue + flush", () => {
    it("flushes queued statements to /api/pg/book/exec and clears the queue", async () => {
      const fetchMock = vi.fn<FetchLike>().mockResolvedValue(fakeOkResponse());
      const client = new PostgresSyncClient(connection, "default", fetchMock);

      client.enqueue("INSERT INTO accounts (guid) VALUES (?)", ["g-1"]);
      client.enqueue("UPDATE accounts SET name = ? WHERE guid = ?", [
        "Alice",
        "g-1",
      ]);
      expect(client.pendingCount).toBe(2);

      await client.flush();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("/api/pg/book/exec");
      expect(init.method).toBe("POST");
      const body = JSON.parse(init.body) as {
        connection: PgConnection;
        bookId: string;
        statements: { sql: string; params: unknown[] }[];
      };
      expect(body.connection).toEqual(connection);
      expect(body.bookId).toBe("default");
      expect(body.statements).toEqual([
        { sql: "INSERT INTO accounts (guid) VALUES (?)", params: ["g-1"] },
        {
          sql: "UPDATE accounts SET name = ? WHERE guid = ?",
          params: ["Alice", "g-1"],
        },
      ]);
      expect(client.pendingCount).toBe(0);
    });

    it("is a no-op when the queue is empty", async () => {
      const fetchMock = vi.fn<FetchLike>().mockResolvedValue(fakeOkResponse());
      const client = new PostgresSyncClient(connection, "default", fetchMock);

      await client.flush();

      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("surfaces the server's error message on non-2xx", async () => {
      const fetchMock = vi
        .fn<FetchLike>()
        .mockResolvedValue(fakeErrorResponse(502, { error: "oops" }));
      const client = new PostgresSyncClient(connection, "default", fetchMock);
      client.enqueue("DELETE FROM accounts WHERE guid = ?", ["g-1"]);

      await expect(client.flush()).rejects.toThrow(/oops/);
    });

    it("falls back to an HTTP status message when the body is not JSON", async () => {
      const fetchMock = vi.fn<FetchLike>().mockResolvedValue(
        new Response("not json", { status: 500 }),
      );
      const client = new PostgresSyncClient(connection, "default", fetchMock);
      client.enqueue("DELETE FROM accounts WHERE guid = ?", ["g-1"]);

      await expect(client.flush()).rejects.toThrow(/HTTP 500/);
    });

    it("drains the queue even when the flush fails so a retry does not double-send", async () => {
      const fetchMock = vi
        .fn<FetchLike>()
        .mockResolvedValue(fakeErrorResponse(502, { error: "nope" }));
      const client = new PostgresSyncClient(connection, "default", fetchMock);
      client.enqueue("DELETE FROM accounts WHERE guid = ?", ["g-1"]);

      await expect(client.flush()).rejects.toThrow();
      expect(client.pendingCount).toBe(0);
    });
  });

  describe("transaction stacking", () => {
    it("tracks depth across nested begin/commit pairs", () => {
      const client = new PostgresSyncClient(
        connection,
        "default",
        vi.fn<FetchLike>(),
      );

      expect(client.transactionDepth).toBe(0);
      client.beginTx();
      expect(client.transactionDepth).toBe(1);
      client.beginTx();
      expect(client.transactionDepth).toBe(2);
      client.commitTx();
      expect(client.transactionDepth).toBe(1);
      client.commitTx();
      expect(client.transactionDepth).toBe(0);
    });

    it("keeps enqueued statements when committing a transaction", async () => {
      const fetchMock = vi.fn<FetchLike>().mockResolvedValue(fakeOkResponse());
      const client = new PostgresSyncClient(connection, "default", fetchMock);

      client.beginTx();
      client.enqueue("UPDATE x SET a = ? WHERE b = ?", [1, "y"]);
      client.commitTx();

      expect(client.pendingCount).toBe(1);
      await client.flush();
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it("drops statements enqueued since beginTx when rolled back", () => {
      const client = new PostgresSyncClient(
        connection,
        "default",
        vi.fn<FetchLike>(),
      );

      client.enqueue("INSERT INTO a (x) VALUES (?)", [1]); // before tx
      client.beginTx();
      client.enqueue("INSERT INTO a (x) VALUES (?)", [2]);
      client.enqueue("INSERT INTO a (x) VALUES (?)", [3]);
      expect(client.pendingCount).toBe(3);

      client.rollbackTx();
      expect(client.pendingCount).toBe(1);
      expect(client.transactionDepth).toBe(0);
    });

    it("only rolls back to the innermost savepoint on nested rollback", () => {
      const client = new PostgresSyncClient(
        connection,
        "default",
        vi.fn<FetchLike>(),
      );

      client.beginTx();
      client.enqueue("a", []);
      client.beginTx();
      client.enqueue("b", []);
      client.enqueue("c", []);
      expect(client.pendingCount).toBe(3);

      client.rollbackTx(); // undo inner
      expect(client.pendingCount).toBe(1);
      expect(client.transactionDepth).toBe(1);

      client.commitTx(); // commit outer
      expect(client.pendingCount).toBe(1);
      expect(client.transactionDepth).toBe(0);
    });

    it("rollbackTx without a matching begin is a safe no-op", () => {
      const client = new PostgresSyncClient(
        connection,
        "default",
        vi.fn<FetchLike>(),
      );
      client.enqueue("x", []);

      expect(() => client.rollbackTx()).not.toThrow();
      expect(client.pendingCount).toBe(1);
      expect(client.transactionDepth).toBe(0);
    });
  });
});
