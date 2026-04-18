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
import { existsSync, renameSync } from "node:fs";
import { spawn } from "node:child_process";
import { platform } from "node:os";

// Park OUTSIDE src/app/ — Next scans every descendant for route handlers
// regardless of folder name, so hiding under src/app/ is not enough.
const API_DIR = "src/app/api";
const PARKED_DIR = ".api-parked-for-export";
const shouldPark = process.env.NEXT_OUTPUT === "export";

let parked = false;
if (shouldPark && existsSync(API_DIR)) {
  renameSync(API_DIR, PARKED_DIR);
  parked = true;
}

const restore = () => {
  if (parked && existsSync(PARKED_DIR)) {
    renameSync(PARKED_DIR, API_DIR);
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

// Invoke next via the local bin. `shell: true` on Windows picks the right
// extension (.cmd vs .ps1); Unix shells resolve `next` via PATH already.
const child = spawn("next", ["build"], {
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
