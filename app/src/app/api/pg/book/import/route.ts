import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import BetterSqlite3 from "better-sqlite3";
import { withClient, type PgConnection } from "@/lib/pg/connect";
import {
  bookSchemaName,
  createBookSchemaSQL,
  dropBookSchemaSQL,
  GNUCASH_POSTGRES_DDL,
  GNUCASH_POSTGRES_TABLES,
  insertSchemaVersionSQL,
  setSearchPathSQL,
} from "@/lib/gnucash/db/postgres-schema";
import { REQUIRED_TABLES } from "@/lib/gnucash/db/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/pg/book/import
 *
 * Multipart upload:
 *   - `file`       — a GnuCash SQLite file (raw or gzipped)
 *   - `connection` — JSON-encoded PgConnection
 *   - `bookId`     — target book id
 *
 * Drops and recreates the book's Postgres schema, applies
 * `GNUCASH_POSTGRES_DDL`, and bulk-copies every table from the uploaded
 * SQLite file into the new schema inside a single transaction. Any failure
 * rolls back; on success the schema is fully populated and stamped with
 * `gnudash_meta.schema_version = 1`.
 *
 * XML files are NOT handled server-side — the upload UI converts XML to
 * SQLite client-side (via the existing worker pipeline) before calling this
 * endpoint. That avoids porting the browser-DOM-based XML parser to Node.
 *
 * Gzipped SQLite input is auto-detected by magic bytes and decompressed —
 * matches what GnuCash writes when "save-compressed" is enabled.
 */
export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request must be multipart/form-data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  const connectionJson = formData.get("connection");
  const bookIdRaw = formData.get("bookId");

  if (!(file instanceof File) || typeof connectionJson !== "string" || typeof bookIdRaw !== "string") {
    return NextResponse.json(
      { error: "Missing or malformed 'file', 'connection', or 'bookId'" },
      { status: 400 },
    );
  }

  let connection: PgConnection;
  try {
    connection = JSON.parse(connectionJson) as PgConnection;
  } catch {
    return NextResponse.json(
      { error: "'connection' must be valid JSON" },
      { status: 400 },
    );
  }

  const bookId = bookIdRaw;
  let schema: string;
  try {
    schema = bookSchemaName(bookId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  // Buffer the upload and transparently gunzip if needed.
  let fileBuffer: Buffer;
  try {
    const raw = Buffer.from(await file.arrayBuffer());
    fileBuffer = isGzipped(raw) ? gunzipSync(raw) : raw;
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to read uploaded file: ${(err as Error).message}` },
      { status: 400 },
    );
  }

  if (!isSqlite(fileBuffer)) {
    return NextResponse.json(
      {
        error:
          "Uploaded file is not a SQLite database. XML files must be converted to SQLite client-side before upload.",
      },
      { status: 400 },
    );
  }

  // better-sqlite3 opens files by path, so stage to a private temp dir that we
  // clean up in finally. We open rw so we can normalise legacy ISO date
  // strings in-place before copying — the temp file is discarded immediately
  // afterward so nothing we write here outlives this request.
  const tmpDir = await mkdtemp(join(tmpdir(), "gnudash-import-"));
  const tmpPath = join(tmpDir, `${randomUUID()}.sqlite`);
  try {
    await writeFile(tmpPath, fileBuffer);

    const source = new BetterSqlite3(tmpPath);
    try {
      validateSourceFile(source);
      normaliseDatesToCompact(source);
      const rowsByTable = readSourceTables(source);

      await withClient(connection, async (client) => {
        // Everything — drop/recreate, DDL, inserts, sequence bumps, meta
        // stamp — runs inside a single transaction. Postgres supports DDL
        // inside explicit transactions, so a failure at any step rolls the
        // schema back entirely instead of leaving empty tables behind that
        // would trick a subsequent `book/status` check into the "already
        // imported, just load" branch on the next reconnect.
        await client.query("BEGIN");
        try {
          await client.query(dropBookSchemaSQL(bookId));
          await client.query(createBookSchemaSQL(bookId));
          await client.query(setSearchPathSQL(bookId));
          await client.query(GNUCASH_POSTGRES_DDL);

          for (const table of GNUCASH_POSTGRES_TABLES) {
            if (table === "gnudash_meta") continue;
            const rows = rowsByTable[table];
            if (!rows || rows.length === 0) continue;
            // Real .gnucash SQLite files carry a wider column set than our
            // PG DDL — e.g. commodities has quote_flag/quote_source/quote_tz
            // that the engine never touches. Ask PG what columns actually
            // exist in the freshly-created table and only copy those, so
            // source-schema drift never produces an INSERT failure.
            const targetColumns = await fetchTableColumns(
              client,
              schema,
              table,
            );
            await bulkInsert(client, schema, table, rows, targetColumns);
          }

          // Bump the underlying sequence past any explicit `id` values we
          // imported so subsequent auto-assigned ids don't collide.
          for (const table of ["recurrences", "budget_amounts", "slots"] as const) {
            const rows = rowsByTable[table];
            if (!rows || rows.length === 0) continue;
            await client.query(
              `SELECT setval(pg_get_serial_sequence('${schema}.${table}', 'id'),
                              COALESCE((SELECT MAX(id) FROM ${table}), 1),
                              true)`,
            );
          }

          await client.query(insertSchemaVersionSQL());
          await client.query("COMMIT");
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          throw err;
        }
      });
    } finally {
      source.close();
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

function isGzipped(buf: Buffer): boolean {
  return buf.length >= 2 && buf[0] === 0x1f && buf[1] === 0x8b;
}

function isSqlite(buf: Buffer): boolean {
  // "SQLite format 3\0" — the first 16 bytes of every SQLite 3 file header.
  const magic = "SQLite format 3\0";
  if (buf.length < magic.length) return false;
  return buf.slice(0, magic.length).toString("binary") === magic;
}

/** Throw if the source SQLite is missing any table/column the engine requires. */
function validateSourceFile(db: BetterSqlite3.Database): void {
  for (const [table, columns] of Object.entries(REQUIRED_TABLES)) {
    const row = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!row) {
      throw new Error(
        `Uploaded file is not a valid GnuCash SQLite database: missing table "${table}"`,
      );
    }
    const info = db
      .prepare(`PRAGMA table_info(${table})`)
      .all() as { name: string }[];
    const present = new Set(info.map((c) => c.name));
    for (const col of columns) {
      if (!present.has(col)) {
        throw new Error(
          `Uploaded file is not a valid GnuCash SQLite database: table "${table}" missing column "${col}"`,
        );
      }
    }
  }
}

/**
 * Rewrite any legacy ISO-format dates (YYYY-MM-DD HH:MM:SS) to GnuCash's
 * compact YYYYMMDDHHmmss format. Mirrors the worker-side normaliser so
 * files written by older GnuCash releases end up consistent in Postgres.
 */
function normaliseDatesToCompact(db: BetterSqlite3.Database): void {
  const cols = [
    ["transactions", "post_date"],
    ["transactions", "enter_date"],
    ["prices", "date"],
    ["schedxactions", "start_date"],
    ["schedxactions", "end_date"],
    ["schedxactions", "last_occur"],
    ["recurrences", "recurrence_period_start"],
  ] as const;
  for (const [table, col] of cols) {
    try {
      db.exec(
        `UPDATE ${table} SET ${col} =
           REPLACE(REPLACE(REPLACE(${col}, '-', ''), ' ', ''), ':', '')
         WHERE ${col} LIKE '____-__-%'`,
      );
    } catch {
      // Table may not exist on older files — ignore.
    }
  }
}

/**
 * Read every table declared in GNUCASH_POSTGRES_TABLES out of the source
 * SQLite DB as plain row objects, keyed by table name. Tables that don't
 * exist in the source (older files may lack `lots` or `slots`) map to an
 * empty array so the caller doesn't have to guard.
 */
function readSourceTables(
  db: BetterSqlite3.Database,
): Record<string, Record<string, unknown>[]> {
  const out: Record<string, Record<string, unknown>[]> = {};
  for (const table of GNUCASH_POSTGRES_TABLES) {
    if (table === "gnudash_meta") continue;
    const exists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!exists) {
      out[table] = [];
      continue;
    }
    out[table] = db.prepare(`SELECT * FROM ${table}`).all() as Record<
      string,
      unknown
    >[];
  }
  return out;
}

/** Column names present in `schema.table` in the target Postgres. */
async function fetchTableColumns(
  client: import("pg").Client,
  schema: string,
  table: string,
): Promise<Set<string>> {
  const res = await client.query<{ column_name: string }>(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = $2`,
    [schema, table],
  );
  return new Set(res.rows.map((r) => r.column_name));
}

/**
 * Insert rows in chunks so we don't exceed PG's parameter limit (~65k).
 * Only columns in `targetColumns` are copied; extra columns present in the
 * source .gnucash file (e.g. `quote_flag` on `commodities`) are silently
 * dropped because our schema doesn't declare them and the engine doesn't
 * use them.
 */
async function bulkInsert(
  client: import("pg").Client,
  schema: string,
  table: string,
  rows: Record<string, unknown>[],
  targetColumns: Set<string>,
): Promise<void> {
  const columns = Object.keys(rows[0]).filter((c) => targetColumns.has(c));
  if (columns.length === 0) return;
  const CHUNK = 500;
  for (let start = 0; start < rows.length; start += CHUNK) {
    const chunk = rows.slice(start, start + CHUNK);
    const values: unknown[] = [];
    const rowPlaceholders: string[] = [];
    let p = 1;
    for (const row of chunk) {
      const cols = columns.map(() => `$${p++}`).join(", ");
      rowPlaceholders.push(`(${cols})`);
      for (const col of columns) {
        values.push(row[col]);
      }
    }
    const sql = `INSERT INTO ${schema}.${table} (${columns.join(", ")}) VALUES ${rowPlaceholders.join(", ")}`;
    await client.query(sql, values);
  }
}
