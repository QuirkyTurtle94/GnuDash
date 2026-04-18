import {
  resolveSchemaName,
  withClient,
  type PgConnection,
} from "@/lib/pg/connect";
import { GNUCASH_POSTGRES_TABLES } from "@/lib/gnucash/db/postgres-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Accepts either a gnudash-managed `bookId` (the default flow) or a raw
 * `schema` for the existing-GnuCash-DB read-only interop path. Exactly one
 * must be supplied; see `resolveSchemaName` for validation.
 */
interface Body {
  connection: PgConnection;
  bookId?: string;
  schema?: string;
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

  if (!body.connection) {
    return new Response(
      JSON.stringify({ error: "Missing 'connection'" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }
  if ((!body.bookId && !body.schema) || (body.bookId && body.schema)) {
    return new Response(
      JSON.stringify({ error: "Provide exactly one of 'bookId' or 'schema'" }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  let schema: string;
  try {
    schema = resolveSchemaName({ bookId: body.bookId, schema: body.schema });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 400, headers: { "content-type": "application/json" } },
    );
  }

  try {
    const payload = await withClient(body.connection, async (client) => {
      // Only dump tables that actually exist in the target schema. A real
      // GnuCash database won't have `gnudash_meta`, and older GnuCash files
      // may lack `lots` / `slots` until first use — skipping missing tables
      // lets the same client handle both flavours without a schema branch.
      const existing = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
        [schema, [...GNUCASH_POSTGRES_TABLES]],
      );
      const existingTables = new Set(existing.rows.map((r) => r.table_name));

      const tables: DumpPayload["tables"] = {};
      for (const table of GNUCASH_POSTGRES_TABLES) {
        if (!existingTables.has(table)) continue;
        // Explicit schema-qualified name in case search_path was clobbered.
        const qualified = `${schema}.${table}`;
        const res = await client.query(`SELECT * FROM ${qualified}`);
        tables[table] = res.rows;
      }
      return { version: 1 as const, tables };
    });

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
