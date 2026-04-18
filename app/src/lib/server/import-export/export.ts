import "server-only";
/**
 * Postgres → GnuCash SQLite export.
 *
 * Creates an in-memory SQLite database, applies the GnuCash SQLite DDL
 * (taken from `xml/schema.ts`), copies every row from the target Postgres
 * schema back to SQLite with inverse type conversions, and serializes
 * the whole thing to a byte buffer suitable for download as a .gnucash file.
 */
import Database from "better-sqlite3";
import { withBookClient } from "../../gnucash/engine/db/pg/with-book-client";
import { PHASE_1_SCHEMA } from "../../gnucash/engine/db/pg/schema-name";
import { GNUCASH_SCHEMA_DDL } from "../../gnucash/xml/schema";
import {
  GNUCASH_TABLES,
  transformForSqlite,
  type TableDescriptor,
} from "./tables";
import type { WritableDbAdapter } from "../../gnucash/engine/db/writable-adapter";

export interface ExportOptions {
  schema?: string;
}

async function exportTable(
  pg: WritableDbAdapter,
  sqlite: Database.Database,
  t: TableDescriptor
): Promise<number> {
  if (t.passThrough) return 0;

  const rows = (await pg
    .prepare(`SELECT ${t.columns.join(", ")} FROM ${t.name}`)
    .all()) as Record<string, unknown>[];
  if (rows.length === 0) return 0;

  const placeholders = t.columns.map(() => "?").join(", ");
  const insert = sqlite.prepare(
    `INSERT INTO ${t.name} (${t.columns.join(", ")}) VALUES (${placeholders})`
  );

  for (const row of rows) {
    const values = t.columns.map((col) => {
      const kind = t.types?.[col] ?? "passthrough";
      return transformForSqlite(row[col], kind);
    });
    insert.run(...(values as unknown[]));
  }
  return rows.length;
}

/**
 * Build a valid .gnucash byte buffer from the given book's schema.
 * Returns a Buffer that can be streamed as application/x-gnucash.
 */
export async function exportGnucashFile(
  options: ExportOptions = {}
): Promise<Buffer> {
  const schema = options.schema ?? PHASE_1_SCHEMA;

  const sqlite = new Database(":memory:");
  try {
    // Apply the GnuCash SQLite DDL. The reduced schema.ts doesn't include
    // every real-GnuCash column — see docs/architecture/storage-adapters.md —
    // but it's enough for a dashboard round-trip. A follow-up will swap this
    // for the full 3.0+ SQLite DDL so desktop GnuCash can open the export
    // unchanged.
    sqlite.exec(GNUCASH_SCHEMA_DDL);

    await withBookClient(schema, async (pg) => {
      for (const t of GNUCASH_TABLES) {
        if (t.passThrough) continue;
        await exportTable(pg, sqlite, t);
      }
    });

    // better-sqlite3 serialize() produces the raw SQLite file bytes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bytes = (sqlite as any).serialize() as Buffer;
    return bytes;
  } finally {
    sqlite.close();
  }
}
