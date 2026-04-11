// api/home.js — GET /api/home
// Edge runtime — lib/* uses Node-compatible globals available on Vercel Edge

export const config = { runtime: 'edge' };

import { fetchPage } from '../lib/scraper.js';
import { parseHomePage } from '../lib/parser.js';
import { apiOk, apiError } from '../lib/formatter.js';
import cfg from '../src/config.js';

export default async function handler(req) {
  if (req.method !== 'GET') {
    return Response.json(apiError('Method not allowed', 405), { status: 405 });
  }
  try {
    const html = await fetchPage(cfg.PATHS.home);
    const data = parseHomePage(html);
    return Response.json(apiOk(data), {
      status: 200,
      headers: { 'Cache-Control': cfg.CACHE_CONTROL },
    });
  } catch (err) {
    console.error('[/api/home]', err.message);
    return Response.json(apiError(err.message), { status: 500 });
  }
}
