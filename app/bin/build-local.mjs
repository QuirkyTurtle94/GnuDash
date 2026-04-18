#!/usr/bin/env node
/**
 * Local-mode build wrapper.
 *
 * Next.js refuses to produce a static export (`output: "export"`) when the
 * app tree contains dynamic API routes. In server mode we keep those routes;
 * in local mode we need them out of the route tree for the duration of the
 * build and back afterwards.
 *
 * This wrapper:
 *  1. Moves src/app/api → .api-stash/ (no-op if api/ doesn't exist yet).
 *  2. Runs `next build` with BUILD_MODE=local.
 *  3. Restores src/app/api in a finally block so a failed build doesn't
 *     leave the working tree broken.
 *
 * Both stash and restore are idempotent: missing source = skip, no error.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const API_DIR = path.join(appRoot, "src", "app", "api");
const STASH_DIR = path.join(appRoot, ".api-stash");

function stashApi() {
  if (fs.existsSync(API_DIR)) {
    if (fs.existsSync(STASH_DIR)) {
      throw new Error(
        `.api-stash already exists at ${STASH_DIR} — likely a previous build crashed mid-stash. ` +
          `Resolve manually before rebuilding.`
      );
    }
    console.log(`[build-local] stashing api routes: ${API_DIR} → ${STASH_DIR}`);
    fs.renameSync(API_DIR, STASH_DIR);
    return true;
  }
  return false;
}

function restoreApi() {
  if (fs.existsSync(STASH_DIR)) {
    console.log(`[build-local] restoring api routes: ${STASH_DIR} → ${API_DIR}`);
    fs.renameSync(STASH_DIR, API_DIR);
  }
}

let stashed = false;
try {
  stashed = stashApi();
  execSync("next build", {
    stdio: "inherit",
    cwd: appRoot,
    env: { ...process.env, BUILD_MODE: "local" },
  });
} finally {
  if (stashed) restoreApi();
}
