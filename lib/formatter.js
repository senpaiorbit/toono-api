// lib/formatter.js — Normalize & beautify scraped data

import { decodeEntities, stripTags } from './scraper.js';

/** Extract slug from a toono.app URL */
export function slugFromUrl(url = '') {
  return url.replace(/\/$/, '').split('/').pop() || '';
}

/** Decode & clean a title string */
export function cleanTitle(raw = '') {
  return decodeEntities(stripTags(raw)).replace(/\s+/g, ' ').trim();
}

/** Clean & trim a description / excerpt */
export function cleanText(raw = '') {
  return decodeEntities(stripTags(raw))
    .replace(/\[…\]|\[&hellip;\]/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse rating string to float */
export function parseRating(raw = '') {
  const n = parseFloat(raw.trim());
  return isNaN(n) ? null : Math.round(n * 1000) / 1000;
}

/** Parse year string to integer */
export function parseYear(raw = '') {
  const n = parseInt(raw.trim(), 10);
  return isNaN(n) ? null : n;
}

/**
 * Normalize a TMDB image URL.
 * The site uses w342, w1280, w92, w185 sizes.
 * Default: keep as-is. Pass size to swap e.g. 'w500'.
 */
export function normalizeImage(url = '', size = null) {
  if (!url) return null;
  if (size) {
    return url.replace(/\/w\d+\//, `/${size}/`);
  }
  return url;
}

/** Extract categories from a list of anchor tags HTML */
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

/** Parse a details-lst <ul> into a key→value object */
export function parseDetailsList(html = '') {
  const details = {};
  const itemRe = /<li[^>]*class="rw sm"[^>]*>([\s\S]*?)<\/li>/gi;
  let item;
  while ((item = itemRe.exec(html)) !== null) {
    const spans = [...item[1].matchAll(/<span[^>]*>([\s\S]*?)<\/span>/gi)];
    if (spans.length >= 2) {
      const key = cleanText(spans[0][1]).toLowerCase();
      const rawVal = spans[1][1];
      // Try to extract multiple links
      const links = [...rawVal.matchAll(/<a[^>]*aria-label="([^"]*)"[^>]*href="([^"]*)"[^>]*>/gi)];
      if (links.length > 0) {
        details[key] = links.map(([, name, url]) => ({ name: decodeEntities(name), url, slug: slugFromUrl(url) }));
      } else {
        details[key] = cleanText(rawVal);
      }
    }
  }
  return details;
}

/**
 * Parse a card article (.post.movies.more-info) into a media object.
 * Used in home sections, trending rows, related lists, etc.
 */
export function parseCardArticle(html = '') {
  // Title from entry-header h2
  const titleM = html.match(/<h2[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h2>/i);
  const title = titleM ? cleanTitle(titleM[1]) : null;

  // Link from lnk-blk anchor
  const linkM = html.match(/<a[^>]*href="(https?:\/\/toono\.app[^"]*)"[^>]*class="lnk-blk"/i)
    || html.match(/<a[^>]*class="lnk-blk"[^>]*href="(https?:\/\/toono\.app[^"]*)"/i);
  const url = linkM ? linkM[1] : null;

  // Poster image
  const imgM = html.match(/<div[^>]*class="post-thumbnail[^"]*"[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/i);
  const poster = imgM ? normalizeImage(imgM[1]) : null;

  // Year from entry-meta span.year
  const yearM = html.match(/<span[^>]*class="year"[^>]*>(\d{4})<\/span>/i);
  const year = yearM ? parseYear(yearM[1]) : null;

  // Quality badge
  const qualM = html.match(/<span[^>]*class="quality"[^>]*>([^<]+)<\/span>/i);
  const quality = qualM ? qualM[1].trim() : null;

  // Language tag
  const langM = html.match(/<span[^>]*class="language-tags"[^>]*>([^<]+)<\/span>/i);
  const language = langM ? langM[1].trim() : null;

  // Tooltip block (more-info hover card)
  const tooltipM = html.match(/<div[^>]*class="post info"[^>]*role="tooltip"[^>]*>([\s\S]*?)<\/div>\s*<\/article>/i);
  let extra = {};
  if (tooltipM) {
    const tip = tooltipM[1];
    // rating
    const ratingM = tip.match(/<span[^>]*class="rating fa-star"[^>]*><span>([^<]+)<\/span><\/span>/i);
    const durationM = tip.match(/<span[^>]*class="duration"[^>]*>([^<]+)<\/span>/i);
    const descM = tip.match(/<div[^>]*class="entry-content"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
    const genresM = tip.match(/<li[^>]*class="rw sm"[^>]*><span>Genres<\/span><span>([\s\S]*?)<\/span><\/li>/i);
    const castM = tip.match(/<li[^>]*class="rw sm"[^>]*><span>Cast<\/span><span>([\s\S]*?)<\/span><\/li>/i);

    extra = {
      rating: ratingM ? parseRating(ratingM[1]) : null,
      duration: durationM ? durationM[1].trim() : null,
      description: descM ? cleanText(descM[1]) : null,
      genres: genresM ? parseCategories(genresM[1]) : [],
      cast: castM ? parsePeopleList(castM[1]) : [],
    };
  }

  return {
    title,
    url,
    slug: url ? slugFromUrl(url) : null,
    type: url ? (url.includes('/movies/') ? 'movie' : url.includes('/series/') ? 'series' : 'unknown') : null,
    poster,
    year,
    quality,
    language,
    ...extra,
  };
}

/** Parse a list of person anchor links */
export function parsePeopleList(html = '') {
  const re = /<a[^>]*aria-label="([^"]+)"[^>]*href="([^"]+)"[^>]*>/gi;
  const results = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    results.push({ name: decodeEntities(m[1]), url: m[2], slug: slugFromUrl(m[2]) });
  }
  return results;
}

/** Format a full hero/slider article */
export function parseHeroSlide(html = '') {
  const titleM = html.match(/<h2[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h2>/i);
  const ratingM = html.match(/<span[^>]*class="rating fa-star"[^>]*><span>([^<]+)<\/span>/i);
  const yearM = html.match(/<span[^>]*class="year"[^>]*>(\d{4})<\/span>/i);
  const durM = html.match(/<span[^>]*class="duration"[^>]*>([^<]+)<\/span>/i);
  const catM = html.match(/<span[^>]*class="categories"[^>]*>([\s\S]*?)<\/span>/i);
  const descM = html.match(/<div[^>]*class="entry-content"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
  const linkM = html.match(/<a[^>]*href="(https?:\/\/toono\.app\/(?:series|movies)\/[^"]+)"[^>]*class="btn[^"]*fa-play[^"]*"/i);
  const bgM = html.match(/background-image:\s*url\(([^)]+)\)/i);

  return {
    title: titleM ? cleanTitle(titleM[1]) : null,
    rating: ratingM ? parseRating(ratingM[1]) : null,
    year: yearM ? parseYear(yearM[1]) : null,
    duration: durM ? durM[1].trim() : null,
    categories: catM ? parseCategories(catM[1]) : [],
    description: descM ? cleanText(descM[1]) : null,
    url: linkM ? linkM[1] : null,
    slug: linkM ? slugFromUrl(linkM[1]) : null,
    type: linkM ? (linkM[1].includes('/movies/') ? 'movie' : 'series') : null,
    backdrop: bgM ? bgM[1].trim() : null,
  };
}

/**
 * Format the full single series/movie page data.
 */
export function parseSinglePost(html = '', type = 'series') {
  // Poster
  const posterM = html.match(/<aside[\s\S]*?<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/i);

  // Title
  const titleM = html.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i);

  // Meta
  const yearM = html.match(/<span[^>]*class="year"[^>]*>(\d{4})<\/span>/i);
  const durM = html.match(/<span[^>]*class="duration"[^>]*>([^<]+)<\/span>/i);
  const ratingM = html.match(/<span[^>]*class="rating fa-star"[^>]*><span>([^<]+)<\/span>/i);
  const catM = html.match(/<span[^>]*class="categories"[^>]*>([\s\S]*?)<\/span>/i);
  const seEpM = html.match(/<span[^>]*class="season-episode"[^>]*>([^<]+)<\/span>/i);

  // Description
  const descM = html.match(/<div[^>]*class="entry-content"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i);

  // Details list
  const detailsM = html.match(/<ul[^>]*class="details-lst"[^>]*>([\s\S]*?)<\/ul>/i);

  // Player embed URL (movies & episodes)
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

/**
 * Parse all seasons and their episode lists from a series page.
 */
export function parseSeasons(html = '') {
  const seasons = [];
  const seasonRe = /<div[^>]*id="season-(\d+)"[^>]*class="seasons-bx"[^>]*>([\s\S]*?)(?=<div[^>]*id="season-\d+"[^>]*class="seasons-bx"|<\/div>\s*<\/div>\s*<div[^>]*class="comments-wrapper|$)/gi;

  let sMatch;
  while ((sMatch = seasonRe.exec(html)) !== null) {
    const seasonNum = parseInt(sMatch[1], 10);
    const sHtml = sMatch[2];

    // Season header
    const thumbM = sHtml.match(/<figure[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i);
    const dateM = sHtml.match(/<span[^>]*class="date"[^>]*>([^<]+)<\/span>/i);
    const epCountM = sHtml.match(/(\d+)\s*Episodes?/i);

    // Episodes
    const episodes = [];
    const epRe = /<li[^>]*data-episode-id="(\d+)"[^>]*>([\s\S]*?)<\/li>/gi;
    let epM;
    while ((epM = epRe.exec(sHtml)) !== null) {
      const epId = epM[1];
      const epHtml = epM[2];

      const thumbImgM = epHtml.match(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/i);
      const titleM = epHtml.match(/<h3[^>]*class="title"[^>]*>[\s\S]*?<span>([^<]+)<\/span>\s*([\s\S]*?)<\/h3>/i);
      const langM = epHtml.match(/<span[^>]*class="episode-lang"[^>]*>([^<]+)<\/span>/i);
      const linkM = epHtml.match(/<a[^>]*href="(https?:\/\/toono\.app\/episode\/[^"]+)"[^>]*>/i);

      // Parse S1-E3 label
      const labelM = epHtml.match(/<span>S(\d+)-E(\d+)<\/span>/i);

      episodes.push({
        id: epId,
        season: labelM ? parseInt(labelM[1], 10) : seasonNum,
        episode: labelM ? parseInt(labelM[2], 10) : null,
        label: labelM ? `S${labelM[1]}E${labelM[2]}` : null,
        title: titleM ? cleanTitle(titleM[2]) : null,
        thumbnail: thumbImgM ? normalizeImage(thumbImgM[1]) : null,
        language: langM ? langM[1].trim() : null,
        url: linkM ? linkM[1] : null,
        slug: linkM ? slugFromUrl(linkM[1]) : null,
      });
    }

    seasons.push({
      season: seasonNum,
      thumbnail: thumbM ? normalizeImage(thumbM[1]) : null,
      episodeCount: epCountM ? parseInt(epCountM[1], 10) : episodes.length,
      date: dateM ? dateM[1].trim() : null,
      episodes,
    });
  }

  return seasons;
}

/**
 * Parse a section of cards from a swiper block.
 * Extracts all .swiper-slide article cards.
 */
export function parseSwiperSection(html = '') {
  const slideRe = /<div[^>]*class="swiper-slide"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="swiper-slide"|<\/div>\s*<\/div>)/gi;
  const items = [];
  let m;
  while ((m = slideRe.exec(html)) !== null) {
    const articleM = m[1].match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    if (articleM) {
      items.push(parseCardArticle(articleM[0]));
    }
  }
  return items;
}

/**
 * Parse a named home section (Series, Movies, etc.) with tabs (Recent / Trending).
 */
export function parseHomeSection(html = '', sectionTitle = '') {
  // Tab panels — each is an aa-tb div
  const tabRe = /<div[^>]*:class="[^"]*aa-tb[^"]*"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*:class="[^"]*aa-tb|<\/div>\s*<\/div>\s*<\/section>)/gi;
  const tabs = [];
  let tabM;
  let tabIndex = 0;
  const tabNames = ['recent', 'trending'];

  while ((tabM = tabRe.exec(html)) !== null) {
    const items = parseSwiperSection(tabM[1]);
    tabs.push({ tab: tabNames[tabIndex] || `tab_${tabIndex}`, items });
    tabIndex++;
  }

  return { section: sectionTitle, tabs };
}

/** Build a clean API response envelope */
export function apiResponse(data, extra = {}) {
  return {
    ok: true,
    ...extra,
    data,
  };
}

export function apiError(message, status = 500) {
  return { ok: false, error: message, status };
}
