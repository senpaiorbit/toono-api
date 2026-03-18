// ============================================================
//  api/series.ts  –  GET /api/series?slug=<slug>
//                    GET /api/series?url=<full-url>
// ============================================================

import { CONFIG } from "../config";
import { fetchHtml } from "../lib/utils";
import { scrapeMeta, scrapeSeasons } from "../lib/scraper";

export const config = { runtime: "nodejs" };

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  const url  = searchParams.get("url");

  if (!slug && !url) {
    return json({ success: false, error: "Provide ?slug= or ?url=" }, 400);
  }

  const targetUrl = url ?? `${CONFIG.BASE_URL}${CONFIG.ROUTES.series}${slug}/`;

  try {
    const html = await fetchHtml(targetUrl);
    return json({
      success: true,
      data: { meta: scrapeMeta(html), seasons: scrapeSeasons(html) },
      scrapedAt: new Date().toISOString(),
    });
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
