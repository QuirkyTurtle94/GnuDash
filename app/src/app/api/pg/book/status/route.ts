import { NextResponse } from "next/server";
import { withClient, type PgConnection } from "@/lib/pg/connect";
import { bookSchemaName } from "@/lib/gnucash/db/postgres-schema";
import { REQUIRED_TABLES } from "@/lib/gnucash/db/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  connection: PgConnection;
  bookId: string;
}

/**
 * POST /api/pg/book/status
 *
 * Returns whether the book's schema exists in the target database, and if
 * so, whether every required table is present. The upload flow uses this to
 * branch between "existing book → load" and "new book → import".
 *
 * Response:
 *   { exists: false }                   — schema does not exist at all
 *   { exists: true, missingTables: [] } — schema exists, all required tables present
 *   { exists: true, missingTables: ["accounts", ...] } — partially provisioned
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (!body.connection || !body.bookId) {
    return NextResponse.json(
      { error: "Missing 'connection' or 'bookId'" },
      { status: 400 },
    );
  }

  let schema: string;
  try {
    schema = bookSchemaName(body.bookId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  try {
    const result = await withClient(body.connection, async (client) => {
      const schemaRow = await client.query<{ exists: boolean }>(
        "SELECT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = $1) AS exists",
        [schema],
      );
      const exists = schemaRow.rows[0]?.exists === true;
      if (!exists) {
        return { exists: false as const };
      }

      // Schema is there — check every required table for presence.
      const required = Object.keys(REQUIRED_TABLES);
      const presentRows = await client.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = $1 AND table_name = ANY($2::text[])`,
        [schema, required],
      );
      const present = new Set(presentRows.rows.map((r) => r.table_name));
      const missingTables = required.filter((t) => !present.has(t));

      return { exists: true as const, missingTables };
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
