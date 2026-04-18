# Deployment Guide

GnuDash supports two deployment modes:

| Mode | Output | Backends | When to use |
|---|---|---|---|
| **Static** (`NEXT_OUTPUT=export npm run build`) | `app/out/` — plain HTML/JS/WASM | Local (OPFS) only | Cloudflare Pages, Netlify, nginx, any static host |
| **Standalone** (default `npm run build`) | `app/.next/standalone/` — Node.js server | Local (OPFS) **and** Server (Postgres) | Self-hosted behind Node, Docker, VPS — when you want a shared Postgres book across devices |

The Server (Postgres) backend is tracked by [issue #48](https://github.com/QuirkyTurtle94/GnuDash/issues/48). Until that lands, both modes behave identically from the user's perspective — the default flip to `standalone` just enables the API routes the Postgres backend needs.

If you have an existing static deployment (Cloudflare Pages, Netlify, the nginx Dockerfile in this repo), follow the commands in each section below — they already set `NEXT_OUTPUT=export` so nothing changes for you.

## Important: Required HTTP Headers

Wherever you deploy, your server **must** set these two headers on all responses:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

These are required for [`SharedArrayBuffer`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) support, which the SQLite WASM engine uses for OPFS persistence. Without them, file uploads will fail with a Worker error.

---

## Local Development

The simplest way to run GnuDash. Requires [Node.js](https://nodejs.org/) 20+.

```bash
git clone https://github.com/QuirkyTurtle94/GnuDash.git
cd GnuDash/app
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The dev server sets the required headers automatically via `next.config.ts`.

### Linux: "Too many open files" error

On Linux (e.g. Ubuntu), you may see this crash when running `npm run dev`:

```
FATAL: An unexpected Turbopack error occurred.
Error [TurbopackInternalError]: Too many open files (os error 24)
```

This happens because the Next.js dev server (Turbopack) opens file watchers across the project tree, and Linux distributions often ship with a low default limit on open file descriptors (typically 1024). Between the source files, `node_modules`, and Turbopack's internal bookkeeping, the dev server can exceed that limit.

**Quick fix** — raise the limit for your current shell session:

```bash
ulimit -n 65536
npm run dev
```

**Permanent fix** — add these lines to `/etc/security/limits.conf` (requires sudo) so the change persists across reboots:

```
* soft nofile 65536
* hard nofile 65536
```

Then log out and back in (or reboot) for the new limits to take effect. You can verify with `ulimit -n`.

> **Why this isn't needed on macOS or Docker:** macOS sets a much higher default limit (tens of thousands), and the Docker images used for production builds don't run a file watcher at all — they just serve the static build output via nginx.

---

## Static Build

For any of the static hosts below (nginx, Cloudflare Pages, Netlify, a plain CDN), build with `NEXT_OUTPUT=export`:

```bash
cd app
npm install
NEXT_OUTPUT=export npm run build
```

This produces a static export in `app/out/` containing everything needed to serve the site.

Without the env var, the build instead produces a standalone Node.js bundle in `app/.next/standalone/` which is what the Server (Postgres) backend needs — but the static hosts below cannot serve it.

---

## Docker (Recommended)

The recommended way to self-host. Uses a two-stage build: Node builds the static site, nginx serves it with all required headers pre-configured.

### Dockerfile

A `Dockerfile` is included in both the repo root (build context = repo) and `app/` (build context = app directory).

```bash
# From the app/ directory
cd app
docker build -t gnudash .
docker run -p 8080:80 --restart unless-stopped gnudash
```

Open [http://localhost:8080](http://localhost:8080).

The `-p 8080:80` flag maps port 80 inside the container to port 8080 on your host. You can change `8080` to any port you like — for example, `-p 3000:80` to serve on port 3000, or `-p 80:80` if nothing else is using port 80. The container always listens on port 80 internally.

### Docker Compose

Create a `docker-compose.yml` in the repo root:

```yaml
services:
  gnudash:
    build:
      context: ./app
      dockerfile: Dockerfile
    ports:
      - "8080:80"  # Change 8080 to any port you prefer
    restart: unless-stopped
```

Then:

```bash
docker compose up -d
```

The nginx configuration inside the container handles the COOP/COEP headers, MIME types, routing, and static asset caching automatically.

---

## Cloudflare Pages

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) > **Workers & Pages** > **Create**
2. Select **Pages** > **Connect to Git**
3. Pick your repository and branch
4. Configure the build:
   - **Build command**: `cd app && npm install && NEXT_OUTPUT=export npm run build`
   - **Build output directory**: `app/out`
5. Deploy

The required headers are handled automatically by the `_headers` file in `app/public/`, which gets copied into the build output:

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

No additional configuration needed.

---

## Vercel

1. Import your repository on [Vercel](https://vercel.com)
2. Set the **Root Directory** to `app`
3. Vercel will auto-detect Next.js and build it. If you want a pure-static deployment (no Postgres backend), set the **Build Command** to `NEXT_OUTPUT=export npm run build` and **Output Directory** to `out`. Otherwise Vercel will deploy the standalone Node.js output, which supports both backends.

Add the required headers by creating `app/vercel.json`:

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

> **Note**: COEP `require-corp` can interfere with Vercel's analytics and preview toolbar. If you encounter issues, this may require `credentialless` instead of `require-corp`, though browser support varies.

---

## Netlify

1. Import your repository on [Netlify](https://netlify.com)
2. Configure the build:
   - **Base directory**: `app`
   - **Build command**: `NEXT_OUTPUT=export npm run build`
   - **Publish directory**: `app/out`

Add the required headers by creating `app/public/_headers` (already included in the repo):

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: require-corp
```

Netlify reads the `_headers` file from the publish directory, same as Cloudflare Pages.

---

## Coolify

[Coolify](https://coolify.io) is a self-hosted PaaS. GnuDash deploys as a Docker container.

1. Create a new resource, select **Dockerfile** as the build pack
2. Point it at your repository
3. Set the **Dockerfile location** to `app/Dockerfile` (or `/Dockerfile` if using repo root context)
4. Set the **exposed port** to `80`
5. Save and deploy

The Dockerfile handles everything — the build, the nginx config, and the required headers. Git webhooks will trigger automatic redeployments on push.

---

## Synology NAS

You can run GnuDash on a Synology NAS using Container Manager (Docker). No command line needed.

### Prerequisites

- A Synology NAS running DSM 7.0 or later
- **Container Manager** installed from Package Center (it's free — open Package Center, search "Container Manager", and click Install)

### Step-by-step

1. **Open Container Manager** from your Synology desktop

2. **Go to the "Project" section** in the left sidebar

3. **Click "Create"**
   - Give the project a name: `gnudash`
   - Set the path to any folder (e.g. create a new folder called `docker/gnudash` in File Station first)

4. **Paste this Docker Compose config** in the editor:

   ```yaml
   services:
     gnudash:
       image: nginx:alpine
       ports:
         - "8080:80"  # Change 8080 to any free port on your NAS
       restart: unless-stopped
       volumes:
         - ./nginx.conf:/etc/nginx/conf.d/default.conf:ro
         - ./site:/usr/share/nginx/html:ro
   ```

5. **Click "Next"**, then **"Done"** to create the project (it will fail to start — that's expected, we need to add the files first)

6. **Build the site on your computer** (you need Node.js installed):

   ```bash
   git clone https://github.com/QuirkyTurtle94/GnuDash.git
   cd GnuDash/app
   npm install
   NEXT_OUTPUT=export npm run build
   ```

7. **Copy files to your NAS** using File Station or a network share:
   - Copy the entire contents of `GnuDash/app/out/` into the `site/` folder inside your project directory
   - Copy `GnuDash/app/nginx.conf` into the project directory (next to `docker-compose.yml`)

   Your project folder should look like:
   ```
   docker/gnudash/
   ├── docker-compose.yml   (created by Container Manager)
   ├── nginx.conf           (copied from the repo)
   └── site/                (contents of app/out/)
       ├── index.html
       ├── _next/
       ├── _headers
       └── ...
   ```

8. **Go back to Container Manager** > **Project** > **gnudash** > click **"Start"**

9. **Open GnuDash** at `http://YOUR-NAS-IP:8080`

### Updating

When a new version of GnuDash is released, repeat steps 6-7 (rebuild and copy the files), then restart the container in Container Manager.

### Alternative: Build on the NAS

If you'd prefer the NAS to build the Docker image itself (no need to copy files manually), your NAS needs enough RAM (2GB+ free) and you'll use SSH:

1. SSH into your NAS: `ssh admin@YOUR-NAS-IP`
2. Clone and build (the repo-root `Dockerfile` forces `NEXT_OUTPUT=export` so this keeps producing a static nginx image):
   ```bash
   cd /volume1/docker
   git clone https://github.com/QuirkyTurtle94/GnuDash.git
   cd GnuDash/app
   docker build -t gnudash .
   docker run -d -p 8080:80 --restart unless-stopped --name gnudash gnudash
   ```
3. Open `http://YOUR-NAS-IP:8080`

To update: `cd /volume1/docker/GnuDash && git pull && cd app && docker build -t gnudash . && docker stop gnudash && docker rm gnudash && docker run -d -p 8080:80 --restart unless-stopped --name gnudash gnudash`

---

## Any Static Host

If your host isn't listed above, the process is the same:

1. Build the site: `cd app && npm install && NEXT_OUTPUT=export npm run build`
2. Upload the contents of `app/out/` to your host
3. Configure your server to set the two required headers (COOP and COEP)
4. Ensure your server serves `index.html` for client-side routes (SPA fallback)

If you can't set custom headers (e.g. GitHub Pages), the app will still load but file uploads will fail because `SharedArrayBuffer` won't be available.

---

## Self-hosted Server (Postgres) backend

The Server backend runs your book against a Postgres database you control, so the same data is reachable from every browser that can reach the server. Every write is applied to a local SQLite WASM cache first (keeps the dashboard fast) and round-tripped to Postgres before the UI shows the "saved" state. Credentials are persisted in your browser's Origin Private File System so page reloads auto-reconnect without re-prompting.

> **Build-mode dependency.** This requires the **standalone** Node.js build. A static export (nginx / Cloudflare Pages / Netlify) doesn't have the `/api/pg/*` routes and the upload screen only shows the Local tab in that mode. If you want self-hostable, cross-device access, follow the steps below; if you only want the familiar local-file dashboard, stay on the static path from the sections earlier in this guide.

### Quickstart with Docker Compose (easiest)

From the repo root:

```bash
docker compose up -d
# → gnudash on http://localhost:3000, Postgres on localhost:5432
```

Compose builds the app from the included `Dockerfile.standalone`, starts a `postgres:16-alpine` container, waits for it to be healthy, and runs the app. Open http://localhost:3000 and pick the **Server (Postgres)** tab on the upload screen. Defaults match compose:

```
host=localhost  port=5432  user=gnudash  password=gnudash  database=gnudash
book id=default
```

Drop a `.gnucash` file to bootstrap the book and you're in.

**Overrides before first `up`** (or in a `.env` next to `docker-compose.yml`):

| env var | default | purpose |
|---|---|---|
| `POSTGRES_USER` | `gnudash` | DB role name |
| `POSTGRES_PASSWORD` | `gnudash` | DB password (change for anything non-toy) |
| `POSTGRES_DB` | `gnudash` | DB name |
| `POSTGRES_PORT` | `5432` | Host-side port mapping |
| `GNUDASH_PORT` | `3000` | Host-side port for the app |

### Running only Postgres (dev-server against it)

If you'd rather point `npm run dev` at a containerised Postgres:

```bash
docker compose up -d postgres
cd app && npm install && npm run dev
```

Dev mode includes the API routes and hot-reloads on source changes.

### Running without Docker

```bash
cd app
npm install
npm run build          # produces app/.next/standalone/server.js
node .next/standalone/server.js
```

You'll need Postgres reachable separately — install locally, rent a managed instance, or point at an existing one.

### Reverse proxy + TLS (required for any non-localhost deployment)

The browser posts the Postgres password in each request body, so the app **must** sit behind TLS unless it's on localhost. Minimal nginx example:

```nginx
server {
  listen 443 ssl http2;
  server_name gnudash.example.com;

  ssl_certificate     /etc/letsencrypt/live/gnudash.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/gnudash.example.com/privkey.pem;

  # Cross-Origin-* headers so SharedArrayBuffer works (SQLite WASM needs it).
  add_header Cross-Origin-Opener-Policy "same-origin" always;
  add_header Cross-Origin-Embedder-Policy "require-corp" always;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # File imports can be large — raise this from the nginx default of 1m.
    client_max_body_size 200m;
  }
}
```

Caddy is even simpler — it handles certs automatically:

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

If the app is on the open internet, consider also putting it behind an auth reverse proxy (oauth2-proxy, Authelia, Cloudflare Access) so the login to your Postgres isn't just a password field on a public form.

### Pointing gnudash at an existing GnuCash desktop database (read-only)

If you already have a GnuCash book saved to Postgres, you can load it in gnudash without re-importing:

1. On the Server tab, choose **Existing GnuCash database (read-only)**.
2. Fill in the connection fields and set `schema` to whatever GnuCash desktop writes to (usually `public`).
3. Connect — gnudash shows a persistent amber banner and every edit affordance is disabled.

**Close GnuCash desktop before you load the book here.** gnudash doesn't take the DBI session lock, so concurrent access between the two apps can corrupt data. The read-only mode is a safety rail, not an interlock.

### Storage model

Each gnudash-managed book lives in its own Postgres schema named `book_{bookId}` (default: `book_default`). Tables in the schema mirror GnuCash's own layout but are **not byte-for-byte identical**: we only declare the columns the gnudash engine reads or writes, and the NOT NULL policy is deliberately looser so real `.gnucash` imports don't fail. That's why the "existing GnuCash database" path is read-only — write-through to a foreign schema requires column-discovery logic we haven't shipped yet.

### Troubleshooting

- **"Invalid schema name" on Connect.** The `book id` / `schema` field accepts only `[a-z][a-z0-9_]*`, up to 63 chars. `public`, `book_alice`, `default` all work; hyphens, uppercase, semicolons don't.
- **Import fails on `column "X" does not exist`.** You're hitting a column our PG DDL doesn't declare on import. Expected to be drift-proof as of PR 82 (we filter source columns); if you see a new one, file an issue with the GnuCash file's schema (`sqlite3 file.gnucash ".schema <tablename>"`).
- **"SharedArrayBuffer is not defined" in the console.** Your reverse proxy isn't serving the COOP/COEP headers. See the nginx / Caddy snippets above.
- **"Connection refused" on Connect with Compose.** Inside Docker use `host=postgres`; from a browser hitting the exposed port use `host=localhost`. If you changed `POSTGRES_PORT`, use that port, not 5432.
- **Data looks stale after a server restart.** OPFS caches the last dump; reload the page to re-fetch from Postgres.
