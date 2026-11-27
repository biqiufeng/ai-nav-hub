/**
 * Cloudflare Pages Function: GET /api/icon?d=<domain>
 * Edge-cached Favicon proxy (30-day CDN s-maxage) so mainland & global visitors load tool icons
 * directly from same-origin Cloudflare Edge without 3rd-party anti-hotlink or GFW timeouts.
 */

const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i;

export async function onRequestGet(context) {
  const { request } = context;
  const reqUrl = new URL(request.url);
  const dom = (reqUrl.searchParams.get("d") || "").trim().toLowerCase().replace(/^www\./, "");

  if (!dom || !DOMAIN_RE.test(dom) || dom.endsWith(".local") || dom.endsWith(".internal")) {
    return new Response(null, { status: 400, headers: { "Cache-Control": "public, max-age=3600" } });
  }

  const cache = caches.default;
  const cacheKey = new Request(`${reqUrl.origin}/api/icon?d=${encodeURIComponent(dom)}`, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const upstreams = [
    `https://www.google.com/s2/favicons?domain=${encodeURIComponent(dom)}&sz=64`,
    `https://icons.duckduckgo.com/ip3/${encodeURIComponent(dom)}.ico`,
    `https://favicon.im/${encodeURIComponent(dom)}?larger=true`,
  ];

  for (const target of upstreams) {
    try {
      const res = await fetch(target, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; AI-Nav-Hub-IconProxy/1.0)",
          Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8",
        },
        signal: AbortSignal.timeout(4500),
        cf: { cacheTtl: 2592000, cacheEverything: true },
      });
      if (!res.ok) continue;
      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (!ct.startsWith("image/") && !ct.includes("icon")) continue;
      const buf = await res.arrayBuffer();
      if (buf.byteLength < 68 || buf.byteLength > 524288) continue;

      const out = new Response(buf, {
        status: 200,
        headers: {
          "Content-Type": ct || "image/png",
          "Cache-Control": "public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400",
          "X-Content-Type-Options": "nosniff",
        },
      });
      context.waitUntil(cache.put(cacheKey, out.clone()));
      return out;
    } catch {
      // Try next upstream icon provider
    }
  }

  const miss = new Response(null, {
    status: 404,
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=21600" },
  });
  context.waitUntil(cache.put(cacheKey, miss.clone()));
  return miss;
}
