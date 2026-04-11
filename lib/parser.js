// lib/parser.js — Page-specific extraction logic

import { HtmlDoc } from './scraper.js';
import {
  parseHeroSlide,
  parseCardArticle,
  parseSinglePost,
  parseSeasons,
  parseHomeSection,
  parseSwiperSection,
  cleanTitle,
  slugFromUrl,
  normalizeImage,
  parseRating,
  parseYear,
  parseCategories,
  parsePeopleList,
  cleanText,
} from './formatter.js';

// ─── HOME PAGE ───────────────────────────────────────────────────────────────

export function parseHomePage(html) {
  const doc = new HtmlDoc(html);

  // ── Hero slider ──────────────────────────────────────────────────────
  const heroSlides = [];
  const heroThumb = [];

  const heroSwiperM = html.match(/<div[^>]*id="home-slider"[^>]*class="swiper-wrapper"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (heroSwiperM) {
    const slideRe = /<div[^>]*class="swiper-slide"[^>]*>([\s\S]*?)<\/div>\s*(?=<div[^>]*class="swiper-slide"|<\/div>)/gi;
    let m;
    while ((m = slideRe.exec(heroSwiperM[1])) !== null) {
      const articleM = m[1].match(/<article[^>]*>([\s\S]*?)<\/article>/i);
      if (articleM) heroSlides.push(parseHeroSlide(articleM[0]));
    }
  }

  const thumbSwiperM = html.match(/<div[^>]*id="home-slider-thumb"[^>]*class="swiper-wrapper"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (thumbSwiperM) {
    const imgRe = /<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi;
    let m;
    while ((m = imgRe.exec(thumbSwiperM[1])) !== null) {
      heroThumb.push({ image: normalizeImage(m[1]), alt: m[2] });
    }
  }

  // ── Content sections (Series, Movies, etc.) ───────────────────────────
  const sections = [];
  const sectionRe = /<section[^>]*class="[^"]*section[^"]*nt-tb-carousel[^"]*"[^>]*>([\s\S]*?)<\/section>/gi;
  let secM;
  while ((secM = sectionRe.exec(html)) !== null) {
    const titleM = secM[1].match(/<h2[^>]*class="section-title"[^>]*>\s*([^<]+)\s*<\/h2>/i);
    const sectionTitle = titleM ? cleanTitle(titleM[1]) : 'Unknown';
    sections.push(parseHomeSection(secM[1], sectionTitle));
  }

  return {
    hero: {
      slides: heroSlides,
      thumbnails: heroThumb,
    },
    sections,
  };
}

// ─── SERIES LIST PAGE ────────────────────────────────────────────────────────

export function parseSeriesListPage(html) {
  // Used for /series/ archive or category pages
  const items = [];
  const articleRe = /<article[^>]*class="[^"]*post[^"]*movies[^"]*more-info[^"]*"[^>]*>([\s\S]*?)<\/article>/gi;
  let m;
  while ((m = articleRe.exec(html)) !== null) {
    items.push(parseCardArticle(m[0]));
  }

  // Pagination
  const pagination = parsePagination(html);

  return { items, pagination };
}

// ─── SERIES DETAIL PAGE ──────────────────────────────────────────────────────

export function parseSeriesDetailPage(html) {
  const base = parseSinglePost(html, 'series');

  // Related
  const relatedM = html.match(/<section[^>]*class="[^"]*nt-related[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
  const related = relatedM ? parseSwiperSection(relatedM[1]).slice(0, 10) : [];

  // Seasons + episodes
  const seasonsContainerM = html.match(/<div[^>]*id="seasons-container"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="comments-wrapper/i);
  const seasons = seasonsContainerM ? parseSeasons(seasonsContainerM[1]) : [];

  return { ...base, type: 'series', seasons, related };
}

// ─── MOVIES LIST PAGE ────────────────────────────────────────────────────────

export function parseMoviesListPage(html) {
  return parseSeriesListPage(html); // same card structure
}

// ─── MOVIE DETAIL PAGE ───────────────────────────────────────────────────────

export function parseMovieDetailPage(html) {
  const base = parseSinglePost(html, 'movie');

  // Related
  const relatedM = html.match(/<section[^>]*class="[^"]*nt-related[^"]*"[^>]*>([\s\S]*?)<\/section>/i);
  const related = relatedM ? parseSwiperSection(relatedM[1]).slice(0, 10) : [];

  // Tab players (Hindi / Tamil / Telugu / etc.)
  const tabs = parsePlayerTabs(html);

  return { ...base, type: 'movie', playerTabs: tabs, related };
}

// ─── SEARCH PAGE ─────────────────────────────────────────────────────────────

export function parseSearchPage(html) {
  return parseSeriesListPage(html);
}

// ─── CATEGORY / ARCHIVE PAGE ─────────────────────────────────────────────────

export function parseCategoryPage(html) {
  return parseSeriesListPage(html);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────

function parsePagination(html) {
  const navM = html.match(/<div[^>]*class="[^"]*pagination-nav[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
  if (!navM) return null;

  const links = [];
  const linkRe = /<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = linkRe.exec(navM[1])) !== null) {
    links.push({ label: m[2].trim(), url: m[1] });
  }

  const currentM = navM[1].match(/<span[^>]*class="[^"]*current[^"]*"[^>]*>([^<]+)<\/span>/i);
  return {
    current: currentM ? parseInt(currentM[1].trim(), 10) : 1,
    links,
  };
}

function parsePlayerTabs(html) {
  const tabsM = html.match(/<ul[^>]*class="tabs-list"[^>]*>([\s\S]*?)<\/ul>/i);
  if (!tabsM) return [];

  const tabs = [];
  const tabRe = /<li[^>]*class="[^"]*tab-item[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = tabRe.exec(tabsM[1])) !== null) {
    const langM = m[1].match(/<span[^>]*class="tab-language"[^>]*>([^<]+)<\/span>/i);
    const srcM = m[1].match(/data-src="([^"]+)"/i);
    const hrefM = m[1].match(/href="([^"]+)"/i);
    tabs.push({
      language: langM ? langM[1].trim() : null,
      src: srcM ? srcM[1] : null,
      href: hrefM ? hrefM[1] : null,
    });
  }
  return tabs;
}
