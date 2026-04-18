# Docker files

This directory has three compose flavours, pick by use case.

## `docker-compose.dev.yml` — day-to-day development

Postgres + Adminer. The app stays out of the compose — run it natively with `npm run dev` from `app/` so you get hot reload.

```bash
cd docker
docker compose -f docker-compose.dev.yml up -d
```

On first start, the bundled init scripts:
1. create the `gnudash_app` role (password: `testapppass`),
2. apply `app/db/migrations/0001_gnucash_schema.sql` — creates the `gnudash_book` schema and every GnuCash table,
3. grant the app role day-to-day CRUD on that schema.

Then in another terminal, run the app:

```bash
cd app
BUILD_MODE=server \
DATABASE_URL='postgres://gnudash_app:testapppass@localhost:5432/gnudash' \
SESSION_SECRET='at-least-32-bytes-of-random-junk-for-dev-use-only' \
APP_PASSPHRASE_HASH='<generate with node -e ...>' \
APP_ORIGIN='http://localhost:3000' \
TRUSTED_PROXY_HOPS=0 \
npm run dev
```

### Stop and start again (keeping data)

```bash
docker compose -f docker-compose.dev.yml down
docker compose -f docker-compose.dev.yml up -d
```

### Wipe everything (fresh Postgres)

```bash
docker compose -f docker-compose.dev.yml down -v
```

The `-v` removes the volume. Next `up -d` re-runs the init scripts from scratch.

### Browse the DB

Adminer is at [http://localhost:8080](http://localhost:8080).

- System: `PostgreSQL`
- Server: `postgres`
- Username: `gnudash_migrator` (or `gnudash_app`)
- Password: `testpass` (or `testapppass`)
- Database: `gnudash`

## `docker-compose.prod.yml` — full-stack smoke test

Builds `Dockerfile.server` locally and runs the app container against the same dev Postgres setup. For verifying the container image works before opening a PR. Not for daily iteration.

```bash
cd docker
cp .env.prod.example .env.prod
# edit .env.prod — generate a SESSION_SECRET and APP_PASSPHRASE_HASH
docker compose -f docker-compose.prod.yml --env-file .env.prod up --build
```

App on [http://localhost:3000](http://localhost:3000).

Stop:

```bash
docker compose -f docker-compose.prod.yml down
```

## `docker-compose.example.yml` — reference for self-hosters

Not for local use. Copy to your real deployment target and adapt. See `../docs/deployment-server.md` for the walkthrough.

## Hard-coded dev passwords

`testpass` and `testapppass` are literally that — for dev. Never use them in production; `docs/deployment-server.md` covers real-deploy secret generation.
