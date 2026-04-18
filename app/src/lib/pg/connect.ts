/**
 * Postgres connection helpers for the Server backend API routes (#48).
 *
 * The MVP opens a fresh pg.Client per request rather than sharing a pool.
 * That is intentional — each incoming request already carries its own
 * credentials (the browser sends them in the request body), so pooling by
 * connection identity would require a keying scheme and teardown logic the
 * MVP doesn't need. When we move credentials server-side (future auth/RLS
 * work) we revisit.
 *
 * All API routes funnel through these helpers — do NOT construct a new
 * `pg.Client` directly from a route. That keeps connection lifecycle and
 * search_path handling in one place.
 */

import { Client } from "pg";
import { bookSchemaName } from "../gnucash/db/postgres-schema";

/**
 * Validate a raw Postgres schema name supplied by the user for the
 * existing-GnuCash-DB interop path. Mirrors `sanitizeBookId`'s strictness —
 * the value is interpolated into unquoted SQL (`SET search_path TO ...`) so
 * anything that could break out of an identifier is rejected. Allows the
 * typical GnuCash defaults like `public`.
 */
const SCHEMA_NAME_PATTERN = /^[a-z_][a-z0-9_]{0,62}$/;

export function sanitizeSchemaName(name: string): string {
  if (typeof name !== "string" || !SCHEMA_NAME_PATTERN.test(name)) {
    throw new Error(
      `Invalid schema name ${JSON.stringify(name)}: must match /^[a-z_][a-z0-9_]{0,62}$/`,
    );
  }
  return name;
}

/**
 * Resolve the Postgres schema name for a request that carries either a
 * gnudash-managed `bookId` (mapped through `book_` prefix + sanitisation)
 * or a raw `schema` for the existing-GnuCash-DB read-only interop path.
 * Exactly one of the two must be present — the route's body validator
 * enforces that before calling in.
 */
export function resolveSchemaName(args: {
  bookId?: string;
  schema?: string;
}): string {
  if (args.schema !== undefined) {
    return sanitizeSchemaName(args.schema);
  }
  if (args.bookId !== undefined) {
    return bookSchemaName(args.bookId);
  }
  throw new Error("resolveSchemaName: neither bookId nor schema supplied");
}

/** Connection parameters sent from the browser. */
export interface PgConnection {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** Enable TLS. Required for any non-localhost deployment. */
  ssl?: boolean;
}

/** Extra safety: keep per-request work from stalling a stuck server. */
const DEFAULT_QUERY_TIMEOUT_MS = 30_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

/**
 * Open a pg.Client, run `fn`, and always close it. No search_path is set —
 * use this for connection-level calls like `test-connection` that don't need
 * a book schema.
 */
export async function withClient<T>(
  connection: PgConnection,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database: connection.database,
    ssl: connection.ssl ? { rejectUnauthorized: false } : undefined,
    statement_timeout: DEFAULT_QUERY_TIMEOUT_MS,
    query_timeout: DEFAULT_QUERY_TIMEOUT_MS,
    connectionTimeoutMillis: DEFAULT_CONNECT_TIMEOUT_MS,
  });

  await client.connect();
  try {
    return await fn(client);
  } finally {
    // Swallow end() errors — by the time we reach here the real error has
    // already been thrown (or the caller's result is ready to return).
    await client.end().catch(() => {});
  }
}

/**
 * Open a pg.Client, pin `search_path` to the book's schema, run `fn`, and
 * always close. Every API route that touches book data goes through this.
 *
 * `bookId` is validated via `bookSchemaName` (which calls `sanitizeBookId`)
 * so a malicious `bookId` cannot break out of the unquoted schema-name
 * syntax. Do not bypass this helper for SET search_path elsewhere.
 */
export async function withBookClient<T>(
  connection: PgConnection,
  bookId: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  // Throws on invalid bookId before opening the connection — fail fast.
  const schema = bookSchemaName(bookId);

  return withClient(connection, async (client) => {
    await client.query(`SET search_path TO ${schema}`);
    return fn(client);
  });
}

/**
 * Same shape as `withBookClient` but pins `search_path` to a caller-supplied
 * schema name. Used by the existing-GnuCash-DB read-only path where the
 * user picks the schema directly instead of using gnudash's `book_` prefix.
 */
export async function withSchemaClient<T>(
  connection: PgConnection,
  schema: string,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const sanitized = sanitizeSchemaName(schema);

  return withClient(connection, async (client) => {
    await client.query(`SET search_path TO ${sanitized}`);
    return fn(client);
  });
}
