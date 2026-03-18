// ============================================================
//  api/search.ts  –  GET /api/search?q=<query>
//                    GET /api/search?category=hindi&page=2
// ============================================================
//  Scrapes the site's search results page or a category listing.
// ============================================================

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { CONFIG } from "../config.js";
import { fetchHtml, matchAll, matchOne, decodeHtml, stripTags } from "../lib/utils.js";

interface SearchResult {
  title: string;
  url: string;
  slug: string;
  thumbnail: string | null;
  year: string | null;
  rating: string | null;
  language: string | null;
}

function scrapeListingPage(html: string): SearchResult[] {
  const results: SearchResult[] = [];

  // Each post card  <article class="post ...">
  const articles = html.split(/<article\s+class="post/).slice(1);

  for (const article of articles) {
    // URL and slug from <a href="...">
    const url = matchOne(article, /href="(https:\/\/toono\.app\/(?:episode|series|movies)\/[^"]+)"/) ?? "";
    if (!url) continue;

    const slug = url.replace(/\/$/, "").split("/").pop() ?? "";

    // Title
    const titleRaw = matchOne(article, /class="entry-title"[^>]*>([\s\S]*?)<\//) ?? "";
    const title = decodeHtml(stripTags(titleRaw)).trim();

    // Thumbnail
    const thumb = matchOne(article, /<img[^>]*src="([^"]+)"[^>]*loading="lazy"/);

    // Year
    const year = matchOne(article, /<span class="year">([^<]+)<\/span>/);

    // Rating
    const rating = matchOne(article, /<span class="rating[^"]*"><span>([^<]+)<\/span>/);

    // Language tag overlay
    const lang = matchOne(article, /<div class="language-tags">([^<]+)<\/div>/);

    results.push({ title, url, slug, thumbnail: thumb ?? null, year: year ?? null, rating: rating ?? null, language: lang?.trim() ?? null });
  }

  return results;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const { q, category, page = "1" } = req.query as Record<string, string>;

  let targetUrl: string;

  if (q) {
    // WordPress search
    targetUrl = `${CONFIG.BASE_URL}/?s=${encodeURIComponent(q)}&paged=${page}`;
  } else if (category) {
    // Category page e.g. /category/hindi/page/2/
    targetUrl = `${CONFIG.BASE_URL}/category/${encodeURIComponent(category)}/page/${page}/`;
  } else {
    return res.status(400).json({
      success: false,
      error: "Provide ?q= for search or ?category= for category listing",
    });
  }

  try {
    const html = await fetchHtml(targetUrl);
    const results = scrapeListingPage(html);

    return res.status(200).json({
      success: true,
      data: { results, page: parseInt(page, 10), query: q ?? null, category: category ?? null },
      scrapedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return res.status(500).json({ success: false, error: msg });
  }
}
