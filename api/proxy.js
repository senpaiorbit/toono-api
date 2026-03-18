// api/proxy.js
// Scrapes the embed page and extracts the real iframe src
//
// Usage:
//   /api/proxy?trembed=1&trid=47709&trtype=2
//   /api/proxy?url=https://toono.app/?trembed=1&trid=47709&trtype=2
//
// Returns JSON:  { success, embedUrl, playerUrl, referrer }
// Or HTML mode: /api/proxy?trembed=1&trid=47709&trtype=2&render=1
//   → returns a full HTML page with the real player iframe (100% w/h + referrer)

// ─── Config ──────────────────────────────────────────────────────────────────

const BASE_URL = "https://toono.app";

// ─── Handler ─────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const { url, trembed, trid, trtype, render } = req.query;

  // ── 1. Normalise / build the embed URL ───────────────────────────────────
  let embedUrl;

  if (url) {
    // Caller passed a full URL — parse & re-normalise it so we always own it
    embedUrl = normaliseEmbedUrl(url);
  } else if (trid) {
    // Caller passed individual query params
    embedUrl = buildEmbedUrl({ trembed, trid, trtype });
  } else {
    return res.status(400).json({
      error: "Missing parameters",
      usage: [
        "/api/proxy?trembed=1&trid=47709&trtype=2",
        "/api/proxy?url=https://toono.app/?trembed=1&trid=47709&trtype=2",
        "/api/proxy?trembed=1&trid=47709&trtype=2&render=1  (returns HTML player page)",
      ],
    });
  }

  if (!embedUrl) {
    return res.status(400).json({ error: "Could not build a valid embed URL from provided params" });
  }

  // ── 2. Fetch the embed page ───────────────────────────────────────────────
  let html;
  try {
    const response = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: BASE_URL + "/",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    if (!response.ok) {
      return res.status(502).json({
        error: `Upstream returned ${response.status} ${response.statusText}`,
        embedUrl,
      });
    }

    html = await response.text();
  } catch (err) {
    return res.status(500).json({ error: "Fetch failed", detail: err.message, embedUrl });
  }

  // ── 3. Extract the real player src ───────────────────────────────────────
  const playerUrl = extractPlayerSrc(html);

  if (!playerUrl) {
    return res.status(502).json({
      error: "Could not find iframe src in embed page",
      embedUrl,
      htmlSnippet: html.slice(0, 500), // first 500 chars for debugging
    });
  }

  // ── 4. Render mode → return full HTML page ───────────────────────────────
  if (render === "1" || render === "true") {
    const referrer = getReferrer(playerUrl, embedUrl);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(buildPlayerPage(playerUrl, referrer, embedUrl));
  }

  // ── 5. JSON mode (default) ────────────────────────────────────────────────
  return res.status(200).json({
    success: true,
    embedUrl,
    playerUrl,
    referrer: getReferrer(playerUrl, embedUrl),
  });
}

// ─── URL helpers ─────────────────────────────────────────────────────────────

/**
 * Accepts any of these inputs and always returns a clean embed URL:
 *   "https://toono.app/?trembed=1&trid=47709&trtype=2"
 *   "toono.app/?trembed=1&trid=47709&trtype=2"
 *   "/?trembed=1&trid=47709&trtype=2"
 */
function normaliseEmbedUrl(raw) {
  try {
    // Try parsing as-is first
    let parsed;
    if (/^https?:\/\//i.test(raw)) {
      parsed = new URL(raw);
    } else if (raw.startsWith("/")) {
      parsed = new URL(raw, BASE_URL);
    } else {
      parsed = new URL("https://" + raw);
    }

    // Extract the 3 known params; fall back to empty string
    const trembed = parsed.searchParams.get("trembed") || "1";
    const trid = parsed.searchParams.get("trid") || "";
    const trtype = parsed.searchParams.get("trtype") || "2";

    if (!trid) return null; // trid is required

    return buildEmbedUrl({ trembed, trid, trtype });
  } catch {
    return null;
  }
}

/** Build canonical embed URL from individual params */
function buildEmbedUrl({ trembed = "1", trid, trtype = "2" }) {
  if (!trid) return null;
  const u = new URL(BASE_URL);
  u.searchParams.set("trembed", trembed);
  u.searchParams.set("trid", trid);
  u.searchParams.set("trtype", trtype);
  return u.toString(); // https://toono.app/?trembed=1&trid=47709&trtype=2
}

// ─── Scraper ─────────────────────────────────────────────────────────────────

/**
 * Extract the real player iframe src from the embed page HTML.
 * Tries multiple patterns in priority order.
 */
function extractPlayerSrc(html) {
  const patterns = [
    // <div class="Video"><iframe ... src="URL"
    /<div[^>]*class="Video"[^>]*>[\s\S]*?<iframe[^>]*src="([^"]+)"/i,
    // Any iframe inside body with a real http src
    /<body[\s\S]*?<iframe[^>]*\ssrc="(https?:\/\/[^"]+)"/i,
    // Fallback: first iframe src anywhere
    /<iframe[^>]*\ssrc="(https?:\/\/[^"]+)"/i,
  ];

  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1] && !m[1].includes("cloudflare") && !m[1].includes("analytics")) {
      return m[1];
    }
  }
  return null;
}

/**
 * Determine the correct Referer header value to send with the player.
 * Most embed hosts require the referer to be the *embed page host*, not BASE_URL.
 */
function getReferrer(playerUrl, embedUrl) {
  try {
    // Use the embed page origin as referer (toono.app)
    return new URL(embedUrl).origin + "/";
  } catch {
    return BASE_URL + "/";
  }
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

/**
 * Returns a minimal full-page HTML document that:
 *  - iframes the real player at 100% width/height
 *  - sets the correct referrer policy so the player host accepts it
 *  - disables right-click (mirrors original behaviour)
 */
function buildPlayerPage(playerUrl, referrer, embedUrl) {
  // Escape for safe use inside HTML attribute / JS string
  const safePlayerUrl = playerUrl.replace(/"/g, "&quot;");
  const safeReferrer = referrer.replace(/"/g, "&quot;");
  const safeEmbedUrl = embedUrl.replace(/"/g, "&quot;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex, nofollow" />
  <meta name="referrer" content="origin" />
  <!-- Tell the browser to send the embed-page origin as Referer -->
  <meta http-equiv="Referrer-Policy" content="no-referrer-when-downgrade" />
  <title>Player</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 100%; height: 100%;
      background: #000;
      overflow: hidden;
    }
    #player-frame {
      position: fixed;
      top: 0; left: 0;
      width: 100%; height: 100%;
      border: none;
      display: block;
    }
    /* Loading indicator shown until iframe fires load */
    #loader {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #000;
      z-index: 10;
      pointer-events: none;
    }
    .spinner {
      width: 48px; height: 48px;
      border: 5px solid rgba(255,255,255,0.15);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body oncontextmenu="return false;">
  <div id="loader"><div class="spinner"></div></div>
  <iframe
    id="player-frame"
    src="${safePlayerUrl}"
    allowfullscreen
    allow="autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
    referrerpolicy="no-referrer-when-downgrade"
    frameborder="0"
    scrolling="no"
  ></iframe>
  <script>
    // Hide loader once iframe content starts loading
    document.getElementById('player-frame').addEventListener('load', function () {
      var loader = document.getElementById('loader');
      if (loader) loader.style.display = 'none';
    });

    // Debug info accessible from parent via postMessage or console
    console.info('[proxy] playerUrl  :', "${safePlayerUrl}");
    console.info('[proxy] referrer   :', "${safeReferrer}");
    console.info('[proxy] embedUrl   :', "${safeEmbedUrl}");
  </script>
</body>
</html>`;
}
