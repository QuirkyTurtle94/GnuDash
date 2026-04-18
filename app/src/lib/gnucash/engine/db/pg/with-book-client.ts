import "server-only";
/**
 * withBookClient — the only sanctioned way to run queries against a book's
 * Postgres schema.
 *
 * Why this wrapper is load-bearing:
 *   - `search_path` is a session setting. If we forgot to set it on a
 *     pooled connection, queries would resolve against whatever the last
 *     tenant left it as. The security review flags this explicitly
 *     (§1.4 TOCTOU). Every request goes through this helper; no one else
 *     calls `checkoutClient` directly.
 *   - `set_config($1, $2, false)` parameterises the value. We still validate
 *     the schema name with a strict regex (see `schema-name.ts`) so a
 *     regression can't slip an injection string through. We use session-
 *     level (is_local=false) rather than transaction-local: domain reads
 *     aren't always wrapped in BEGIN/COMMIT, and Postgres silently ignores
 *     a transaction-local set when called outside a transaction block.
 *   - `RESET ALL` fires in `finally`, including on error paths. That's
 *     what prevents session-level state from bleeding between tenants —
 *     once the client returns to the pool, search_path is back to default.
 *   - On any query error during the callback we destroy the client (pg.Pool
 *     will create a fresh one on the next checkout) — belt-and-braces in
 *     case RESET ALL itself couldn't run (e.g. the connection is wedged).
 */
import type { WritableDbAdapter } from "../writable-adapter";
import { checkoutClient } from "./pg-pool";
import { assertValidSchemaName } from "./schema-name";
import { createWritablePgAdapter } from "./writable-pg-adapter";

/**
 * Run `fn` with a `WritableDbAdapter` scoped to the given book schema.
 * Handles client checkout, search_path, and cleanup. The adapter passed to
 * `fn` must not escape the callback — the underlying client returns to the
 * pool when this function returns.
 */
export async function withBookClient<T>(
  schemaName: string,
  fn: (db: WritableDbAdapter) => Promise<T>
): Promise<T> {
  assertValidSchemaName(schemaName);
  const client = await checkoutClient();
  let errored = false;
  try {
    await client.query("SELECT set_config($1, $2, false)", [
      "search_path",
      `${schemaName}, public`,
    ]);
    const adapter = createWritablePgAdapter(client);
    return await fn(adapter);
  } catch (err) {
    errored = true;
    throw err;
  } finally {
    try {
      await client.query("RESET ALL");
    } catch {
      // If RESET fails the client is in an unknown state; destroy it
      // rather than return it to the pool.
      errored = true;
    }
    if (errored) {
      // Destroy the client instead of releasing. pg.Pool's `release(true)`
      // signals "this client is damaged, discard it".
      client.release(new Error("withBookClient: destroying client after error"));
    } else {
      client.release();
    }
  }
}
