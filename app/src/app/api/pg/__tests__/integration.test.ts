/**
 * Integration tests for the Server-backend API routes.
 *
 * These tests hit a real Postgres — start one with `docker compose up -d
 * postgres` from the repo root before running. If no Postgres is reachable
 * the whole suite is skipped (with a console note so CI and solo devs both
 * get a clear signal rather than a misleading pass).
 *
 * Each test suite uses a unique `bookId` namespaced with a random suffix so
 * parallel runs don't collide; teardown drops the schema afterward.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PgConnection } from "@/lib/pg/connect";
import { POST as testConnectionPOST } from "@/app/api/pg/test-connection/route";
import { POST as statusPOST } from "@/app/api/pg/book/status/route";
import { POST as importPOST } from "@/app/api/pg/book/import/route";
import { POST as dumpPOST } from "@/app/api/pg/book/dump/route";
import { POST as execPOST } from "@/app/api/pg/book/exec/route";
import { POST as dropPOST } from "@/app/api/pg/book/drop/route";
import { bookSchemaName } from "@/lib/gnucash/db/postgres-schema";

const FIXTURE_PATH = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "lib",
  "gnucash",
  "__tests__",
  "fixtures",
  "test.gnucash",
);

function readTestConnection(): PgConnection {
  return {
    host: process.env.PG_TEST_HOST ?? "localhost",
    port: Number(process.env.PG_TEST_PORT ?? 5432),
    user: process.env.PG_TEST_USER ?? "gnudash",
    password: process.env.PG_TEST_PASSWORD ?? "gnudash",
    database: process.env.PG_TEST_DATABASE ?? "gnudash",
  };
}

async function probePostgres(): Promise<PgConnection | null> {
  const conn = readTestConnection();
  const client = new Client({
    host: conn.host,
    port: conn.port,
    user: conn.user,
    password: conn.password,
    database: conn.database,
    connectionTimeoutMillis: 2000,
  });
  try {
    await client.connect();
    await client.end();
    return conn;
  } catch {
    await client.end().catch(() => {});
    return null;
  }
}

const connection = await probePostgres();
if (!connection) {
  // Print once at module load so the reason is obvious in CI logs.
  console.warn(
    "[pg-api integration] skipping — no Postgres reachable at " +
      `${readTestConnection().host}:${readTestConnection().port}. Start it with ` +
      "`docker compose up -d postgres` to run these tests.",
  );
}

describe.skipIf(!connection)("API routes (integration)", () => {
  // Book IDs are scoped to this test run so parallel runs don't collide.
  const bookId = `test_${Math.random().toString(36).slice(2, 10)}`;

  function jsonRequest(url: string, body: unknown): Request {
    return new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function resetSchema(): Promise<void> {
    const res = await dropPOST(
      jsonRequest("http://local/api/pg/book/drop", { connection, bookId }),
    );
    expect(res.status).toBe(200);
  }

  beforeAll(resetSchema);
  afterAll(resetSchema);

  it("test-connection returns server version", async () => {
    const res = await testConnectionPOST(
      jsonRequest("http://local/api/pg/test-connection", { connection }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; serverVersion: string };
    expect(body.ok).toBe(true);
    expect(body.serverVersion).toMatch(/PostgreSQL/);
  });

  it("test-connection fails gracefully on bad credentials", async () => {
    const badConnection = { ...connection!, password: "definitely-not-right" };
    const res = await testConnectionPOST(
      jsonRequest("http://local/api/pg/test-connection", {
        connection: badConnection,
      }),
    );
    expect(res.status).toBe(502);
    const body = (await res.json()) as { ok: boolean; error: string };
    expect(body.ok).toBe(false);
    expect(body.error).toBeTruthy();
  });

  it("book/status reports exists=false on a fresh database", async () => {
    const res = await statusPOST(
      jsonRequest("http://local/api/pg/book/status", { connection, bookId }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { exists: boolean };
    expect(body.exists).toBe(false);
  });

  it("book/status rejects a malformed bookId", async () => {
    const res = await statusPOST(
      jsonRequest("http://local/api/pg/book/status", {
        connection,
        bookId: "BAD-ID",
      }),
    );
    expect(res.status).toBe(400);
  });

  it("book/import accepts a SQLite fixture and populates the schema", async () => {
    const buf = readFileSync(FIXTURE_PATH);
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(buf)]), "test.gnucash");
    form.append("connection", JSON.stringify(connection));
    form.append("bookId", bookId);

    const res = await importPOST(
      new Request("http://local/api/pg/book/import", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);

    // Follow-up: status should now report exists=true with no missing tables.
    const statusRes = await statusPOST(
      jsonRequest("http://local/api/pg/book/status", { connection, bookId }),
    );
    const statusBody = (await statusRes.json()) as {
      exists: boolean;
      missingTables: string[];
    };
    expect(statusBody.exists).toBe(true);
    expect(statusBody.missingTables).toEqual([]);
  });

  it("book/import rejects a non-SQLite file", async () => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new TextEncoder().encode("not a sqlite file")]),
      "bad.txt",
    );
    form.append("connection", JSON.stringify(connection));
    form.append("bookId", `${bookId}_bad`);

    const res = await importPOST(
      new Request("http://local/api/pg/book/import", {
        method: "POST",
        body: form,
      }),
    );
    expect(res.status).toBe(400);
  });

  it("book/dump returns gzipped JSON with all tables populated", async () => {
    const res = await dumpPOST(
      jsonRequest("http://local/api/pg/book/dump", { connection, bookId }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("content-encoding")).toBe("gzip");

    // Decompress and parse.
    const buf = Buffer.from(await res.arrayBuffer());
    const decompressed = await new Response(
      new Blob([new Uint8Array(buf)]).stream().pipeThrough(
        new DecompressionStream("gzip"),
      ),
    ).arrayBuffer();
    const payload = JSON.parse(new TextDecoder().decode(decompressed)) as {
      version: number;
      tables: Record<string, unknown[]>;
    };
    expect(payload.version).toBe(1);
    expect(payload.tables.accounts.length).toBeGreaterThan(0);
    expect(payload.tables.transactions.length).toBeGreaterThan(0);
    expect(payload.tables.commodities.length).toBeGreaterThan(0);
  });

  it("book/exec runs translated SQL in a transaction and returns row counts", async () => {
    // Grab an existing account guid from the imported book so the update has
    // something real to hit.
    const dumpRes = await dumpPOST(
      jsonRequest("http://local/api/pg/book/dump", { connection, bookId }),
    );
    const decompressed = await new Response(
      new Blob([new Uint8Array(Buffer.from(await dumpRes.arrayBuffer()))])
        .stream()
        .pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer();
    const dump = JSON.parse(new TextDecoder().decode(decompressed)) as {
      tables: { accounts: { guid: string; description: string }[] };
    };
    const account = dump.tables.accounts[0];

    const res = await execPOST(
      jsonRequest("http://local/api/pg/book/exec", {
        connection,
        bookId,
        statements: [
          {
            sql: "UPDATE accounts SET description = ? WHERE guid = ?",
            params: ["exec-test", account.guid],
          },
        ],
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { results: { changes: number }[] };
    expect(body.results).toEqual([{ changes: 1 }]);

    // Verify the write actually landed by reading the row back.
    const verifyClient = new Client({
      ...connection!,
      statement_timeout: 5000,
    });
    await verifyClient.connect();
    try {
      const { rows } = await verifyClient.query<{ description: string }>(
        `SELECT description FROM ${bookSchemaName(bookId)}.accounts WHERE guid = $1`,
        [account.guid],
      );
      expect(rows[0]?.description).toBe("exec-test");
    } finally {
      await verifyClient.end();
    }
  });

  it("book/exec rolls back the whole batch if any statement fails", async () => {
    const dumpRes = await dumpPOST(
      jsonRequest("http://local/api/pg/book/dump", { connection, bookId }),
    );
    const decompressed = await new Response(
      new Blob([new Uint8Array(Buffer.from(await dumpRes.arrayBuffer()))])
        .stream()
        .pipeThrough(new DecompressionStream("gzip")),
    ).arrayBuffer();
    const dump = JSON.parse(new TextDecoder().decode(decompressed)) as {
      tables: { accounts: { guid: string; description: string }[] };
    };
    const account = dump.tables.accounts[0];
    const original = account.description;

    // First statement succeeds, second targets a nonexistent column so PG
    // errors and everything should roll back.
    const res = await execPOST(
      jsonRequest("http://local/api/pg/book/exec", {
        connection,
        bookId,
        statements: [
          {
            sql: "UPDATE accounts SET description = ? WHERE guid = ?",
            params: ["rollback-test", account.guid],
          },
          {
            sql: "UPDATE accounts SET nonexistent_column = ? WHERE guid = ?",
            params: ["x", account.guid],
          },
        ],
      }),
    );
    expect(res.status).toBe(502);

    const verifyClient = new Client(connection!);
    await verifyClient.connect();
    try {
      const { rows } = await verifyClient.query<{ description: string }>(
        `SELECT description FROM ${bookSchemaName(bookId)}.accounts WHERE guid = $1`,
        [account.guid],
      );
      expect(rows[0]?.description).toBe(original);
    } finally {
      await verifyClient.end();
    }
  });

  it("book/exec rejects unsupported opcodes before opening a connection", async () => {
    const res = await execPOST(
      jsonRequest("http://local/api/pg/book/exec", {
        connection,
        bookId,
        statements: [{ sql: "SELECT * FROM accounts" }],
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/unsupported opcode/i);
  });

  it("book/drop removes the schema", async () => {
    const res = await dropPOST(
      jsonRequest("http://local/api/pg/book/drop", { connection, bookId }),
    );
    expect(res.status).toBe(200);

    const statusRes = await statusPOST(
      jsonRequest("http://local/api/pg/book/status", { connection, bookId }),
    );
    const statusBody = (await statusRes.json()) as { exists: boolean };
    expect(statusBody.exists).toBe(false);
  });
});

/**
 * Regression coverage for issue #97: when gnudash reads a real GnuCash
 * Postgres schema (the read-only interop path), `transactions.post_date` etc.
 * are declared as native TIMESTAMP columns, not the compact YYYYMMDDHHmmss
 * TEXT format the engine expects. The dump route must normalise those on the
 * way out so the engine's `substr`-based month extraction keeps working.
 */
describe.skipIf(!connection)("dump route: read-only interop date normalisation", () => {
  const rawSchema = `real_gnucash_${Math.random().toString(36).slice(2, 10)}`;

  function jsonRequest(url: string, body: unknown): Request {
    return new Request(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function drop(): Promise<void> {
    const client = new Client({ ...connection! });
    await client.connect();
    try {
      await client.query(`DROP SCHEMA IF EXISTS ${rawSchema} CASCADE`);
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    await drop();
    const client = new Client({ ...connection! });
    await client.connect();
    try {
      // A minimal slice of GnuCash's real PG schema — only the columns the
      // dump route needs to touch, with the native timestamp types GnuCash
      // desktop writes. Enough to prove TO_CHAR normalisation kicks in.
      await client.query(`CREATE SCHEMA ${rawSchema}`);
      await client.query(`
        CREATE TABLE ${rawSchema}.transactions (
          guid TEXT PRIMARY KEY,
          currency_guid TEXT NOT NULL,
          num TEXT,
          post_date TIMESTAMP,
          enter_date TIMESTAMP,
          description TEXT
        )
      `);
      await client.query(`
        CREATE TABLE ${rawSchema}.prices (
          guid TEXT PRIMARY KEY,
          commodity_guid TEXT NOT NULL,
          currency_guid TEXT NOT NULL,
          date TIMESTAMP,
          source TEXT,
          type TEXT,
          value_num BIGINT NOT NULL,
          value_denom BIGINT NOT NULL DEFAULT 100
        )
      `);
      // A future-dated write-off plus a current-year transaction: the exact
      // shape of data that exposed the bug in issue #97.
      await client.query(
        `INSERT INTO ${rawSchema}.transactions
           (guid, currency_guid, post_date, enter_date, description)
         VALUES
           ('tx-now', 'cur', TIMESTAMP '2026-04-15 10:30:00', TIMESTAMP '2026-04-15 10:30:00', 'now'),
           ('tx-future', 'cur', TIMESTAMP '2029-02-01 00:00:00', TIMESTAMP '2029-02-01 00:00:00', 'writeoff')`,
      );
      await client.query(
        `INSERT INTO ${rawSchema}.prices
           (guid, commodity_guid, currency_guid, date, value_num, value_denom)
         VALUES ('p1', 'stk', 'cur', TIMESTAMP '2026-04-15 00:00:00', 100, 1)`,
      );
    } finally {
      await client.end();
    }
  });

  afterAll(drop);

  it("wraps TIMESTAMP columns with TO_CHAR so the client sees compact YYYYMMDDHHmmss", async () => {
    const res = await dumpPOST(
      jsonRequest("http://local/api/pg/book/dump", {
        connection,
        schema: rawSchema,
      }),
    );
    expect(res.status).toBe(200);

    const buf = Buffer.from(await res.arrayBuffer());
    const decompressed = await new Response(
      new Blob([new Uint8Array(buf)]).stream().pipeThrough(
        new DecompressionStream("gzip"),
      ),
    ).arrayBuffer();
    const payload = JSON.parse(new TextDecoder().decode(decompressed)) as {
      tables: {
        transactions: { guid: string; post_date: string; enter_date: string }[];
        prices: { guid: string; date: string }[];
      };
    };

    const txns = payload.tables.transactions;
    const now = txns.find((t) => t.guid === "tx-now");
    const future = txns.find((t) => t.guid === "tx-future");
    expect(now?.post_date).toBe("20260415103000");
    expect(now?.enter_date).toBe("20260415103000");
    expect(future?.post_date).toBe("20290201000000");
    expect(future?.enter_date).toBe("20290201000000");

    // Prices.date must also land in compact form — it feeds `sqlMonth` too.
    expect(payload.tables.prices[0]?.date).toBe("20260415000000");

    // And the shape the chart code would see must round-trip through
    // `substr(col, 1, 4) || '-' || substr(col, 5, 2)` to produce a valid
    // YYYY-MM string (not "2026--0").
    const month = `${now!.post_date.substring(0, 4)}-${now!.post_date.substring(4, 6)}`;
    expect(month).toBe("2026-04");
  });
});
