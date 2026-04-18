# Adversarial Security Review — Storage Adapter Architecture

**Context:** Review commissioned for `docs/architecture/storage-adapters.md`. Reviewer was asked to "break this plan" — produce an offensive-security analysis of the proposed Postgres adapter, auth model, and container hardening. Findings below feed into the final Phase 1 build order.

**Scope at the time of review:** v1 of the plan (RLS on `book_id`). The design has since shifted to **schema-per-book** with `search_path` isolation. Many findings transfer directly (the GUC/injection/TOCTOU concerns apply to `search_path` as they did to `app.current_book_id`). Where a finding is schema-specific, the mitigation is adapted in the current plan.

---

## 0. Load-bearing concern: the dialect shim is the single most dangerous design decision

The plan commits to running **SQLite-authored domain SQL verbatim against Postgres**, with a runtime `prepare()` that rewrites `?` → `$N`, plus Postgres UDFs named `julianday`/`strftime` to cover missing functions. Everything else in the plan — RLS, whitelisted dispatch, Argon2id, distroless — is secondary to the claim that this shim is safe. It is *correct in spirit* (parameters are positional; rewriting `?` → `$N` outside string literals is safe in principle) but **the correctness of that rewrite depends entirely on a parser-aware tokenizer that the plan does not describe**. A naive regex (`sql.replace(/\?/g, ...)`) will rewrite `?`-characters inside SQL string literals, comments, and identifier quoting — silently breaking queries, or worse, producing queries where an attacker-controlled string literal can influence which `$N` binds to what.

Recommendation before anything else ships: write the rewrite as a proper tokenizer that understands `'…'`, `E'…'`, `"…"`, `$tag$…$tag$` dollar-quoting, `--` line comments, and `/* … */` block comments (with nesting, because Postgres nests them). Unit-test it with the pgsql-parser corpus. This is a hundred lines of code and a weekend; it is also the single thing that, done wrong, voids the architecture.

---

## 1. Attack narratives

### 1.1 Whitelist dispatch smuggling via payload type confusion

**Premise.** `/api/books/[id]/mutation` accepts `{ action: MutationAction, payload: unknown }` and dispatches from a whitelist map. The plan says "Zod-validate every payload." In practice, when writers extend `MutationAction` there's a lag between adding the action name, wiring it to a handler, and adding a Zod schema. During that window the handler receives `unknown`. Submit `{"action":"createTransaction","payload":{"__proto__":{"isAdmin":true},"splits":[…]}}`. If any route handler uses `Object.assign({}, body)` or spreads the payload into audit-log metadata, prototype-polluted properties leak into downstream code that uses `for…in` or unchecked property access.

**Hardening.** In `app/src/lib/server/dispatch.ts`, make the dispatch map *the schema registry*: `{ createTransaction: { schema: z.object(...), handler: ... } }`. Reject the request if there is no registered schema — you cannot add an action without also registering validation. Use `z.strictObject` everywhere. Ban `Object.assign({}, body)` and spreads of request bodies. Add a lint rule that flags `JSON.parse` of request bodies outside `server/validate.ts`.

**Priority: P0.**

### 1.2 `?`-in-string-literal dialect rewrite bug

**Premise.** See §0. The real risk: the `writable-pg-adapter.ts` plan notes `exec(sql)` delegates to `pool.query(sql)` — **but no input reaches `exec()` today** except engine-internal DDL. The risk is future regression, not present.

**Hardening.** Replace any regex-based rewrite with a tokenizer. Add a vitest suite whose fixtures include every literal `?`, `--`, `/* */`, dollar-quoted block, `E'\\'?'`, and nested comment pattern you can think of. Run the suite against Postgres via `EXPLAIN` on the rewritten SQL — if Postgres rejects it, you catch the shim bug immediately.

**Priority: P0** (before any Postgres query ships).

### 1.3 Schema/GUC injection via identifier interpolation

**Premise.** Postgres does **not** accept parameterised identifiers. You cannot say `SET LOCAL search_path = $1` as a bare `SET` — you must use `SELECT set_config('search_path', $1, true)` instead. If the plan falls back to interpolating a validated-looking schema name into a `SET LOCAL` string, any bypass of the validator (e.g., a Zod coercion fallback that accepts a string instead of a UUID) allows injection. Postgres's simple-query protocol allows multi-statement strings; `pg`'s default `query(text)` uses the simple protocol and executes both statements.

**Steps.** Authenticated attacker hits `POST /api/books/<id>/query`. If the schema/book-id is ever concatenated into a `SET LOCAL` without strict regex validation, they inject a second statement that redefines `julianday` as a function logging all arguments to a writable table — exfiltrating data over time.

**Hardening.** Use `await client.query('SELECT set_config($1, $2, true)', ['search_path', schemaName])`. This parameterises; no string interpolation. Double-gate with strict regex at the route edge (`^gnudash_book$|^book_[0-9a-f]{8}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{4}_[0-9a-f]{12}$`). Use `pool.connect()` + `RESET ALL` in a `finally`. Consider Postgres *application roles* instead of GUCs: `SET ROLE` to a restricted role per book would be sturdier still (but complicates migrations).

**Priority: P0.**

### 1.4 Check-out-before-SET TOCTOU inside transactions

**Premise.** The plan says "set Postgres GUCs on the checked-out client." There is a narrow window where the client is checked out but the `search_path` has not yet been set. If a request handler performs *any* query on that client before the set lands — e.g., a logging query, a feature-flag query, an ORM that auto-executes `SHOW search_path` on connect — that query runs with **default search_path**, not the book's schema. Depending on role grants, this could leak or error opaquely.

**Hardening.** Do not expose `pool.query` directly outside `pg-pool.ts`. Export only `withBookClient(schemaName, fn)` which (1) checks out, (2) `set_config` the search_path, (3) runs `fn(client)`, (4) `RESET ALL` in `finally`, (5) releases. Mark `pool.query` with `/** @deprecated — use withBookClient */`. Add an `eslint-no-restricted-imports` rule to block direct `pool.query` outside the pool module. Better: revoke `USAGE` on book schemas from the default role so a forgotten set returns no rows rather than all rows.

**Priority: P0.**

### 1.5 Argon2id timing side-channels in login (user enumeration)

**Premise.** The plan says "constant-time comparison" but the costly operation is **the Argon2 verify itself**. If the passphrase is wrong the route returns immediately; if correct, same. But in Phase 2, if the user doesn't exist, the route returns immediately without verifying anything — that delta is trivially measurable over a LAN.

**Hardening.** On unknown-email (Phase 2) or empty passphrase (Phase 1), compute a fake Argon2 verify against a fixed decoy hash stored as a module constant. Make the code path identical: either way, `verify(hash_or_decoy, submittedPassphrase)` → same error message, same HTTP status, same body length. For the lockout-DoS: rate-limit the **failure response**, not the user row. Don't lock accounts on IP-based failures; lock on *authenticated-session* suspicious activity only.

**Priority: P0** for timing, **P1** for lockout-DoS.

### 1.6 X-Forwarded-For trust → rate-limit and IP-hash bypass

**Premise.** The server needs to know the real client IP for rate limiting. Next.js in Node reads from `request.headers['x-forwarded-for']`. If the code `split(',')[0]` unconditionally, an attacker sends `X-Forwarded-For: 1.2.3.4, actual.ip` and gets a fresh rate-limit bucket per synthesized IP, defeating login throttling. Conversely, an attacker can *poison* a legitimate user's bucket by spoofing their XFF and triggering the cooldown on their real IP.

**Hardening.** Require operators to set `TRUSTED_PROXY_HOPS=N` (default 0). Read XFF as `xff.split(',').slice(-N)[0]` (the Nth-from-right, which is what their proxy injected). If the remote socket IP isn't in `TRUSTED_PROXY_CIDR`, ignore XFF entirely and use the socket IP. Document this in the operator guide prominently. Never accept `X-Real-IP` from an untrusted source.

**Priority: P0.**

### 1.7 Iron-session cookie replay after logout

**Premise.** `iron-session` seals a cookie with AEAD but is **stateless**. "Logout" clears the cookie on the client; the server cannot revoke it. If an attacker XSS'd the cookie before logout (or copied it off a shared machine), it remains valid until its absolute timeout — 12 hours in the plan.

**Hardening.** Store an opaque session ID inside the sealed cookie (not the full session payload), and maintain `sessions` rows in Postgres `(id, user_id, issued_at, revoked_at)`. Logout flips `revoked_at`. Every request joins. Yes, this is a DB hit per request — for a financial dashboard with small user counts, it's trivial. If you insist on stateless, add a `sessions_epoch` column on `users`, include it in the cookie payload, and bump it on logout/password change; cookies with stale epochs are rejected.

**Priority: P1.**

### 1.8 Export endpoint as data exfiltration channel

**Premise.** `GET /api/books/[id]/export` returns a `pg_dump`-backed blob. The risk: an authenticated low-privilege user (role=`viewer` in `book_members`) can hit `/export` and walk away with the full book. Dump contains everything — including any columns you wouldn't have queried via the semantic API.

**Hardening.** Gate `/export` behind `role IN ('owner','editor')` explicitly — viewers never export. Require passphrase re-entry (the plan already does this for book DELETE; do the same here). Log the export to `audit_log` with the byte count and a content hash. Rate-limit exports to N per day per book. For the bigger threat — a compromised session exfiltrating silently — alert the owner by email on any export.

**Priority: P1.**

### 1.9 Runtime migrations race → partial-schema window

**Premise.** Plan open-question #4 favours a `gnudash migrate` command (good). If that lands as "run migrations on app start" instead, two container replicas starting simultaneously (Coolify rolling deploy) race on migration locks. The loser may *start serving traffic* against a half-migrated schema.

**Hardening.** Commit to the separate `gnudash migrate` subcommand as a distinct entrypoint. The app binary refuses to start if `schema_migrations.version < BUNDLED_VERSION`. Operators run `gnudash migrate` once (docs: Coolify pre-deploy hook). Ship all migrations as idempotent SQL files with advisory locks. Never `ALTER TABLE … DROP COLUMN` in the same version that deploys code that stops using it — always two releases.

**Priority: P1.**

### 1.10 "OPFS unchanged" but the static export now ships alongside API routes

**Premise.** The plan makes OPFS mode conditional on `BUILD_MODE=static`. That means the **same codebase** contains `fetch('/api/...')` clients. Dead code isn't dangerous on its own, but the static build's CSP (`next.config.ts`) allows `script-src 'unsafe-inline' 'unsafe-eval'` (required by SQLite WASM). In server mode the WASM is not loaded, and those CSP relaxations should be dropped — but the plan says nothing about a mode-specific CSP.

**Hardening.** In server mode, set a strict CSP *without* `unsafe-eval`/`unsafe-inline` — use per-request nonces (Next.js middleware can inject them). Drop `worker-src blob:` when WASM isn't used. Add `frame-ancestors 'none'` (plan is missing this — it blocks clickjacking). Set `connect-src 'self'`. Add `require-trusted-types-for 'script'` to force a Trusted Types policy on `innerHTML` sinks. Grep for `dangerouslySetInnerHTML` and `href={` in the codebase — any user-data in an `href` must be URL-validated (`javascript:` URI block).

**Priority: P0** for dropping `unsafe-eval` in server mode, **P1** for Trusted Types.

### 1.11 Coolify self-signed Postgres TLS → rejectUnauthorized footgun

**Premise.** Coolify provisions Postgres in a shared Docker network with self-signed certs. Operators will copy-paste `{ ssl: { rejectUnauthorized: false } }` from a Stack Overflow answer. That disables server identity verification entirely — any attacker on the Docker bridge can MITM.

**Hardening.** Ship an operator guide that says: (1) mount the Coolify Postgres CA cert into gnudash at `/etc/ssl/pg-ca.crt`, (2) set `DATABASE_SSL_CA=/etc/ssl/pg-ca.crt`, (3) `ssl: { ca: fs.readFileSync(...), rejectUnauthorized: true }`. Refuse to start in production if `rejectUnauthorized: false` *and* `DATABASE_SSL_CA` unset.

**Priority: P0.**

### 1.12 Audit log injection via user-controlled metadata

**Premise.** If any handler writes user-controlled strings to `audit_log.metadata JSONB` — e.g., `metadata: { description: payload.description }` — a sufficiently large payload wastes storage and the log ingestion pipeline (pino → Loki/Elastic) becomes attacker-reachable.

**Hardening.** In `audit_log`, store **IDs and enums only** in `metadata`. For free-text, store a `length` and a `sha256`, not the content. Cap `metadata` JSONB size at 4 KB at the DB level (`CHECK (octet_length(metadata::text) < 4096)`). Validate all enum fields. Strip NUL bytes at the validation layer. For pino output, configure `redact` paths.

**Priority: P1.**

### 1.13 CSRF via subdomain takeover / same-site scoping

**Premise.** `SameSite=Strict` blocks cross-site; it does not block same-site. If any subdomain of the app's domain is attacker-controlled (expired subdomain, `*.example.com` wildcard cert on a forgotten service), that subdomain can mount CSRF because it's same-site.

**Hardening.** `Origin` check compares **exact string equality** with a configured `APP_ORIGIN` env var (single value, no wildcard). For multi-tenant deploys, this is per-tenant. Also set `__Host-session` cookie prefix (implies `Secure`, `Path=/`, no `Domain` attribute) — this prevents a sibling subdomain from writing a cookie that your app trusts. Consider double-submit CSRF tokens (cheap) for defense in depth.

**Priority: P1.**

### 1.14 Supply-chain: `pg`, `@node-rs/argon2`, `iron-session`, `zod`

**Premise.** None of these has an active critical CVE at time of writing, but `@node-rs/argon2` is a prebuilt native binding — supply chain risk lives in the binary, which most `npm audit` tooling doesn't inspect. A malicious post-install script in any transitive dep has full access to `DATABASE_URL` at build time if it runs during `npm ci`.

**Hardening.** `.npmrc` with `ignore-scripts=true` during `npm ci`. Only whitelisted packages get install scripts. Lock file audit in CI (`npm audit signatures` for provenance). Pin exact versions (no `^`). Generate an SBOM on every release. Sign with `cosign` (plan mentions as stretch — promote to P1). Use `overrides` to cap transitive versions.

**Priority: P1.**

### 1.15 IDOR in `getFullDashboardData` via the "one call" design

**Premise.** The plan celebrates "one request = one dashboard payload." It's also the exact pattern that makes IDOR easy to miss: a single function internally calls 15 domain subroutines. If any one of those subroutines takes a `book_id` from anywhere other than the route param, or `search_path` isn't set on *that* specific connection, cross-book leaks happen silently.

**Hardening.** Enforce one-client-per-request: acquire once in the route handler, pass the scoped client to all subroutines, set search_path once, release in `finally`. Forbid `pool.query` in domain code. Add an integration test that spins up two books and asserts `getFullDashboardData(bookA)` never returns any row whose data belongs to book B.

**Priority: P0.**

---

## 2. Hardening beyond the attack list (consolidated)

- In `pg-pool.ts`: set `statement_timeout`, `idle_in_transaction_session_timeout`, `lock_timeout` at pool-init via `options: '-c statement_timeout=10s -c idle_in_transaction_session_timeout=30s'`. Reject the connection if it's missing.
- Disable Postgres extensions the app doesn't need — create the app user with `NOSUPERUSER NOCREATEDB NOCREATEROLE`. Deny `COPY … FROM PROGRAM`.
- Container hardening: `--security-opt=no-new-privileges`, `--cap-drop=ALL`, `NODE_OPTIONS=--disallow-code-generation-from-strings`.
- `HEALTHCHECK` should hit `/api/health` but that endpoint must **not** touch Postgres (else a DB outage takes down the container). Report `db: degraded` in the JSON body instead.
- Next.js middleware: top-level `try/catch` that converts any unexpected error into a generic 500 with a request ID — never a stack. Gate verbose errors on `NODE_ENV !== 'production'`.
- Reject any POST that isn't `application/json`.
- Set `Cache-Control: no-store` on every API response. Accidental caching at a reverse proxy of an authenticated response is a classic disaster.

## 3. Missing from the plan

1. **CSP nonce strategy for server mode.** See §1.10.
2. **Trusted Types.** For a financial UI rendering user-controlled strings, this is the modern baseline.
3. **Subresource Integrity / no third-party scripts.** Assert explicitly: all JS is self-hosted.
4. **Incident response for leaked `SESSION_SECRET`.** What's the runbook? Rotate env var and restart; all sessions invalidate because the AEAD key changed. Document it.
5. **Key rotation for `IP_HASH_SECRET`.** Decide policy, document.
6. **Backup/restore threat model.** If operators run `pg_dump` to a local file, that file contains *passphrase hashes*. Argon2id resists offline brute force but not trivial passphrases. Encrypt backups with operator key before they leave the server.
7. **Dependency pinning policy.** Plan says `npm ci --omit=dev`; doesn't say how exact-version pinning is enforced. Add a CI check.
8. **Abuse handling.** No throttle on `/api/books` creation. A logged-in user could create millions of books.
9. **Log retention & rotation.** `audit_log` grows forever. Plan a retention policy (e.g., 1 year) and a pruning job.
10. **Admin access model.** Document: operators access the Postgres directly with their DBA credentials; the app has no admin UI by design.
11. **Time-based token safety.** Use Postgres's `now()` everywhere, not Node's `Date.now()` — clock drift matters for lockout semantics.
12. **WebAuthn (plan's open #3).** Defer the implementation, but *design the schema now* — add a `user_credentials` table in the initial migration with a `kind` discriminator.
13. **`/api/auth/me` rate limiting.** Plan rate-limits login; should also rate-limit `/me`.
14. **Email deliverability for audit notifications.** Not required for MVP; later adds SMTP config and its own threat surface.

## 4. Priority tiering

**P0 (fix before any user touches the Postgres backend)**

- §0 dialect shim tokenizer
- §1.1 schema-registry dispatch with `z.strictObject`
- §1.2 shim fuzz suite
- §1.3 `set_config` for identifier values, multi-statement protection
- §1.4 `withBookClient` wrapper, ban direct `pool.query`
- §1.5 Argon2 timing equalization (decoy verify)
- §1.6 `TRUSTED_PROXY_HOPS` and XFF discipline
- §1.11 Coolify TLS verification posture documented and defaulted
- §1.15 IDOR integration tests, one-client-per-request
- §1.10 drop `unsafe-eval` in server-mode CSP

**P1 (before v1.0 / before opening to paying customers)**

- §1.7 server-side session store or epoch-based invalidation
- §1.8 export endpoint passphrase re-entry + audit
- §1.9 `gnudash migrate` as a separate subcommand
- §1.12 `audit_log` metadata discipline + size cap
- §1.13 `__Host-` cookie prefix and strict `Origin` pinning
- §1.14 `ignore-scripts=true`, exact version pinning, `cosign` signing
- Trusted Types policy in server mode
- Backup encryption guidance

**P2 (track; revisit)**

- WebAuthn schema prep
- Log retention automation
- SBOM publishing cadence
- Admin access documented-as-designed

## 5. What the plan gets right

- **Semantic API boundary chosen correctly.** Not SQL-RPC. This single decision eliminates an entire class of attack.
- **Schema isolation as defense-in-depth**, not as primary authorization — right posture.
- **Argon2id** with reasonable starting params; pepper acknowledged via env secret pattern.
- **No bundled Postgres in the image.** Clean responsibility split.
- **Non-root, read-only root FS, distroless target.** Container hardening already at a good bar.
- **`CITEXT` for emails.** Catches the case-insensitivity footgun.
- **HMAC-hashed IP in `audit_log`.** Right answer for GDPR and log-leak scenarios.
- **Book-scoped routes** rather than a single `/api/query` — makes the authorization boundary syntactic.
- **Explicit non-goals** (passphrase recovery, multi-writer). Scope honesty that prevents dangerous half-measures.
- **`pg_dump` streaming**, not buffering. Right call.
- **Parallel CI against both adapters** for domain functions. The single most valuable test-engineering decision in the plan.

The plan is, overall, *above* the bar for a self-hosted app of this scope. The foundational risks are concentrated in the dialect shim and the RLS/schema-path plumbing; if those two areas get adversarial unit tests and a strict `withBookClient` discipline, most of the rest is polish.
