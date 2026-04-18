import type { NextConfig } from "next";

/**
 * Build mode — selected via the BUILD_MODE env var, defaulting to local.
 *   - local  → static export (output: "export"), OPFS-only, no API routes.
 *              Deploys to Cloudflare Pages, nginx, etc.
 *   - server → full Next.js server with API routes enabled.
 *              Deploys to Docker, Coolify, etc. Required for Postgres books.
 *
 * See docs/architecture/storage-adapters.md §1 and §9 for the mode split.
 */
const buildMode = process.env.BUILD_MODE === "server" ? "server" : "local";
const isLocal = buildMode === "local";
const isServer = buildMode === "server";

const nextConfig: NextConfig = {
  // Static export only applies to `next build`; `next dev` ignores this flag,
  // so dev mode works the same regardless of the target build mode.
  output: isLocal ? "export" : undefined,
  // Exposed to the client bundle so factories can tree-shake server-only code.
  env: {
    NEXT_PUBLIC_SERVER_MODE: isServer ? "1" : "",
  },
  images: {
    unoptimized: true,
  },
  turbopack: {},
  // Exclude test directories from webpack's file watcher to reduce open file
  // descriptors during development (helps avoid EMFILE on Linux with low ulimits).
  // Note: Turbopack does not currently support watch exclusions — if you hit
  // "Too many open files" with Turbopack, increase your OS file descriptor
  // limit instead (see docs/deployment.md).
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: ["**/__tests__/**", "**/__snapshots__/**", "**/fixtures/**"],
    };
    return config;
  },
  // Active during `npm run dev`; ignored during static export
  headers: async () => [
    {
      source: "/(.*)",
      headers: [
        { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; worker-src 'self' blob:; connect-src 'self' ws:; object-src 'none'; base-uri 'self'; form-action 'self'" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      ],
    },
  ],
};

export default nextConfig;
