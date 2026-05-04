// Static-export build for Cloudflare Workers Sites.
//
// Next.js `output: "export"` can't include route handlers (our /api/* routes
// rely on Node `fs` and won't run on Workers anyway). So we move the api/
// directory aside, run the export, then restore it. The deployed Worker
// serves the static frontend from ./dist; the API routes still work in
// `npm run dev` locally.

import { execSync } from "node:child_process";
import { existsSync, renameSync, rmSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const apiDir = path.join(root, "src/app/api");
const stash = path.join(root, ".api-stash");

if (existsSync(stash)) {
  console.error("✗ Found leftover .api-stash — restoring before continuing.");
  if (!existsSync(apiDir)) renameSync(stash, apiDir);
  else rmSync(stash, { recursive: true, force: true });
}

let moved = false;
try {
  if (existsSync(apiDir)) {
    renameSync(apiDir, stash);
    moved = true;
  }
  rmSync(path.join(root, "dist"), { recursive: true, force: true });
  execSync("next build", { stdio: "inherit", env: { ...process.env, STATIC_EXPORT: "1" } });
} finally {
  if (moved && existsSync(stash)) renameSync(stash, apiDir);
}
