import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
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
