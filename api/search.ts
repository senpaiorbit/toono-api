// ============================================================
//  api/search.ts  –  GET /api/search?q=<query>
//                    GET /api/search?category=<cat>&page=<n>
// ============================================================

import { CONFIG } from "../config";
import { fetchHtml, matchOne, decodeHtml, stripTags } from "../lib/utils";

export const config = { runtime: "nodejs" };

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
  const articles = html.split(/<article\s+class="post/).slice(1);

  for (const article of articles) {
    const url = matchOne(article, /href="(https:\/\/toono\.app\/(?:episode|series|movies)\/[^"]+)"/) ?? "";
    if (!url) continue;

    const slug     = url.replace(/\/$/, "").split("/").pop() ?? "";
    const titleRaw = matchOne(article, /class="entry-title"[^>]*>([\s\S]*?)<\//) ?? "";
    const title    = decodeHtml(stripTags(titleRaw)).trim();
    const thumb    = matchOne(article, /<img[^>]*src="([^"]+)"[^>]*loading="lazy"/);
    const year     = matchOne(article, /<span class="year">([^<]+)<\/span>/);
    const rating   = matchOne(article, /<span class="rating[^"]*"><span>([^<]+)<\/span>/);
    const lang     = matchOne(article, /<div class="language-tags">([^<]+)<\/div>/);

    results.push({
      title,
      url,
      slug,
      thumbnail: thumb ?? null,
      year: year ?? null,
      rating: rating ?? null,
      language: lang?.trim() ?? null,
    });
  }

  return results;
}

export default async function handler(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const q        = searchParams.get("q");
  const category = searchParams.get("category");
  const page     = searchParams.get("page") ?? "1";

  if (!q && !category) {
    return json({ success: false, error: "Provide ?q= or ?category=" }, 400);
  }

  const targetUrl = q
    ? `${CONFIG.BASE_URL}/?s=${encodeURIComponent(q)}&paged=${page}`
    : `${CONFIG.BASE_URL}/category/${encodeURIComponent(category!)}/page/${page}/`;

  try {
    const html    = await fetchHtml(targetUrl);
    const results = scrapeListingPage(html);
    return json({
      success: true,
      data: { results, page: parseInt(page), q, category },
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
