// lib/formatter.js — Data normalizers used by all parsers (Node.js runtime)

import { decodeEntities, stripTags, cleanText } from './scraper.js';
import config from '../src/config.js';

/** Extract slug from any toono.app URL */
export function slugFromUrl(url = '') {
  return url.replace(/\/$/, '').split('/').filter(Boolean).pop() || '';
}

/** Decode & clean a title */
export function cleanTitle(raw = '') {
  return decodeEntities(stripTags(raw)).replace(/\s+/g, ' ').trim();
}

/** Parse rating string → float or null */
export function parseRating(raw = '') {
  const n = parseFloat(raw.trim());
  return isNaN(n) ? null : Math.round(n * 1000) / 1000;
}

/** Parse year string → int or null */
export function parseYear(raw = '') {
  const n = parseInt(raw.trim(), 10);
  return isNaN(n) ? null : n;
}

/** Normalize a TMDB image URL, optionally swap size */
export function normalizeImage(url = '', size = null) {
  if (!url) return null;
  if (size) return url.replace(/\/w\d+\//, `/${size}/`);
  return url;
}

/** Parse category/genre anchor tags into [{name, url, slug}] */
export function parseCategories(html = '') {
  const re = /<a[^>]*aria-label="([^"]+)"[^>]*href="([^"]+)"[^>]*>/gi;
  const results = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    results.push({
      name: decodeEntities(m[1]),
      url: m[2],
      slug: slugFromUrl(m[2]),
    });
  }
  return results;
}

/** Parse person anchor links into [{name, url, slug}] */
export function parsePeople(html = '') {
  const re = /<a[^>]*aria-label="([^"]+)"[^>]*href="([^"]+)"[^>]*>/gi;
  const results = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    results.push({
      name: decodeEntities(m[1]),
      url: m[2],
      slug: slugFromUrl(m[2]),
    });
  }
  return results;
}

/** Parse a details-lst <ul> → {genres:[], cast:[], director:[], ...} */
export function parseDetailsList(html = '') {
  const details = {};
  const liRe = /<li[^>]*class="rw sm"[^>]*>([\s\S]*?)<\/li>/gi;
  let li;
  while ((li = liRe.exec(html)) !== null) {
    const spans = [...li[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)];
    if (spans.length < 2) continue;
    const key = cleanText(spans[0][1]).toLowerCase();
    const valHtml = spans[1][1];
    const links = [...valHtml.matchAll(/<a[^>]*aria-label="([^"]*)"[^>]*href="([^"]*)"[^>]*>/gi)];
    details[key] = links.length
      ? links.map(([, name, url]) => ({ name: decodeEntities(name), url, slug: slugFromUrl(url) }))
      : cleanText(valHtml);
  }
  return details;
}

/**
 * Parse a single card article (.post.movies.more-info swiper-slide).
 */
export function parseCard(html = '') {
  const titleM = html.match(/<h2[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h2>/i);

  const linkM = html.match(/<a[^>]*href="(https?:\/\/toono\.app\/(?:series|movies)\/[^"]+)"[^>]*class="lnk-blk"/i)
    || html.match(/<a[^>]*class="lnk-blk"[^>]*href="(https?:\/\/toono\.app\/(?:series|movies)\/[^"]*)"/i);

  const posterM = html.match(/<div[^>]*class="post-thumbnail[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/i);

  const qualM = html.match(/<span[^>]*class="quality"[^>]*>([^<]+)<\/span>/i);
  const langM = html.match(/<span[^>]*class="language-tags"[^>]*>([^<]+)<\/span>/i);
  const yearM = html.match(/<span[^>]*class="year"[^>]*>(\d{4})<\/span>/i);

  let rating = null, duration = null, description = null, genres = [], cast = [];
  const tooltipM = html.match(/<div[^>]*class="post info"[^>]*role="tooltip"[^>]*>([\s\S]*?)<\/div>\s*<\/article>/i);
  if (tooltipM) {
    const t = tooltipM[1];
    const rM = t.match(/<span[^>]*class="rating fa-star"[^>]*><span>([^<]+)<\/span>/i);
    const dM = t.match(/<span[^>]*class="duration"[^>]*>([^<]+)<\/span>/i);
    const descM = t.match(/<div[^>]*class="entry-content"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
    const genreM = t.match(/<span>Genres<\/span><span>([\s\S]*?)<\/span>/i);
    const castM = t.match(/<span>Cast<\/span><span>([\s\S]*?)<\/span>/i);
    rating = rM ? parseRating(rM[1]) : null;
    duration = dM ? dM[1].trim() : null;
    description = descM ? cleanText(descM[1]) : null;
    genres = genreM ? parseCategories(genreM[1]) : [];
    cast = castM ? parsePeople(castM[1]) : [];
  }

  const url = linkM ? linkM[1] : null;
  return {
    title: titleM ? cleanTitle(titleM[1]) : null,
    url,
    slug: url ? slugFromUrl(url) : null,
    type: url ? (url.includes('/movies/') ? 'movie' : 'series') : null,
    poster: posterM ? normalizeImage(posterM[1]) : null,
    year: yearM ? parseYear(yearM[1]) : null,
    quality: qualM ? qualM[1].trim() : null,
    language: langM ? langM[1].trim() : null,
    rating,
    duration,
    description,
    genres,
    cast,
  };
}

/** Parse the hero slider article (.post.home.item) */
export function parseHeroSlide(html = '') {
  const titleM = html.match(/<h2[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h2>/i);
  const ratingM = html.match(/<span[^>]*class="rating fa-star"[^>]*><span>([^<]+)<\/span>/i);
  const yearM = html.match(/<span[^>]*class="year"[^>]*>(\d{4})<\/span>/i);
  const durM = html.match(/<span[^>]*class="duration"[^>]*>([^<]+)<\/span>/i);
  const catM = html.match(/<span[^>]*class="categories"[^>]*>([\s\S]*?)<\/span>/i);
  const descM = html.match(/<div[^>]*class="entry-content"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
  const linkM = html.match(/<a[^>]*href="(https?:\/\/toono\.app\/(?:series|movies)\/[^"]+)"[^>]*class="btn[^"]*fa-play/i)
    || html.match(/class="btn[^"]*fa-play[^"]*"[^>]*href="(https?:\/\/toono\.app\/(?:series|movies)\/[^"]+)"/i);
  const bgM = html.match(/class="bg"[^>]*style="background-image:\s*url\(([^)]+)\)/i);

  const url = linkM ? linkM[1] : null;
  return {
    title: titleM ? cleanTitle(titleM[1]) : null,
    rating: ratingM ? parseRating(ratingM[1]) : null,
    year: yearM ? parseYear(yearM[1]) : null,
    duration: durM ? durM[1].trim() : null,
    categories: catM ? parseCategories(catM[1]) : [],
    description: descM ? cleanText(descM[1]) : null,
    url,
    slug: url ? slugFromUrl(url) : null,
    type: url ? (url.includes('/movies/') ? 'movie' : 'series') : null,
    backdrop: bgM ? normalizeImage(bgM[1].trim(), config.DEFAULT_BACKDROP_SIZE) : null,
  };
}

/** Parse a single post page header (series or movie detail) */
export function parseSinglePostHeader(html = '') {
  const posterM = html.match(/<aside[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/i);
  const titleM = html.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i);
  const yearM = html.match(/<span[^>]*class="year"[^>]*>(\d{4})<\/span>/i);
  const durM = html.match(/<span[^>]*class="duration"[^>]*>([^<]+)<\/span>/i);
  const ratingM = html.match(/<span[^>]*class="rating fa-star"[^>]*><span>([^<]+)<\/span>/i);
  const catM = html.match(/<span[^>]*class="categories"[^>]*>([\s\S]*?)<\/span>/i);
  const seEpM = html.match(/<span[^>]*class="season-episode"[^>]*>([^<]+)<\/span>/i);
  const descM = html.match(/<div[^>]*class="entry-content"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
  const detailsM = html.match(/<ul[^>]*class="details-lst"[^>]*>([\s\S]*?)<\/ul>/i);
  const playerM = html.match(/data-lazy-src="(https?:\/\/toono\.app\/\?trembed=[^"]+)"/i);

  return {
    title: titleM ? cleanTitle(titleM[1]) : null,
    poster: posterM ? normalizeImage(posterM[1]) : null,
    year: yearM ? parseYear(yearM[1]) : null,
    duration: durM ? durM[1].trim() : null,
    rating: ratingM ? parseRating(ratingM[1]) : null,
    categories: catM ? parseCategories(catM[1]) : [],
    seasonEpisodeInfo: seEpM ? seEpM[1].trim() : null,
    description: descM ? cleanText(descM[1]) : null,
    details: detailsM ? parseDetailsList(detailsM[0]) : {},
    playerEmbedUrl: playerM ? playerM[1] : null,
  };
}

/** Build a clean API success envelope */
export function apiOk(data, meta = {}) {
  return { ok: true, ...meta, data };
}

/** Build a clean API error envelope */
export function apiError(message, status = 500) {
  return { ok: false, error: message, status };
}
