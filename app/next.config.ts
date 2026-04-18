import type { NextConfig } from "next";

// Default build target is the standalone Node.js server, which the Postgres
// backend (issue #48) needs for its API routes. Set `NEXT_OUTPUT=export` at
// build time to produce the legacy static `out/` bundle for nginx / Cloudflare
// Pages / Netlify / any other host that serves pure static files. Static
// export does NOT support the Postgres backend — see docs/deployment.md.
const output: NextConfig["output"] =
  process.env.NEXT_OUTPUT === "export" ? "export" : "standalone";

const nextConfig: NextConfig = {
  output,
  // better-sqlite3 is a native module and `pg` pulls in optional native bits
  // (pg-native). Keep them as external commonjs requires at runtime instead
  // of letting the bundler try to inline them — both are only used by the
  // Server-backend API routes (/api/pg/*) under Node, never in the browser.
  serverExternalPackages: ["better-sqlite3", "pg"],
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
