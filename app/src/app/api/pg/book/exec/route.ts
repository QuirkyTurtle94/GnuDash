import { NextResponse } from "next/server";
import { withBookClient, type PgConnection } from "@/lib/pg/connect";
import { translate } from "@/lib/pg/sql-translate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Statement {
  sql: string;
  params?: unknown[];
}

interface Body {
  connection: PgConnection;
  bookId: string;
  statements: Statement[];
}

/**
 * POST /api/pg/book/exec
 *
 * Runs a batch of mutation statements inside the book's schema in a single
 * transaction. The client sends SQLite-dialect SQL (INSERT/UPDATE/DELETE
 * with `?` placeholders); the route runs each statement through the
 * translator before dispatching to Postgres. All-or-nothing: any error
 * rolls back every statement in the batch.
 *
 * Response: `{ results: [{ changes: number }, ...] }` — one entry per
 * statement in input order, so the caller can correlate per-statement row
 * counts with the original list.
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

  if (!Array.isArray(body.statements) || body.statements.length === 0) {
    return NextResponse.json(
      { error: "'statements' must be a non-empty array" },
      { status: 400 },
    );
  }

  // Translate up front so bad SQL fails before we open a connection or BEGIN.
  let translated: Statement[];
  try {
    translated = body.statements.map((stmt) => ({
      sql: translate(stmt.sql),
      params: stmt.params ?? [],
    }));
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 400 },
    );
  }

  try {
    const results = await withBookClient(
      body.connection,
      body.bookId,
      async (client) => {
        await client.query("BEGIN");
        try {
          const out: { changes: number }[] = [];
          for (const stmt of translated) {
            const res = await client.query(stmt.sql, stmt.params);
            out.push({ changes: res.rowCount ?? 0 });
          }
          await client.query("COMMIT");
          return out;
        } catch (err) {
          await client.query("ROLLBACK").catch(() => {});
          throw err;
        }
      },
    );
    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 502 },
    );
  }
}
