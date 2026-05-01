#!/usr/bin/env node
/**
 * Wrapper around `next build`.
 *
 * Standalone builds (the default, used by the Server/Postgres backend) need
 * the `/api/pg/*` route handlers in src/app/api/. Static export builds
 * (NEXT_OUTPUT=export) do NOT support dynamic route handlers at all — Next.js
 * fails the build if any exist. So we park the api directory aside while the
 * export build runs, then put it back. Net effect: consumers get to keep
 * using the same `NEXT_OUTPUT=export npm run build` command from PR 1 / the
 * deployment guide without having to know about this script.
 */
import { existsSync, renameSync, cpSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { platform } from "node:os";

// Docker overlayfs returns EXDEV when renaming a path that lives in a lower
// (read-only) layer to a destination that has to be created in the upper
// layer — see issue #101. Fall back to copy-then-remove on EXDEV; keep the
// atomic rename on host filesystems where it works.
const moveDir = (src, dest) => {
  try {
    renameSync(src, dest);
  } catch (err) {
    if (err.code !== "EXDEV") throw err;
    cpSync(src, dest, { recursive: true });
    rmSync(src, { recursive: true, force: true });
  }
};

// Park OUTSIDE src/app/ — Next scans every descendant for route handlers
// regardless of folder name, so hiding under src/app/ is not enough.
const API_DIR = "src/app/api";
const PARKED_DIR = ".api-parked-for-export";
const shouldPark = process.env.NEXT_OUTPUT === "export";

// Expose the build target to the client bundle so the upload UI can hide the
// Server (Postgres) tab when the API routes aren't going to exist at runtime.
// `NEXT_PUBLIC_*` vars are inlined into the client bundle at build time by
// Next.js, so this survives the static export as a constant string.
process.env.NEXT_PUBLIC_HAS_SERVER_BACKEND = shouldPark ? "false" : "true";

let parked = false;
if (shouldPark && existsSync(API_DIR)) {
  moveDir(API_DIR, PARKED_DIR);
  parked = true;
}

const restore = () => {
  if (parked && existsSync(PARKED_DIR)) {
    moveDir(PARKED_DIR, API_DIR);
    parked = false;
  }
};

// Best-effort cleanup on interrupts so a Ctrl-C doesn't leave the repo with
// the api dir parked aside.
process.on("exit", restore);
process.on("SIGINT", () => {
  restore();
  process.exit(130);
});
process.on("SIGTERM", () => {
  restore();
  process.exit(143);
});

// Bundler selection: Next.js 16 defaults `next build` to Turbopack, but it
// panics inside containerised builds (issue #103) — the PostCSS worker spawns
// a child Node process and times out at the hard-coded 30s connect deadline,
// most reliably under rootless Podman / fuse-overlayfs and arm64 emulation.
// Webpack does not have that worker model and finishes cleanly. Default to
// webpack so `docker build` / `podman build` work out of the box; let power
// users who want Turbopack's speed opt back in with NEXT_BUILDER=turbopack.
const buildArgs = ["build"];
if (process.env.NEXT_BUILDER !== "turbopack") {
  buildArgs.push("--webpack");
}

// Invoke next via the local bin. `shell: true` on Windows picks the right
// extension (.cmd vs .ps1); Unix shells resolve `next` via PATH already.
const child = spawn("next", buildArgs, {
  stdio: "inherit",
  shell: platform() === "win32",
});

child.on("exit", (code) => {
  restore();
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  restore();
  console.error(err);
  process.exit(1);
});
