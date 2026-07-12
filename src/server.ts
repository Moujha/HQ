import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!body.includes('"unhandled":true') || !body.includes('"message":"HTTPError"')) {
    return response;
  }

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

type CloudflareEnv = {
  ASSETS?: { fetch: (req: Request) => Promise<Response> };
  [key: string]: unknown;
};

export default {
  async fetch(request: Request, env: CloudflareEnv, ctx: unknown) {
    // Cloudflare Workers don't populate process.env from the Pages dashboard.
    // Copy string bindings into process.env so existing code using process.env works.
    if (env && typeof env === "object") {
      for (const [key, value] of Object.entries(env)) {
        if (typeof value === "string") process.env[key] = value;
      }
    }

    // In Cloudflare Pages Advanced Mode, static assets are NOT served automatically.
    // Try the ASSETS binding first; fall through to SSR only on 404.
    if (env.ASSETS) {
      try {
        const assetResponse = await env.ASSETS.fetch(request.clone());
        if (assetResponse.status !== 404) return assetResponse;
      } catch {
        // not a static asset — continue to SSR
      }
    }

    try {
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      // DEBUG: expose raw 500 body so we can see the actual error
      if (response.status >= 500) {
        const body = await response.clone().text();
        console.error("SSR 500 body:", body);
        return new Response(`<pre>SSR ERROR\n${body}</pre>`, {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        });
      }
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error("WORKER CATCH:", error);
      const msg = error instanceof Error ? `${error.message}\n${error.stack}` : String(error);
      return new Response(`<pre>WORKER ERROR\n${msg}</pre>`, {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
