// api/proxy.js
//
// Full 3-hop proxy chain:
//   HOP 1: Fetch toono.app embed page   (Referer: toono.app episode page)
//   HOP 2: Fetch argon player page      (Referer: toono.app embed URL)
//   HOP 3: Rewrite HLS URLs to go via   /api/stream  (Referer: argon embed URL)
//
// ── Endpoints ──────────────────────────────────────────────────────────────
//
//  JSON  (default):
//    GET /api/proxy?trembed=1&trid=47709&trtype=2
//    GET /api/proxy?url=https://toono.app/?trembed=1&trid=47709&trtype=2
//    → { embedUrl, playerUrl, referrer, renderUrl }
//
//  HTML render  (returns full playable page):
//    GET /api/proxy?trembed=1&trid=47709&trtype=2&render=1
//    → serves argon embed HTML with all URLs rewritten through this API

// ─── Config ───────────────────────────────────────────────────────────────

const BASE_URL = "https://toono.app";

// Headers that look like a real browser
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

const HEADERS = {
  "User-Agent": UA,
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "identity",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Dest": "iframe",
  "Sec-Fetch-Site": "cross-site",
};

// ─── Handler ─────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const q = req.query;

  // ── Branch A: stream sub-request from rewritten player page ─────────────
  // /api/proxy?_stream=1&url=<player-page-url>&ref=<toono-embed-url>
  if (q._stream === "1" && q.url) {
    return handleStreamRequest(req, res, q.url, q.ref || BASE_URL + "/");
  }

  // ── Branch B: normal flow ────────────────────────────────────────────────

  // 1. Build embed URL
  let embedUrl;
  if (q.url) {
    embedUrl = normaliseEmbedUrl(q.url);
  } else if (q.trid) {
    embedUrl = buildEmbedUrl(q);
  } else {
    return res.status(400).json({
      error: "Missing parameters",
      usage: {
        json: "/api/proxy?trembed=1&trid=47709&trtype=2",
        render: "/api/proxy?trembed=1&trid=47709&trtype=2&render=1",
      },
    });
  }

  if (!embedUrl) return res.status(400).json({ error: "Invalid embed URL params" });

  // 2. HOP 1 — fetch toono embed page to get argon player URL
  let embedHtml;
  try {
    const r = await fetch(embedUrl, {
      headers: { ...HEADERS, Referer: BASE_URL + "/", Origin: BASE_URL },
    });
    if (!r.ok) return res.status(502).json({ error: `Toono returned ${r.status}`, embedUrl });
    embedHtml = await r.text();
  } catch (e) {
    return res.status(500).json({ error: "Hop-1 fetch failed", detail: e.message });
  }

  // 3. Extract the argon player URL from the iframe in toono's embed page
  const playerUrl = extractSrc(embedHtml);
  if (!playerUrl) {
    return res.status(502).json({
      error: "Could not find player iframe src",
      embedUrl,
      htmlSnippet: embedHtml.slice(0, 600),
    });
  }

  // The referer argon expects = the FULL toono embed URL
  const playerReferer = embedUrl;

  // 4. Render mode — full HTML page
  if (q.render === "1" || q.render === "true") {
    return renderPlayerPage(req, res, playerUrl, playerReferer);
  }

  // 5. JSON mode
  const apiBase = getApiBase(req);
  return res.status(200).json({
    success: true,
    embedUrl,
    playerUrl,
    referrer: playerReferer,
    renderUrl: `${apiBase}/api/proxy?${new URLSearchParams({
      trembed: q.trembed || "1",
      trid: q.trid,
      trtype: q.trtype || "2",
      render: "1",
    })}`,
  });
}

// ─── Render: HOP 2 → serves argon page with all URLs rewritten ───────────

async function renderPlayerPage(req, res, playerUrl, playerReferer) {
  // HOP 2 — fetch the argon embed page with correct Referer
  let playerHtml;
  try {
    const r = await fetch(playerUrl, {
      headers: { ...HEADERS, Referer: playerReferer, Origin: new URL(playerReferer).origin },
    });
    if (!r.ok) {
      return res.status(502).json({
        error: `Argon returned ${r.status} — possible IP/cookie block`,
        playerUrl,
        referer: playerReferer,
        hint: "The embed ID may have expired. Try a fresh trid request.",
      });
    }
    playerHtml = await r.text();
  } catch (e) {
    return res.status(500).json({ error: "Hop-2 fetch failed", detail: e.message });
  }

  const apiBase = getApiBase(req);
  const playerOrigin = new URL(playerUrl).origin; // https://argon.razorshell.space

  // Rewrite the HTML so that:
  //  • relative assets resolve against the player origin (<base> tag)
  //  • HLS stream URLs (m3u8/ts) are routed via /api/stream with correct Referer
  //  • script src & link href that are absolute argon URLs pass through normally
  //    (browser loads them from argon directly; static assets don't check Referer)
  let rewritten = rewritePlayerHtml(playerHtml, playerOrigin, playerUrl, apiBase);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("X-Proxied-Player", playerUrl);
  return res.status(200).send(rewritten);
}

// ─── Stream sub-request: HOP 3 ────────────────────────────────────────────
// Proxies any URL (m3u8 playlist or .ts segment) with the correct Referer.
// For m3u8 files also rewrites internal URLs so they also go through this proxy.

async function handleStreamRequest(req, res, rawUrl, rawRef) {
  let targetUrl, referer;
  try {
    targetUrl = new URL(rawUrl).toString();
    referer = new URL(rawRef).toString();
  } catch {
    return res.status(400).json({ error: "Invalid stream url/ref params" });
  }

  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      headers: {
        ...HEADERS,
        Referer: referer,
        Origin: new URL(referer).origin,
        Accept: "*/*",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Site": "cross-site",
      },
    });
  } catch (e) {
    return res.status(500).json({ error: "Stream fetch failed", detail: e.message, targetUrl });
  }

  if (!upstream.ok) {
    return res.status(upstream.status).json({
      error: `Stream host returned ${upstream.status}`,
      targetUrl,
      referer,
    });
  }

  const contentType = upstream.headers.get("content-type") || "";
  const isM3u8 = /mpegurl|m3u8/i.test(contentType) || targetUrl.includes(".m3u8");

  if (isM3u8) {
    // Rewrite m3u8 playlist — all chunk URLs must also go through this proxy
    const body = await upstream.text();
    const apiBase = getApiBase(req);
    const rewrittenM3u8 = rewriteM3u8(body, targetUrl, referer, apiBase);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(rewrittenM3u8);
  }

  // Binary pass-through (video segments, images, etc.)
  const buffer = await upstream.arrayBuffer();
  res.setHeader("Content-Type", contentType || "application/octet-stream");
  res.setHeader("Access-Control-Allow-Origin", "*");
  // Forward range/content-length if present
  const cl = upstream.headers.get("content-length");
  if (cl) res.setHeader("Content-Length", cl);
  return res.status(200).send(Buffer.from(buffer));
}

// ─── URL helpers ──────────────────────────────────────────────────────────

function normaliseEmbedUrl(raw) {
  try {
    let p;
    if (/^https?:\/\//i.test(raw)) p = new URL(raw);
    else if (raw.startsWith("/")) p = new URL(raw, BASE_URL);
    else p = new URL("https://" + raw);

    const trembed = p.searchParams.get("trembed") || "1";
    const trid    = p.searchParams.get("trid") || "";
    const trtype  = p.searchParams.get("trtype") || "2";
    if (!trid) return null;
    return buildEmbedUrl({ trembed, trid, trtype });
  } catch { return null; }
}

function buildEmbedUrl({ trembed = "1", trid, trtype = "2" }) {
  if (!trid) return null;
  const u = new URL(BASE_URL);
  u.searchParams.set("trembed", trembed);
  u.searchParams.set("trid",    trid);
  u.searchParams.set("trtype",  trtype);
  return u.toString();
}

function getApiBase(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host  = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  return `${proto}://${host}`;
}

// ─── HTML scraping ────────────────────────────────────────────────────────

function extractSrc(html) {
  // Priority: <div class="Video"><iframe src="…">
  const patterns = [
    /<div[^>]*class="Video"[^>]*>[\s\S]*?<iframe[^>]*\ssrc="([^"]+)"/i,
    /<body[\s\S]*?<iframe[^>]*\ssrc="(https?:\/\/[^"]+)"/i,
    /<iframe[^>]*\ssrc="(https?:\/\/[^"]+)"/i,
  ];
  const SKIP = ["cloudflare", "analytics", "beacon", "gtag", "google"];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1] && !SKIP.some((s) => m[1].includes(s))) return m[1];
  }
  return null;
}

// ─── HTML rewriting ───────────────────────────────────────────────────────

/**
 * Rewrite the argon player HTML so that:
 *  1. A <base> tag makes relative assets resolve to the player origin
 *  2. Any hardcoded HLS stream URLs (in <script> tags / window.juicyData)
 *     are replaced with our /api/stream proxy URL
 *  3. Context menu / devtools blockers are neutered (optional QoL)
 */
function rewritePlayerHtml(html, playerOrigin, playerUrl, apiBase) {
  // Inject <base> immediately after <head>
  let out = html.replace(/(<head[^>]*>)/i, `$1\n  <base href="${playerOrigin}/" />`);

  // Rewrite HLS stream URLs inside inline scripts
  // Pattern: any https URL containing common stream indicators
  out = out.replace(
    /"(https?:\/\/[^"]+\.(?:m3u8|ts|mp4)[^"]*)"/gi,
    (match, streamUrl) => {
      if (streamUrl.includes(playerOrigin)) return match; // same-origin, leave it
      const proxied = buildStreamProxyUrl(apiBase, streamUrl, playerUrl);
      return `"${proxied}"`;
    }
  );

  // Also rewrite plain string assignments like: file:"https://..."
  out = out.replace(
    /(['`])(https?:\/\/[^'`]+\.m3u8[^'`]*)(['`])/gi,
    (match, q1, streamUrl, q3) => {
      if (streamUrl.includes(playerOrigin)) return match;
      const proxied = buildStreamProxyUrl(apiBase, streamUrl, playerUrl);
      return `${q1}${proxied}${q3}`;
    }
  );

  // Neuter the right-click blocker so devtools work normally
  out = out.replace(/oncontextmenu="return false;"/gi, "");

  return out;
}

function buildStreamProxyUrl(apiBase, targetUrl, referer) {
  const u = new URL(`${apiBase}/api/stream`);
  u.searchParams.set("url", targetUrl);
  u.searchParams.set("ref", referer);
  return u.toString();
}

/**
 * Rewrite an m3u8 playlist file so that all chunk/sub-playlist URLs
 * also go through /api/stream with the correct Referer.
 */
function rewriteM3u8(body, m3u8Url, referer, apiBase) {
  const base = m3u8Url.substring(0, m3u8Url.lastIndexOf("/") + 1);

  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();

      // Skip comment/tag lines
      if (trimmed.startsWith("#") || trimmed === "") return line;

      // It's a URL or relative path to a chunk/sub-playlist
      let absoluteUrl;
      try {
        absoluteUrl = /^https?:\/\//i.test(trimmed)
          ? trimmed
          : new URL(trimmed, base).toString();
      } catch {
        return line; // leave malformed lines alone
      }

      return buildStreamProxyUrl(apiBase, absoluteUrl, referer);
    })
    .join("\n");
}
