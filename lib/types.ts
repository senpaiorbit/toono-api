// ============================================================
//  lib/types.ts  –  All shared TypeScript interfaces / types
// ============================================================

export interface EpisodeItem {
  episodeId: string;       // term id used by the site (e.g. "47709")
  slug: string;            // URL slug (e.g. "the-angel-next-door-spoils-me-rotten-1x1")
  url: string;             // Full episode URL
  season: number;
  episode: number;
  title: string;           // Episode title e.g. "Meet the Angel"
  thumbnail: string | null;
  language: string;        // e.g. "Hindi"
}

export interface SeasonData {
  seasonNumber: number;
  posterUrl: string | null;
  episodeCount: number;
  airDate: string | null;
  episodes: EpisodeItem[];
}

export interface SeriesMeta {
  title: string;
  year: string | null;
  duration: string | null;
  rating: string | null;
  genres: string[];
  description: string;
  posterUrl: string | null;
  tags: string[];
  nextEpisodeUrl: string | null;
  prevEpisodeUrl: string | null;
  trailerYouTubeId: string | null;
}

export interface EpisodePageData {
  meta: SeriesMeta;
  currentEpisode: {
    season: number;
    episode: number;
    playerUrl: string | null;   // lazy-loaded iframe src
  };
  seasons: SeasonData[];
  downloadLinks: DownloadLink[];
}

export interface DownloadLink {
  language: string;
  encodedUrl: string;   // base64-encoded, same as data-url attr
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  scrapedAt: string;
}
