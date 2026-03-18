// api/proxy.js
// Scrapes the embed page and either:
//   - returns JSON with playerUrl  (default)
//   - server-side fetches + streams the real player HTML (?render=1)
//     so the browser never makes a cross-origin request and the
//     Referer check on the player host always passes.
//
// ── Endpoints ────────────────────────────────────────────────────────────────
//   GET /api/proxy?trembed=1&trid=47709&trtype=2          → JSON
//   GET /api/proxy?url=https://toono.app/?trembed=1&trid=47709&trtype=2 → JSON
//   GET /api/proxy?trembed=1&trid=47709&trtype=2&render=1
//        → HTML wrapper page; inner iframe points back to this API with stream=1
//   GET /api/proxy?playerUrl=https://...&referer=https://...&stream=1
//        → server fetches the real player page with correct Referer, streams it

// ─── Config ───────────────────────────────────────────────────────────────────

const BASE_URL = "https://toono.app";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "identity",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
};

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { url, trembed, trid, trtype, render, stream, playerUrl, referer } = req.query;

  // ── Branch A: stream=1 sub-request from wrapper iframe ───────────────────
  // The wrapper page's iframe calls us with ?playerUrl=...&referer=...&stream=1
  // We fetch the real player server-side with the correct Referer and pipe it back.
  if (stream === "1" && playerUrl) {
    let safePlayerUrl, safeReferer;
    try {
      safePlayerUrl = new URL(playerUrl).toString();
      safeReferer   = referer ? new URL(referer).toString() : BASE_URL + "/";
    } catch {
      return res.status(400).json({ error: "Invalid playerUrl or referer param" });
    }
    return streamPlayerPage(res, safePlayerUrl, safeReferer);
  }

  // ── Branch B: normal scrape flow ─────────────────────────────────────────

  // 1. Normalise / build the embed URL
  let embedUrl;
  if (url) {
    embedUrl = normaliseEmbedUrl(url);
  } else if (trid) {
    embedUrl = buildEmbedUrl({ trembed, trid, trtype });
  } else {
    return res.status(400).json({
      error: "Missing parameters",
      usage: {
        json:         "/api/proxy?trembed=1&trid=47709&trtype=2",
        jsonFromUrl:  "/api/proxy?url=https://toono.app/?trembed=1&trid=47709&trtype=2",
        renderHtml:   "/api/proxy?trembed=1&trid=47709&trtype=2&render=1",
      },
    });
  }

  if (!embedUrl) {
    return res.status(400).json({ error: "Could not build a valid embed URL from the provided params" });
  }

  // 2. Fetch the toono embed page
  let embedHtml;
  try {
    const embedRes = await fetch(embedUrl, {
      headers: {
        ...BROWSER_HEADERS,
        Referer: BASE_URL + "/",
        Origin:  BASE_URL,
      },
    });
    if (!embedRes.ok) {
      return res.status(502).json({
        error: `Embed page returned ${embedRes.status} ${embedRes.statusText}`,
        embedUrl,
      });
    }
    embedHtml = await embedRes.text();
  } catch (err) {
    return res.status(500).json({ error: "Embed fetch failed", detail: err.message, embedUrl });
  }

  // 3. Extract real player URL from embed HTML
  const extractedPlayerUrl = extractPlayerSrc(embedHtml);
  if (!extractedPlayerUrl) {
    return res.status(502).json({
      error: "Could not find iframe src in embed page",
      embedUrl,
      hint: "The embed page structure may have changed",
      htmlSnippet: embedHtml.slice(0, 800),
    });
  }

  // The Referer the player host expects = the FULL embed URL
  // e.g. "https://toono.app/?trembed=1&trid=47709&trtype=2"
  const correctReferrer = embedUrl;

  // 4. render=1 → return wrapper HTML page
  if (render === "1" || render === "true") {
    const streamHref = buildStreamHref(req, extractedPlayerUrl, correctReferrer);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(buildWrapperPage(streamHref, extractedPlayerUrl, embedUrl));
  }

  // 5. JSON mode (default)
  return res.status(200).json({
    success: true,
    embedUrl,
    playerUrl: extractedPlayerUrl,
    referrer: correctReferrer,
    renderUrl: `/api/proxy?trembed=${trembed||1}&trid=${trid}&trtype=${trtype||2}&render=1`,
  });
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

function normaliseEmbedUrl(raw) {
  try {
    let parsed;
    if (/^https?:\/\//i.test(raw)) {
      parsed = new URL(raw);
    } else if (raw.startsWith("/")) {
      parsed = new URL(raw, BASE_URL);
    } else {
      parsed = new URL("https://" + raw);
    }
    const trembed = parsed.searchParams.get("trembed") || "1";
    const trid    = parsed.searchParams.get("trid")    || "";
    const trtype  = parsed.searchParams.get("trtype")  || "2";
    if (!trid) return null;
    return buildEmbedUrl({ trembed, trid, trtype });
  } catch {
    return null;
  }
}

function buildEmbedUrl({ trembed = "1", trid, trtype = "2" }) {
  if (!trid) return null;
  const u = new URL(BASE_URL);
  u.searchParams.set("trembed", trembed);
  u.searchParams.set("trid",    trid);
  u.searchParams.set("trtype",  trtype);
  return u.toString();
}

/**
 * Build the /api/proxy?stream=1&playerUrl=...&referer=... href.
 * The wrapper iframe points here so the server (not the browser) fetches
 * the real player with the correct Referer.
 */
function buildStreamHref(req, playerUrl, referer) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host  = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  const u     = new URL("/api/proxy", `${proto}://${host}`);
  u.searchParams.set("stream",    "1");
  u.searchParams.set("playerUrl", playerUrl);
  u.searchParams.set("referer",   referer);
  return u.toString();
}

// ─── Scraper ─────────────────────────────────────────────────────────────────

function extractPlayerSrc(html) {
  const SKIP = ["cloudflare", "analytics", "beacon", "gtag", "google"];

  const patterns = [
    // Preferred: inside .Video wrapper
    /<div[^>]*class="Video"[^>]*>[\s\S]*?<iframe[^>]*\ssrc="([^"]+)"/i,
    // Any iframe in body with absolute URL
    /<body[\s\S]*?<iframe[^>]*\ssrc="(https?:\/\/[^"]+)"/i,
    // Last resort: first iframe src anywhere
    /<iframe[^>]*\ssrc="(https?:\/\/[^"]+)"/i,
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1] && !SKIP.some((s) => m[1].includes(s))) {
      return m[1];
    }
  }
  return null;
}

// ─── Server-side player stream ────────────────────────────────────────────────

/**
 * Fetch the real player page server-side with the correct Referer header
 * and stream the response back to the client.
 *
 * Why this works:
 *   - The player host (e.g. argon.razorshell.space) checks the HTTP Referer header
 *   - If the request comes from the browser the Referer is our Vercel domain → blocked
 *   - Here the request comes from our Node server with Referer = embedUrl → allowed
 *   - The browser only ever talks to our own domain so no CORS / Referer issue
 */
async function streamPlayerPage(res, playerUrl, referer) {
  try {
    const upstream = await fetch(playerUrl, {
      headers: {
        ...BROWSER_HEADERS,
        Referer:          referer,                    // full embed URL
        Origin:           new URL(referer).origin,    // toono.app
        "Sec-Fetch-Site": "cross-site",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "iframe",
      },
    });

    if (!upstream.ok) {
      return res.status(502).json({
        error:     `Player host returned ${upstream.status} ${upstream.statusText}`,
        playerUrl,
        referer,
        hint:      "The player host may be checking cookies or a token in addition to Referer",
      });
    }

    const contentType = upstream.headers.get("content-type") || "text/html; charset=utf-8";
    const body        = await upstream.text();

    // Inject <base> so relative asset paths still resolve against the player host
    const rewritten = injectBase(body, playerUrl);

    res.setHeader("Content-Type", contentType);
    // Allow this response to be framed by our own wrapper page
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("X-Proxied-From", playerUrl);
    return res.status(200).send(rewritten);
  } catch (err) {
    return res.status(500).json({
      error:     "Player stream failed",
      detail:    err.message,
      playerUrl,
      referer,
    });
  }
}

/** Inject <base href="origin/"> so relative URLs resolve correctly */
function injectBase(html, playerUrl) {
  try {
    const origin = new URL(playerUrl).origin;
    // Insert after opening <head> tag (or at the very start if no head)
    if (/<head[^>]*>/i.test(html)) {
      return html.replace(/(<head[^>]*>)/i, `$1\n  <base href="${origin}/" />`);
    }
    return `<base href="${origin}/" />\n` + html;
  } catch {
    return html;
  }
}

// ─── Wrapper page ─────────────────────────────────────────────────────────────

/**
 * Minimal full-page HTML wrapper.
 * The <iframe> src = /api/proxy?stream=1&playerUrl=...&referer=...
 * so our server fetches the player — the browser never contacts the player host.
 */
function buildWrapperPage(streamHref, playerUrl, embedUrl) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <title>Player</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: #000; overflow: hidden; }

    #player-frame {
      position: fixed; top: 0; left: 0;
      width: 100%; height: 100%;
      border: none; display: block;
    }

    #loader {
      position: fixed; inset: 0;
      display: flex; align-items: center; justify-content: center;
      background: #000; z-index: 10;
      transition: opacity 0.4s ease;
    }
    #loader.hidden { opacity: 0; pointer-events: none; }

    .spinner {
      width: 52px; height: 52px;
      border: 4px solid rgba(255,255,255,0.12);
      border-top-color: rgba(255,255,255,0.88);
      border-radius: 50%;
      animation: spin 0.75s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body oncontextmenu="return false;">

  <div id="loader"><div class="spinner"></div></div>

  <!--
    HOW IT WORKS
    ─────────────────────────────────────────────────────────────────────
    src points to /api/proxy?stream=1&playerUrl=<real-player>&referer=<embed-url>

    When the browser loads this iframe it calls OUR server, which then:
      1. Fetches <real-player> with  Referer: <embed-url>
      2. Streams the response back to the browser

    Result: the player host sees a server request with the correct Referer,
    never a browser request from our Vercel domain.
    ─────────────────────────────────────────────────────────────────────
  -->
  <iframe
    id="player-frame"
    src="${esc(streamHref)}"
    allowfullscreen
    allow="autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
    referrerpolicy="no-referrer-when-downgrade"
    frameborder="0"
    scrolling="no"
  ></iframe>

  <script>
    var frame  = document.getElementById('player-frame');
    var loader = document.getElementById('loader');

    frame.addEventListener('load', function () {
      loader.classList.add('hidden');
    });

    // Safety: hide loader after 15 s regardless
    setTimeout(function () { loader.classList.add('hidden'); }, 15000);

    console.info('[proxy] wrapper    :', window.location.href);
    console.info('[proxy] streamHref :', "${esc(streamHref)}");
    console.info('[proxy] playerUrl  :', "${esc(playerUrl)}");
    console.info('[proxy] embedUrl   :', "${esc(embedUrl)}");
  </script>
</body>
</html>`;
}
