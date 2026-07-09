import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

// Cron endpoint: called on a schedule to scrape the web for fresh
// Meryl / Maison Caviar mentions and import them into the News section.
// Authenticated with a dedicated, server-only CRON_SECRET (never shipped to
// the client) passed in the `x-cron-secret` header.
export const Route = createFileRoute("/api/public/hooks/scrape-news")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Authenticate with a dedicated, server-only cron secret. The Supabase
        // anon/publishable key is intentionally public (shipped in the client
        // bundle) and provides no real access control, so it must NOT be used
        // to gate this costly Firecrawl scraping endpoint.
        const provided =
          request.headers.get("x-cron-secret") ??
          request.headers.get("authorization")?.replace("Bearer ", "");

        const expected = process.env.CRON_SECRET;

        const isAuthorized = (() => {
          if (!expected || !provided) return false;
          const a = Buffer.from(provided);
          const b = Buffer.from(expected);
          if (a.length !== b.length) return false;
          return timingSafeEqual(a, b);
        })();


        if (!isAuthorized) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { scrapeArtistNews } = await import(
            "@/lib/news-scraper.server"
          );
          const result = await scrapeArtistNews();
          return new Response(JSON.stringify({ success: true, ...result }), {
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          console.error("scrape-news failed:", e);
          return new Response(
            JSON.stringify({ success: false, error: String(e?.message ?? e) }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
