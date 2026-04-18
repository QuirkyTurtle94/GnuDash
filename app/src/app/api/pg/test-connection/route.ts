import { NextResponse } from "next/server";
import { withClient, type PgConnection } from "@/lib/pg/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Body {
  connection: PgConnection;
}

/**
 * POST /api/pg/test-connection
 *
 * Validates the supplied Postgres credentials by opening a connection and
 * issuing `SELECT version()`. Used by the Server tab of the upload screen to
 * fail fast before attempting a book import or dump.
 */
export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(
      { ok: false, error: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  if (!body.connection) {
    return NextResponse.json(
      { ok: false, error: "Missing 'connection' field" },
      { status: 400 },
    );
  }

  try {
    const serverVersion = await withClient(body.connection, async (client) => {
      const res = await client.query<{ version: string }>("SELECT version()");
      return res.rows[0]?.version ?? "";
    });
    return NextResponse.json({ ok: true, serverVersion });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 502 },
    );
  }
}
