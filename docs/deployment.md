# Deployment Guide

GnuDash builds to a fully static site — just HTML, CSS, JS, and WASM files. No Node.js server, no API, no database. This means you can host it almost anywhere.

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

---

## Static Build

All production deployment methods start with the same build step:

```bash
cd app
npm install
npm run build
```

This produces a static export in `app/out/` containing everything needed to serve the site.

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
   - **Build command**: `cd app && npm install && npm run build`
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
3. Vercel will auto-detect Next.js and build it

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
   - **Build command**: `npm run build`
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
   npm run build
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
2. Clone and build:
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

1. Build the site: `cd app && npm install && npm run build`
2. Upload the contents of `app/out/` to your host
3. Configure your server to set the two required headers (COOP and COEP)
4. Ensure your server serves `index.html` for client-side routes (SPA fallback)

If you can't set custom headers (e.g. GitHub Pages), the app will still load but file uploads will fail because `SharedArrayBuffer` won't be available.
