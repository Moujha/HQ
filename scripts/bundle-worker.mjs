// Bundles dist/server/server.js into a single Cloudflare Pages _worker.js.
// Only node:* built-ins are left external — Cloudflare Pages provides them via
// the "nodejs_compat" compatibility flag (must be enabled in CF Pages settings).
import { build } from "esbuild";

await build({
  entryPoints: ["dist/server/server.js"],
  bundle: true,
  format: "esm",
  outfile: "dist/client/_worker.js",
  platform: "node",
  target: "es2022",
  // Only leave Node.js built-ins external; everything else gets bundled.
  external: ["node:async_hooks", "node:stream", "node:stream/web", "node:buffer", "node:util", "node:events", "node:path", "node:url", "node:fs", "node:os", "node:crypto"],
  minify: true,
  logLevel: "info",
});

console.log("✓ dist/client/_worker.js ready for Cloudflare Pages");
console.log("  Remember: enable 'nodejs_compat' in Cloudflare Pages settings!");
