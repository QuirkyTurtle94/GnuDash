import "server-only";
/**
 * GnuCash SQLite → Postgres import.
 *
 * Opens the uploaded `.gnucash` file in an in-memory better-sqlite3 instance
 * and copies every known table row-for-row into the target Postgres schema,
 * applying the type conversions declared in `tables.ts`.
 *
 * For Phase 1 this writes to the fixed `gnudash_book` schema; Phase 2 will
 * target `book_<uuid>`. The target schema must already exist (created by
 * `db/migrations/0001_gnucash_schema.sql`).
 *
 * Refuses to run if the target schema contains any rows unless
 * `overwrite: true`. Overwriting TRUNCATEs every table in the schema
 * inside the same transaction as the insert so a mid-import failure rolls
 * back cleanly — no half-overwritten state.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import type { WritableDbAdapter } from "../../gnucash/engine/db/writable-adapter";
import { withBookClient } from "../../gnucash/engine/db/pg/with-book-client";
import { PHASE_1_SCHEMA } from "../../gnucash/engine/db/pg/schema-name";
import {
  CORE_TABLE_NAMES,
  GNUCASH_TABLES,
  transformForPostgres,
  type TableDescriptor,
} from "./tables";

export interface ImportOptions {
  overwrite?: boolean;
  /** Target schema. Defaults to Phase 1 fixed schema. */
  schema?: string;
}

export interface ImportResult {
  schema: string;
  tablesImported: string[];
  tablesSkipped: string[];
  rowsByTable: Record<string, number>;
}

/**
 * Decode the uploaded buffer into a better-sqlite3 connection.
 *
 * better-sqlite3 opens databases from file paths rather than from
 * in-memory buffers, so we persist the upload to a tmp file and open
 * that read-only. The returned `cleanup` must be called on every exit
 * path (success or error) — it closes the handle and deletes the file.
 *
 * Container deploys run with a read-only root filesystem and a writable
 * tmpfs mount on `/tmp` (see Dockerfile.server), so this path is fine
 * in production without loosening the fs posture.
 */
function openSqliteFromBuffer(
  buffer: ArrayBuffer
): { db: Database.Database; cleanup: () => void } {
  const bytes = new Uint8Array(buffer);
  if (
    bytes.length < 4 ||
    bytes[0] !== 0x53 ||
    bytes[1] !== 0x51 ||
    bytes[2] !== 0x4c ||
    bytes[3] !== 0x69
  ) {
    throw new Error(
      "Unsupported .gnucash format: server-side import currently accepts binary SQLite files only. " +
        "Re-save in GnuCash desktop via File → Save As with format 'sqlite3'."
    );
  }
  const tempPath = path.join(
    os.tmpdir(),
    `gnudash-import-${crypto.randomBytes(16).toString("hex")}.db`
  );
  fs.writeFileSync(tempPath, Buffer.from(bytes), { mode: 0o600 });
  const db = new Database(tempPath, { readonly: true });
  const cleanup = () => {
    try {
      db.close();
    } catch {
      // already closed
    }
    try {
      fs.unlinkSync(tempPath);
    } catch {
      // already gone
    }
  };
  return { db, cleanup };
}

/**
 * Probe whether the target Postgres schema has any rows already.
 * We check a single telltale table to avoid a 23-table scan.
 */
async function targetHasData(db: WritableDbAdapter): Promise<boolean> {
  const row = (await db
    .prepare(`SELECT count(*)::int AS c FROM accounts`)
    .get()) as { c: number } | undefined;
  return (row?.c ?? 0) > 0;
}

async function truncateAll(db: WritableDbAdapter): Promise<void> {
  for (const t of GNUCASH_TABLES) {
    if (t.passThrough) continue;
    await db.exec(`TRUNCATE TABLE ${t.name} RESTART IDENTITY CASCADE`);
  }
}

async function importTable(
  sqlite: Database.Database,
  pg: WritableDbAdapter,
  t: TableDescriptor
): Promise<number> {
  if (t.passThrough) return 0;

  // Verify the source file actually has this table — older GnuCash files
  // predate some tables (e.g. `versions` was added in schema v1.x).
  const exists = sqlite
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`)
    .get(t.name) as { name: string } | undefined;
  if (!exists) return 0;

  const rows = sqlite.prepare(`SELECT * FROM ${t.name}`).all() as Record<
    string,
    unknown
  >[];
  if (rows.length === 0) return 0;

  const placeholders = t.columns.map((_, i) => `$${i + 1}`).join(", ");
  const insertSql = `INSERT INTO ${t.name} (${t.columns.join(", ")}) VALUES (${placeholders})`;

  for (const row of rows) {
    const values = t.columns.map((col) => {
      const kind = t.types?.[col] ?? "passthrough";
      return transformForPostgres(row[col], kind);
    });
    await pg.run(insertSql, ...values);
  }
  return rows.length;
}

/**
 * Import a .gnucash file into the configured Postgres book schema.
 * Entire operation runs in a single Postgres transaction.
 */
export async function importGnucashFile(
  buffer: ArrayBuffer,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const schema = options.schema ?? PHASE_1_SCHEMA;
  const { db: sqlite, cleanup } = openSqliteFromBuffer(buffer);
  try {
    return await withBookClient(schema, async (pg) => {
      if (await targetHasData(pg)) {
        if (!options.overwrite) {
          throw new Error(
            "Target schema already contains data. Retry with overwrite=true to replace it."
          );
        }
      }

      const result: ImportResult = {
        schema,
        tablesImported: [],
        tablesSkipped: [],
        rowsByTable: {},
      };

      return await pg.transaction(async () => {
        if (options.overwrite) {
          await truncateAll(pg);
        }
        for (const t of GNUCASH_TABLES) {
          if (t.passThrough) {
            result.tablesSkipped.push(t.name);
            continue;
          }
          const rows = await importTable(sqlite, pg, t);
          result.tablesImported.push(t.name);
          result.rowsByTable[t.name] = rows;
        }
        if (!result.tablesImported.some((n) => CORE_TABLE_NAMES.has(n) && result.rowsByTable[n] > 0)) {
          throw new Error(
            "No core tables had any rows — source file is empty or not a valid GnuCash file."
          );
        }
        return result;
      });
    });
  } finally {
    cleanup();
  }
}
