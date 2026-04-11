// src/config.js — Central configuration for toono scraper

const config = {
  BASE_URL: 'https://toono.app',

  HEADERS: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Cache-Control': 'no-cache',
  },

  CACHE_CONTROL: 's-maxage=60, stale-while-revalidate=120',

  TMDB_IMAGE_BASE: 'https://image.tmdb.org/t/p',
  DEFAULT_POSTER_SIZE: 'w342',
  DEFAULT_BACKDROP_SIZE: 'w1280',
  DEFAULT_THUMB_SIZE: 'w185',

  PATHS: {
    home: '/',
    series: '/series/',
    movies: '/movies/',
    search: '/search/',
    episode: '/episode/',
    category: '/category/',
  },

  RELATED_LIMIT: 12,
};

export default config;
