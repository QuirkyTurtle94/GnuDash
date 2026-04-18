import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Next.js middleware — protects /api/* endpoints by requiring an active
 * session, with a whitelist for the auth endpoints themselves.
 *
 * Session cookies are sealed (iron-session). We can't verify the cookie's
 * payload from middleware's edge runtime — iron-session's decryption uses
 * Node APIs that aren't available there. So middleware just checks for the
 * presence of the session cookie; route handlers do the authoritative
 * authenticated-check via getSession().
 *
 * This is intentional defence-in-depth, not primary authz. The real gate
 * is in each route handler.
 */
export function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Open endpoints — auth itself + health.
  if (
    path === "/api/auth/login" ||
    path === "/api/auth/logout" ||
    path === "/api/health"
  ) {
    return NextResponse.next();
  }

  // Everything else under /api requires a session cookie to even reach
  // the route handler. Route handlers run the authoritative check.
  const isProd = process.env.NODE_ENV === "production";
  const cookieName = isProd ? "__Host-gnudash" : "gnudash_dev_session";
  const sessionCookie = req.cookies.get(cookieName);
  if (!sessionCookie) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
