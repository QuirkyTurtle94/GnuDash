import { describe, expect, it, vi } from "vitest";
import { createWritablePostgresAdapter } from "../postgres-adapter";
import { PostgresSyncClient } from "../postgres-sync-client";
import type { PgConnection } from "@/lib/pg/connect";

const connection: PgConnection = {
  host: "localhost",
  port: 5432,
  user: "gnudash",
  password: "gnudash",
  database: "gnudash",
};

/**
 * Minimal stand-in for the SQLite WASM oo1.Database used by the adapter.
 * Records exec calls so tests can assert BEGIN/COMMIT/ROLLBACK ordering.
 */
function makeFakeDb() {
  const execCalls: { sql: string; bind?: unknown[] }[] = [];
  let changesValue = 0;
  return {
    execCalls,
    setChanges(n: number) {
      changesValue = n;
    },
    selectObjects: vi.fn(() => []),
    selectObject: vi.fn(() => undefined),
    exec: vi.fn((opts: { sql: string; bind?: unknown[] }) => {
      execCalls.push(opts);
      return 0;
    }),
    close: vi.fn(),
    changes: () => changesValue,
  };
}

function makeSyncClient() {
  // Real client with a stub fetch — lets us verify enqueue/beginTx behaviour
  // without mocking every method on the class.
  return new PostgresSyncClient(connection, "default", vi.fn());
}

describe("createWritablePostgresAdapter", () => {
  describe("run", () => {
    it("applies the statement locally and enqueues it for sync", () => {
      const db = makeFakeDb();
      db.setChanges(1);
      const sync = makeSyncClient();
      const adapter = createWritablePostgresAdapter(db, sync);

      const result = adapter.run(
        "UPDATE accounts SET name = ? WHERE guid = ?",
        "Alice",
        "g-1",
      );

      expect(result.changes).toBe(1);
      expect(db.exec).toHaveBeenCalledWith({
        sql: "UPDATE accounts SET name = ? WHERE guid = ?",
        bind: ["Alice", "g-1"],
      });
      expect(sync.pendingCount).toBe(1);
    });

    it("omits bind when no params are supplied", () => {
      const db = makeFakeDb();
      const sync = makeSyncClient();
      const adapter = createWritablePostgresAdapter(db, sync);

      adapter.run("DELETE FROM transactions");

      expect(db.exec).toHaveBeenCalledWith({
        sql: "DELETE FROM transactions",
        bind: undefined,
      });
    });
  });

  describe("prepare", () => {
    it("delegates .all to the local db", () => {
      const db = makeFakeDb();
      db.selectObjects = vi.fn(() => [{ guid: "g-1" }]);
      const adapter = createWritablePostgresAdapter(db, makeSyncClient());

      const rows = adapter.prepare("SELECT * FROM accounts WHERE id = ?").all(
        "x",
      );

      expect(db.selectObjects).toHaveBeenCalledWith(
        "SELECT * FROM accounts WHERE id = ?",
        ["x"],
      );
      expect(rows).toEqual([{ guid: "g-1" }]);
    });

    it("delegates .get to the local db", () => {
      const db = makeFakeDb();
      db.selectObject = vi.fn(() => ({ guid: "g-1" }));
      const adapter = createWritablePostgresAdapter(db, makeSyncClient());

      const row = adapter
        .prepare("SELECT * FROM accounts WHERE guid = ?")
        .get("g-1");

      expect(row).toEqual({ guid: "g-1" });
    });
  });

  describe("transaction", () => {
    it("issues BEGIN/COMMIT locally and stacks the sync tx on success", () => {
      const db = makeFakeDb();
      const sync = makeSyncClient();
      const adapter = createWritablePostgresAdapter(db, sync);

      const result = adapter.transaction(() => {
        adapter.run("INSERT INTO accounts (guid) VALUES (?)", "g-1");
        return "done";
      });

      expect(result).toBe("done");
      expect(db.execCalls.map((c) => c.sql)).toEqual([
        "BEGIN IMMEDIATE",
        "INSERT INTO accounts (guid) VALUES (?)",
        "COMMIT",
      ]);
      expect(sync.transactionDepth).toBe(0);
      expect(sync.pendingCount).toBe(1);
    });

    it("issues ROLLBACK and drops enqueued statements on failure", () => {
      const db = makeFakeDb();
      const sync = makeSyncClient();
      const adapter = createWritablePostgresAdapter(db, sync);

      expect(() => {
        adapter.transaction(() => {
          adapter.run("INSERT INTO accounts (guid) VALUES (?)", "g-1");
          throw new Error("engine rejection");
        });
      }).toThrow("engine rejection");

      expect(db.execCalls.map((c) => c.sql)).toEqual([
        "BEGIN IMMEDIATE",
        "INSERT INTO accounts (guid) VALUES (?)",
        "ROLLBACK",
      ]);
      expect(sync.transactionDepth).toBe(0);
      expect(sync.pendingCount).toBe(0);
    });

    it("handles nested transactions via sync-client savepoint stacking", () => {
      const db = makeFakeDb();
      const sync = makeSyncClient();
      const adapter = createWritablePostgresAdapter(db, sync);

      adapter.transaction(() => {
        adapter.run("a", []);
        // Inner tx rolls back — outer statement stays.
        expect(() => {
          adapter.transaction(() => {
            adapter.run("b", []);
            throw new Error("inner fail");
          });
        }).toThrow("inner fail");
        adapter.run("c", []);
      });

      expect(sync.pendingCount).toBe(2); // a and c, not b
      expect(sync.transactionDepth).toBe(0);
    });
  });

  describe("exec", () => {
    it("runs locally only — no sync enqueue", () => {
      const db = makeFakeDb();
      const sync = makeSyncClient();
      const adapter = createWritablePostgresAdapter(db, sync);

      adapter.exec("CREATE TABLE IF NOT EXISTS foo (x)");

      expect(db.exec).toHaveBeenCalledWith({
        sql: "CREATE TABLE IF NOT EXISTS foo (x)",
      });
      expect(sync.pendingCount).toBe(0);
    });
  });

  describe("close", () => {
    it("closes the underlying local db", () => {
      const db = makeFakeDb();
      const adapter = createWritablePostgresAdapter(db, makeSyncClient());

      adapter.close();

      expect(db.close).toHaveBeenCalledOnce();
    });
  });
});
