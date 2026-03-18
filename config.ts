// ============================================================
//  config.ts  –  Central configuration for the Toono scraper
// ============================================================

export const CONFIG = {
  // Base URL of the site being scraped
  BASE_URL: "https://toono.app",

  // TMDB image CDN base (used for poster/episode thumbnails)
  TMDB_IMG_BASE: "https://image.tmdb.org/t/p",

  // Request headers sent with every fetch to avoid bot-detection
  HEADERS: {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    Accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Cache-Control": "no-cache",
  },

  // Route prefixes used by the site
  ROUTES: {
    episode: "/episode/",   // e.g. /episode/the-angel-next-door-spoils-me-rotten-1x1/
    series:  "/series/",    // e.g. /series/the-angel-next-door-spoils-me-rotten/
    movies:  "/movies/",
  },

  // TMDB image sizes
  IMG_SIZES: {
    poster:    "w342",
    thumb:     "w185",
    season:    "w92",
  },
} as const;

export type Config = typeof CONFIG;
