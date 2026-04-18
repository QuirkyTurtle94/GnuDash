import { NextResponse } from "next/server";
import { getSession, isActiveSession } from "@/lib/server/session";

/**
 * Session probe — returns 200 if the caller has a live session, 401 otherwise.
 * The UI uses this on mount to decide between showing the login form and
 * proceeding to the book-restore flow. No secrets in the response body;
 * presence/absence of the cookie is the only bit surfaced.
 */
export async function GET() {
  const session = await getSession();
  if (!isActiveSession(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
