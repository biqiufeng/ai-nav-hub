const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
  "ref", "from", "spm", "source", "via", "share", "invite", "code",
  "sourcepage", "ch", "invitecode",
]);

function decodeEntities(str) {
  return String(str || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&(nbsp|amp|lt|gt|quot|apos|#39|mdash|ndash|hellip);/gi, (m, k) => ({
      nbsp: " ",
      amp: "&",
      lt: "<",
      gt: ">",
      quot: '"',
      apos: "'",
      "#39": "'",
      mdash: "—",
      ndash: "–",
      hellip: "…",
    })[k.toLowerCase()] || m);
}

function stripTags(raw) {
  return decodeEntities(String(raw || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(raw) {
  const txt = decodeEntities(String(raw || "").trim());
  if (!txt || !/^https?:\/\//i.test(txt)) return "";
  try {
    const u = new URL(txt);
    if (!u.hostname || !u.hostname.includes(".")) return "";
    for (const key of [...u.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase())) {
        u.searchParams.delete(key);
      }
    }
    const cleanPath = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
    u.pathname = cleanPath || "/";
    let out = u.toString();
    if (!cleanPath && !u.search && out.endsWith("/")) {
      out = out.slice(0, -1);
    }
    return out;
  } catch {
    return "";
  }
}

function safeIconUrl(raw) {
  const u = normalizeUrl(raw);
  if (!u) return "";
  const low = u.toLowerCase();
  if (low.includes("onenav/images/favicon.png") || low.includes("placeholder") || low.includes("default-avatar")) {
    return "";
  }
  return u;
}

function nowUtc8Iso() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19) + "+08:00";
}

export async function onRequestGet({ request }) {
  const reqUrl = new URL(request.url);
  const forceRefresh = reqUrl.searchParams.get("refresh") === "1";

  let upstreamRes;
  try {
    upstreamRes = await fetch("https://www.baoboxs.com/api/utility/proxy/hotlist", {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.baoboxs.com/",
        Accept: "application/json,text/plain,*/*",
      },
      signal: AbortSignal.timeout(10000),
      cf: {
        cacheTtl: forceRefresh ? 0 : 120,
        cacheEverything: !forceRefresh,
      },
    });
  } catch (err) {
    return Response.json(
      { error: "upstream_fetch_failed", detail: String(err?.message || err) },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  if (!upstreamRes.ok) {
    return Response.json(
      { error: "upstream_http_error", status: upstreamRes.status },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  let payload;
  try {
    payload = await upstreamRes.json();
  } catch {
    return Response.json(
      { error: "upstream_invalid_json" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  const platforms = [];
  for (const entry of payload?.data || []) {
    const cfg = entry?.config || {};
    const pid = String(cfg.platformId || "").trim();
    const pname = stripTags(cfg.platformName || pid);
    if (!pid || !pname) continue;

    const items = [];
    for (const it of (entry?.items || []).slice(0, 30)) {
      const title = stripTags(it?.title || "");
      const url = normalizeUrl(it?.url || "");
      if (!title || !url) continue;
      items.push({
        title,
        url,
        hot_value: String(it?.hotValue ?? ""),
        is_hot: Boolean(it?.isHot),
        is_new: Boolean(it?.isNew),
        is_rising: Boolean(it?.isRising),
      });
    }
    if (items.length === 0) continue;

    platforms.push({
      id: pid,
      name: pname,
      short_name: stripTags(cfg.platformShortName || pname),
      icon: safeIconUrl(cfg.iconUrl || ""),
      color: String(cfg.color || "#0071e3"),
      updated_at: String(cfg.lastUpdateTime || ""),
      items,
    });
  }

  if (platforms.length === 0) {
    return Response.json(
      { error: "empty_upstream" },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  return new Response(
    JSON.stringify({
      generated_at: nowUtc8Iso(),
      platforms_count: platforms.length,
      platforms,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": forceRefresh ? "no-store" : "public, max-age=60, s-maxage=120",
        "X-Hotlist-Source": "live",
      },
    }
  );
}
