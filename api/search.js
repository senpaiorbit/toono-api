// api/search.js — GET /api/search?q=naruto&page=1

import { fetchPage } from '../lib/scraper.js';
import { parseSearchPage } from '../lib/parser.js';
import { apiOk, apiError } from '../lib/formatter.js';
import cfg from '../src/config.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json(apiError('Method not allowed', 405));
  const { q = '', page = '1' } = req.query;
  if (!q.trim()) return res.status(400).json(apiError('Missing query param: q', 400));
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  try {
    const path = pageNum > 1
      ? `/search/${encodeURIComponent(q.trim())}/page/${pageNum}/`
      : `/search/${encodeURIComponent(q.trim())}/`;
    const html = await fetchPage(path);
    const data = parseSearchPage(html);
    res.setHeader('Cache-Control', cfg.CACHE_CONTROL);
    return res.status(200).json(apiOk(data, { query: q.trim(), page: pageNum }));
  } catch (err) {
    console.error('[/api/search]', err.message);
    return res.status(500).json(apiError(err.message));
  }
}
