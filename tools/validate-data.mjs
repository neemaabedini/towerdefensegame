#!/usr/bin/env node
/**
 * CD-56: run the data contract (`validateLevels`) at build time.
 *
 * tsc cannot catch `as unknown as` JSON casts; this loads the same TS
 * module the game boots with (via Vite SSR) and fails non-zero on error
 * so `npm run build` never ships broken content.
 *
 *   node tools/validate-data.mjs
 *   npm run validate
 */
import { createServer } from "vite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const server = await createServer({
  root,
  logLevel: "error",
  server: { middlewareMode: true },
  appType: "custom",
});

try {
  const mod = await server.ssrLoadModule("/src/data/validate.ts");
  if (typeof mod.validateLevels !== "function") {
    throw new Error("src/data/validate.ts did not export validateLevels");
  }
  mod.validateLevels();
  console.log("validateLevels: ok");
} catch (err) {
  console.error("validateLevels failed:");
  console.error(err);
  process.exitCode = 1;
} finally {
  await server.close();
}
