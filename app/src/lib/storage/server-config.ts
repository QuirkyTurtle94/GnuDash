/**
 * OPFS-persisted Server-backend configuration (#48).
 *
 * Stores the Postgres connection parameters the user filled into the Server
 * tab of the upload screen so subsequent visits to the app can auto-reconnect
 * without prompting. Lives in the origin's private filesystem — never
 * transmitted across the network, never readable by other origins.
 *
 * ## SECURITY
 *
 * **This file stores the Postgres password in plaintext.** OPFS is sandboxed
 * per-origin and isolated from other websites, but it is still accessible to
 * any JavaScript running on this origin (e.g. a malicious browser extension
 * or a future XSS in this app). Deployments where that matters should:
 *
 *  - host this app behind an auth layer that users trust, and
 *  - never reuse the Postgres password anywhere outside this app.
 *
 * Encryption at rest is tracked as out-of-scope in the PR #48 handoff;
 * implementing it would require deriving a key from something that survives
 * a page reload but isn't plaintext-persisted itself, which is non-trivial
 * and not worth gating MVP on.
 */

/** How the active Postgres session is scoped. */
export type ServerConfigMode = "gnudash" | "existing";

/**
 * Shape of the config we persist. Mirrors `PgConnection` (from
 * `lib/pg/connect`) plus enough context to re-open the same book on
 * auto-reconnect:
 *
 * - `mode: "gnudash"` (default) — gnudash owns the schema, named
 *   `book_{bookId}`. Writes round-trip to Postgres via the sync client.
 * - `mode: "existing"` — a real GnuCash desktop database; `schema` names
 *   the target (usually `public`). Opened read-only; the engine's write
 *   paths are gated off by `isWritable=false`.
 */
export interface ServerConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  /** Enable TLS. Required for any non-localhost deployment. */
  ssl?: boolean;
  /** "gnudash" or "existing"; defaults to "gnudash" for pre-v1 saves. */
  mode?: ServerConfigMode;
  /** Book id for gnudash mode (required when mode === "gnudash"). */
  bookId?: string;
  /** Raw schema name for existing mode (required when mode === "existing"). */
  schema?: string;
}

/** Filename inside the OPFS root. */
const FILE_NAME = "gnudash-server.json";

/**
 * Whether OPFS is available in this environment. Old browsers and test
 * harnesses that don't stub navigator.storage return false; every persistence
 * helper below fails gracefully when support is missing so callers don't need
 * to guard.
 */
export function isServerConfigSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "storage" in navigator &&
    typeof navigator.storage?.getDirectory === "function"
  );
}

/**
 * Read and parse the persisted config, or return null if there isn't one
 * (file missing) or the file is unreadable / corrupt. Returning null rather
 * than throwing keeps the auto-reconnect path simple: the caller treats
 * "nothing to restore" and "something went wrong restoring" identically by
 * falling through to the upload screen.
 */
export async function loadServerConfig(): Promise<ServerConfig | null> {
  if (!isServerConfigSupported()) return null;
  try {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle(FILE_NAME);
    const file = await handle.getFile();
    const text = await file.text();
    return parseServerConfig(text);
  } catch {
    // Either the file doesn't exist yet, or reading/parsing failed. Both
    // collapse to "no usable config" — clearing a truly corrupt file is the
    // caller's decision.
    return null;
  }
}

/**
 * Write the config to OPFS, overwriting any existing one. Call this ONLY
 * after a successful connect+dump round-trip — persisting on a failed
 * connect would trap the user in an auto-reconnect loop on next load.
 *
 * Throws if OPFS isn't available or the write fails; callers should show
 * the error to the user but the connection itself is still usable (this is
 * a "remember for next time" convenience, not a data-integrity concern).
 */
export async function saveServerConfig(config: ServerConfig): Promise<void> {
  if (!isServerConfigSupported()) {
    throw new Error("OPFS is not available in this environment.");
  }
  const root = await navigator.storage.getDirectory();
  const handle = await root.getFileHandle(FILE_NAME, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(JSON.stringify(config));
  } finally {
    await writable.close();
  }
}

/**
 * Delete the persisted config. Used by logout / clear-data flows — after
 * calling this, `loadServerConfig()` returns null.
 *
 * Idempotent: missing file is not an error.
 */
export async function clearServerConfig(): Promise<void> {
  if (!isServerConfigSupported()) return;
  try {
    const root = await navigator.storage.getDirectory();
    await root.removeEntry(FILE_NAME);
  } catch {
    // File already gone — fine.
  }
}

/** Fast "is there a config?" probe that doesn't read or parse the file. */
export async function hasServerConfig(): Promise<boolean> {
  if (!isServerConfigSupported()) return false;
  try {
    const root = await navigator.storage.getDirectory();
    await root.getFileHandle(FILE_NAME);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and return a ServerConfig from raw text. Missing/wrong-typed
 * fields cause a null return — we'd rather fall back to the upload screen
 * than feed garbage into an auto-reconnect attempt.
 *
 * `mode` is optional and defaults to "gnudash" when missing so configs
 * written before the existing-DB interop landed still load cleanly.
 */
function parseServerConfig(text: string): ServerConfig | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;
  const cfg = parsed as Partial<ServerConfig>;
  if (
    typeof cfg.host !== "string" ||
    typeof cfg.port !== "number" ||
    typeof cfg.user !== "string" ||
    typeof cfg.password !== "string" ||
    typeof cfg.database !== "string"
  ) {
    return null;
  }

  const mode: ServerConfigMode =
    cfg.mode === "existing" || cfg.mode === "gnudash" ? cfg.mode : "gnudash";

  const base = {
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    ssl: typeof cfg.ssl === "boolean" ? cfg.ssl : undefined,
  };

  if (mode === "existing") {
    if (typeof cfg.schema !== "string") return null;
    return { ...base, mode: "existing", schema: cfg.schema };
  }
  // gnudash mode (including legacy configs without a mode field)
  if (typeof cfg.bookId !== "string") return null;
  return { ...base, mode: "gnudash", bookId: cfg.bookId };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
