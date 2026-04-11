// api/home.js — GET /api/home

import { fetchPage } from '../lib/scraper.js';
import { parseHomePage } from '../lib/parser.js';
import { apiOk, apiError } from '../lib/formatter.js';
import cfg from '../src/config.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json(apiError('Method not allowed', 405));
  try {
    const html = await fetchPage(cfg.PATHS.home);
    const data = parseHomePage(html);
    res.setHeader('Cache-Control', cfg.CACHE_CONTROL);
    return res.status(200).json(apiOk(data));
  } catch (err) {
    console.error('[/api/home]', err.message);
    return res.status(500).json(apiError(err.message));
  }
}
