// api/category.js — GET /api/category?slug=hindi&page=1

import { fetchPage } from '../lib/scraper.js';
import { parseCategoryPage } from '../lib/parser.js';
import { apiOk, apiError } from '../lib/formatter.js';
import cfg from '../src/config.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json(apiError('Method not allowed', 405));
  const { slug = '', page = '1' } = req.query;
  if (!slug.trim()) return res.status(400).json(apiError('Missing query param: slug', 400));
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  try {
    const path = pageNum > 1
      ? `/category/${slug}/page/${pageNum}/`
      : `/category/${slug}/`;
    const html = await fetchPage(path);
    const data = parseCategoryPage(html);
    res.setHeader('Cache-Control', cfg.CACHE_CONTROL);
    return res.status(200).json(apiOk(data, { category: slug, page: pageNum }));
  } catch (err) {
    console.error('[/api/category]', err.message);
    return res.status(500).json(apiError(err.message));
  }
}
