// api/episode.js
// Scrapes episode pages from toono.app style sites
// Test: /api/episode?url=https://toono.app/episode/the-angel-next-door-spoils-me-rotten-1x1/

export default async function handler(req, res) {
  // --- CORS ---
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { url } = req.query;

  if (!url) {
    return res.status(400).json({
      error: "Missing url parameter",
      example: "/api/episode?url=https://toono.app/episode/the-angel-next-door-spoils-me-rotten-1x1/",
    });
  }

  // Basic URL validation
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }

  try {
    // Fetch the page
    const response = await fetch(parsedUrl.href, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    if (!response.ok) {
      return res.status(502).json({
        error: `Upstream fetch failed: ${response.status} ${response.statusText}`,
      });
    }

    const html = await response.text();
    const data = scrapeEpisode(html, parsedUrl.href);

    return res.status(200).json({ success: true, url: parsedUrl.href, data });
  } catch (err) {
    return res.status(500).json({ error: "Scrape failed", detail: err.message });
  }
}

// ─── Scraper ────────────────────────────────────────────────────────────────

function scrapeEpisode(html, pageUrl) {
  return {
    title: getTitle(html),
    thumbnail: getThumbnail(html),
    meta: getMeta(html),
    description: getDescription(html),
    player: getPlayer(html, pageUrl),
    currentEpisode: getCurrentEpisode(html),
    navigation: getNavigation(html),
    seasons: getSeasons(html),
    downloadLinks: getDownloadLinks(html),
    trailer: getTrailer(html),
    tags: getTags(html),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Strip HTML tags and decode basic entities */
function stripHtml(str = "") {
  return str
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/&#x([0-9a-f]+);/gi, (_, c) => String.fromCharCode(parseInt(c, 16)))
    .trim();
}

function match(html, regex, group = 1) {
  const m = html.match(regex);
  return m ? stripHtml(m[group]) : null;
}

// ─── Field extractors ────────────────────────────────────────────────────────

function getTitle(html) {
  return match(html, /<h1[^>]*class="entry-title"[^>]*>([\s\S]*?)<\/h1>/i);
}

function getThumbnail(html) {
  // <div class="post-thumbnail"> first img
  const block = html.match(/<div[^>]*class="post-thumbnail"[^>]*>([\s\S]*?)<\/div>/i);
  if (!block) return null;
  const src = block[1].match(/src="([^"]+)"/i);
  return src ? src[1] : null;
}

function getMeta(html) {
  const metaBlock = html.match(/<div[^>]*class="entry-meta"[^>]*>([\s\S]*?)<\/div>/i);
  if (!metaBlock) return {};

  const b = metaBlock[1];

  return {
    year: match(b, /<span[^>]*class="year"[^>]*>(\d{4})<\/span>/i),
    duration: match(b, /<span[^>]*class="duration"[^>]*>([^<]+)<\/span>/i),
    rating: match(b, /<span[^>]*class="[^"]*fa-star[^"]*"[^>]*>.*?<span>([^<]+)<\/span>/is),
    categories: extractLinks(b, /<a[^>]*aria-label="([^"]+)"[^>]*href="([^"]+)"[^>]*>/gi),
    seasonEpisode: match(b, /<span[^>]*class="season-episode"[^>]*>([^<]+)<\/span>/i),
  };
}

function extractLinks(html, regex) {
  const results = [];
  let m;
  const re = new RegExp(regex.source, "gi");
  while ((m = re.exec(html)) !== null) {
    results.push({ label: m[1], url: m[2] });
  }
  return results;
}

function getDescription(html) {
  const content = html.match(/<div[^>]*class="entry-content"[^>]*>([\s\S]*?)<\/div>/i);
  if (!content) return null;
  return stripHtml(content[1].match(/<p>([\s\S]*?)<\/p>/i)?.[1] || "");
}

function getPlayer(html, pageUrl) {
  // Primary: data-lazy-src on iframe#main-player
  const lazySrc = html.match(/id="main-player"[\s\S]*?data-lazy-src="([^"]+)"/i)
    || html.match(/data-lazy-src="([^"]+)"[\s\S]*?id="main-player"/i);

  // Fallback: direct src
  const directSrc = html.match(/id="main-player"[\s\S]*?src="([^"]+)"/i);

  const playerUrl = lazySrc?.[1] || directSrc?.[1] || null;

  // Also grab the trembed params if present
  let trid = null, trtype = null;
  if (playerUrl) {
    try {
      const u = new URL(playerUrl, pageUrl);
      trid = u.searchParams.get("trid");
      trtype = u.searchParams.get("trtype");
    } catch {}
  }

  return { url: playerUrl, trid, trtype };
}

function getCurrentEpisode(html) {
  // "You are watching Season X Episode Y"
  const bar = html.match(/<div[^>]*class="single-episode-bar"[^>]*>([^<]+)<\/div>/i);
  if (!bar) return null;
  const text = bar[1].trim();
  const s = text.match(/Season\s+(\d+)/i)?.[1] || null;
  const e = text.match(/Episode\s+(\d+)/i)?.[1] || null;
  return { text, season: s ? Number(s) : null, episode: e ? Number(e) : null };
}

function getNavigation(html) {
  // .episodes__nav links
  const navBlock = html.match(/<div[^>]*class="episodes__nav"[^>]*>([\s\S]*?)<\/div>/i);
  if (!navBlock) return {};

  const links = [];
  const re = /href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(navBlock[1])) !== null) {
    const label = stripHtml(m[2]).replace(/\s+/g, " ").trim();
    if (label) links.push({ label, url: m[1] });
  }

  return {
    prev: links.find((l) => /prev|back/i.test(l.label)) || null,
    next: links.find((l) => /next/i.test(l.label)) || null,
    episodes: links.find((l) => /episode/i.test(l.label)) || null,
    all: links,
  };
}

function getSeasons(html) {
  const seasons = [];
  // Each season block: id="season-N"
  const seasonRe = /id="season-(\d+)"([\s\S]*?)(?=id="season-\d+"|<\/div>\s*<div[^>]*class="tags"|$)/gi;
  let sm;

  while ((sm = seasonRe.exec(html)) !== null) {
    const seasonNum = Number(sm[1]);
    const block = sm[2];

    // Season title / episode count
    const titleMatch = block.match(/<p>Season\s*<span>(\d+)<\/span>/i);
    const dateMatch = block.match(/class="date">([^<]+)</i);

    // Episodes list
    const episodes = [];
    const epRe = /<li[^>]*data-episode-id="(\d+)"[^>]*>([\s\S]*?)<\/li>/gi;
    let em;

    while ((em = epRe.exec(block)) !== null) {
      const epId = em[1];
      const epBlock = em[2];

      const epLabel = match(epBlock, /<span>([^<]+)<\/span>/i); // e.g. "S1-E1"
      const epTitle = match(epBlock, /<h3[^>]*class="title"[^>]*>[\s\S]*?<\/span>\s*([\s\S]*?)<\/h3>/i);
      const epThumb = epBlock.match(/<img[^>]*src="([^"]+)"/i)?.[1] || null;
      const epLang = match(epBlock, /class="episode-lang"[^>]*>([^<]+)</i);
      const epUrl = epBlock.match(/href="([^"]+)"[^>]*class="btn[^"]*"[^>]*>Watch/i)?.[1]
        || epBlock.match(/href="([^"]+)"/i)?.[1]
        || null;

      episodes.push({
        id: Number(epId),
        label: epLabel,
        title: epTitle ? epTitle.trim() : null,
        thumbnail: epThumb,
        language: epLang,
        url: epUrl,
      });
    }

    seasons.push({
      season: seasonNum,
      date: dateMatch ? dateMatch[1].trim() : null,
      episodeCount: episodes.length,
      episodes,
    });
  }

  return seasons;
}

function getDownloadLinks(html) {
  // Inside .download-links table, links have data-url (base64 encoded)
  const links = [];
  const re = /<td><span[^>]*class="num"[^>]*>([^<]*)<\/td>[\s\S]*?data-url="([^"]+)"[\s\S]*?data-lmt="([^"]+)"/gi;
  let m;

  while ((m = re.exec(html)) !== null) {
    const language = m[1].trim();
    const encodedUrl = m[2];
    let decodedUrl = null;
    try {
      decodedUrl = atob(encodedUrl);
    } catch {}

    links.push({ language, encodedUrl, decodedUrl });
  }

  // Simpler fallback: grab any data-url attrs inside download modal
  if (links.length === 0) {
    const dlBlock = html.match(/<div[^>]*class="download-links"[^>]*>([\s\S]*?)<\/div>/i);
    if (dlBlock) {
      const reSimple = /data-url="([^"]+)"/gi;
      let ms;
      while ((ms = reSimple.exec(dlBlock[1])) !== null) {
        let decodedUrl = null;
        try { decodedUrl = atob(ms[1]); } catch {}
        links.push({ language: null, encodedUrl: ms[1], decodedUrl });
      }
    }
  }

  return links;
}

function getTrailer(html) {
  // YouTube embed in trailer modal
  const src = html.match(/data-src='(https:\/\/www\.youtube\.com\/embed\/[^']+)'/i)
    || html.match(/data-src="(https:\/\/www\.youtube\.com\/embed\/[^"]+)"/i);
  if (!src) return null;
  const videoId = src[1].match(/embed\/([^?]+)/i)?.[1] || null;
  return { embedUrl: src[1], videoId };
}

function getTags(html) {
  const tagBlock = html.match(/<div[^>]*class="tags"[^>]*>([\s\S]*?)<\/div>/i);
  if (!tagBlock) return [];
  const tags = [];
  const re = /href="[^"]+"[^>]*rel="tag"[^>]*>([^<]+)</gi;
  let m;
  while ((m = re.exec(tagBlock[1])) !== null) {
    tags.push(m[1].trim());
  }
  return tags;
}
