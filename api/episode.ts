// ============================================================
//  api/episode.ts  –  GET /api/episode?slug=<slug>
//                     GET /api/episode?url=<full-url>
// ============================================================

import { CONFIG } from "../config";
import { fetchHtml } from "../lib/utils";
import { scrapeEpisodePage } from "../lib/scraper";

export const config = { runtime: "nodejs" };

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const url  = searchParams.get("url");

  if (!slug && !url) {
    return json({ success: false, error: "Provide ?slug= or ?url=" }, 400);
  }

  const targetUrl = url ?? `${CONFIG.BASE_URL}${CONFIG.ROUTES.episode}${slug}/`;

  try {
    const html = await fetchHtml(targetUrl);
    const data = scrapeEpisodePage(html);
    return json({ success: true, data, scrapedAt: new Date().toISOString() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ success: false, error: message }, 500);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}
