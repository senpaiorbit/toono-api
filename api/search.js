// api/search.js — GET /api/search?q=naruto&page=1
//
// Scrapes toono.app search results page

import { fetchPage } from '../lib/scraper.js';
import { parseSearchPage } from '../lib/parser.js';
import { apiResponse, apiError } from '../lib/formatter.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json(apiError('Method not allowed', 405));
  }

  const { q, page = '1' } = req.query;

  if (!q || !q.trim()) {
    return res.status(400).json(apiError('Missing query param: q', 400));
  }

  try {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const encoded = encodeURIComponent(q.trim());

    // toono.app uses /?s=query or /search/query/ structure
    const path = pageNum > 1
      ? `/search/${encoded}/page/${pageNum}/`
      : `/?s=${encoded}`;

    const html = await fetchPage(path);
    const data = parseSearchPage(html);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    return res.status(200).json(apiResponse(data, { query: q.trim(), page: pageNum }));
  } catch (err) {
    console.error('[/api/search]', err.message);
    return res.status(500).json(apiError(err.message));
  }
}
