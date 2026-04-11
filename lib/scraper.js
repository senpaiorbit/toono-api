// lib/scraper.js — Universal fetch + regex-based HTML parser

const BASE_URL = 'https://toono.app';

const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': BASE_URL,
  'Cache-Control': 'no-cache',
};

/**
 * Fetch a page from toono.app and return raw HTML.
 * @param {string} path  - relative path e.g. "/" or "/series/jujutsu-kaisen/"
 * @param {object} opts  - extra fetch options
 */
export async function fetchPage(path = '/', opts = {}) {
  const url = path.startsWith('http') ? path : `${BASE_URL}${path}`;
  const res = await fetch(url, {
    ...opts,
    headers: { ...DEFAULT_HEADERS, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

// ─── Minimal regex-based DOM ────────────────────────────────────────────────

/**
 * HtmlDoc — lightweight regex HTML parser (no external deps).
 * Exposes find(), findAll(), attr(), text(), innerHTML() helpers.
 */
export class HtmlDoc {
  constructor(html) {
    this.html = html;
  }

  /**
   * Return the first substring matching an open+close tag pair.
   * Handles simple nesting for the same tag.
   */
  find(selector) {
    const html = this._applySelector(selector, this.html);
    return html ? new HtmlDoc(html) : null;
  }

  findAll(selector) {
    return this._applyAllSelector(selector, this.html).map(h => new HtmlDoc(h));
  }

  /** Raw innerHTML of this node (content between first open tag and close) */
  innerHTML() {
    return this._innerHtml(this.html);
  }

  /** Decoded text content (tags stripped, entities decoded) */
  text() {
    return decodeEntities(stripTags(this.innerHTML() || '').trim());
  }

  /** Get attribute value from the root element */
  attr(name) {
    const m = this.html.match(new RegExp(`${escRe(name)}\\s*=\\s*["']([^"']*)["']`, 'i'));
    return m ? decodeEntities(m[1]) : null;
  }

  // ── private ────────────────────────────────────────────────────────────────

  _applySelector(selector, html) {
    const parts = parseSelector(selector);
    let current = html;
    for (const part of parts) {
      current = findFirst(current, part.tag, part.attrs);
      if (!current) return null;
    }
    return current;
  }

  _applyAllSelector(selector, html) {
    const parts = parseSelector(selector);
    if (parts.length === 1) {
      return findAll(html, parts[0].tag, parts[0].attrs);
    }
    // Multi-part: find all matching last selector inside first context
    let contexts = [html];
    for (let i = 0; i < parts.length - 1; i++) {
      const next = [];
      for (const ctx of contexts) {
        next.push(...findAll(ctx, parts[i].tag, parts[i].attrs));
      }
      contexts = next;
    }
    const last = parts[parts.length - 1];
    const results = [];
    for (const ctx of contexts) {
      results.push(...findAll(ctx, last.tag, last.attrs));
    }
    return results;
  }

  _innerHtml(html) {
    const m = html.match(/^<[^>]+>([\s\S]*)<\/[^>]+>\s*$/) ||
              html.match(/^<[^>]+>([\s\S]*)$/);
    return m ? m[1] : html;
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

function escRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Parse a CSS-like selector into [{tag, attrs}] */
function parseSelector(selector) {
  return selector.split(/\s+/).map(part => {
    const tagMatch = part.match(/^([a-z0-9*]+)/i);
    const tag = tagMatch ? tagMatch[1] : '*';
    const attrs = {};

    // .class
    const classes = [...part.matchAll(/\.([a-zA-Z0-9_-]+)/g)].map(m => m[1]);
    if (classes.length) attrs.class = classes;

    // #id
    const idMatch = part.match(/#([a-zA-Z0-9_-]+)/);
    if (idMatch) attrs.id = idMatch[1];

    // [attr=val]
    const attrMatches = [...part.matchAll(/\[([^\]=]+)(?:=["']?([^"'\]]+)["']?)?\]/g)];
    for (const [, k, v] of attrMatches) attrs[k] = v || true;

    return { tag, attrs };
  });
}

/**
 * Find the first occurrence of a tag (with optional attrs) in html.
 * Returns the full outer HTML string of that element.
 */
function findFirst(html, tag, attrs = {}) {
  const pattern = buildOpenTagPattern(tag, attrs);
  const re = new RegExp(pattern, 'is');
  const start = html.search(re);
  if (start === -1) return null;

  const openMatch = html.slice(start).match(re);
  if (!openMatch) return null;

  if (isSelfClosing(tag) || openMatch[0].trimEnd().endsWith('/>')) {
    return openMatch[0];
  }

  return extractBalanced(html, start, tag);
}

function findAll(html, tag, attrs = {}) {
  const pattern = buildOpenTagPattern(tag, attrs);
  const re = new RegExp(pattern, 'gi');
  const results = [];
  let match;
  let cursor = 0;

  const tempHtml = html;
  re.lastIndex = 0;

  while ((match = re.exec(tempHtml)) !== null) {
    const idx = match.index;
    if (idx < cursor) continue; // skip nested

    if (isSelfClosing(tag) || match[0].trimEnd().endsWith('/>')) {
      results.push(match[0]);
      cursor = idx + match[0].length;
    } else {
      const block = extractBalanced(tempHtml, idx, tag);
      if (block) {
        results.push(block);
        cursor = idx + block.length;
        re.lastIndex = cursor;
      }
    }
  }
  return results;
}

function buildOpenTagPattern(tag, attrs) {
  const t = tag === '*' ? '[a-z][a-z0-9]*' : escRe(tag);
  let p = `<${t}(?:\\s[^>]*)?)?>`;

  // Build individual attr checks
  const checks = [];

  if (attrs.class && Array.isArray(attrs.class)) {
    for (const cls of attrs.class) {
      checks.push(`(?=[^>]*class\\s*=\\s*["'][^"']*\\b${escRe(cls)}\\b[^"']*["'])`);
    }
  }
  if (attrs.id) {
    checks.push(`(?=[^>]*id\\s*=\\s*["']${escRe(attrs.id)}["'])`);
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class' || k === 'id') continue;
    if (v === true) checks.push(`(?=[^>]*\\b${escRe(k)}\\b)`);
    else checks.push(`(?=[^>]*${escRe(k)}\\s*=\\s*["']${escRe(String(v))}["'])`);
  }

  if (checks.length === 0) {
    return `<${t}(?:\\s[^>]*)?>`;
  }
  return `<${t}${checks.join('')}(?:\\s[^>]*)?>`;
}

function extractBalanced(html, start, tag) {
  const openRe = new RegExp(`<${escRe(tag)}(?:\\s[^>]*)?>`, 'gi');
  const closeRe = new RegExp(`<\\/${escRe(tag)}>`, 'gi');

  // find the first open tag at `start`
  openRe.lastIndex = start;
  const firstOpen = openRe.exec(html);
  if (!firstOpen) return null;

  let depth = 1;
  let pos = firstOpen.index + firstOpen[0].length;

  while (depth > 0 && pos < html.length) {
    openRe.lastIndex = pos;
    closeRe.lastIndex = pos;

    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);

    if (!nextClose) break;

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) {
        return html.slice(start, nextClose.index + nextClose[0].length);
      }
      pos = nextClose.index + nextClose[0].length;
    }
  }
  return null;
}

function isSelfClosing(tag) {
  return /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(tag);
}

export function stripTags(html) {
  return html.replace(/<[^>]+>/g, '');
}

export function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&hellip;/g, '…')
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
