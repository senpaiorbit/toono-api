// api/watch.js — GET /api/watch?slug=<episode-slug>
// Edge runtime
//
// Scrapes a single episode page from toono.app/episode/<slug>/
//
// Response data shape:
// {
//   fullTitle:       "Jujutsu Kaisen 1x1 — Hindi Watch/Download",
//   season:          1,
//   episode:         1,
//   episodeTermId:   25461,            // internal ID used in embed URL (trid)
//   watchingText:    "You are watching Season 1 Episode 1",
//   poster:          "https://image.tmdb.org/t/p/w342/...",
//   year:            2020,
//   duration:        "24m",
//   rating:          8.561,
//   categories:      [{name, url, slug}],
//   description:     "After visiting his beloved grandfather...",
//   details:         { genres: [...], ... },
//   embedUrl:        "https://toono.app/?trembed=1&trid=25461&trtype=2",
//   playerTabs:      [{language, src, srcEncoded, href}],   // multi-lang if present
//   nav:             [{url, slug, label}],                   // prev/next/list links
//   seriesUrl:       "https://toono.app/series/jujutsu-kaisen/",
//   seasons:         [ { season, thumbnail, episodeCount, date, episodes:[...] } ]
// }

export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scraper.js';
import { parseEpisodePage } from '../lib/parser.js';
import { apiOk, apiError } from '../lib/formatter.js';
import cfg from '../src/config.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json(apiError('Method not allowed', 405), { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug') || '';

  if (!slug.trim()) {
    return Response.json(apiError('Missing query param: slug', 400), { status: 400 });
  }

  try {
    const path = `/episode/${slug}/`;
    const html = await fetchPage(path);
    const data = parseEpisodePage(html);

    return Response.json(apiOk(data, { slug }), {
      status: 200,
      // Episode pages change infrequently once aired; short CDN cache is fine
      headers: { 'Cache-Control': cfg.CACHE_CONTROL },
    });
  } catch (err) {
    console.error('[/api/watch]', err.message);
    return Response.json(apiError(err.message), { status: 500 });
  }
}
