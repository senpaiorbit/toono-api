// lib/parser.js — Page-specific extraction using scraper + formatter (Node.js runtime)

import { extractInner, extractAll, cleanText, decodeEntities } from './scraper.js';
import {
  parseHeroSlide,
  parseCard,
  parseSinglePostHeader,
  parseDetailsList,
  parseCategories,
  parsePeople,
  parseRating,
  parseYear,
  slugFromUrl,
  normalizeImage,
  cleanTitle,
} from './formatter.js';
import config from '../src/config.js';

// ─── HOME ────────────────────────────────────────────────────────────────────

export function parseHomePage(html) {
  const heroWrapper = extractInner(html, 'div', 'id="home-slider"');
  const heroSlides = heroWrapper
    ? extractAll(heroWrapper, 'article').map(a => parseHeroSlide(a))
    : [];

  const thumbWrapper = extractInner(html, 'div', 'id="home-slider-thumb"');
  const heroThumbs = thumbWrapper
    ? [...thumbWrapper.matchAll(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi)]
        .map(m => ({ image: m[1], alt: decodeEntities(m[2]) }))
    : [];

  const sectionBlocks = extractAll(html, 'section', 'nt-tb-carousel');
  const sections = sectionBlocks.map(secHtml => {
    const titleM = secHtml.match(/<h2[^>]*class="section-title"[^>]*>\s*([\s\S]*?)\s*<\/h2>/i);
    const sectionTitle = titleM ? cleanTitle(titleM[1]) : 'Unknown';

    const tabBlocks = extractAll(secHtml, 'div', "aa-tb hdd anm-a");
    const tabNames = ['recent', 'trending'];

    const tabs = tabBlocks.map((tabHtml, i) => {
      const slideBlocks = extractAll(tabHtml, 'div', 'class="swiper-slide"');
      const items = slideBlocks.map(slideHtml => {
        const articleBlocks = extractAll(slideHtml, 'article');
        return articleBlocks.length ? parseCard(articleBlocks[0]) : null;
      }).filter(Boolean);

      return { tab: tabNames[i] || `tab_${i}`, items };
    });

    return { section: sectionTitle, tabs };
  });

  return {
    hero: { slides: heroSlides, thumbnails: heroThumbs },
    sections,
  };
}

// ─── SERIES / MOVIES LIST ────────────────────────────────────────────────────

export function parseListPage(html) {
  const articleBlocks = extractAll(html, 'article', 'movies more-info');
  const items = articleBlocks.map(a => parseCard(a));
  return { items, pagination: parsePagination(html) };
}

// ─── SERIES DETAIL ───────────────────────────────────────────────────────────

export function parseSeriesDetailPage(html) {
  const base = parseSinglePostHeader(html);

  const seasonsHtml = extractInner(html, 'div', 'id="seasons-container"');
  const seasons = seasonsHtml ? parseSeasons(seasonsHtml) : [];

  const relatedSection = extractAll(html, 'section', 'nt-related')[0] || '';
  const related = relatedSection
    ? extractAll(relatedSection, 'article').map(a => parseCard(a)).slice(0, config.RELATED_LIMIT)
    : [];

  return { ...base, type: 'series', seasons, related };
}

// ─── MOVIE DETAIL ────────────────────────────────────────────────────────────

export function parseMovieDetailPage(html) {
  const base = parseSinglePostHeader(html);

  const tabsHtml = extractInner(html, 'ul', 'class="tabs-list"');
  const playerTabs = tabsHtml ? parsePlayerTabs(tabsHtml) : [];

  const relatedSection = extractAll(html, 'section', 'nt-related')[0] || '';
  const related = relatedSection
    ? extractAll(relatedSection, 'article').map(a => parseCard(a)).slice(0, config.RELATED_LIMIT)
    : [];

  return { ...base, type: 'movie', playerTabs, related };
}

// ─── EPISODE / WATCH PAGE ────────────────────────────────────────────────────
//
// URL pattern: /episode/<series-slug>-<SxE>/
// Key HTML structures observed from the live page:
//
//   <h1 class="entry-title">Jujutsu Kaisen 1x1 — Hindi Watch/Download</h1>
//   <div class="single-episode-bar">You are watching Season 1 Episode 1</div>
//   <iframe id="main-player" data-lazy-src="https://toono.app/?trembed=1&trid=25461&trtype=2"></iframe>
//   <div class="episodes__nav">
//     <a href="/series/.../">Episodes</a>
//     <a href="/episode/.../">Next</a>  (optional prev too)
//   </div>
//   <div id="seasons-container"> ... all seasons/episodes ... </div>
//
// The player embed URL contains: trembed=1, trid=<episodeId>, trtype=2
// Player tabs (language selector) use data-src as base64-encoded iframe URLs.

export function parseEpisodePage(html) {
  // ── Episode identity ─────────────────────────────────────────────────────
  const titleM = html.match(/<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i);
  const fullTitle = titleM ? cleanTitle(titleM[1]) : null;

  // "You are watching Season N Episode N"
  const watchBarM = html.match(/<div[^>]*class="single-episode-bar"[^>]*>([^<]+)<\/div>/i);
  const watchingText = watchBarM ? watchBarM[1].trim() : null;

  // Extract season + episode numbers from the watch bar text
  const seM = watchingText
    ? watchingText.match(/Season\s+(\d+)\s+Episode\s+(\d+)/i)
    : null;
  const seasonNum = seM ? parseInt(seM[1], 10) : null;
  const episodeNum = seM ? parseInt(seM[2], 10) : null;

  // ── Metadata (same aside/header block as series detail) ─────────────────
  const posterM = html.match(/<aside[\s\S]*?<img[^>]*src="([^"]+)"[^>]*>/i);
  const yearM = html.match(/<span[^>]*class="year"[^>]*>(\d{4})<\/span>/i);
  const durM = html.match(/<span[^>]*class="duration"[^>]*>([^<]+)<\/span>/i);
  const ratingM = html.match(/<span[^>]*class="rating fa-star"[^>]*><span>([^<]+)<\/span>/i);
  const catM = html.match(/<span[^>]*class="categories"[^>]*>([\s\S]*?)<\/span>/i);
  const descM = html.match(/<div[^>]*class="entry-content"[^>]*>[\s\S]*?<p>([\s\S]*?)<\/p>/i);
  const detailsM = html.match(/<ul[^>]*class="details-lst"[^>]*>([\s\S]*?)<\/ul>/i);

  // ── Primary player embed ─────────────────────────────────────────────────
  // data-lazy-src="https://toono.app/?trembed=1&trid=<ID>&trtype=2"
  const embedM = html.match(/data-lazy-src="(https?:\/\/toono\.app\/\?trembed=[^"]+)"/i);
  const embedUrl = embedM ? embedM[1] : null;

  // Extract trid (episode term ID) from the embed URL
  const tridM = embedUrl ? embedUrl.match(/trid=(\d+)/) : null;
  const episodeTermId = tridM ? parseInt(tridM[1], 10) : null;

  // ── Language player tabs (if present — some episodes have multi-lang) ────
  // <ul class="tabs-list"> ... <li class="tab-item"> ...
  const tabsHtml = extractInner(html, 'ul', 'class="tabs-list"');
  const playerTabs = tabsHtml ? parsePlayerTabs(tabsHtml) : [];

  // ── Navigation (prev/next episode links) ────────────────────────────────
  const navHtml = extractInner(html, 'div', 'episodes__nav') || '';
  const navLinks = [...navHtml.matchAll(/<a[^>]*href="(https?:\/\/toono\.app\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)]
    .map(m => ({
      url: m[1],
      slug: slugFromUrl(m[1]),
      label: cleanText(m[2]),
    }));

  // Identify prev / next / episodes-list from the nav buttons
  let prevEpisode = null, nextEpisode = null, seriesUrl = null;
  for (const link of navLinks) {
    const labelLower = link.label.toLowerCase();
    if (labelLower.includes('prev') || link.url.includes('/episode/')) {
      // Could be prev; toono uses Episodes (series link) + optional Prev + Next
      if (labelLower.includes('prev')) prevEpisode = link;
      else if (labelLower.includes('next')) nextEpisode = link;
    }
    if (link.url.includes('/series/') || link.url.includes('/movies/')) {
      seriesUrl = link.url;
    }
  }

  // Simpler: just collect all episode nav links
  const episodeNavLinks = navLinks.filter(l =>
    l.url.includes('/episode/') || l.url.includes('/series/') || l.url.includes('/movies/')
  );

  // ── All seasons + episodes list (same structure as series detail) ─────────
  const seasonsHtml = extractInner(html, 'div', 'id="seasons-container"');
  const seasons = seasonsHtml ? parseSeasons(seasonsHtml) : [];

  return {
    fullTitle,
    season: seasonNum,
    episode: episodeNum,
    episodeTermId,
    watchingText,
    poster: posterM ? normalizeImage(posterM[1]) : null,
    year: yearM ? parseYear(yearM[1]) : null,
    duration: durM ? durM[1].trim() : null,
    rating: ratingM ? parseRating(ratingM[1]) : null,
    categories: catM ? parseCategories(catM[1]) : [],
    description: descM ? cleanText(descM[1]) : null,
    details: detailsM ? parseDetailsList(detailsM[0]) : {},
    embedUrl,
    playerTabs,
    nav: episodeNavLinks,
    seriesUrl: seriesUrl || null,
    seasons,
  };
}

// ─── SEARCH ──────────────────────────────────────────────────────────────────

export function parseSearchPage(html) {
  return parseListPage(html);
}

// ─── CATEGORY ────────────────────────────────────────────────────────────────

export function parseCategoryPage(html) {
  return parseListPage(html);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function parseSeasons(html) {
  const seasons = [];
  const seasonBlocks = extractAll(html, 'div', 'seasons-bx');

  for (const sHtml of seasonBlocks) {
    const idM = sHtml.match(/id="season-(\d+)"/i);
    const seasonNum = idM ? parseInt(idM[1], 10) : 0;

    const thumbM = sHtml.match(/<figure[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i);
    const dateM = sHtml.match(/<span[^>]*class="date"[^>]*>([^<]+)<\/span>/i);
    const epCountM = sHtml.match(/(\d+)\s*Episodes?/i);

    const episodes = [];
    const epRe = /<li[^>]*data-episode-id="(\d+)"[^>]*>([\s\S]*?)<\/li>/gi;
    let epM;
    while ((epM = epRe.exec(sHtml)) !== null) {
      const epId = epM[1];
      const epHtml = epM[2];

      const thumbImgM = epHtml.match(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"/i);
      const labelM = epHtml.match(/<span>S(\d+)-E(\d+)<\/span>/i);
      const titleM = epHtml.match(/<h3[^>]*class="title"[^>]*>[\s\S]*?<span>[^<]+<\/span>\s*([\s\S]*?)<\/h3>/i);
      const langM = epHtml.match(/<span[^>]*class="episode-lang"[^>]*>([^<]+)<\/span>/i);
      const linkM = epHtml.match(/<a[^>]*href="(https?:\/\/toono\.app\/episode\/[^"]+)"[^>]*>/i);

      episodes.push({
        id: epId,
        season: labelM ? parseInt(labelM[1], 10) : seasonNum,
        episode: labelM ? parseInt(labelM[2], 10) : null,
        label: labelM ? `S${labelM[1]}E${labelM[2]}` : null,
        title: titleM ? cleanTitle(titleM[1]) : null,
        thumbnail: thumbImgM ? thumbImgM[1] : null,
        language: langM ? langM[1].trim() : null,
        url: linkM ? linkM[1] : null,
        slug: linkM ? slugFromUrl(linkM[1]) : null,
      });
    }

    seasons.push({
      season: seasonNum,
      thumbnail: thumbM ? thumbM[1] : null,
      episodeCount: epCountM ? parseInt(epCountM[1], 10) : episodes.length,
      date: dateM ? dateM[1].trim() : null,
      episodes,
    });
  }

  return seasons;
}

function parsePlayerTabs(html) {
  const tabs = [];
  const liBlocks = extractAll(html, 'li', 'tab-item');
  for (const li of liBlocks) {
    const langM = li.match(/<span[^>]*class="tab-language"[^>]*>([^<]+)<\/span>/i);
    const srcM = li.match(/data-src="([^"]+)"/i);
    const hrefM = li.match(/href="([^"]+)"/i);
    // data-src is base64-encoded iframe src (decoded client-side with atob())
    const srcDecoded = srcM
      ? (() => { try { return Buffer.from(srcM[1], 'base64').toString('utf8'); } catch { return srcM[1]; } })()
      : null;
    tabs.push({
      language: langM ? langM[1].trim() : null,
      src: srcDecoded || (hrefM ? hrefM[1] : null),
      srcEncoded: srcM ? srcM[1] : null,
      href: hrefM ? hrefM[1] : null,
    });
  }
  return tabs;
}

function parsePagination(html) {
  const navHtml = extractInner(html, 'div', 'pagination-nav') || '';
  if (!navHtml) return null;

  const links = [...navHtml.matchAll(/<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi)]
    .map(m => ({ label: m[2].trim(), url: m[1] }));
  const currentM = navHtml.match(/<span[^>]*class="[^"]*current[^"]*"[^>]*>([^<]+)<\/span>/i);

  return { current: currentM ? parseInt(currentM[1].trim(), 10) : 1, links };
}
