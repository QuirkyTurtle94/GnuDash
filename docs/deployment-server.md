# Server-mode deployment

Two deploy shapes are supported from one codebase:

- **Local mode** (static export, OPFS-only) — unchanged from today. Deploys to Cloudflare Pages, nginx, GitHub Pages. See the existing README for that path.
- **Server mode** (this document) — Next.js server + Postgres. Deploys via Docker or Coolify. Enables multi-device access.

This guide covers server mode only.

---

## What you're deploying

- **gnudash** container (`ghcr.io/.../gnudash:<tag>-server`) — Next.js app.
- **PostgreSQL 15+** — external. The app container does not bundle it.

Data stays inside Postgres. The app container is stateless.

---

## Before you start

You need three secrets to hand:

| Env var | What | How to generate |
|---|---|---|
| `SESSION_SECRET` | AEAD key for session cookies | `openssl rand -base64 48` |
| `APP_PASSPHRASE_HASH` | Argon2id hash of your app passphrase | see "Generate a passphrase hash" below |
| Postgres password for `gnudash_app` | DB user password | `openssl rand -base64 24` |

### Generate a passphrase hash

Pick a passphrase you'll type to log in. Then one-shot hash it:

```bash
node -e '
  const { hash } = require("@node-rs/argon2");
  hash("your-strong-passphrase").then(h => console.log(h));
'
```

Copy the output starting with `$argon2id$...` and use it as `APP_PASSPHRASE_HASH`. Never check it into git.

If you forget the passphrase there is no recovery — the data in Postgres is fine, but you'll need to set a new hash and restart. This is intentional.

---

## Postgres setup

Create the database and two roles. Run as a Postgres superuser:

```sql
CREATE DATABASE gnudash;
\c gnudash

-- Migrator role: owns the schema, runs migrations, has DDL rights.
CREATE ROLE gnudash_migrator WITH LOGIN PASSWORD '<migrator-pw>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE gnudash OWNER TO gnudash_migrator;

-- App role: the running container's identity. No DDL, no superuser.
CREATE ROLE gnudash_app WITH LOGIN PASSWORD '<app-pw>'
  NOSUPERUSER NOCREATEDB NOCREATEROLE;

-- Connection-level safety nets stick regardless of app code.
ALTER ROLE gnudash_app SET statement_timeout = '10s';
ALTER ROLE gnudash_app SET idle_in_transaction_session_timeout = '30s';
ALTER ROLE gnudash_app SET lock_timeout = '5s';

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO gnudash_app;
```

Then apply the schema migration as `gnudash_migrator`:

```bash
psql "postgres://gnudash_migrator:<migrator-pw>@<host>/gnudash?sslmode=require" \
  -f app/db/migrations/0001_gnucash_schema.sql
```

Finally, grant the app role day-to-day access to the book schema. **Run these as `gnudash_migrator` after applying the migration — `ON ALL TABLES` only covers tables that exist at grant time, so ordering matters:**

```sql
GRANT USAGE ON SCHEMA gnudash_book TO gnudash_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA gnudash_book TO gnudash_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA gnudash_book TO gnudash_app;

-- Default privileges so any tables added by future migrations
-- automatically inherit the grants — prevents "permission denied" errors
-- the next time the schema grows.
ALTER DEFAULT PRIVILEGES IN SCHEMA gnudash_book
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gnudash_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA gnudash_book
  GRANT USAGE ON SEQUENCES TO gnudash_app;
```

The app never runs as `gnudash_migrator`. If it tries to `CREATE TABLE` or `DROP`, it will fail by design.

---

## TLS to Postgres

Production requires TLS. The app refuses to start if:

- `DATABASE_URL` is missing `sslmode=require` (or `verify-ca` / `verify-full`), or
- `DATABASE_SSL_CA` is unset.

Mount the Postgres CA cert into the container at the path `DATABASE_SSL_CA` points to. For Coolify, extract the internal Postgres CA from the Postgres service container and mount it as a volume into gnudash. For a managed DB (Supabase, Neon, RDS), use the provider's supplied CA bundle.

**Do not** set `rejectUnauthorized: false`. The security review flagged this as the single biggest deployment footgun — it disables MITM protection on shared Docker networks. If the cert can't be mounted, fix the infra; don't bypass verification.

---

## Shape A — Docker single container

```bash
docker run -d \
  --name gnudash \
  --user 1000:1000 \
  --read-only \
  --tmpfs /tmp \
  --tmpfs /app/.next/cache \
  --cap-drop=ALL \
  --security-opt=no-new-privileges \
  -p 3000:3000 \
  -v /path/to/pg-ca.crt:/etc/ssl/pg-ca.crt:ro \
  -e NODE_ENV=production \
  -e DATABASE_URL='postgres://gnudash_app:...@db.example.com:5432/gnudash?sslmode=verify-full' \
  -e DATABASE_SSL_CA=/etc/ssl/pg-ca.crt \
  -e SESSION_SECRET="$(openssl rand -base64 48)" \
  -e APP_PASSPHRASE_HASH='$argon2id$v=19$...' \
  -e APP_ORIGIN='https://gnudash.example.com' \
  -e TRUSTED_PROXY_HOPS=1 \
  ghcr.io/.../gnudash:<tag>-server
```

Put nginx or Caddy in front for TLS termination and HTTP→HTTPS redirection. Forward only port 443. Do not expose Postgres to the internet.

---

## Shape B — Coolify + managed Postgres

1. **New Resource → Database → Postgres.** Note the internal hostname (usually `postgres`) and the superuser creds Coolify generates.
2. `docker exec` into the Postgres container and run the Postgres setup SQL above (creating the two roles + schema).
3. Extract the Postgres CA cert from the Coolify Postgres container:
   ```bash
   docker cp gnudash-postgres:/etc/ssl/certs/ssl-cert-snakeoil.pem ./pg-ca.crt
   ```
   (Exact path varies by image; inspect `/etc/ssl/` inside the container.)
4. **New Resource → Docker Image → gnudash.** Use the server image (`:<tag>-server`).
5. **Environment variables** (as above).
6. **File mount**: attach `pg-ca.crt` to `/etc/ssl/pg-ca.crt`.
7. **Pre-deploy command**:
   ```bash
   psql "$DATABASE_URL_MIGRATOR" -f app/db/migrations/0001_gnucash_schema.sql
   ```
   (Optionally split migrator URL into `DATABASE_URL_MIGRATOR` so the app itself never has DDL rights.)
8. **Healthcheck path**: `/api/health` — returns 200 even if Postgres is down, so a transient DB outage doesn't loop the container.
9. Deploy. Coolify handles Let's Encrypt TLS for the public hostname; the app sees HTTP internally, so `TRUSTED_PROXY_HOPS=1` plus `APP_ORIGIN=https://gnudash.example.com` keeps cookies and origin checks correct.

### First boot

1. Visit your URL. The login page asks for the passphrase.
2. Enter the passphrase you hashed into `APP_PASSPHRASE_HASH`.
3. Upload your `.gnucash` file via the dashboard. Data goes into Postgres.
4. Revisit from a different device. Log in. Same data, same books.

---

## Backup

Backups are a `pg_dump` problem, not an app problem:

```bash
pg_dump --format=custom --schema=gnudash_book --file=gnudash-$(date +%F).dump \
  "postgres://gnudash_migrator:...@host/gnudash?sslmode=require"
```

**Encrypt dumps before they leave the host.** They contain Argon2id hashes of the passphrase:

```bash
age -p -o gnudash-$(date +%F).dump.age gnudash-$(date +%F).dump
rm gnudash-$(date +%F).dump
```

Restore by reversing: `age -d` then `pg_restore`.

---

## Rotation and incident response

- **Session secret rotation.** If `SESSION_SECRET` leaks, change it and restart the container. All existing sessions invalidate immediately because the AEAD key changes. Users re-login.
- **Passphrase change.** Generate a new hash and update `APP_PASSPHRASE_HASH`; restart. Sessions stay valid until absolute timeout (12h); to cut them off sooner, also rotate `SESSION_SECRET`.
- **Postgres password rotation.** Update `gnudash_app`'s password and the `DATABASE_URL` env; restart.
- **Data compromise.** `DROP SCHEMA gnudash_book CASCADE` removes every book row. Restore from encrypted backup.

---

## What's not in Phase 1

- Multi-user accounts, shared books, roles. Phase 2.
- WebAuthn / passkeys. Tracked.
- Desktop GnuCash opening the Postgres directly — possible in principle (the schema is 1:1 with `gnc-*-sql.cpp`) but not a supported path.

See [architecture/storage-adapters.md](architecture/storage-adapters.md) for the full Phase 1/2 plan and [architecture/storage-adapters-security-review.md](architecture/storage-adapters-security-review.md) for the threat model.
