// ============================================================
//  api/episode.ts  –  GET /api/episode?url=<episode-url>
//                     GET /api/episode?slug=<slug>
// ============================================================
//  Query params (one required):
//    url   – full episode URL
//    slug  – slug only, e.g. "the-angel-next-door-spoils-me-rotten-1x1"
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CONFIG } from "../config.js";
import { fetchHtml, okResponse, errResponse } from "../lib/utils.js";
import { scrapeEpisodePage } from "../lib/scraper.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { url, slug } = req.query as Record<string, string>;

  let targetUrl: string;

  if (url) {
    targetUrl = url;
  } else if (slug) {
    targetUrl = `${CONFIG.BASE_URL}${CONFIG.ROUTES.episode}${slug}/`;
  } else {
    return res.status(400).json({
      success: false,
      error: "Provide ?url= or ?slug= query param",
    });
  }

  try {
    const html = await fetchHtml(targetUrl);
    const data = scrapeEpisodePage(html);

    return res.status(200).json({
      success: true,
      data,
      scrapedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}
