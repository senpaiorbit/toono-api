// api/category.js — GET /api/category?slug=hindi&page=1
//
// Scrapes any toono.app category archive page.
// e.g. /category/hindi/, /category/animation/, /category/crunchyroll/

import { fetchPage } from '../lib/scraper.js';
import { parseCategoryPage } from '../lib/parser.js';
import { apiResponse, apiError } from '../lib/formatter.js';

export const config = { runtime: 'nodejs18.x' };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json(apiError('Method not allowed', 405));
  }

  const { slug, page = '1' } = req.query;

  if (!slug || !slug.trim()) {
    return res.status(400).json(apiError('Missing query param: slug', 400));
  }

  try {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const path = pageNum > 1
      ? `/category/${slug}/page/${pageNum}/`
      : `/category/${slug}/`;

    const html = await fetchPage(path);
    const data = parseCategoryPage(html);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(apiResponse(data, { category: slug, page: pageNum }));
  } catch (err) {
    console.error('[/api/category]', err.message);
    return res.status(500).json(apiError(err.message));
  }
}
