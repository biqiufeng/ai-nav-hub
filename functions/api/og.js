/**
 * Cloudflare Pages Function: GET /api/og
 * Edge-cached 1200x630 Vector Social Poster Card Generator (30-day CDN cache).
 * Supports:
 *   - /api/og?type=tool&slug=<slug>
 *   - /api/og?type=vs&a=<slugA>&b=<slugB>
 *   - /api/og?title=...&sub=...&badge=...
 */

import {
  avatarColor,
  ensureRuntimeIndex,
  escHtml,
  isDomestic,
  regionLabel,
  todayCstDate,
} from "../../edge-lib/catalog-runtime.js";

function wrapLines(text, maxUnits = 26, maxLines = 2) {
  const str = String(text || "").trim();
  if (!str) return [];
  const lines = [];
  let cur = "";
  let units = 0;
  for (const ch of str) {
    const w = ch.charCodeAt(0) > 255 ? 1 : 0.56;
    if (units + w > maxUnits) {
      lines.push(cur);
      if (lines.length >= maxLines) {
        lines[lines.length - 1] = lines[lines.length - 1].slice(0, -1) + "…";
        return lines;
      }
      cur = ch;
      units = w;
    } else {
      cur += ch;
      units += w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function buildToolCardSvg(item, alts, totalCatalog) {
  const name = item.name || item.domain || "AI 工具";
  const domain = item.domain || "";
  const cat = item.category === "划水摸鱼" ? "影音娱乐" : item.category || "AI 工具";
  const reg = regionLabel(item);
  const pricing = item.pricing || "免费额度";
  const accent = avatarColor(domain || name);
  const letter = (name.trim()[0] || "A").toUpperCase();
  const descLines = wrapLines(item.description || `${name} 官方直达与同赛道国内平替对比`, 32, 2);
  const altBadges = alts
    .slice(0, 4)
    .map((a, idx) => {
      const x = 72 + idx * 265;
      const label = a.name.length > 11 ? `${a.name.slice(0, 10)}…` : a.name;
      const sub = isDomestic(a) ? "国内直连" : a.pricing || "热门平替";
      return `
    <g transform="translate(${x}, 456)">
      <rect width="248" height="76" rx="16" fill="#161b26" stroke="#283144" stroke-width="1.5"/>
      <text x="20" y="33" fill="#f5f7fa" font-size="20" font-weight="700">${escHtml(label)}</text>
      <text x="20" y="58" fill="#64d2ff" font-size="14" font-weight="500">${escHtml(sub)}</text>
    </g>`;
    })
    .join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escHtml(name)} 分享卡片">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0b101b"/>
      <stop offset="55%" stop-color="#111827"/>
      <stop offset="100%" stop-color="#0d172a"/>
    </linearGradient>
    <radialGradient id="glow" cx="85%" cy="18%" r="55%">
      <stop offset="0%" stop-color="${accent}" stop-opacity="0.34"/>
      <stop offset="100%" stop-color="${accent}" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <rect x="36" y="32" width="1128" height="566" rx="28" fill="none" stroke="#232d42" stroke-width="1.5"/>

  <!-- Top Brand Header -->
  <g transform="translate(72, 68)">
    <rect width="38" height="38" rx="10" fill="#0a84ff"/>
    <text x="19" y="26" text-anchor="middle" fill="#ffffff" font-family="system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif" font-size="20" font-weight="800">AI</text>
    <text x="52" y="26" fill="#e5e7eb" font-family="system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif" font-size="21" font-weight="700">AI 导航聚合站 · 严选 ${totalCatalog.toLocaleString("en-US")}+ 款国内外 AI 工具</text>
    <rect x="866" y="2" width="190" height="34" rx="17" fill="#17253b" stroke="#294775"/>
    <text x="961" y="24" text-anchor="middle" fill="#64d2ff" font-family="system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif" font-size="15" font-weight="600">零广告 · 免登录直达</text>
  </g>

  <!-- Tool Identity -->
  <g transform="translate(72, 146)" font-family="system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
    <rect width="88" height="88" rx="22" fill="${accent}"/>
    <text x="44" y="59" text-anchor="middle" fill="#ffffff" font-size="42" font-weight="800">${escHtml(letter)}</text>
    <text x="114" y="46" fill="#ffffff" font-size="44" font-weight="800">${escHtml(name.slice(0, 22))}</text>
    <text x="114" y="80" fill="#94a3b8" font-size="22" font-weight="500">${escHtml(domain)}</text>
  </g>

  <!-- Pills -->
  <g transform="translate(72, 260)" font-family="system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
    <rect x="0" y="0" width="142" height="38" rx="19" fill="#102a22" stroke="#1f5f46"/>
    <text x="71" y="25" text-anchor="middle" fill="#34d399" font-size="17" font-weight="700">${escHtml(reg)}</text>
    <rect x="156" y="0" width="142" height="38" rx="19" fill="#17243c" stroke="#2b4c7e"/>
    <text x="227" y="25" text-anchor="middle" fill="#60a5fa" font-size="17" font-weight="700">${escHtml(pricing)}</text>
    <rect x="312" y="0" width="166" height="38" rx="19" fill="#231c38" stroke="#483677"/>
    <text x="395" y="25" text-anchor="middle" fill="#c084fc" font-size="17" font-weight="700">${escHtml(cat)}</text>
  </g>

  <!-- Description -->
  <g transform="translate(72, 344)" font-family="system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
    <text x="0" y="0" fill="#cbd5e1" font-size="24" font-weight="500">${escHtml(descLines[0] || "")}</text>
    <text x="0" y="38" fill="#94a3b8" font-size="23" font-weight="400">${escHtml(descLines[1] || "")}</text>
  </g>

  <!-- Alternatives Strip -->
  <g font-family="system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
    <text x="72" y="438" fill="#94a3b8" font-size="16" font-weight="600">同赛道高口碑平替与国内直连推荐：</text>
    ${altBadges}
  </g>

  <!-- Footer URL -->
  <g transform="translate(72, 568)" font-family="system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
    <text x="0" y="0" fill="#64748b" font-size="17">详情与平替对比：https://dlzbkj-ai.pages.dev/tool/${escHtml(item.slug)}/</text>
    <text x="1056" y="0" text-anchor="end" fill="#64748b" font-size="16">每日同步 · ${todayCstDate()}</text>
  </g>
</svg>`;
}

function buildVsCardSvg(itemA, itemB) {
  const colA = avatarColor(itemA.domain || itemA.name);
  const colB = avatarColor(itemB.domain || itemB.name);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${escHtml(itemA.name)} vs ${escHtml(itemB.name)}">
  <rect width="1200" height="630" fill="#0b101b"/>
  <rect x="36" y="32" width="1128" height="566" rx="28" fill="#111827" stroke="#243046" stroke-width="1.5"/>
  <g font-family="system-ui,-apple-system,'PingFang SC','Microsoft YaHei',sans-serif">
    <text x="600" y="88" text-anchor="middle" fill="#60a5fa" font-size="20" font-weight="700">AI 导航聚合站 · 2026 深度选型一对一横评</text>
    <rect x="76" y="132" width="468" height="360" rx="24" fill="#161f30" stroke="${colA}" stroke-width="2"/>
    <circle cx="140" cy="202" r="34" fill="${colA}"/>
    <text x="140" y="215" text-anchor="middle" fill="#fff" font-size="30" font-weight="800">${escHtml((itemA.name[0] || "A").toUpperCase())}</text>
    <text x="192" y="198" fill="#fff" font-size="32" font-weight="800">${escHtml(itemA.name.slice(0, 12))}</text>
    <text x="192" y="230" fill="#94a3b8" font-size="18">${escHtml(itemA.domain || "")}</text>
    <text x="106" y="294" fill="#34d399" font-size="20" font-weight="700">访问：${escHtml(regionLabel(itemA))} · ${escHtml(itemA.pricing || "免费额度")}</text>
    <text x="106" y="344" fill="#cbd5e1" font-size="19">${escHtml((itemA.description || "").slice(0, 21))}…</text>

    <circle cx="600" cy="312" r="40" fill="#0a84ff"/>
    <text x="600" y="322" text-anchor="middle" fill="#fff" font-size="26" font-weight="900">VS</text>

    <rect x="656" y="132" width="468" height="360" rx="24" fill="#161f30" stroke="${colB}" stroke-width="2"/>
    <circle cx="720" cy="202" r="34" fill="${colB}"/>
    <text x="720" y="215" text-anchor="middle" fill="#fff" font-size="30" font-weight="800">${escHtml((itemB.name[0] || "B").toUpperCase())}</text>
    <text x="772" y="198" fill="#fff" font-size="32" font-weight="800">${escHtml(itemB.name.slice(0, 12))}</text>
    <text x="772" y="230" fill="#94a3b8" font-size="18">${escHtml(itemB.domain || "")}</text>
    <text x="686" y="294" fill="#34d399" font-size="20" font-weight="700">访问：${escHtml(regionLabel(itemB))} · ${escHtml(itemB.pricing || "免费额度")}</text>
    <text x="686" y="344" fill="#cbd5e1" font-size="19">${escHtml((itemB.description || "").slice(0, 21))}…</text>

    <text x="600" y="554" text-anchor="middle" fill="#94a3b8" font-size="19">查看完整参数与免费平替对比：https://dlzbkj-ai.pages.dev/vs/</text>
  </g>
</svg>`;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const reqUrl = new URL(request.url);
  const cache = caches.default;
  const cacheKey = new Request(reqUrl.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const type = (reqUrl.searchParams.get("type") || "tool").trim().toLowerCase();
  let svg = "";

  try {
    const index = await ensureRuntimeIndex(request, env);
    if (type === "vs") {
      const slugA = (reqUrl.searchParams.get("a") || "").trim().toLowerCase();
      const slugB = (reqUrl.searchParams.get("b") || "").trim().toLowerCase();
      const itemA = index.bySlug.get(slugA) || index.items[0];
      const itemB = index.bySlug.get(slugB) || index.items[1];
      svg = buildVsCardSvg(itemA, itemB);
    } else {
      const slug = (reqUrl.searchParams.get("slug") || "").trim().toLowerCase();
      const item =
        index.bySlug.get(slug) ||
        index.byId.get(reqUrl.searchParams.get("id") || "") || {
          name: (reqUrl.searchParams.get("title") || "AI 导航聚合站").slice(0, 32),
          domain: "dlzbkj-ai.pages.dev",
          slug: "",
          category: reqUrl.searchParams.get("badge") || "AI 全景索引",
          pricing: "完全免费",
          access_mode: "cn_native",
          description:
            reqUrl.searchParams.get("sub") ||
            "零广告、免登录、国内直连秒开的 AI 工具、每日一手早报与 14 平台热榜聚合站。",
        };
      const peers = (index.byCategory.get(item.category) || []).filter((p) => p.id !== item.id);
      const alts = [...peers.filter((p) => isDomestic(p)).slice(0, 3), ...peers.slice(0, 2)].slice(0, 4);
      svg = buildToolCardSvg(item, alts, index.items.length);
    }
  } catch {
    svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0b101b"/><text x="600" y="325" text-anchor="middle" fill="#fff" font-size="42" font-weight="800">AI 导航聚合站 · dlzbkj-ai.pages.dev</text></svg>`;
  }

  const out = new Response(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=86400",
    },
  });
  context.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}
