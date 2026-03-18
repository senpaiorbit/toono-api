// ============================================================
//  lib/utils.ts  –  Pure helper functions (no side-effects)
// ============================================================

import { CONFIG } from "../config.js";

// ── URL helpers ───────────────────────────────────────────────

/** Resolve a path against BASE_URL, safely. */
export function resolveUrl(path: string): string {
  if (path.startsWith("http")) return path;
  return `${CONFIG.BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
}

/** Extract the slug from a full episode/series URL.
 *  e.g. "https://toono.app/episode/foo-1x1/" → "foo-1x1"
 */
export function slugFromUrl(url: string): string {
  return url.replace(/\/$/, "").split("/").pop() ?? "";
}

/** Parse season & episode numbers from a slug like "show-name-1x5".
 *  Returns null if pattern not found.
 */
export function parseSeasonEpisode(
  slug: string
): { season: number; episode: number } | null {
  const match = slug.match(/(\d+)x(\d+)$/);
  if (!match) return null;
  return { season: parseInt(match[1], 10), episode: parseInt(match[2], 10) };
}

/** Build a TMDB image URL from a partial path like "/abc.jpg". */
export function tmdbImg(path: string, size = "w342"): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return `${CONFIG.TMDB_IMG_BASE}/${size}${path}`;
}

// ── String/HTML helpers ───────────────────────────────────────

/** Decode HTML entities (&amp; → & etc.) */
export function decodeHtml(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

/** Strip ALL HTML tags from a string. */
export function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, "").trim();
}

/** Return the first regex match group or null. */
export function matchOne(
  html: string,
  pattern: RegExp
): string | null {
  const m = html.match(pattern);
  return m ? (m[1] ?? null) : null;
}

/** Return ALL regex matches (all groups[1]) for a global pattern. */
export function matchAll(html: string, pattern: RegExp): string[] {
  const results: string[] = [];
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g");
  while ((m = re.exec(html)) !== null) {
    results.push(m[1]);
  }
  return results;
}

// ── Fetch helpers ─────────────────────────────────────────────

/** Fetch HTML from a URL with proper headers. Throws on non-2xx. */
export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: CONFIG.HEADERS as Record<string, string>,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return res.text();
}

// ── Response helpers ──────────────────────────────────────────

export function okResponse<T>(data: T): Response {
  return new Response(
    JSON.stringify({ success: true, data, scrapedAt: new Date().toISOString() }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

export function errResponse(message: string, status = 500): Response {
  return new Response(
    JSON.stringify({ success: false, error: message, scrapedAt: new Date().toISOString() }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}
