/**
 * SQLite WASM returns int64 column values as JavaScript `BigInt` whenever the
 * underlying value exceeds Number.MAX_SAFE_INTEGER, which causes downstream
 * arithmetic (Number * BigInt, Number + BigInt, …) to throw "can't convert
 * BigInt to number". The whole engine treats integer columns as `number`, so
 * coerce at the adapter boundary instead of audit-trailing every caller.
 *
 * Both the read-only (`wasm-adapter.ts`) and writable (`engine/db/
 * writable-wasm-adapter.ts`) WASM adapters import this helper — keep it as
 * the single source of truth so a future adapter can't silently miss the
 * conversion (see issue #102, which regressed exactly that way).
 */
export function coerceBigInts(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  for (const key in obj) {
    if (typeof obj[key] === "bigint") {
      obj[key] = Number(obj[key]);
    }
  }
  return obj;
}
