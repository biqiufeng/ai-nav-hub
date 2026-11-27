/**
 * Cloudflare Pages Function: GET /api/search
 * Zero-auth, CORS-enabled AI Tool Discovery API for AI Agents, LLM Tool Use, and Frontend Search.
 * Returns full detail_url (/tool/<slug>/) coverage across all 8,240+ catalog items.
 */

import {
  ensureRuntimeIndex,
  expandTermGroup,
  isDomestic,
  scoreTool,
} from "../../edge-lib/catalog-runtime.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const rawQ = (url.searchParams.get("q") || "").trim().slice(0, 80);
  const category = (url.searchParams.get("category") || "").trim();
  const region = (url.searchParams.get("region") || "all").trim().toLowerCase();
  const pricing = (url.searchParams.get("pricing") || "").trim().toLowerCase();
  const rawLimit = parseInt(url.searchParams.get("limit") || "20", 10);
  const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(50, rawLimit)) : 20;

  let index;
  try {
    index = await ensureRuntimeIndex(request, env);
  } catch (err) {
    return Response.json(
      { error: "catalog_unavailable", detail: String(err?.message || err) },
      { status: 502, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } }
    );
  }

  const terms = rawQ ? rawQ.split(/\s+/).filter(Boolean).slice(0, 6) : [];
  const groups = terms.map(expandTermGroup);
  const allItems = index.items;
  const originBase = `${url.protocol}//${url.host}`;

  const scored = [];
  for (const it of allItems) {
    if (category && it.category !== category && !(category === "影音娱乐" && it.category === "划水摸鱼")) {
      continue;
    }
    if (region === "domestic" && !isDomestic(it)) {
      continue;
    }
    if (region === "overseas" && isDomestic(it)) {
      continue;
    }
    if (pricing) {
      const p = (it.pricing || "").toLowerCase();
      if (pricing === "free") {
        if (p !== "完全免费" && p !== "开源免费") continue;
      } else if (!p.includes(pricing)) {
        continue;
      }
    }
    const sc = scoreTool(it, groups);
    if (sc < 0) continue;
    scored.push({ sc, it });
  }

  scored.sort((a, b) => b.sc - a.sc || a.it.name.localeCompare(b.it.name));
  const slice = scored.slice(0, limit).map(({ it }) => ({
    id: it.id,
    slug: it.slug,
    name: it.name,
    url: it.url,
    domain: it.domain,
    category: it.category === "划水摸鱼" ? "影音娱乐" : it.category,
    pricing: it.pricing || "免费额度",
    access_mode: it.access_mode || (isDomestic(it) ? "cn_native" : "overseas_direct"),
    description: it.description,
    consensus_sources_count: (it.sources || []).length,
    detail_url: `${originBase}/tool/${it.slug}/`,
  }));

  return new Response(
    JSON.stringify({
      site: "AI 导航聚合站",
      site_url: `${originBase}/`,
      mcp_endpoint: `${originBase}/api/mcp`,
      openapi_spec: `${originBase}/openapi.json`,
      query: { q: rawQ, category: category || "all", region, pricing: pricing || "all", limit },
      total_catalog_size: allItems.length,
      total_matches: scored.length,
      returned: slice.length,
      items: slice,
    }),
    {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=120, s-maxage=600",
      },
    }
  );
}
