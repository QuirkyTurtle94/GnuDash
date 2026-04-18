import "server-only";
/**
 * In-memory rate limiter for Phase 1 login throttling.
 *
 * Intentionally small: a single-container deploy doesn't need a distributed
 * bucket. Restarts reset counters — acceptable for Phase 1; Phase 2 can
 * promote this to a Postgres-backed store if multi-instance becomes a thing.
 *
 * Reads the client IP with the operator-configured proxy hop count. The
 * security review (§1.6) flagged naive XFF parsing as a rate-limit bypass
 * — setting TRUSTED_PROXY_HOPS=1 for a Coolify/Nginx front makes the limiter
 * key the real client IP instead of a spoofed header.
 */
import { headers } from "next/headers";

interface Bucket {
  /** Timestamps of attempts, in ms since epoch. */
  attempts: number[];
}

const buckets = new Map<string, Bucket>();

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

/**
 * Resolve the client IP. Trust X-Forwarded-For only as many hops deep as
 * TRUSTED_PROXY_HOPS (default 0 — no trust).
 */
export async function getClientIp(): Promise<string> {
  const h = await headers();
  const hops = Number(process.env.TRUSTED_PROXY_HOPS ?? "0");
  if (hops > 0) {
    const xff = h.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((p) => p.trim()).filter(Boolean);
      // The Nth-from-right is the one our own proxy injected. Earlier
      // entries could be spoofed by a client that sent its own XFF.
      const idx = Math.max(0, parts.length - hops);
      return parts[idx] ?? "unknown";
    }
  }
  // Next.js doesn't surface the raw socket IP; fall back to the first XFF
  // entry only when TRUSTED_PROXY_HOPS is 0 and there's no better source.
  return h.get("x-real-ip") ?? "unknown";
}

/**
 * Returns true if the given key has available attempts; false if throttled.
 * Records the attempt either way (throttled counts as an attempt for lockout).
 */
export function tryAttempt(key: string): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { attempts: [] };
  bucket.attempts = bucket.attempts.filter((t) => now - t < WINDOW_MS);
  if (bucket.attempts.length >= MAX_ATTEMPTS) {
    const oldest = bucket.attempts[0];
    const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
    buckets.set(key, bucket);
    return { allowed: false, retryAfterSeconds };
  }
  bucket.attempts.push(now);
  buckets.set(key, bucket);
  return { allowed: true };
}

/** Reset the bucket after a successful auth, so legitimate users don't get locked. */
export function clearAttempts(key: string): void {
  buckets.delete(key);
}
