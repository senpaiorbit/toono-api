// ============================================================
//  lib/scraper.ts  –  All regex-based HTML parsing logic
// ============================================================

import type {
  EpisodePageData,
  SeriesMeta,
  SeasonData,
  EpisodeItem,
  DownloadLink,
} from "./types.js";
import { matchOne, matchAll, stripTags, decodeHtml, tmdbImg, slugFromUrl } from "./utils.js";
import { CONFIG } from "../config.js";

// ── Series/Episode Meta ───────────────────────────────────────

export function scrapeMeta(html: string): SeriesMeta {
  // Title
  const rawTitle = matchOne(html, /<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/) ?? "";
  const title = decodeHtml(stripTags(rawTitle)).trim();

  // Year
  const year = matchOne(html, /<span class="year">([\s\S]*?)<\/span>/);

  // Duration
  const duration = matchOne(html, /<span class="duration">([\s\S]*?)<\/span>/);

  // Rating
  const rating = matchOne(html, /<span class="rating[^"]*"><span>([\s\S]*?)<\/span>/);

  // Genres — grab all <a> inside entry-meta .categories
  const catBlock = matchOne(html, /<span class="categories">([\s\S]*?)<\/span>/);
  const genres = catBlock
    ? matchAll(catBlock, /aria-label="([^"]+)"/).map(decodeHtml)
    : [];

  // Description
  const descRaw = matchOne(html, /<div class="entry-content">([\s\S]*?)<\/div>/) ?? "";
  const description = decodeHtml(stripTags(descRaw)).trim();

  // Poster
  const posterPath = matchOne(
    html,
    /<aside[\s\S]*?class="post-thumbnail"[\s\S]*?<img[^>]*src="([^"]+)"/
  );

  // Tags
  const tagBlock = matchOne(html, /<div class="tagcloud">([\s\S]*?)<\/div>/);
  const tags = tagBlock
    ? matchAll(tagBlock, /rel="tag">([^<]+)<\/a>/).map(decodeHtml)
    : [];

  // Prev / Next episode links
  const nextEpisodeUrl = matchOne(
    html,
    /<a class="btn episodes__btn"[^>]*href="([^"]+)"[^>]*>[\s\S]*?Next/
  );
  const prevEpisodeUrl = matchOne(
    html,
    /href="([^"]+)"[^>]*>\s*<i class="fa-arrow-left/
  );

  // YouTube trailer ID
  const trailerSrc = matchOne(html, /data-src='https:\/\/www\.youtube\.com\/embed\/([^?']+)/);

  return {
    title,
    year: year?.trim() ?? null,
    duration: duration?.trim() ?? null,
    rating: rating?.trim() ?? null,
    genres,
    description,
    posterUrl: posterPath ?? null,
    tags,
    nextEpisodeUrl: nextEpisodeUrl ?? null,
    prevEpisodeUrl: prevEpisodeUrl ?? null,
    trailerYouTubeId: trailerSrc ?? null,
  };
}

// ── Current Episode (player) ──────────────────────────────────

export function scrapeCurrentEpisode(
  html: string
): { season: number; episode: number; playerUrl: string | null } {
  // "You are watching Season 1 Episode 1"
  const seasonNum = parseInt(
    matchOne(html, /You are watching Season\s+(\d+)/) ?? "1",
    10
  );
  const episodeNum = parseInt(
    matchOne(html, /You are watching Season\s+\d+\s+Episode\s+(\d+)/) ?? "1",
    10
  );

  // iframe lazy src
  const playerUrl = matchOne(html, /data-lazy-src="([^"]+)"[\s\S]*?id="main-player"/);

  return { season: seasonNum, episode: episodeNum, playerUrl: playerUrl ?? null };
}

// ── Season / Episode List ─────────────────────────────────────

export function scrapeSeasons(html: string): SeasonData[] {
  const seasons: SeasonData[] = [];

  // Split by season blocks  <div id="season-N" ...>
  const seasonBlocks = html.split(/<div id="season-\d+"/).slice(1);

  for (let sIdx = 0; sIdx < seasonBlocks.length; sIdx++) {
    const block = seasonBlocks[sIdx];

    // Season number from title text "Season <span>N</span>"
    const seasonNum =
      parseInt(matchOne(block, /Season\s*<span>(\d+)<\/span>/) ?? `${sIdx + 1}`, 10);

    // Season poster
    const seasonPosterPath = matchOne(block, /class="seasons-tt[^"]*"[\s\S]*?<img[^>]*src="([^"]+)"/);

    // Air date & episode count
    const metaLine = matchOne(block, /<span class="date">([\s\S]*?)<\/span>/);
    const airDate = metaLine ? metaLine.split("-").pop()?.trim() ?? null : null;
    const epCountStr = matchOne(block, /(\d+)\s+Episodes/);

    // Episodes  <li data-episode-id="...">
    const episodes: EpisodeItem[] = [];
    const liBlocks = block.split(/<li data-episode-id="/).slice(1);

    for (const li of liBlocks) {
      const episodeId = matchOne(li, /^(\d+)"/) ?? "";

      // Slug + URL from Watch button
      const episodeUrl = matchOne(li, /href="(https:\/\/toono\.app\/episode\/[^"]+)"/) ?? "";
      const slug = slugFromUrl(episodeUrl);

      // S1-E3 label
      const seLabel = matchOne(li, /<span>(S\d+-E\d+)<\/span>/);
      const seMatch = seLabel?.match(/S(\d+)-E(\d+)/);
      const season = seMatch ? parseInt(seMatch[1], 10) : seasonNum;
      const episode = seMatch ? parseInt(seMatch[2], 10) : 0;

      // Episode title (h3 after the span)
      const h3Raw = matchOne(li, /<h3 class="title">([\s\S]*?)<\/h3>/) ?? "";
      const epTitle = decodeHtml(stripTags(h3Raw)).replace(/S\d+-E\d+/, "").trim();

      // Thumbnail
      const thumbPath = matchOne(li, /<img[^>]*src="([^"]+)"[^>]*alt="[^"]*"/);

      // Language tag
      const lang = matchOne(li, /<span class="episode-lang">([^<]+)<\/span>/) ?? "Unknown";

      if (episodeId) {
        episodes.push({
          episodeId,
          slug,
          url: episodeUrl,
          season,
          episode,
          title: epTitle,
          thumbnail: thumbPath ?? null,
          language: lang.trim(),
        });
      }
    }

    seasons.push({
      seasonNumber: seasonNum,
      posterUrl: seasonPosterPath
        ? tmdbImg(seasonPosterPath, CONFIG.IMG_SIZES.season)
        : null,
      episodeCount: epCountStr ? parseInt(epCountStr, 10) : episodes.length,
      airDate: airDate ?? null,
      episodes,
    });
  }

  return seasons;
}

// ── Download Links ────────────────────────────────────────────

export function scrapeDownloadLinks(html: string): DownloadLink[] {
  const links: DownloadLink[] = [];

  // Each download row: <tr><td>...Language...</td>...<a data-url="BASE64">Download</a>
  const rows = html.split(/<tr>/).slice(2); // skip thead rows

  for (const row of rows) {
    const lang = matchOne(row, /<td><span[^>]*>([^<]+)<\/td>/) ??
                 matchOne(row, /<td>([^<]+)<\/td>/);
    const encodedUrl = matchOne(row, /data-url="([^"]+)"/);

    if (lang && encodedUrl) {
      links.push({ language: lang.trim(), encodedUrl });
    }
  }

  return links;
}

// ── Master scrape function ────────────────────────────────────

export function scrapeEpisodePage(html: string): EpisodePageData {
  return {
    meta:            scrapeMeta(html),
    currentEpisode:  scrapeCurrentEpisode(html),
    seasons:         scrapeSeasons(html),
    downloadLinks:   scrapeDownloadLinks(html),
  };
}
