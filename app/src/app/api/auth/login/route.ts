import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyAppPassphrase } from "@/lib/server/auth";
import { getSession } from "@/lib/server/session";
import { tryAttempt, clearAttempts, getClientIp } from "@/lib/server/rate-limit";

const LoginSchema = z.strictObject({
  passphrase: z.string().min(1).max(1024),
});

export async function POST(req: Request) {
  // Content-Type strictness: reject anything that isn't JSON, so a form-
  // encoded CSRF payload can't hit this even by accident.
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return NextResponse.json(
      { error: "Content-Type must be application/json" },
      { status: 415 }
    );
  }

  // Origin check: refuse cross-origin POSTs even though SameSite=Strict
  // should already block them. Exact string match against APP_ORIGIN.
  const appOrigin = process.env.APP_ORIGIN;
  const origin = req.headers.get("origin");
  if (appOrigin && origin && origin !== appOrigin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip = await getClientIp();
  const bucket = tryAttempt(`login:${ip}`);
  if (!bucket.allowed) {
    return NextResponse.json(
      { error: "Too many attempts" },
      {
        status: 429,
        headers: bucket.retryAfterSeconds
          ? { "Retry-After": String(bucket.retryAfterSeconds) }
          : undefined,
      }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const ok = await verifyAppPassphrase(parsed.data.passphrase);
  if (!ok) {
    // Same status / shape / timing as success: verify always runs.
    return NextResponse.json({ error: "Invalid passphrase" }, { status: 401 });
  }

  clearAttempts(`login:${ip}`);

  const session = await getSession();
  session.authenticated = true;
  session.v = 1;
  session.issued_at = Math.floor(Date.now() / 1000);
  await session.save();

  const res = NextResponse.json({ ok: true });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
