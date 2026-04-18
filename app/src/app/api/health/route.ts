import { NextResponse } from "next/server";

/**
 * Liveness endpoint — returns 200 ok without touching Postgres so that a
 * DB outage doesn't force the container into a healthcheck-restart loop.
 * Operators inspect DB health via monitoring on the Postgres instance
 * itself, not via this probe.
 */
export function GET() {
  const res = NextResponse.json({ status: "ok" });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
