// src/config.js — Central configuration for toono scraper

const config = {
  // Base URL of the target site
  BASE_URL: 'https://toono.app',

  // Default fetch headers to mimic a real browser
  HEADERS: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
  },

  // Cache-Control header sent on API responses (Vercel CDN cache)
  CACHE_CONTROL: 's-maxage=60, stale-while-revalidate=120',

  // TMDB image base — sizes used by the site: w92, w185, w342, w780, w1280
  TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p',
  DEFAULT_POSTER_SIZE: 'w342',
  DEFAULT_BACKDROP_SIZE: 'w1280',
  DEFAULT_THUMB_SIZE: 'w185',

  // URL path patterns
  PATHS: {
    home: '/',
    series: '/series/',
    movies: '/movies/',
    search: '/search/', // ?q= or /?s=
    episode: '/episode/',
    category: '/category/',
  },

  // Number of related items to return
  RELATED_LIMIT: 12,
};

export default config;
