// api/stream.js
//
// Proxy for HLS streams (m3u8 + ts segments) and any other media URLs.
// Fetches the target with the correct Referer so the CDN/stream host
// never sees the browser's origin — only our server's request.
//
// Usage:
//   GET /api/stream?url=<encoded-url>&ref=<encoded-referer>
//
// Examples:
//   /api/stream?url=https%3A%2F%2Fgroovy.monster%2Fstream%2F...%2Findex.m3u8&ref=https%3A%2F%2Fargon.razorshell.space%2Fembed%2FbesmGUdwMat5TFy
//   /api/stream?url=https%3A%2F%2Fgroovy.monster%2Fstream%2F...%2Fseg0.ts&ref=...

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

export default async function handler(req, res) {
  // CORS — allow any site to use this proxy (e.g. from the rendered player page)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Range, Content-Type");
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Range, Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (!["GET", "HEAD"].includes(req.method))
    return res.status(405).json({ error: "Method not allowed" });

  const { url: rawUrl, ref: rawRef } = req.query;

  if (!rawUrl) {
    return res.status(400).json({
      error: "Missing url parameter",
      usage: "/api/stream?url=<stream-url>&ref=<referer-url>",
    });
  }

  // ── Validate URLs ────────────────────────────────────────────────────────
  let targetUrl, referer;
  try {
    targetUrl = new URL(rawUrl).toString();
  } catch {
    return res.status(400).json({ error: "Invalid url parameter" });
  }
  try {
    referer = rawRef ? new URL(rawRef).toString() : "https://argon.razorshell.space/";
  } catch {
    referer = "https://argon.razorshell.space/";
  }

  const refOrigin = new URL(referer).origin;
  const apiBase   = getApiBase(req);

  // ── Upstream fetch ───────────────────────────────────────────────────────
  let upstream;
  try {
    upstream = await fetch(targetUrl, {
      method: req.method,
      headers: {
        "User-Agent":       UA,
        Referer:            referer,      // ← the key: argon.razorshell.space/embed/...
        Origin:             refOrigin,
        Accept:             "*/*",
        "Accept-Language":  "en-US,en;q=0.9",
        "Accept-Encoding":  "identity",
        "Sec-Fetch-Mode":   "cors",
        "Sec-Fetch-Dest":   "empty",
        "Sec-Fetch-Site":   "cross-site",
        // Forward Range header if the player is doing range requests
        ...(req.headers.range ? { Range: req.headers.range } : {}),
      },
    });
  } catch (err) {
    return res.status(502).json({
      error: "Upstream fetch failed",
      detail: err.message,
      targetUrl,
      referer,
    });
  }

  if (!upstream.ok && upstream.status !== 206) {
    return res.status(upstream.status).json({
      error: `Stream host returned ${upstream.status} ${upstream.statusText}`,
      targetUrl,
      referer,
      hint: upstream.status === 403
        ? "Referer/IP check failed — embed token may have expired"
        : undefined,
    });
  }

  // ── Determine content type ───────────────────────────────────────────────
  const contentType = upstream.headers.get("content-type") || guessContentType(targetUrl);
  const isM3u8 = /mpegurl|m3u8/i.test(contentType) || targetUrl.includes(".m3u8");
  const isMasterM3u8 = isM3u8 && (
    targetUrl.includes("master") ||
    targetUrl.includes("playlist") ||
    targetUrl.match(/index\.m3u8/)
  );

  // ── M3U8 playlist — rewrite chunk URLs ──────────────────────────────────
  if (isM3u8) {
    const body = await upstream.text();
    const base  = targetUrl.substring(0, targetUrl.lastIndexOf("/") + 1);
    const rewritten = rewriteM3u8(body, base, referer, apiBase);

    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cache-Control", "no-cache");
    return res.status(200).send(rewritten);
  }

  // ── Binary pass-through (video segments, audio, images) ─────────────────
  const buffer = await upstream.arrayBuffer();

  res.setHeader("Content-Type", contentType);
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Forward useful headers from upstream
  for (const header of ["content-length", "content-range", "accept-ranges", "cache-control"]) {
    const val = upstream.headers.get(header);
    if (val) res.setHeader(header.replace(/\b\w/g, (c) => c.toUpperCase()), val);
  }

  return res
    .status(upstream.status === 206 ? 206 : 200)
    .send(Buffer.from(buffer));
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function getApiBase(req) {
  const proto = req.headers["x-forwarded-proto"] || "https";
  const host  = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  return `${proto}://${host}`;
}

function guessContentType(url) {
  if (url.includes(".m3u8")) return "application/vnd.apple.mpegurl";
  if (url.includes(".ts"))   return "video/mp2t";
  if (url.includes(".mp4"))  return "video/mp4";
  if (url.includes(".webm")) return "video/webm";
  if (url.includes(".jpg") || url.includes(".jpeg")) return "image/jpeg";
  if (url.includes(".png"))  return "image/png";
  return "application/octet-stream";
}

/**
 * Rewrite every non-comment line in an m3u8 file so that all
 * chunk/sub-playlist URLs are fetched via /api/stream.
 */
function rewriteM3u8(body, baseUrl, referer, apiBase) {
  return body
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (trimmed === "" || trimmed.startsWith("#")) return line;

      // Resolve relative URL against the playlist's base
      let absolute;
      try {
        absolute = /^https?:\/\//i.test(trimmed)
          ? trimmed
          : new URL(trimmed, baseUrl).toString();
      } catch {
        return line;
      }

      // Proxy it through /api/stream
      const proxy = new URL(`${apiBase}/api/stream`);
      proxy.searchParams.set("url", absolute);
      proxy.searchParams.set("ref", referer);
      return proxy.toString();
    })
    .join("\n");
}
