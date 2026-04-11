// api/search.js — GET /api/search?q=naruto&page=1
// Edge runtime

export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scraper.js';
import { parseSearchPage } from '../lib/parser.js';
import { apiOk, apiError } from '../lib/formatter.js';
import cfg from '../src/config.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json(apiError('Method not allowed', 405), { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const pageNum = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  if (!q.trim()) {
    return Response.json(apiError('Missing query param: q', 400), { status: 400 });
  }

  try {
    const path = pageNum > 1
      ? `/search/${encodeURIComponent(q.trim())}/page/${pageNum}/`
      : `/search/${encodeURIComponent(q.trim())}/`;
    const html = await fetchPage(path);
    const data = parseSearchPage(html);

    return Response.json(apiOk(data, { query: q.trim(), page: pageNum }), {
      status: 200,
      headers: { 'Cache-Control': cfg.CACHE_CONTROL },
    });
  } catch (err) {
    console.error('[/api/search]', err.message);
    return Response.json(apiError(err.message), { status: 500 });
  }
}
