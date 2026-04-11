// api/movies.js — Edge runtime
// GET /api/movies                    → list  (?page=N)
// GET /api/movies?slug=<slug>        → detail with player tabs
// GET /api/movies?category=<slug>    → category filter (?page=N)

export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scraper.js';
import { parseListPage, parseMovieDetailPage } from '../lib/parser.js';
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
      html = await fetchPage(`/movies/${slug}/`);
      data = parseMovieDetailPage(html);
    } else if (category) {
      const path = pageNum > 1
        ? `/category/${category}/page/${pageNum}/`
        : `/category/${category}/`;
      html = await fetchPage(path);
      data = parseListPage(html);
    } else {
      const path = pageNum > 1 ? `/movies/page/${pageNum}/` : `/movies/`;
      html = await fetchPage(path);
      data = parseListPage(html);
    }

    return Response.json(apiOk(data, { slug: slug || null, page: pageNum }), {
      status: 200,
      headers: { 'Cache-Control': cfg.CACHE_CONTROL },
    });
  } catch (err) {
    console.error('[/api/movies]', err.message);
    return Response.json(apiError(err.message), { status: 500 });
  }
}
