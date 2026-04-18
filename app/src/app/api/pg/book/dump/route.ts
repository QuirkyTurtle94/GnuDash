import { withBookClient, type PgConnection } from "@/lib/pg/connect";
import {
  GNUCASH_POSTGRES_TABLES,
  bookSchemaName,
} from "@/lib/gnucash/db/postgres-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  connection: PgConnection;
  bookId: string;
}

/**
 * Dump payload shape returned to the client. Per-table row arrays keep the
 * wire format independent of insert order and let the client fan out in
 * parallel when populating the local SQLite WASM cache. `version` lets us
 * evolve the shape without breaking older adapters.
 */
interface DumpPayload {
  version: 1;
  tables: Record<string, Record<string, unknown>[]>;
}

/**
 * POST /api/pg/book/dump
 *
 * Streams a complete snapshot of the book's schema as gzipped JSON. The
 * client adapter restores this into an in-memory SQLite WASM DB so all
 * subsequent reads hit the local cache.
 *
 * BIGINT columns come back from node-postgres as JS strings by default
 * (the driver refuses to coerce because BIGINT > Number.MAX_SAFE_INTEGER
 * loses precision). That is actually what we want: SQLite accepts strings
 * for INTEGER columns. The client adapter pipes them in as-is.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return new Response(
      JSON.stringify({ error: "Request body must be valid JSON" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  if (!body.connection || !body.bookId) {
    return new Response(
      JSON.stringify({ error: "Missing 'connection' or 'bookId'" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  try {
    const payload = await withBookClient(
      body.connection,
      body.bookId,
      async (client) => {
        // Tables we created via GNUCASH_POSTGRES_DDL. We always try them all,
        // even if empty — the client expects a consistent shape.
        const tables: DumpPayload["tables"] = {};
        for (const table of GNUCASH_POSTGRES_TABLES) {
          // Explicit schema-qualified name in case search_path was clobbered.
          const qualified = `${bookSchemaName(body.bookId)}.${table}`;
          const res = await client.query(`SELECT * FROM ${qualified}`);
          tables[table] = res.rows;
        }
        return { version: 1 as const, tables };
      },
    );

    const json = JSON.stringify(payload);
    const gzipped = await gzipString(json);
    // Cast via unknown because the lib.dom BodyInit type is narrower than
    // Node/Undici's runtime — Uint8Array is a valid body at runtime.
    return new Response(gzipped as unknown as BodyInit, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-encoding": "gzip",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 502, headers: { "content-type": "application/json" } },
    );
  }
}

async function gzipString(str: string): Promise<Uint8Array> {
  const stream = new Blob([str]).stream().pipeThrough(
    new CompressionStream("gzip"),
  );
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
