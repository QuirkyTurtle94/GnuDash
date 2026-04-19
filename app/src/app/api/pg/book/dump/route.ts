import {
  resolveSchemaName,
  withClient,
  type PgConnection,
} from "@/lib/pg/connect";
import { GNUCASH_POSTGRES_TABLES } from "@/lib/gnucash/db/postgres-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Columns that carry GnuCash-format dates. The gnudash-managed schema stores
 * these as TEXT in the compact `YYYYMMDDHHmmss` shape the engine expects, but
 * real GnuCash Postgres schemas (the read-only interop path) declare them as
 * native TIMESTAMP / DATE columns. When we encounter the latter, we format on
 * the server via `TO_CHAR(col, 'YYYYMMDDHH24MISS')` so the client cache ends
 * up with the compact form regardless of source — see issue #97 for the bug
 * this guards against (corrupted month strings like `2026--0` cascading into
 * every chart).
 *
 * Mirrors the list in `app/api/pg/book/import/route.ts` → `normaliseDatesToCompact`.
 */
const DATE_COLUMNS_BY_TABLE: Record<string, readonly string[]> = {
  transactions: ["post_date", "enter_date"],
  prices: ["date"],
  schedxactions: ["start_date", "end_date", "last_occur"],
  recurrences: ["recurrence_period_start"],
};

/** Postgres data_type values that need TO_CHAR normalisation. */
const NATIVE_DATE_TYPES = new Set([
  "date",
  "timestamp without time zone",
  "timestamp with time zone",
]);

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

      // One shot for every column in every table we're about to dump, so we
      // can detect native TIMESTAMP/DATE columns and format them to compact
      // form without a round-trip per table.
      const columnTypes = await client.query<{
        table_name: string;
        column_name: string;
        data_type: string;
      }>(
        `SELECT table_name, column_name, data_type FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
        [schema, [...GNUCASH_POSTGRES_TABLES]],
      );
      const typeByTableCol = new Map<string, string>();
      for (const row of columnTypes.rows) {
        typeByTableCol.set(`${row.table_name}.${row.column_name}`, row.data_type);
      }

      const tables: DumpPayload["tables"] = {};
      for (const table of GNUCASH_POSTGRES_TABLES) {
        if (!existingTables.has(table)) continue;
        // Explicit schema-qualified name in case search_path was clobbered.
        const qualified = `${schema}.${table}`;
        const selectList = buildSelectList(table, typeByTableCol);
        const res = await client.query(`SELECT ${selectList} FROM ${qualified}`);
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

/**
 * Build the `SELECT` column list for a table. Known date columns that are
 * declared as a native Postgres date/timestamp type are wrapped with
 * `TO_CHAR(..., 'YYYYMMDDHH24MISS')` so they arrive at the client in the
 * compact form the engine parses; everything else is selected with `*` via a
 * wildcard emitted when no wrapping is required.
 *
 * Returns the raw SELECT fragment (either `*` or an explicit column list).
 */
function buildSelectList(
  table: string,
  typeByTableCol: Map<string, string>,
): string {
  const dateCols = DATE_COLUMNS_BY_TABLE[table];
  if (!dateCols) return "*";

  const nativeDateCols = dateCols.filter((col) => {
    const type = typeByTableCol.get(`${table}.${col}`);
    return type !== undefined && NATIVE_DATE_TYPES.has(type);
  });
  if (nativeDateCols.length === 0) return "*";

  // Cast to timestamp before TO_CHAR so one formatter handles DATE,
  // TIMESTAMP, and TIMESTAMPTZ uniformly. For TIMESTAMPTZ the cast uses the
  // session timezone — matches how GnuCash desktop renders these dates to
  // the user and how the import route's REPLACE-based normaliser handles
  // legacy TEXT values. DATE columns get `000000` for the time portion.
  const wrapped = nativeDateCols.map(
    (col) => `TO_CHAR(${col}::timestamp, 'YYYYMMDDHH24MISS') AS ${col}`,
  );
  // Exclude the raw columns from `*` so we don't emit two rows with the same
  // key (Postgres tolerates duplicate output column names but node-postgres
  // would overwrite one with the other in the row object — order-dependent).
  const excludeCols = new Set(nativeDateCols);
  const remainingWildcard = buildWildcardExcluding(
    table,
    typeByTableCol,
    excludeCols,
  );
  return [...wrapped, remainingWildcard].filter(Boolean).join(", ");
}

/**
 * Emit a column list containing every column of `table` except those in
 * `exclude`. Used when some columns of a table need TO_CHAR wrapping and the
 * rest should pass through unchanged — we can't use `*` alongside aliased
 * copies of the excluded columns without producing duplicates.
 */
function buildWildcardExcluding(
  table: string,
  typeByTableCol: Map<string, string>,
  exclude: Set<string>,
): string {
  const cols: string[] = [];
  for (const key of typeByTableCol.keys()) {
    const [t, c] = key.split(".", 2);
    if (t === table && !exclude.has(c)) cols.push(c);
  }
  return cols.join(", ");
}

async function gzipString(str: string): Promise<Uint8Array> {
  const stream = new Blob([str]).stream().pipeThrough(
    new CompressionStream("gzip"),
  );
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}
