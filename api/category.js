// api/category.js — GET /api/category?slug=hindi&page=1
// Edge runtime

export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scraper.js';
import { parseCategoryPage } from '../lib/parser.js';
import { apiOk, apiError } from '../lib/formatter.js';
import cfg from '../src/config.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json(apiError('Method not allowed', 405), { status: 405 });
  }

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug') || '';
  const pageNum = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  if (!slug.trim()) {
    return Response.json(apiError('Missing query param: slug', 400), { status: 400 });
  }

  try {
    const path = pageNum > 1
      ? `/category/${slug}/page/${pageNum}/`
      : `/category/${slug}/`;
    const html = await fetchPage(path);
    const data = parseCategoryPage(html);

    return Response.json(apiOk(data, { category: slug, page: pageNum }), {
      status: 200,
      headers: { 'Cache-Control': cfg.CACHE_CONTROL },
    });
  } catch (err) {
    console.error('[/api/category]', err.message);
    return Response.json(apiError(err.message), { status: 500 });
  }
}
