/**
 * Cloudflare Pages Function: GET /api/trending
 * Returns 7-day real visitor click counts from Cloudflare D1, cached at Edge (s-maxage=120).
 */

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const reqUrl = new URL(request.url);
  const cache = caches.default;
  const cacheKey = new Request(`${reqUrl.origin}/api/trending`, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  if (!env?.DB) {
    return Response.json(
      { updated_at: new Date().toISOString(), total_clicks_7d: 0, items: [] },
      { headers: { ...CORS_HEADERS, "Cache-Control": "public, max-age=60" } }
    );
  }

  const sinceDate = new Date(Date.now() + 8 * 3600 * 1000 - 7 * 86400 * 1000)
    .toISOString()
    .slice(0, 10);

  try {
    const [topRes, sumRes] = await Promise.all([
      env.DB.prepare(
        "SELECT tool_id AS id, SUM(clicks) AS clicks FROM tool_clicks WHERE day >= ?1 GROUP BY tool_id ORDER BY clicks DESC LIMIT 60"
      )
        .bind(sinceDate)
        .all(),
      env.DB.prepare("SELECT COALESCE(SUM(clicks), 0) AS total FROM tool_clicks WHERE day >= ?1")
        .bind(sinceDate)
        .first(),
    ]);

    const items = (topRes?.results || []).map((r) => ({
      id: r.id,
      clicks: Number(r.clicks || 0),
    }));

    const out = new Response(
      JSON.stringify({
        updated_at: new Date().toISOString(),
        since: sinceDate,
        total_clicks_7d: Number(sumRes?.total || 0),
        items,
      }),
      {
        status: 200,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "public, max-age=60, s-maxage=120, stale-while-revalidate=300",
        },
      }
    );
    context.waitUntil(cache.put(cacheKey, out.clone()));
    return out;
  } catch (err) {
    return Response.json(
      { updated_at: new Date().toISOString(), total_clicks_7d: 0, items: [], warning: String(err?.message || err) },
      { status: 200, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } }
    );
  }
}
