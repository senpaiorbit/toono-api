// lib/scraper.js — Universal fetch + regex HTML helpers

import config from '../src/config.js';

/**
 * Fetch a page and return raw HTML text.
 * @param {string} path  - relative e.g. '/series/naruto/' or full URL
 */
export async function fetchPage(path = '/') {
  const url = path.startsWith('http') ? path : `${config.BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { ...config.HEADERS, Referer: config.BASE_URL },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.text();
}

// ─── Regex helpers ────────────────────────────────────────────────────────────

/** Decode common HTML entities */
export function decodeEntities(str = '') {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(+c))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

/** Strip all HTML tags */
export function stripTags(html = '') {
  return html.replace(/<[^>]+>/g, '');
}

/** Clean text: decode entities, strip tags, collapse whitespace */
export function cleanText(raw = '') {
  return decodeEntities(stripTags(raw)).replace(/\s+/g, ' ').trim();
}

/**
 * Extract the innerHTML between the first matching open tag and its closing tag.
 * Handles nested same-tag elements correctly via depth counting.
 *
 * @param {string} html
 * @param {string} tag       - e.g. 'div', 'section', 'article'
 * @param {string} attrSnip  - snippet that must appear in the open tag, e.g. 'id="home-slider"'
 * @returns {string|null}    - content between open and close tag, or null
 */
export function extractInner(html, tag, attrSnip = '') {
  const escapedAttr = attrSnip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const openRe = attrSnip
    ? new RegExp(`<${tag}[^>]*${escapedAttr}[^>]*>`, 'i')
    : new RegExp(`<${tag}[^>]*>`, 'i');

  const startMatch = openRe.exec(html);
  if (!startMatch) return null;

  const contentStart = startMatch.index + startMatch[0].length;
  let depth = 1;
  let pos = contentStart;

  while (depth > 0 && pos < html.length) {
    const innerOpen = new RegExp(`<${tag}[^>]*>`, 'i');
    const innerClose = new RegExp(`<\\/${tag}>`, 'i');

    const restHtml = html.slice(pos);
    const nextOpenM = innerOpen.exec(restHtml);
    const nextCloseM = innerClose.exec(restHtml);

    if (!nextCloseM) break;

    if (nextOpenM && nextOpenM.index < nextCloseM.index) {
      depth++;
      pos += nextOpenM.index + nextOpenM[0].length;
    } else {
      depth--;
      if (depth === 0) return html.slice(contentStart, pos + nextCloseM.index);
      pos += nextCloseM.index + nextCloseM[0].length;
    }
  }
  return null;
}

/**
 * Extract all outer HTML blocks of a tag that contain attrSnip.
 * Returns array of full outer HTML strings.
 */
export function extractAll(html, tag, attrSnip = '') {
  const escapedAttr = attrSnip.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const scanRe = attrSnip
    ? new RegExp(`<${tag}[^>]*${escapedAttr}[^>]*>`, 'gi')
    : new RegExp(`<${tag}[^>]*>`, 'gi');

  const results = [];
  let m;

  while ((m = scanRe.exec(html)) !== null) {
    const blockStart = m.index;
    const contentStart = m.index + m[0].length;
    let depth = 1;
    let pos = contentStart;

    while (depth > 0 && pos < html.length) {
      const restHtml = html.slice(pos);
      const nextOpenM = new RegExp(`<${tag}[^>]*>`, 'i').exec(restHtml);
      const nextCloseM = new RegExp(`<\\/${tag}>`, 'i').exec(restHtml);

      if (!nextCloseM) break;

      if (nextOpenM && nextOpenM.index < nextCloseM.index) {
        depth++;
        pos += nextOpenM.index + nextOpenM[0].length;
      } else {
        depth--;
        if (depth === 0) {
          const blockEnd = pos + nextCloseM.index + nextCloseM[0].length;
          results.push(html.slice(blockStart, blockEnd));
          scanRe.lastIndex = blockEnd;
          break;
        }
        pos += nextCloseM.index + nextCloseM[0].length;
      }
    }
  }
  return results;
}
