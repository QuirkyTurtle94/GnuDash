# Storage Architecture — Local + Server modes, GnuCash-compatible Postgres

**Status:** v2 draft — supersedes the v1 plan; incorporates adversarial security review.
**Branch:** `feat/storage-adapters`
**Target issue:** #48 (pluggable storage backends). Related: #49 (encryption), #52 (profiles), #70 (auto-load).

---

## 1. What this design delivers

Two deployment modes from a single codebase:

| | **Local mode** | **Server mode** |
|---|---|---|
| Build | `BUILD_MODE=local npm run build` → static export | `BUILD_MODE=server npm run build` → Next.js server |
| Hosts | Cloudflare Pages, nginx, GitHub Pages (today's story) | Docker, Coolify |
| Data | Browser OPFS | Postgres (per-book schema) |
| Devices | One browser profile | Any device that can reach the server |
| Users | Implicit single user | Phase 1: shared passphrase. Phase 2: per-user accounts. |
| Works offline | Yes | Requires server reachability |

**Core design commitment:** data stored in Postgres uses **literally the same table structure GnuCash's own SQL backend uses** — identical names, columns, types (where Postgres has a sensible equivalent). This means:

- A `.gnucash` file round-trips through Postgres losslessly (import → use → export = same file).
- GnuCash's source code, documentation, and mailing list archives are directly applicable references. When we hit a hard modeling question, the answer is "what does GnuCash do?" and we match it.
- In principle, GnuCash desktop's own `postgres://` backend could point at a single book's schema and work (we don't commit to supporting this, but it's a property that falls out of doing the schema correctly).

---

## 2. Phased scope

### Phase 1 — self-host, single user, multi-device
Drop a Docker container on a server + provision Postgres. Upload a `.gnucash` file. Access from laptop, phone, tablet. One shared passphrase protects the app. No user accounts, no sharing, no RLS.

**Done when:** an operator can `docker run`, visit the URL, enter a passphrase, upload a `.gnucash` file, and use every feature the OPFS version has — from any device.

### Phase 2 — multi-tenant hosted
Add user accounts, per-book ownership, sharing, and the hardening the security review demands. Same schema-per-book layout; now schemas are named per-book and access is gated by membership rows.

**Done when:** operator offers the service to others; each user has their own account; books are isolated and cannot leak between users even on operator misconfiguration.

Phase 2 is **additive**. Phase 1 data upgrades to Phase 2 via a schema rename and a handful of `INSERT`s into new app-level tables. No table-level schema changes required on GnuCash tables.

---

## 3. Why schema-per-book

Postgres allows multiple schemas inside one database. Each schema has its own namespace for tables. A query against `accounts` resolves via `search_path` to whichever schema you've selected.

```
Database: gnudash
│
├── Schema: public
│   └── App-level tables (Phase 1: almost empty. Phase 2: users, book_catalog, sessions, audit_log, ...)
│
└── Schema: gnudash_book          (Phase 1 — fixed name, single book)
    ├── accounts                  ┐
    ├── transactions              │
    ├── splits                    │
    ├── commodities               ├── GnuCash's tables, 1:1.
    ├── prices                    │   No book_id. No custom columns.
    ├── slots                     │   Names and types match GnuCash.
    ├── lots                      │
    ├── schedxactions             │
    ├── recurrences               │
    ├── budgets                   │
    ├── budget_amounts            │
    ├── books   ← GnuCash's internal 'books' table (per-file metadata)
    └── versions                  ┘
```

Phase 2 becomes:

```
Database: gnudash
│
├── Schema: public
│   ├── users
│   ├── user_credentials
│   ├── book_catalog            (app-level registry of books; NOT GnuCash's books table)
│   ├── book_memberships        (who can access what)
│   ├── sessions
│   └── audit_log
│
├── Schema: book_a1b2c3d4...    (one per GnuCash file)
│   └── ... identical GnuCash tables ...
│
└── Schema: book_e5f6g7h8...
    └── ... identical GnuCash tables ...
```

### Why this beats a `book_id` column everywhere

| Approach | 1:1 with GnuCash? | Phase 2 migration cost | Isolation mechanism |
|---|---|---|---|
| Add `book_id` column to every table | No — columns differ from GnuCash | Zero | RLS on `book_id` |
| **Schema per book** | **Yes, literally** | **Rename schema + insert app rows** | **`search_path` + schema GRANTs** |
| Shared tables, multi-book via app filter | No | Zero | Application-only (fragile) |

Schema-per-book is the only approach that keeps the 1:1 commitment while still admitting multi-tenancy.

### The isolation mechanism

For any request scoped to a book, the server:

1. Validates the book ID against a strict regex (Phase 1: single fixed schema name; Phase 2: `^book_[0-9a-f]{8}_[0-9a-f]{4}_...$`).
2. Checks the user has membership (Phase 2 only).
3. Checks out a Postgres client from the pool.
4. Runs `SELECT set_config('search_path', $1, true)` with the validated schema name — **parameterised, never string-concatenated.** The `true` makes it session-local.
5. Runs domain SQL. Bare table references (`SELECT * FROM accounts`) resolve to the correct book's schema.
6. In `finally`, runs `RESET search_path`, returns the client to the pool.

Defense in depth: in Phase 2, the app's Postgres role has no default privileges on any book schema. `GRANT USAGE ON SCHEMA book_<id>` happens at book creation. If authorization code misfires, Postgres still refuses the query.

---

## 4. Postgres schema (the 1:1 commitment)

The existing `app/src/lib/gnucash/xml/schema.ts` is already GnuCash's table structure (in SQLite dialect). The Postgres port must match table names and column names **exactly**. Types adapt per Postgres conventions, following GnuCash's own `gnc-backend-dbi` type mapping:

| GnuCash type | SQLite | Postgres |
|---|---|---|
| `guid` (32-char string) | `TEXT` | `VARCHAR(32)` |
| counted/denom integers | `INTEGER` | `BIGINT` |
| small enums | `INTEGER` | `INTEGER` |
| free text | `TEXT` | `TEXT` |
| booleans (stored as 0/1) | `INTEGER` | `INTEGER` — keep GnuCash convention, don't introduce `BOOLEAN` |
| timestamps (`YYYYMMDDhhmmss`) | `TEXT` | `VARCHAR(19)` |
| `gdate` (`YYYYMMDD`) | `TEXT` | `VARCHAR(8)` |

**Invariants we commit to:**

- Table names identical to GnuCash.
- Column names identical to GnuCash.
- GUIDs stored as 32-char strings (not Postgres `UUID` type — GnuCash format is hex without dashes).
- Numeric values stored as `(num, denom)` pairs — *not* converted to `NUMERIC`. GnuCash's accounting correctness depends on exact rational arithmetic in `GncNumeric`, which the codebase already implements; converting at the storage layer would break equality.
- Dates stored as the GnuCash string formats, not `DATE` / `TIMESTAMP`. Letting the app do string parsing matches GnuCash and avoids timezone ambiguity.
- No added columns. No added indexes beyond what GnuCash ships.

**Schema version table:**

GnuCash's SQL backend has a `versions` table. We add it (the existing project `schema.ts` doesn't have this yet — gap to close). This lets us declare which GnuCash schema version we're at and refuse to import files from future versions.

**Engine-auxiliary tables (`lots`, `slots`):**

Already defined by the engine (`ENSURE_TABLES_SQL` in `writable-wasm-adapter.ts`). These are part of GnuCash's own schema. Kept as-is.

**Missing tables to eventually add for full GnuCash parity:**

The current schema omits tables the dashboard doesn't use yet: `billterms`, `customers`, `vendors`, `employees`, `invoices`, `entries`, `jobs`, `orders`, `taxtables`, `taxtable_entries`. These aren't needed for Phase 1 (the dashboard doesn't read them), but round-trip losslessness requires preserving them on import/export. **Pass-through strategy:** the importer copies these tables as opaque rows if present; the exporter writes them back. No domain logic runs against them. Add them to the schema mirror, make them nullable/empty-friendly, leave the dashboard blind to their contents.

---

## 5. Application architecture — BookClient abstraction

The single seam both modes pivot on:

```ts
// app/src/lib/client/book-client.ts
export interface BookClient {
  // Reads — one method per DomainFunction
  getFullDashboardData(): Promise<DashboardData>
  getLedgerTransactions(args: LedgerArgs): Promise<LedgerResult>
  // ... (every current DomainFunction)

  // Writes — one method per MutationAction
  createTransaction(payload: CreateTransactionPayload): Promise<void>
  // ... (every current MutationAction)

  // File I/O
  importGnucashFile(buffer: ArrayBuffer): Promise<void>
  exportGnucashFile(): Promise<ArrayBuffer>

  // Lifecycle
  setCurrency(currencyGuid: string): Promise<void>
  close(): Promise<void>
}
```

Two implementations:

### `OpfsBookClient`
Wraps the existing Web Worker + SQLite WASM + OPFS plumbing. Extracted from `dashboard-context.tsx`. **No behaviour change for existing users.**

### `ApiBookClient`
`fetch('/api/books/[id]/query' | '/mutation' | '/import' | '/export')`. Server-mode only. Serializes the same payload types the worker uses.

### The React layer consumes only `BookClient`
`dashboard-context.tsx` holds a `BookClient` instance, never a worker or a fetch helper. Switching backends is a factory call:

```ts
function createBookClient(book: BookConfig): BookClient {
  if (book.backend === 'opfs') return new OpfsBookClient(book)
  if (SERVER_MODE) return new ApiBookClient(book)
  throw new Error('Remote books require server build')
}
```

`SERVER_MODE` is `process.env.NEXT_PUBLIC_SERVER_MODE` — compile-time constant, tree-shaken out of local builds. The `ApiBookClient` import is dynamic so `pg`-adjacent types don't leak into the client bundle when building for local.

### Server-side: the domain functions run unchanged

The same `app/src/lib/gnucash/domain/*` functions that run in the Web Worker also run in the Next.js API routes, against a `WritableDbAdapter` backed by Postgres (`createWritablePgAdapter`). One domain codebase, two execution environments.

```
Local mode:
  UI → OpfsBookClient → postMessage → Worker → WritableWasmAdapter → SQLite(OPFS)

Server mode:
  UI → ApiBookClient → fetch → /api/.../query → withBookClient → WritablePgAdapter → Postgres
  (app/src/lib/gnucash/domain/* — shared, unchanged)
```

---

## 6. The Postgres adapter (`WritablePgAdapter`)

Implements `WritableDbAdapter` against `pg.PoolClient`. The domain layer cannot tell the difference.

### 6.1 Parameter rewrite (the tokenizer)

Domain SQL uses SQLite-style `?` placeholders. Postgres uses `$1, $2, ...`. The adapter rewrites at `prepare()` time.

**Critical:** a naive regex replace is unsafe (breaks on `?` inside string literals, comments, dollar-quoted blocks). Security review flagged this as the load-bearing design risk.

Required implementation:

- A proper tokenizer that recognises: single-quoted strings (with `''` escapes), dollar-quoted strings (`$tag$...$tag$` with balanced tags), double-quoted identifiers, line comments (`-- ... \n`), and block comments (`/* ... */` with nesting).
- Only `?` outside any of those contexts gets rewritten.
- Output is stable: same SQL → same rewrite.

**Testing:**
- A dedicated vitest suite with fixtures covering every corner case the reviewer listed.
- **Golden test**: run every domain function against both SQLite and Postgres in CI, asserting identical results on identical fixtures. This catches dialect regressions before they land.

### 6.2 Function compatibility

GnuCash-era domain SQL uses `julianday()` and `strftime()` (SQLite). Postgres doesn't have these.

**Strategy: UDFs in the `public` schema.** Create Postgres functions named `julianday` and `strftime` with compatible signatures. Mark `IMMUTABLE STRICT`. Because `public` is always in `search_path`, domain SQL keeps working unchanged.

```sql
CREATE OR REPLACE FUNCTION public.julianday(ts TEXT) RETURNS DOUBLE PRECISION
  LANGUAGE sql IMMUTABLE STRICT
  AS $$ SELECT extract(epoch from ts::timestamp) / 86400.0 + 2440587.5 $$;

CREATE OR REPLACE FUNCTION public.strftime(fmt TEXT, ts TEXT) RETURNS TEXT
  LANGUAGE sql IMMUTABLE STRICT
  AS $$
    SELECT CASE fmt
      WHEN '%Y-%m-%d' THEN to_char(ts::timestamp, 'YYYY-MM-DD')
      WHEN '%Y-%m'    THEN to_char(ts::timestamp, 'YYYY-MM')
      WHEN '%Y'       THEN to_char(ts::timestamp, 'YYYY')
      -- expand as needed; fail loud on unknown formats during dev
    END
  $$;
```

CI grep enforces: no SQLite-ism appears in domain SQL without a Postgres equivalent defined.

### 6.3 Transactions and `search_path`

```ts
export async function withBookClient<T>(
  bookSchema: string,
  fn: (adapter: WritableDbAdapter) => Promise<T>
): Promise<T> {
  if (!isValidSchemaName(bookSchema)) throw new InvalidBookError()
  const client = await pool.connect()
  try {
    await client.query('SELECT set_config($1, $2, true)', ['search_path', `${bookSchema}, public`])
    const adapter = createWritablePgAdapter(client)
    return await adapter.transaction(() => fn(adapter))
  } finally {
    try { await client.query('RESET ALL') } catch { /* evict on error */ }
    client.release()
  }
}
```

**Hard rules:**
- `pool.query` is not exported outside `pg-pool.ts`. Only `withBookClient` is.
- A lint rule (`no-restricted-imports`) enforces this.
- `RESET ALL` always fires in `finally`.
- On connection errors, the client is destroyed, not returned to the pool (prevents leaking state between tenants).

---

## 7. Import and export flows

### Import: `.gnucash` → Postgres

```
1. POST /api/import (Phase 1) or /api/books/[id]/import (Phase 2)
2. Authenticate (Phase 1: passphrase gate; Phase 2: session + membership check)
3. Parse uploaded file:
   a. Detect format: XML-gzip, XML-plain, or SQLite3 binary.
   b. For XML, run through existing XML parser into an in-memory SQLite DB.
   c. For SQLite, open directly in-memory via better-sqlite3.
4. Validate: required GnuCash tables present, versions table compatible.
5. Target schema:
   - Phase 1: `gnudash_book` (fixed).
   - Phase 2: `book_<new_uuid>` created for the user.
6. Refuse if target schema is non-empty, unless ?overwrite=true with confirmation.
7. In a single Postgres transaction:
   a. For each GnuCash table (including pass-through tables we don't use):
      SELECT all rows from SQLite → COPY FROM STDIN into Postgres (fast path)
      or batched INSERTs (fallback).
   b. No transformation. Row-for-row identity.
8. COMMIT.
```

Importer is stream-ish: opens SQLite from the uploaded buffer, iterates row-by-row. Large books (100k+ transactions) work without buffering everything in RAM.

### Export: Postgres → `.gnucash`

```
1. GET /api/export (Phase 1) or /api/books/[id]/export (Phase 2)
2. Authenticate. Phase 2: passphrase re-entry required (security review P1 finding).
3. Create an in-memory SQLite DB. Apply GnuCash SQLite DDL.
4. In a Postgres transaction:
   a. SET search_path to the source schema.
   b. For each GnuCash table: SELECT * → INSERT into the SQLite DB.
5. `db.serialize()` → ArrayBuffer of bytes that constitute a valid .gnucash file.
6. Stream to client as application/x-gnucash.
7. Log export to audit_log (Phase 2) with byte count and sha256.
```

The exported file is openable by desktop GnuCash. That's the acceptance test — round-trip a real book through import/export and diff-compare with `gnucash-cli` or a simple table-by-table check.

---

## 8. Authentication

### Phase 1: single shared passphrase

- Operator sets `APP_PASSPHRASE` env var. Stored hashed in `public.app_config` on first boot (hash in the DB means the operator can't accidentally change it mid-flight; env var becomes the bootstrap-only hint).
- Login form posts the passphrase to `/api/auth/login`.
- Argon2id verify. On success, issue a sealed iron-session cookie.
- Cookie: `__Host-gnudash=<sealed>; HttpOnly; Secure; SameSite=Strict; Path=/`.
- Session payload: `{ authenticated: true, issued_at }`. That's it — no user ID in Phase 1.
- Idle timeout 30m; absolute 12h.
- Rate limit: 5 attempts / 15min / IP, with `TRUSTED_PROXY_HOPS` env for reverse-proxy deployments.
- **Timing defense:** always compute an Argon2 verify, even on empty input (against a fixed decoy hash), so login duration doesn't leak anything.

### Phase 2: per-user accounts (summarised; full design in Phase 2 appendix)

- `public.users`, `public.user_credentials`, `public.book_memberships`, `public.sessions`, `public.audit_log`.
- Argon2id per-user passphrases.
- Sessions stored server-side (row in `sessions`, opaque ID inside sealed cookie). Logout invalidates immediately.
- `book_memberships.role ∈ ('owner', 'editor', 'viewer')`.
- Export gated on `role IN ('owner', 'editor')` + passphrase re-entry.
- All mutations logged to `audit_log` with HMAC-hashed IPs.
- `ALLOW_SIGNUP` env; disabled once the operator has their own account.

---

## 9. Build-mode split

### `next.config.ts`

```ts
const mode = process.env.BUILD_MODE ?? 'local'
const serverMode = mode === 'server'

export default {
  output: serverMode ? undefined : 'export',
  env: { NEXT_PUBLIC_SERVER_MODE: serverMode ? '1' : '' },
  // Local build also needs to exclude app/api/* from the build graph.
  // Approach: a pre-build step moves app/api → .api-stash when mode=local,
  // and restores it after build. Implemented in scripts/pre-build.mjs.
}
```

API routes physically exist in `app/api/`. In local builds they're moved out of the Next.js route tree before `next build` and restored after. Ugly but bulletproof — Next.js doesn't support conditional route tree inclusion natively.

### Dockerfiles

- `Dockerfile.local` — unchanged from today. Multi-stage → nginx serving `/app/out`.
- `Dockerfile.server` — Node runtime, non-root UID, read-only root FS, distroless target.
- Published as `ghcr.io/.../gnudash:<version>-local` and `:<version>-server`.

### CI

- Build both modes on every PR.
- Run full test suite against both OPFS (WASM) and Postgres adapters via the dialect test harness.
- Lint check: no import of `pg`, `better-sqlite3`, or `fs` in any file reachable from the client bundle.

---

## 10. Deployment shapes

### Shape L — Local (static)
`BUILD_MODE=local` → `docker run` nginx image, or deploy to Cloudflare Pages / GitHub Pages. Unchanged from today. No Postgres.

### Shape S1 — Server, single-container + external Postgres

```
┌─────────────────────────┐          ┌──────────────┐
│ gnudash:<v>-server      │──────────▶ Postgres     │
│  Next.js on :3000       │  TLS     │  (operator-  │
│  USER 1000              │          │  managed)    │
│  --read-only            │          └──────────────┘
└─────────────────────────┘
```

```bash
docker run -d \
  --name gnudash \
  --user 1000:1000 \
  --read-only --tmpfs /tmp --tmpfs /app/.next/cache \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  -p 3000:3000 \
  -e DATABASE_URL='postgres://gnudash_app:...@db:5432/gnudash?sslmode=verify-full' \
  -e DATABASE_SSL_CA=/etc/ssl/pg-ca.crt \
  -v /path/to/pg-ca.crt:/etc/ssl/pg-ca.crt:ro \
  -e SESSION_SECRET='...' \
  -e APP_PASSPHRASE_HASH='$argon2id$...' \
  -e APP_ORIGIN='https://gnudash.example.com' \
  -e TRUSTED_PROXY_HOPS=1 \
  ghcr.io/.../gnudash:<v>-server
```

### Shape S2 — Coolify + managed Postgres

- Coolify provisions Postgres, app container, TLS termination.
- Operator extracts Coolify's Postgres CA, mounts into app container.
- Same image as S1.
- Pre-deploy hook runs `gnudash migrate`.

---

## 11. Security posture (summary of review findings)

Full review: `docs/architecture/storage-adapters-security-review.md` (to be committed from the agent output).

### Phase 1 P0s (must-fix before operators run this)

1. Tokenizer-based `?`→`$N` rewrite. Regex approach is insufficient. Fuzz test suite required.
2. `set_config('search_path', $1, true)` for book isolation — never string-interpolate. Reject any `SET`/`RESET` code path that bypasses `withBookClient`.
3. `withBookClient` wrapper mandatory. Direct `pool.query` forbidden by lint rule.
4. Argon2 decoy verify on the passphrase gate (timing equalisation).
5. `TRUSTED_PROXY_HOPS` + `APP_ORIGIN` validation. No naive XFF trust.
6. Coolify CA cert documented. Refuse `rejectUnauthorized: false` in production.
7. CSP without `unsafe-eval` in server mode. (Local mode still needs it for WASM.)
8. Integration test asserting: a request never returns rows from an unintended schema.
9. `__Host-` cookie prefix; strict same-origin check via `APP_ORIGIN`.

### Phase 2 P1s (before offering to customers)

- Server-side session store with revocation.
- Export passphrase re-entry + audit log + rate-limit + email notification.
- `gnudash migrate` as a separate subcommand (not auto-run on app start).
- `audit_log.metadata` discipline: IDs only, no free-text; 4KB cap.
- `ignore-scripts=true` on install; exact version pinning; `cosign` image signing.
- Trusted Types policy; CSP nonces.
- Backup encryption guidance in operator docs.
- Book creation rate limit.

### What the review affirmed (don't re-litigate)

- Semantic API boundary (not SQL-RPC) is the right call.
- Schema isolation + non-superuser app role is good defense-in-depth.
- Argon2id, HMAC-hashed IPs in audit, CITEXT emails — all good.
- Non-root read-only container — good.
- Parallel CI against both adapters — highest-value test engineering decision.

---

## 12. Migration from Phase 1 to Phase 2

When the operator wants to host multiple users:

1. Deploy Phase 2 image against the same Postgres.
2. Run `gnudash migrate` — creates `public.users`, `public.user_credentials`, `public.book_catalog`, `public.book_memberships`, `public.sessions`, `public.audit_log`.
3. Command-line prompt: create the first admin user.
4. `ALTER SCHEMA gnudash_book RENAME TO book_<new_uuid>` (uuid generated).
5. `INSERT` into `public.book_catalog`: `(book_<uuid>, 'My Book', <admin_user_id>)`.
6. `INSERT` into `public.book_memberships`: `(<admin_user_id>, book_<uuid>, 'owner')`.
7. `GRANT USAGE ON SCHEMA book_<uuid> TO gnudash_app`.
8. Done. The GnuCash tables themselves don't change. Not a single row is rewritten.

---

## 13. Build order

Each step is independently mergeable and reviewable.

1. **Extract `BookClient` interface; implement `OpfsBookClient`.** No behaviour change. Existing OPFS users unaffected.
2. **`BUILD_MODE` plumbing.** Local build stays static; server build enables API route tree. Pre-build stash script.
3. **Postgres schema DDL** (`app/db/migrations/0001_gnucash_schema.sql`). Mirrors `xml/schema.ts`. Add `versions` table and pass-through tables (billterms, etc.).
4. **Dialect tokenizer + fuzz suite.** Required before any domain query runs against Postgres.
5. **UDF migration** (`0002_sqlite_compat_functions.sql`). `julianday`, `strftime`.
6. **`WritablePgAdapter` + `withBookClient`.** Lint rule blocking direct `pool.query`.
7. **Parallel CI harness.** Run every domain function against both SQLite and Postgres on shared fixtures.
8. **Import endpoint** (`POST /api/import`). Phase 1 flavour — writes to fixed `gnudash_book` schema.
9. **Export endpoint** (`GET /api/export`).
10. **`ApiBookClient`.** UI can now talk to either backend.
11. **Passphrase gate + `iron-session`.**
12. **`Dockerfile.server` + operator documentation** (`docs/deployment-server.md`): env vars, Postgres role setup, Coolify walkthrough, backup guidance.

At step 12, Phase 1 ships.

Phase 2 is a separate roadmap: users, book_catalog, book_memberships, RLS-like isolation via per-schema grants, Argon2id per user, audit log. Detailed in a follow-up doc when Phase 1 is stable.

---

## 14. Open questions for final sign-off

1. **`versions` table.** Which GnuCash schema version do we declare? Probably `2.6.x` / `3.0`. Decide before writing the import validator.
2. **Pass-through tables.** Commit to preserving `billterms`, `customers`, `vendors`, `employees`, `invoices`, `entries`, `jobs`, `orders`, `taxtables`? Or drop them on import and warn? Recommend: preserve, even if opaque. Round-trip is the contract.
3. **`DATABASE_URL` for migrations vs runtime.** Propose: two URLs (`DATABASE_URL_MIGRATOR` with DDL rights, `DATABASE_URL` with row-level rights only). Migrator URL only needed during `gnudash migrate` invocations.
4. **What to do if Postgres goes away mid-session?** 503 + banner; user's local edits (if any unsent) buffered in localStorage? Probably overkill for Phase 1 — accept as a known gap.
5. **Testing round-trip against real GnuCash.** Commit to a CI job that installs `gnucash-cli`, imports our export, compares account tree. Nice-to-have; adds 15 min to CI.
