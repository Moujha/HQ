// Bundles dist/server/server.js into a single Cloudflare Pages _worker.js.
// Only node:* built-ins are left external — Cloudflare Pages provides them via
// the "nodejs_compat" compatibility flag (must be enabled in CF Pages settings).
//
// The banner below polyfills `require()` for CJS packages that do dynamic
// require("util") etc. — CF Workers don't define `require` globally even with
// nodejs_compat, so esbuild's __require shim throws without this.
import { build } from "esbuild";

const CF_NODE_MODULES = [
  "assert", "async_hooks", "buffer", "crypto", "events", "os", "path",
  "perf_hooks", "querystring", "stream", "string_decoder", "timers", "url",
  "util", "zlib",
];

const bannerImports = CF_NODE_MODULES.map((m, i) => `import * as __n${i} from "node:${m}";`).join("\n");
const bannerMap = CF_NODE_MODULES.map((m, i) => `"${m}":__n${i},"node:${m}":__n${i}`).join(",");
const banner = `${bannerImports}\nconst __cfNodeMap={${bannerMap}};\nvar require=function(id){var m=__cfNodeMap[id];if(m!==undefined)return m;throw new Error('Dynamic require of "'+id+'" is not supported');};`;

await build({
  entryPoints: ["dist/server/server.js"],
  bundle: true,
  format: "esm",
  outfile: "dist/client/_worker.js",
  platform: "node",
  target: "es2022",
  // Only leave Node.js built-ins external; everything else gets bundled.
  external: ["node:async_hooks", "node:stream", "node:stream/web", "node:buffer", "node:util", "node:events", "node:path", "node:url", "node:fs", "node:os", "node:crypto"],
  banner: { js: banner },
  minify: true,
  logLevel: "info",
});

console.log("✓ dist/client/_worker.js ready for Cloudflare Pages");
console.log("  Remember: enable 'nodejs_compat' in Cloudflare Pages settings!");
