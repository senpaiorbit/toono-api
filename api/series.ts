// ============================================================
//  api/series.ts  –  GET /api/series?url=<series-url>
//                    GET /api/series?slug=<slug>
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CONFIG } from "../config.js";
import { fetchHtml } from "../lib/utils.js";
import { scrapeMeta, scrapeSeasons } from "../lib/scraper.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { url, slug } = req.query as Record<string, string>;

  let targetUrl: string;

  if (url) {
    targetUrl = url;
  } else if (slug) {
    targetUrl = `${CONFIG.BASE_URL}${CONFIG.ROUTES.series}${slug}/`;
  } else {
    return res.status(400).json({
      success: false,
      error: "Provide ?url= or ?slug= query param",
    });
  }

  try {
    const html = await fetchHtml(targetUrl);

    return res.status(200).json({
      success: true,
      data: {
        meta:    scrapeMeta(html),
        seasons: scrapeSeasons(html),
      },
      scrapedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}
