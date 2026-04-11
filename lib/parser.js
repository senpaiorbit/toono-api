// lib/parser.js — Page-specific extraction using scraper + formatter

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
  // ── Hero slides ──────────────────────────────────────────────────────────
  // Structure: <div id="home-slider" class="swiper-wrapper"> ... slides ...
  const heroWrapper = extractInner(html, 'div', 'id="home-slider"');
  const heroSlides = heroWrapper
    ? extractAll(heroWrapper, 'article').map(a => parseHeroSlide(a))
    : [];

  // ── Thumb images (slider thumbnails) ────────────────────────────────────
  const thumbWrapper = extractInner(html, 'div', 'id="home-slider-thumb"');
  const heroThumbs = thumbWrapper
    ? [...thumbWrapper.matchAll(/<img[^>]*src="([^"]+)"[^>]*alt="([^"]*)"[^>]*>/gi)]
        .map(m => ({ image: m[1], alt: decodeEntities(m[2]) }))
    : [];

  // ── Content sections ─────────────────────────────────────────────────────
  // Structure: <section class="section nt-tb-carousel"> ... </section>
  const sectionBlocks = extractAll(html, 'section', 'nt-tb-carousel');
  const sections = sectionBlocks.map(secHtml => {
    // Section title
    const titleM = secHtml.match(/<h2[^>]*class="section-title"[^>]*>\s*([\s\S]*?)\s*<\/h2>/i);
    const sectionTitle = titleM ? cleanTitle(titleM[1]) : 'Unknown';

    // Tab containers: <div :class="{'aa-tb hdd anm-a': true, 'on': tab == N}">
    // Each tab div contains one swiper with slides
    const tabBlocks = extractAll(secHtml, 'div', "aa-tb hdd anm-a");
    const tabNames = ['recent', 'trending'];

    const tabs = tabBlocks.map((tabHtml, i) => {
      // All swiper-slide articles inside this tab
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

  // Seasons container
  const seasonsHtml = extractInner(html, 'div', 'id="seasons-container"');
  const seasons = seasonsHtml ? parseSeasons(seasonsHtml) : [];

  // Related section
  const relatedSection = extractAll(html, 'section', 'nt-related')[0] || '';
  const related = relatedSection
    ? extractAll(relatedSection, 'article').map(a => parseCard(a)).slice(0, config.RELATED_LIMIT)
    : [];

  return { ...base, type: 'series', seasons, related };
}

// ─── MOVIE DETAIL ────────────────────────────────────────────────────────────

export function parseMovieDetailPage(html) {
  const base = parseSinglePostHeader(html);

  // Language player tabs
  const tabsHtml = extractInner(html, 'ul', 'class="tabs-list"');
  const playerTabs = tabsHtml ? parsePlayerTabs(tabsHtml) : [];

  // Related section
  const relatedSection = extractAll(html, 'section', 'nt-related')[0] || '';
  const related = relatedSection
    ? extractAll(relatedSection, 'article').map(a => parseCard(a)).slice(0, config.RELATED_LIMIT)
    : [];

  return { ...base, type: 'movie', playerTabs, related };
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
  // Each season: <div id="season-N" class="seasons-bx">
  const seasonBlocks = extractAll(html, 'div', 'seasons-bx');

  for (const sHtml of seasonBlocks) {
    const idM = sHtml.match(/id="season-(\d+)"/i);
    const seasonNum = idM ? parseInt(idM[1], 10) : 0;

    // Season thumbnail
    const thumbM = sHtml.match(/<figure[^>]*>[\s\S]*?<img[^>]*src="([^"]+)"/i);
    // Season date + episode count
    const dateM = sHtml.match(/<span[^>]*class="date"[^>]*>([^<]+)<\/span>/i);
    const epCountM = sHtml.match(/(\d+)\s*Episodes?/i);

    // Episodes list
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
    tabs.push({
      language: langM ? langM[1].trim() : null,
      src: srcM ? srcM[1] : null,
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
