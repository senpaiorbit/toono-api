// api/home.js — GET /api/home
// Scrapes the toono.app homepage: hero slider + Series/Movies sections

import { fetchPage } from '../lib/scraper.js';
import { parseHomePage } from '../lib/parser.js';
import { apiResponse, apiError } from '../lib/formatter.js';

export const config = { runtime: 'nodejs18.x' };

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json(apiError('Method not allowed', 405));
  }

  try {
    const html = await fetchPage('/');
    const data = parseHomePage(html);

    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json(apiResponse(data));
  } catch (err) {
    console.error('[/api/home]', err.message);
    return res.status(500).json(apiError(err.message));
  }
}
