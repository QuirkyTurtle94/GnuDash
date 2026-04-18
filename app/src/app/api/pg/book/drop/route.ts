import { NextResponse } from "next/server";
import { withClient, type PgConnection } from "@/lib/pg/connect";
import { dropBookSchemaSQL } from "@/lib/gnucash/db/postgres-schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  connection: PgConnection;
  bookId: string;
}

/**
 * POST /api/pg/book/drop
 *
 * Drops the book's Postgres schema (and every table in it). Used by the
 * reupload flow — the client calls this and then immediately calls
 * /api/pg/book/import with a new file. There is no soft-delete / backup;
 * the caller is responsible for confirming with the user.
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

  let sql: string;
  try {
    sql = dropBookSchemaSQL(body.bookId);
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }

  try {
    await withClient(body.connection, (client) => client.query(sql));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
