// api/movies.js — GET /api/movies  |  GET /api/movies?slug=chainsaw-man-the-movie-reze-arc
//
// Without slug  → scrapes /movies/ list (paginated via ?page=N)
// With slug     → scrapes /movies/{slug}/ detail with player tabs

import { fetchPage } from '../lib/scraper.js';
import { parseMoviesListPage, parseMovieDetailPage } from '../lib/parser.js';
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
      // ── Movie detail page ────────────────────────────────────────────
      html = await fetchPage(`/movies/${slug}/`);
      data = parseMovieDetailPage(html);
    } else if (category) {
      // ── Category filter e.g. ?category=animation ─────────────────────
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const path = pageNum > 1
        ? `/category/${category}/page/${pageNum}/`
        : `/category/${category}/`;
      html = await fetchPage(path);
      data = parseMoviesListPage(html);
    } else {
      // ── Movies archive list ──────────────────────────────────────────
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const path = pageNum > 1 ? `/movies/page/${pageNum}/` : `/movies/`;
      html = await fetchPage(path);
      data = parseMoviesListPage(html);
    }

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(apiResponse(data, { slug: slug || null, page: parseInt(page, 10) || 1 }));
  } catch (err) {
    console.error('[/api/movies]', err.message);
    return res.status(500).json(apiError(err.message));
  }
}
