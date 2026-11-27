/**
 * Cloudflare Pages Function: GET /api/search
 * Zero-auth, CORS-enabled AI Tool Discovery API for AI Agents, LLM Tool Use, and Developers.
 * Reads static /data/catalog.json & /data/tool-slugs.json from Pages ASSETS binding and caches in isolate memory.
 */

let cachedCatalog = null;
let cachedSlugs = null;
let cachedAtMs = 0;
const MEM_TTL_MS = 5 * 60 * 1000;

const SYNONYM_MAP = [
  [["ppt", "slides", "幻灯片", "演示", "演示文稿"], ["ppt", "幻灯片", "演示文稿", "slides", "presentations"]],
  [["生图", "画图", "绘画", "文生图", "draw"], ["文生图", "绘画", "图像生成", "text-to-image", "art"]],
  [["抠图", "去背景", "koutu"], ["抠图", "去背景", "背景替换", "remove background"]],
  [["配音", "语音合成", "tts", "声音克隆", "peiyin"], ["配音", "语音合成", "tts", "声音克隆", "text-to-speech"]],
  [["字幕", "转写", "录音转文字", "asr"], ["字幕", "语音转文字", "转写", "会议纪要", "transcri"]],
  [["论文", "文献", "学术", "科研", "lunwen"], ["论文", "文献", "学术", "科研", "research", "consensus"]],
  [["简历", "面试", "求职", "jianli"], ["简历", "面试", "求职", "招聘", "resume", "interview"]],
  [["翻译", "互译", "fanyi"], ["翻译", "多语种", "本地化", "translat"]],
  [["编程", "代码", "ide", "biancheng"], ["编程", "代码", "ide", "cursor", "copilot", "开发"]],
  [["智能体", "agent", "mcp", "工作流"], ["智能体", "agent", "mcp", "工作流", "自动化"]],
  [["免费", "白嫖", "free"], ["完全免费", "开源免费"]],
  [["开源", "本地部署", "opensource"], ["开源免费", "github", "本地部署"]],
  [["国内", "国产", "免翻墙", "直连"], ["国内直连", "cn_native"]],
];

function expandTermGroup(term) {
  const t = term.toLowerCase();
  const out = new Set([t]);
  for (const [triggers, expansions] of SYNONYM_MAP) {
    if (triggers.includes(t)) {
      for (const ex of expansions) out.add(ex.toLowerCase());
    }
  }
  return [...out];
}

function scoreTool(it, groups) {
  if (groups.length === 0) return (it.score || 0);
  const nameL = (it.name || "").toLowerCase();
  const domL = (it.domain || "").toLowerCase();
  const catL = (it.category || "").toLowerCase();
  const priceL = (it.pricing || "").toLowerCase();
  const accessL = `${it.access_mode || ""} ${it.region === "domestic" ? "国内直连" : "海外"}`.toLowerCase();
  const descL = (it.description || "").toLowerCase();
  const fullHay = `${nameL} ${domL} ${catL} ${priceL} ${accessL} ${descL}`;

  let rel = 0;
  for (const alts of groups) {
    let matchedGroup = false;
    let bestGroupScore = 0;
    for (const term of alts) {
      if (!fullHay.includes(term)) continue;
      matchedGroup = true;
      let s = 40;
      if (nameL === term) s = 1200;
      else if (nameL.startsWith(term)) s = 650;
      else if (nameL.includes(term)) s = 380;
      else if (domL.startsWith(term) || domL === term) s = 340;
      else if (priceL.includes(term) || catL.includes(term) || accessL.includes(term)) s = 220;
      else if (descL.includes(term)) s = 90;
      if (s > bestGroupScore) bestGroupScore = s;
    }
    if (!matchedGroup) return -1;
    rel += bestGroupScore;
  }
  return rel + (it.score || 0) * 0.25;
}

async function ensureCatalogLoaded(request, env) {
  const now = Date.now();
  if (cachedCatalog && now - cachedAtMs < MEM_TTL_MS) {
    return { catalog: cachedCatalog, slugs: cachedSlugs || {} };
  }
  const base = new URL(request.url);
  const fetchAsset = (path) =>
    env?.ASSETS ? env.ASSETS.fetch(new URL(path, base)) : fetch(new URL(path, base));

  const [catRes, slugRes] = await Promise.all([
    fetchAsset("/data/catalog.json"),
    fetchAsset("/data/tool-slugs.json").catch(() => null),
  ]);
  if (!catRes.ok) {
    throw new Error(`catalog HTTP ${catRes.status}`);
  }
  cachedCatalog = await catRes.json();
  if (slugRes && slugRes.ok) {
    const sj = await slugRes.json();
    cachedSlugs = sj?.by_id || {};
  } else {
    cachedSlugs = {};
  }
  cachedAtMs = now;
  return { catalog: cachedCatalog, slugs: cachedSlugs };
}

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

  let catalog, slugs;
  try {
    ({ catalog, slugs } = await ensureCatalogLoaded(request, env));
  } catch (err) {
    return Response.json(
      { error: "catalog_unavailable", detail: String(err?.message || err) },
      { status: 502, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } }
    );
  }

  const terms = rawQ ? rawQ.split(/\s+/).filter(Boolean).slice(0, 6) : [];
  const groups = terms.map(expandTermGroup);
  const allItems = Array.isArray(catalog.items) ? catalog.items : [];
  const originBase = `${url.protocol}//${url.host}`;

  const scored = [];
  for (const it of allItems) {
    if (category && it.category !== category && !(category === "影音娱乐" && it.category === "划水摸鱼")) {
      continue;
    }
    if (region === "domestic" && it.region !== "domestic" && !(it.regions || []).includes("domestic")) {
      continue;
    }
    if (region === "overseas" && it.region !== "overseas" && !(it.regions || []).includes("overseas")) {
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
  const slice = scored.slice(0, limit).map(({ it }) => {
    const tslug = slugs[it.id];
    return {
      id: it.id,
      name: it.name,
      url: it.url,
      domain: it.domain,
      category: it.category === "划水摸鱼" ? "影音娱乐" : it.category,
      pricing: it.pricing || "免费额度",
      access_mode: it.access_mode || (it.region === "domestic" ? "cn_native" : "overseas_direct"),
      description: it.description,
      consensus_sources_count: (it.sources || []).length,
      detail_url: tslug ? `${originBase}/tool/${tslug}/` : null,
    };
  });

  return new Response(
    JSON.stringify({
      site: "AI 导航聚合站",
      site_url: `${originBase}/`,
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
