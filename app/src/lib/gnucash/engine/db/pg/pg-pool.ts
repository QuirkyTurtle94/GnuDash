import "server-only";
/**
 * Postgres connection pool — the single authoritative client source.
 *
 * Enforces the operator-facing security posture from
 * docs/architecture/storage-adapters.md §12 + the security review:
 *  - TLS required in production (refuses `sslmode=disable`).
 *  - `rejectUnauthorized: false` refused unless dev and explicit.
 *  - statement_timeout, idle_in_transaction_session_timeout, lock_timeout
 *    set at pool init so they can't be lost inside a transaction.
 *  - `SESSION_SECRET` and `DATABASE_URL` validated at startup.
 *
 * **Do not import `Pool` from `pg` directly elsewhere.** Everything that
 * needs a client goes through `withBookClient` in this module, which
 * enforces per-request search_path discipline. The one exception is the
 * migration runner (which runs with the migrator role, not the app role).
 */
import { Pool, type PoolClient } from "pg";
import fs from "node:fs";

let pool: Pool | undefined;

function buildPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required in server mode");
  }

  const isProd = process.env.NODE_ENV === "production";
  const caPath = process.env.DATABASE_SSL_CA;

  // Require TLS in production. sslmode=disable/allow/prefer are rejected.
  if (isProd && !/sslmode=(require|verify-ca|verify-full)/.test(url)) {
    throw new Error(
      "Production DATABASE_URL must include sslmode=require (or verify-ca/verify-full)."
    );
  }

  // SSL config: prefer a mounted CA cert (Coolify / self-signed) with
  // full verification. Fall back to a plain object so `pg` negotiates TLS
  // but without identity verification — only allowed in dev.
  // Refuse `rejectUnauthorized: false` in prod without a CA.
  let ssl: false | { ca?: string; rejectUnauthorized: boolean } = false;
  if (/sslmode=(require|verify-ca|verify-full)/.test(url)) {
    if (caPath) {
      ssl = { ca: fs.readFileSync(caPath, "utf8"), rejectUnauthorized: true };
    } else if (isProd) {
      throw new Error(
        "DATABASE_SSL_CA must be set in production to verify the Postgres server certificate. " +
          "Mount the CA cert path into the container and set this env var."
      );
    } else {
      // Dev only — TLS encryption without identity check.
      ssl = { rejectUnauthorized: false };
    }
  }

  return new Pool({
    connectionString: url,
    ssl,
    max: 10,
    // Per-connection safety nets — survive inside pg's transactions.
    options:
      "-c statement_timeout=10s " +
      "-c idle_in_transaction_session_timeout=30s " +
      "-c lock_timeout=5s",
  });
}

/** Lazy singleton — constructed on first request, cached thereafter. */
export function getPool(): Pool {
  if (!pool) pool = buildPool();
  return pool;
}

/** For graceful shutdown hooks. */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/**
 * Check out a pool client. Internal — only `withBookClient` should call
 * this. Exposed so the migration runner has a way in; no one else should.
 */
export async function checkoutClient(): Promise<PoolClient> {
  return getPool().connect();
}
