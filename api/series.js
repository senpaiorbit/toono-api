// api/series.js — GET /api/series  |  GET /api/series?slug=jujutsu-kaisen
//
// Without slug  → scrapes /series/ list (paginated via ?page=N)
// With slug     → scrapes /series/{slug}/ detail with seasons + episodes

import { fetchPage } from '../lib/scraper.js';
import { parseSeriesListPage, parseSeriesDetailPage } from '../lib/parser.js';
import { apiResponse, apiError } from '../lib/formatter.js';

export const config = { runtime: 'nodejs18.x' };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json(apiError('Method not allowed', 405));
  }

  const { slug, page = '1', category } = req.query;

  try {
    let html, data;

    if (slug) {
      // ── Detail page ─────────────────────────────────────────────────
      html = await fetchPage(`/series/${slug}/`);
      data = parseSeriesDetailPage(html);
    } else if (category) {
      // ── Category filter e.g. ?category=hindi ────────────────────────
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const path = pageNum > 1
        ? `/category/${category}/page/${pageNum}/`
        : `/category/${category}/`;
      html = await fetchPage(path);
      data = parseSeriesListPage(html);
    } else {
      // ── List / archive page ─────────────────────────────────────────
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const path = pageNum > 1 ? `/series/page/${pageNum}/` : `/series/`;
      html = await fetchPage(path);
      data = parseSeriesListPage(html);
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(apiResponse(data, { slug: slug || null, page: parseInt(page, 10) || 1 }));
  } catch (err) {
    console.error('[/api/series]', err.message);
    return res.status(500).json(apiError(err.message));
  }
}
