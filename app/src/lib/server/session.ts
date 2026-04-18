import "server-only";
/**
 * iron-session configuration and helpers for Phase 1 shared-passphrase auth.
 *
 * Phase 1 has one shared passphrase; a successful /api/auth/login issues a
 * sealed __Host- cookie carrying only `{ authenticated: true, v: 1 }`. The
 * session payload is versioned so Phase 2 can extend it (user_id, memberships)
 * without invalidating existing cookies.
 *
 * Security properties aligned with the adversarial review:
 *   - `__Host-` prefix → Secure, Path=/, no Domain attribute (cookie can't be
 *     set by a sibling subdomain).
 *   - httpOnly: stolen via XSS → JS can't read.
 *   - SameSite=Strict: cross-site requests don't include it.
 *   - Secure: forced in production; in dev over http we relax this flag.
 *
 * The session is stateless in Phase 1 (cookie-sealed via iron-session).
 * Phase 2 switches to a server-side session store with immediate revocation.
 */
import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export interface SessionData {
  authenticated: boolean;
  /** Schema version. Bump when session shape changes incompatibly. */
  v: number;
  /** Unix-second issued-at; used for idle-timeout checks. */
  issued_at?: number;
}

const IDLE_TIMEOUT_SECONDS = 30 * 60; // 30 min
const ABSOLUTE_TTL_SECONDS = 12 * 60 * 60; // 12 h

function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set and at least 32 bytes. Generate with `openssl rand -base64 48`."
    );
  }
  const isProd = process.env.NODE_ENV === "production";
  return {
    password,
    // __Host- prefix requires Secure + Path=/ + no Domain.
    cookieName: isProd ? "__Host-gnudash" : "gnudash_dev_session",
    cookieOptions: {
      httpOnly: true,
      secure: isProd,
      sameSite: "strict",
      path: "/",
      maxAge: ABSOLUTE_TTL_SECONDS,
    },
  };
}

export async function getSession() {
  const jar = await cookies();
  return getIronSession<SessionData>(jar, sessionOptions());
}

/** True if the session is authenticated and not idle-expired. */
export function isActiveSession(s: SessionData): boolean {
  if (!s.authenticated || s.v !== 1) return false;
  if (!s.issued_at) return false;
  const ageSeconds = Math.floor(Date.now() / 1000) - s.issued_at;
  return ageSeconds >= 0 && ageSeconds <= IDLE_TIMEOUT_SECONDS;
}
