# Deployment Guide

GnuDash ships in two distinct shapes. Pick one before following the rest of this guide — they are deployed differently, have different infrastructure requirements, and offer different features.

## Two versions: Local vs Server

|  | **Local** | **Server (Postgres)** |
|---|---|---|
| **Where the book lives** | Your browser's [Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) (per-browser, per-device) | A Postgres database you run |
| **What runs server-side** | Static HTML/JS/WASM files — any web server | A Node.js standalone app + Postgres |
| **Cross-device sharing** | No (each browser has its own copy) | Yes (every device hits the same DB) |
| **Import a `.gnucash` file** | Yes | Yes |
| **Edit / save changes** | Yes (written to OPFS) | Yes (written to Postgres, cached locally) |
| **Read-only view of an existing GnuCash Postgres DB** | No | Yes |
| **Auto-reconnect across browser restarts** | Via OPFS (per browser) | Via OPFS-cached credentials |
| **Build command** | `NEXT_OUTPUT=export npm run build` → `app/out/` | `npm run build` → `app/.next/standalone/` |
| **Host requirements** | Any static file server with custom response headers | Node.js 20+ runtime, Postgres 12+, reverse proxy with TLS for non-localhost |
| **Example hosts** | nginx, Cloudflare Pages, Netlify, Vercel, Synology, GitHub Pages (with a caveat) | Docker host, VPS, home server, any Linux box with Node |
| **Public demo** | [gnudash.pages.dev](https://gnudash.pages.dev) | — (self-host only) |

### Which should I pick?

- **"I want the easy one, just me using it on my laptop"** → Local. Deploy to Cloudflare Pages or run the static Docker image.
- **"I want to see my books on my phone too, or on another laptop"** → Server. Stand up Postgres and the standalone app.
- **"I already have GnuCash desktop writing to Postgres and just want a web dashboard"** → Server, using the existing-GnuCash-DB read-only mode.
- **"I'm not sure, but I want to decide later"** → Start Local. You can re-deploy in Server mode any time; the Local session just won't migrate automatically (re-import the file).

---

## Common: HTTP headers required on every deployment

Both modes need these response headers on every request:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

They enable [`SharedArrayBuffer`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer), which the in-browser SQLite WASM engine needs for OPFS persistence. Without them, file uploads fail with a Worker error.

Each section below spells out how the headers are set for its path.

---

## Common: local development

The dev server covers both modes — the API routes are live so you can test the Server backend without building.

```bash
git clone https://github.com/QuirkyTurtle94/GnuDash.git
cd GnuDash/app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server sets COOP/COEP automatically via `next.config.ts`.

### Linux: "Too many open files" error

Ubuntu and similar ship with a 1024 open-file-descriptor limit that Turbopack can exceed:

```
FATAL: An unexpected Turbopack error occurred.
Error [TurbopackInternalError]: Too many open files (os error 24)
```

**Quick fix** — for the current shell only:

```bash
ulimit -n 65536
npm run dev
```

**Permanent fix** — add to `/etc/security/limits.conf` (requires sudo):

```
* soft nofile 65536
* hard nofile 65536
```

Log out and back in, verify with `ulimit -n`. Not needed on macOS (much higher default) or in production Docker images (no watcher).

---

# Part 1 — Deploying the Local version

Produces a `app/out/` directory of static files. No Node.js at runtime, no database, no API. Any static file server works as long as it can set the two COOP/COEP headers.

## 1.1 Static build

```bash
cd app
npm install
NEXT_OUTPUT=export npm run build
```

The `NEXT_OUTPUT=export` flag is required — without it the build produces the standalone Node.js bundle for the Server version, which static hosts can't serve. The build wrapper (`scripts/next-build.mjs`) also hides the Server tab from the upload screen in this mode so users don't hit a tab whose Connect button would 404.

## 1.2 Docker (nginx — recommended)

Included `Dockerfile` (repo root) does the build + nginx packaging with COOP/COEP pre-configured:

```bash
# From the app/ directory
cd app
docker build -t gnudash .
docker run -p 8080:80 --restart unless-stopped gnudash
```

Open [http://localhost:8080](http://localhost:8080). Change `-p 8080:80` to remap the host port; `80` inside the container is fixed.

### Docker Compose

Minimal compose for just the Local-mode nginx container (distinct from the `docker-compose.yml` at the repo root, which is for Server mode):

```yaml
services:
  gnudash:
    build:
      context: ./app
      dockerfile: Dockerfile
    ports:
      - "8080:80"
    restart: unless-stopped
```

`docker compose up -d`, and the nginx config inside the container handles headers, MIME, and SPA fallback automatically.

## 1.3 Cloudflare Pages

1. [Cloudflare Dashboard](https://dash.cloudflare.com) → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. Pick the repo and branch.
3. Build config:
   - **Build command**: `cd app && npm install && NEXT_OUTPUT=export npm run build`
   - **Build output directory**: `app/out`
4. Deploy.

Headers are handled by `app/public/_headers` (already in the repo), which gets copied into the build output:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

No extra configuration.

## 1.4 Vercel

1. Import the repo on [Vercel](https://vercel.com).
2. Set the **Root Directory** to `app`.
3. Override the default build for a static deployment: **Build Command** = `NEXT_OUTPUT=export npm run build`, **Output Directory** = `out`. (Leave them at defaults only if you want the Server version — see Part 2.)

Add headers via `app/vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
        { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
      ]
    }
  ]
}
```

> COEP `require-corp` can conflict with Vercel's analytics / preview toolbar. If it does, try `credentialless` — browser support varies.

## 1.5 Netlify

1. Import the repo.
2. Build config:
   - **Base directory**: `app`
   - **Build command**: `NEXT_OUTPUT=export npm run build`
   - **Publish directory**: `app/out`

Headers come from `app/public/_headers` (same file used by Cloudflare Pages).

## 1.6 Coolify

Self-hosted PaaS; GnuDash deploys as a Docker container.

1. New resource → **Dockerfile** build pack → point at the repo.
2. **Dockerfile location**: `app/Dockerfile` (or `/Dockerfile` for repo-root context).
3. **Exposed port**: `80`.
4. Save and deploy.

The repo-root Dockerfile forces `NEXT_OUTPUT=export` inside the build, so this stays on the Local-mode static path regardless of the default.

## 1.7 Synology NAS (Container Manager)

Container Manager + Docker Compose, no CLI required.

**Prerequisites:** DSM 7.0+, Container Manager installed from Package Center.

1. Container Manager → **Project** → **Create**. Name it `gnudash` and pick a path (e.g. `docker/gnudash`).
2. Paste this compose:
   ```yaml
   services:
     gnudash:
       image: nginx:alpine
       ports:
         - "8080:80"
       restart: unless-stopped
       volumes:
         - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
         - ./site:/usr/share/nginx/html:ro
   ```
3. Click **Next** → **Done**. It'll fail to start — that's expected.
4. On your computer:
   ```bash
   git clone https://github.com/QuirkyTurtle94/GnuDash.git
   cd GnuDash/app
   npm install
   NEXT_OUTPUT=export npm run build
   ```
5. Copy via File Station:
   - `GnuDash/app/out/*` → `site/` inside the project folder
   - `GnuDash/app/nginx.conf` → next to `docker-compose.yml`
6. Back to Container Manager → Project → **Start**.
7. Open `http://YOUR-NAS-IP:8080`.

**Updating:** repeat steps 4–5 and restart the container.

**Alternative — build on the NAS via SSH** (needs 2 GB+ free RAM):

```bash
ssh admin@YOUR-NAS-IP
cd /volume1/docker
git clone https://github.com/QuirkyTurtle94/GnuDash.git
cd GnuDash/app
docker build -t gnudash .
docker run -d -p 8080:80 --restart unless-stopped --name gnudash gnudash
```

## 1.8 Any static host

If your host isn't listed:

1. Build: `cd app && npm install && NEXT_OUTPUT=export npm run build`.
2. Upload `app/out/` contents.
3. Configure the host to send COOP and COEP on every response.
4. Configure SPA-fallback to `index.html` for client-side routes.

Hosts that don't let you set custom headers (GitHub Pages being the classic offender): the app loads, but file uploads fail because `SharedArrayBuffer` is unavailable.

---

# Part 2 — Deploying the Server (Postgres) version

Produces `app/.next/standalone/server.js` and needs a real Node.js runtime plus a Postgres database. The Server version enables cross-device access, auto-reconnect from OPFS-persisted credentials, and read-only interop with existing GnuCash desktop Postgres databases.

**All non-localhost Server deployments must be behind TLS** — the browser posts the Postgres password in each request body, so plain HTTP leaks it on the wire. See §2.4.

## 2.1 Quickstart — Docker Compose (recommended)

The repo ships a `docker-compose.yml` that builds the app from `Dockerfile.standalone`, boots `postgres:16-alpine`, waits for the DB healthcheck, and runs the app:

```bash
git clone https://github.com/QuirkyTurtle94/GnuDash.git
cd GnuDash
docker compose up -d
open http://localhost:3000
```

On the upload screen, pick **Server (Postgres)**. Defaults match the compose file:

```
host=localhost  port=5432  user=gnudash  password=gnudash  database=gnudash
book id=default
```

Drop a `.gnucash` file to bootstrap the book and you're in. Subsequent reloads auto-reconnect from the OPFS-cached credentials.

**Overrides** (set in the shell or a `.env` beside `docker-compose.yml` before first `up`):

| env var | default | purpose |
|---|---|---|
| `POSTGRES_USER` | `gnudash` | DB role name |
| `POSTGRES_PASSWORD` | `gnudash` | DB password (**change for anything non-toy**) |
| `POSTGRES_DB` | `gnudash` | DB name |
| `POSTGRES_PORT` | `5432` | Host-side port mapping for Postgres |
| `GNUDASH_PORT` | `3000` | Host-side port for the app |

**Managing data:**

- `docker compose down` — stops containers, keeps the Postgres volume (so your book survives).
- `./scripts/db-reset.sh` — stops **and** drops the `gnudash_pgdata` volume. Used when a previous import left the DB in a bad state or when you're switching between fixture books.

## 2.2 Compose variant — Postgres only (dev server against it)

If you'd rather run the app via `npm run dev` and only want containerised Postgres:

```bash
docker compose up -d postgres
cd app && npm install && npm run dev
```

Dev mode includes the API routes and hot-reloads on source changes. The connection defaults on the upload screen match the compose file.

## 2.3 Running without Docker

For VPS / bare-metal deployments where you manage Postgres separately:

```bash
cd app
npm install
npm run build                       # produces app/.next/standalone/
NODE_ENV=production node .next/standalone/server.js
```

You'll need Postgres reachable — install locally (`apt install postgresql`, `brew install postgresql`, managed instance, etc.) and create a DB + role for gnudash.

Minimal Postgres bootstrap for a standalone install:

```sql
CREATE ROLE gnudash WITH LOGIN PASSWORD 'replace-me';
CREATE DATABASE gnudash OWNER gnudash;
```

## 2.4 Reverse proxy + TLS (required for non-localhost)

**Minimal nginx.** Terminates TLS, forwards to the Node app on 3000, sets COOP/COEP, raises body size for imports:

```nginx
server {
  listen 443 ssl http2;
  server_name gnudash.example.com;

  ssl_certificate     /etc/letsencrypt/live/gnudash.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/gnudash.example.com/privkey.pem;

  add_header Cross-Origin-Opener-Policy "same-origin" always;
  add_header Cross-Origin-Embedder-Policy "require-corp" always;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    client_max_body_size 200m;    # .gnucash imports can be big
  }
}
```

**Caddy** — auto-provisions Let's Encrypt certs:

```caddy
gnudash.example.com {
  header Cross-Origin-Opener-Policy "same-origin"
  header Cross-Origin-Embedder-Policy "require-corp"
  reverse_proxy 127.0.0.1:3000
  request_body {
    max_size 200MB
  }
}
```

If the app is reachable from the open internet, consider also putting it behind an auth reverse proxy (oauth2-proxy, Authelia, Cloudflare Access, Tailscale Funnel with ACL) — the Server backend has no login gate of its own; it just trusts whoever can type the Postgres password.

## 2.5 Security considerations

- **Credentials are stored plaintext in OPFS.** Needed for auto-reconnect. OPFS is sandboxed per origin (no other website can read it) but any JS on this origin can. Treat this origin like any app that handles its own creds.
- **Use a dedicated Postgres user.** Don't reuse the gnudash password anywhere else.
- **TLS is mandatory for non-localhost.** See §2.4.
- **Close GnuCash desktop** before connecting to a database it's currently writing to — see §2.6.

## 2.6 Read-only access to an existing GnuCash desktop database

If you already have GnuCash desktop saving to Postgres, you can load the book directly in gnudash without re-importing via `.gnucash` file:

1. On the Server tab, choose **Existing GnuCash database (read-only)**.
2. Fill in host/port/user/password/database.
3. Set **Schema** to whatever GnuCash writes to (almost always `public`).
4. Connect.

An amber banner persists across the dashboard reminding you the session is read-only. Every edit affordance is disabled.

**Close GnuCash desktop before loading the book here.** gnudash doesn't take the DBI session lock, so concurrent access between the two apps can corrupt data. The read-only UI is a safety rail, not a lock.

The gnudash-managed storage mode and the existing-DB mode are independent — you can have a gnudash book in a schema named `book_mine` alongside a GnuCash-owned schema named `public` in the same database.

## 2.7 Storage model

Each gnudash-managed book lives in its own Postgres schema named `book_{bookId}` (default: `book_default`). The `{bookId}` is whatever you type in the **Book id** field on the upload screen — this is where the multi-tenant / per-user hook lives if you ever want to expose the app beyond one person. Tables inside a `book_*` schema mirror GnuCash's SQLite layout *but are not byte-for-byte identical*; the NOT-NULL policy is deliberately looser so real `.gnucash` imports don't fail on columns GnuCash's own schema allows to be NULL.

That schema divergence is why the existing-GnuCash-DB mode is read-only — write-through to a schema gnudash doesn't own requires column-discovery logic that isn't shipped yet.

## 2.8 Troubleshooting

- **"Invalid schema name" / "Invalid book id" on Connect.** The field accepts `[a-z_][a-z0-9_]*`, up to 63 chars. `public`, `book_alice`, `default` all work; hyphens, uppercase, semicolons, leading digits don't.
- **Import fails on `column "X" does not exist`.** You're hitting a column our PG DDL doesn't declare on import. As of PR #82 we filter source columns to what the target schema has — if you see a new one, file an issue with the output of `sqlite3 your.gnucash ".schema <tablename>"`.
- **"SharedArrayBuffer is not defined" in the browser console.** The reverse proxy isn't adding COOP/COEP headers. Re-check §2.4.
- **"Connection refused" from inside the compose network.** Use `host=postgres` (the service name), not `localhost`. From a browser hitting the exposed host port, use `localhost` with whatever `POSTGRES_PORT` you set.
- **Dashboard looks stale after the server restarts.** OPFS caches the last dump; reload the page to re-fetch.
- **"Book exists but is missing required tables".** Status probe found a partial schema — usually the remnant of a failed import on an older build. Drop it from psql (`DROP SCHEMA book_default CASCADE`) and re-import.
- **Forgot the password / rotated it.** Clear gnudash's site data in your browser (removes the OPFS-cached creds), then reconnect with the new password on the upload screen.

---

## Comparison at a glance: when Local is fine, when Server pays off

- You're the only user, you use one browser, you want a fast setup → **Local.** 5-minute Cloudflare Pages deploy, done.
- You switch between phone and laptop, or have multiple users → **Server.** One Postgres, one Node process, point every browser at it.
- You want GnuCash-desktop compatibility for writes → neither yet; read-only interop (§2.6) is the state of the art until the schema-parity refactor lands.
- You want to just look at your GnuCash-desktop Postgres data in a browser → **Server**, read-only mode. No `.gnucash` export / import cycle.
