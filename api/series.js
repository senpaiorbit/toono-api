// api/series.js
// GET /api/series                    → list  (?page=N)
// GET /api/series?slug=<slug>        → detail with seasons + episodes
// GET /api/series?category=<slug>    → category filter (?page=N)

import { fetchPage } from '../lib/scraper.js';
import { parseListPage, parseSeriesDetailPage } from '../lib/parser.js';
import { apiOk, apiError } from '../lib/formatter.js';
import cfg from '../src/config.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json(apiError('Method not allowed', 405));
  const { slug, page = '1', category } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  try {
    let html, data, path;
    if (slug) {
      path = `/series/${slug}/`;
      html = await fetchPage(path);
      data = parseSeriesDetailPage(html);
    } else if (category) {
      path = pageNum > 1 ? `/category/${category}/page/${pageNum}/` : `/category/${category}/`;
      html = await fetchPage(path);
      data = parseListPage(html);
    } else {
      path = pageNum > 1 ? `/series/page/${pageNum}/` : `/series/`;
      html = await fetchPage(path);
      data = parseListPage(html);
    }
    res.setHeader('Cache-Control', cfg.CACHE_CONTROL);
    return res.status(200).json(apiOk(data, { slug: slug || null, page: pageNum }));
  } catch (err) {
    console.error('[/api/series]', err.message);
    return res.status(500).json(apiError(err.message));
  }
}
