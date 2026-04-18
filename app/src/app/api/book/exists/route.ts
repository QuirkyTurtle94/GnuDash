import { NextResponse } from "next/server";
import { getSession, isActiveSession } from "@/lib/server/session";
import { withBookClient } from "@/lib/gnucash/engine/db/pg/with-book-client";
import { PHASE_1_SCHEMA } from "@/lib/gnucash/engine/db/pg/schema-name";

/**
 * Cheap "is there a book in this schema yet?" probe.
 *
 * The UI uses this after login to decide between "restore existing book"
 * and "show upload form". Without it, the client would have to call a
 * real domain function, which blows up when the schema is empty (no root
 * account → buildParseContext throws) — correct behaviour, but the 500
 * is noise in the server log and a bad signal to condition UI flow on.
 *
 * We read from `books` (GnuCash's internal per-file metadata table): any
 * valid imported book has exactly one row, empty schemas have zero.
 */
export async function GET() {
  const session = await getSession();
  if (!isActiveSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const exists = await withBookClient(PHASE_1_SCHEMA, async (db) => {
      const row = (await db
        .prepare(`SELECT count(*)::int AS c FROM books`)
        .get()) as { c: number } | undefined;
      return (row?.c ?? 0) > 0;
    });
    const res = NextResponse.json({ exists });
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err) {
    // Propagate a 500 only for actual DB connectivity failures.
    const message = err instanceof Error ? err.message : "Probe failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
