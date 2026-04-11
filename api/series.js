// api/series.js — Edge runtime
// GET /api/series                    → list  (?page=N)
// GET /api/series?slug=<slug>        → detail with seasons + episodes
// GET /api/series?category=<slug>    → category filter (?page=N)

export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scraper.js';
import { parseListPage, parseSeriesDetailPage } from '../lib/parser.js';
import { apiOk, apiError } from '../lib/formatter.js';
import cfg from '../src/config.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json(apiError('Method not allowed', 405), { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug') || '';
  const category = searchParams.get('category') || '';
  const pageNum = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  try {
    let html, data;

    if (slug) {
      html = await fetchPage(`/series/${slug}/`);
      data = parseSeriesDetailPage(html);
    } else if (category) {
      const path = pageNum > 1
        ? `/category/${category}/page/${pageNum}/`
        : `/category/${category}/`;
      html = await fetchPage(path);
      data = parseListPage(html);
    } else {
      const path = pageNum > 1 ? `/series/page/${pageNum}/` : `/series/`;
      html = await fetchPage(path);
      data = parseListPage(html);
    }

    return Response.json(apiOk(data, { slug: slug || null, page: pageNum }), {
      status: 200,
      headers: { 'Cache-Control': cfg.CACHE_CONTROL },
    });
  } catch (err) {
    console.error('[/api/series]', err.message);
    return Response.json(apiError(err.message), { status: 500 });
  }
}
