const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const NEWS_TOPICS = [
  "大模型",
  "开发与Agent",
  "多模态",
  "芯片与算力",
  "行业动态",
  "前沿速递",
];

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
  return decodeEntities(String(raw || "").replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " "))
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

function sourceLabelFromUrl(extUrl) {
  if (!extUrl) return "AI 快讯";
  try {
    const h = new URL(extUrl).hostname.toLowerCase();
    if (h.includes("openai.com")) return "OpenAI 官方";
    if (h.includes("huggingface.co")) return "HF 热门论文";
    if (h.includes("ithome.com")) return "IT之家";
    if (h.includes("weixin.qq.com")) return "深度解读";
    if (h.includes("36kr.com")) return "36氪";
    if (h.includes("github.com")) return "GitHub 开源";
    if (h.includes("arxiv.org")) return "arXiv 论文";
    if (h.includes("aibase.com")) return "AI 行业快讯";
    return h.replace(/^www\./, "");
  } catch {
    return "AI 快讯";
  }
}

function classifyNewsTopic(title, summary = "") {
  const text = `${title || ""} ${summary || ""}`.toLowerCase();
  if (
    /openai|anthropic|claude|gpt|gemini|deepseek|qwen|千问|llama|grok|豆包|kimi|大模型|推理模型|基础模型|预训练|停训|开源模型|模型发布|百川|智谱|glm|minimax|mistral/.test(
      text
    )
  ) {
    return "大模型";
  }
  if (
    /\bagent\b|智能体|\bmcp\b|cursor|claude code|codex|openclaw|编程|代码|github|\bide\b|vs code|开发框架|benchmark|工作流|自动化|skill|cline|windsurf/.test(
      text
    )
  ) {
    return "开发与Agent";
  }
  if (
    /视频|图像|绘画|音频|语音|sora|kling|可灵|veo|midjourney|短剧|漫剧|3d|视觉|生图|多模态|音乐|播客|数字人|配音|render|runway/.test(
      text
    )
  ) {
    return "多模态";
  }
  if (
    /英伟达|nvidia|\bgpu\b|芯片|算力|数据中心|\btpu\b|\bamd\b|昇腾|机器人|具身|硬件|服务器|半导体|intel|huawei|华为/.test(
      text
    )
  ) {
    return "芯片与算力";
  }
  if (
    /融资|财报|营收|收购|监管|政策|版权|微信|微软|谷歌|google|苹果|apple|小米|字节|阿里|腾讯|亚马逊|amazon|meta|裁员|估值|投入|收入|合规|起诉/.test(
      text
    )
  ) {
    return "行业动态";
  }
  return "前沿速递";
}

function parseNewsContent(rawHtml) {
  const htmlStr = String(rawHtml || "");
  let cover = "";
  const imgMatch = htmlStr.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (imgMatch) {
    cover = safeIconUrl(imgMatch[1]);
  }

  let cleaned = htmlStr
    .replace(/<div[^>]*border-left[^>]*>[\s\S]*?<\/div>/gi, "")
    .replace(/<div[^>]*>[^<]*原文链接[\s\S]*?<\/div>/gi, "")
    .replace(/<img\b[^>]*>/gi, "")
    .replace(/<br\s*\/?>/gi, " ");

  const paragraphs = [];
  let totalChars = 0;
  const blockRe = /<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m;
  while ((m = blockRe.exec(cleaned)) !== null) {
    const tag = m[1].toLowerCase();
    const inner = m[2];
    const text = stripTags(inner);
    if (!text || text.startsWith("原文链接")) continue;
    let isHeading = tag.startsWith("h");
    if (!isHeading && text.length <= 48) {
      if (/^\s*<(strong|b)\b[^>]*>[\s\S]*?<\/\1>\s*$/i.test(inner)) {
        isHeading = true;
      }
    }
    paragraphs.push({ type: isHeading ? "heading" : "text", text });
    totalChars += text.length;
    if (paragraphs.length >= 20 || totalChars >= 3600) break;
  }

  return { cover, paragraphs };
}

function formatUtc8(tsMs) {
  if (!Number.isFinite(tsMs) || tsMs <= 0) return { published_at: "", date: "" };
  const iso = new Date(tsMs + 8 * 3600 * 1000).toISOString();
  return {
    published_at: `${iso.slice(0, 10)} ${iso.slice(11, 16)}`,
    date: iso.slice(0, 10),
  };
}

async function fetchOpenAiRss(forceRefresh) {
  const res = await fetch("https://openai.com/news/rss.xml", {
    headers: { "User-Agent": UA, Accept: "application/rss+xml,application/xml,text/xml" },
    signal: AbortSignal.timeout(7000),
    cf: { cacheTtl: forceRefresh ? 0 : 600, cacheEverything: !forceRefresh },
  });
  if (!res.ok) return [];
  const xml = await res.text();
  const out = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  let m;
  while ((m = itemRe.exec(xml)) !== null && out.length < 12) {
    const blk = m[0];
    const title = stripTags(blk.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "");
    const link = normalizeUrl(stripTags(blk.match(/<link>([\s\S]*?)<\/link>/i)?.[1] || ""));
    const desc = stripTags(blk.match(/<description>([\s\S]*?)<\/description>/i)?.[1] || "");
    const pubRaw = stripTags(blk.match(/<pubDate>([\s\S]*?)<\/pubDate>/i)?.[1] || "");
    const tsMs = Date.parse(pubRaw) || 0;
    if (!title || !link) continue;
    const { published_at, date } = formatUtc8(tsMs);
    const id = "oai-" + link.split("/").pop().slice(0, 36);
    const summary = `[OpenAI 官方动态] ${desc || title}`.slice(0, 220);
    out.push({
      id,
      title: `[OpenAI] ${title}`,
      summary,
      cover: "",
      url: `/news/?id=${encodeURIComponent(id)}`,
      source_url: link,
      source_name: "OpenAI 官方",
      topic: classifyNewsTopic(title, desc),
      published_ts: tsMs,
      published_at,
      date,
      views: 0,
      paragraphs: [{ type: "text", text: desc || title }],
    });
  }
  return out;
}

async function fetchHfDailyPapers(forceRefresh) {
  const res = await fetch("https://huggingface.co/api/daily_papers?limit=12", {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(7000),
    cf: { cacheTtl: forceRefresh ? 0 : 900, cacheEverything: !forceRefresh },
  });
  if (!res.ok) return [];
  const arr = await res.json();
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const entry of arr.slice(0, 12)) {
    const p = entry?.paper || {};
    const pid = String(p.id || "").trim();
    const rawTitle = stripTags(entry?.title || p.title || "");
    if (!pid || !rawTitle) continue;
    const summaryRaw = stripTags(entry?.summary || p.summary || "");
    const upvotes = Number(p.upvotes || entry?.numComments || 0) || 0;
    const tsMs = Date.parse(entry?.publishedAt || p.publishedAt || "") || 0;
    const { published_at, date } = formatUtc8(tsMs);
    const extUrl = `https://huggingface.co/papers/${pid}`;
    const thumb = safeIconUrl(entry?.thumbnail || "");
    const id = `hf-${pid}`;
    const summary = `Hugging Face 社区精选高赞论文（👍 ${upvotes}）：${summaryRaw}`.slice(0, 220);
    out.push({
      id,
      title: `[HF高赞论文] ${rawTitle}`,
      summary,
      cover: thumb,
      url: `/news/?id=${encodeURIComponent(id)}`,
      source_url: extUrl,
      source_name: "HF 热门论文",
      topic: classifyNewsTopic(rawTitle, summaryRaw),
      published_ts: tsMs,
      published_at,
      date,
      views: upvotes,
      paragraphs: [
        { type: "heading", text: "论文核心摘要（Abstract）" },
        { type: "text", text: summaryRaw.slice(0, 1600) || rawTitle },
      ],
    });
  }
  return out;
}

async function fetchHackerNewsAi(forceRefresh) {
  const hnUrl =
    "https://hn.algolia.com/api/v1/search_by_date?query=AI&tags=story&numericFilters=points%3E50&hitsPerPage=12";
  const res = await fetch(hnUrl, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(7000),
    cf: { cacheTtl: forceRefresh ? 0 : 600, cacheEverything: !forceRefresh },
  });
  if (!res.ok) return [];
  const data = await res.json();
  const out = [];
  for (const hit of (data?.hits || []).slice(0, 12)) {
    const oid = String(hit?.objectID || "").trim();
    const title = stripTags(hit?.title || "");
    const extUrl = normalizeUrl(hit?.url || "") || `https://news.ycombinator.com/item?id=${oid}`;
    const pts = Number(hit?.points) || 0;
    const comments = Number(hit?.num_comments) || 0;
    const tsMs = (Number(hit?.created_at_i) || 0) * 1000;
    if (!oid || !title) continue;
    const { published_at, date } = formatUtc8(tsMs);
    const id = `hn-${oid}`;
    const summary = `Hacker News 极客热议（🔥 ${pts} 赞 · ${comments} 评论）· 来源域名：${sourceLabelFromUrl(extUrl)}`;
    out.push({
      id,
      title: `[HN热议] ${title}`,
      summary,
      cover: "",
      url: `/news/?id=${encodeURIComponent(id)}`,
      source_url: extUrl,
      source_name: "Hacker News",
      topic: classifyNewsTopic(title, ""),
      published_ts: tsMs,
      published_at,
      date,
      views: pts,
      paragraphs: [
        { type: "text", text: `${title} —— 该话题在 Hacker News 获得 ${pts} 热度与 ${comments} 条技术讨论。点击下方「访问原文」可直达一手技术博客或代码仓库。` },
      ],
    });
  }
  return out;
}

export async function onRequestGet({ request }) {
  const reqUrl = new URL(request.url);
  const forceRefresh = reqUrl.searchParams.get("refresh") === "1";

  const cfPages = [1, 2, 3].map(async (page) => {
    const apiUrl = `https://api.codefather.cn/api/ai_post/list/page/vo?current=${page}&pageSize=50&category=news`;
    const res = await fetch(apiUrl, {
      headers: {
        "User-Agent": UA,
        Referer: "https://ai.codefather.cn/news",
        Accept: "application/json,text/plain,*/*",
      },
      signal: AbortSignal.timeout(9000),
      cf: {
        cacheTtl: forceRefresh ? 0 : 180,
        cacheEverything: !forceRefresh,
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (json?.code !== 0) throw new Error(`API ${json?.code}`);
    return json?.data?.records || [];
  });

  const [cf1, cf2, cf3, oaiRes, hfRes, hnRes] = await Promise.allSettled([
    ...cfPages,
    fetchOpenAiRss(forceRefresh),
    fetchHfDailyPapers(forceRefresh),
    fetchHackerNewsAi(forceRefresh),
  ]);

  const rawRecords = [];
  for (const r of [cf1, cf2, cf3]) {
    if (r.status === "fulfilled" && Array.isArray(r.value)) {
      rawRecords.push(...r.value);
    }
  }

  const seenIds = new Set();
  const seenTitles = new Set();
  const items = [];

  for (const rec of rawRecords) {
    const pid = String(rec?.id || "").trim();
    const title = stripTags(rec?.title || "");
    if (!pid || !title) continue;
    const normTitle = title.toLowerCase().replace(/\s+/g, "");
    if (seenIds.has(pid) || seenTitles.has(normTitle)) continue;
    seenIds.add(pid);
    seenTitles.add(normTitle);

    const { cover: contentCover, paragraphs: parsedParas } = parseNewsContent(rec?.content || "");
    const cover = safeIconUrl(rec?.cover || "") || contentCover;
    let summary = stripTags(rec?.plainTextDescription || "");
    if (!summary) {
      summary = parsedParas.find((p) => p.type === "text")?.text || "";
    }
    if (!summary) summary = title;
    summary = summary.slice(0, 220);

    const paragraphs = parsedParas.length > 0 ? parsedParas : [{ type: "text", text: summary }];
    let extUrl = normalizeUrl(rec?.externalLink || "");
    if (extUrl && extUrl.includes("codefather.cn")) {
      extUrl = "";
    }

    const tsMs = Number(rec?.createTime) || 0;
    const { published_at, date } = formatUtc8(tsMs);
    const views = Math.max(0, Number(rec?.viewNum) || 0);

    items.push({
      id: pid,
      title,
      summary,
      cover,
      url: `/news/?id=${encodeURIComponent(pid)}`,
      source_url: extUrl,
      source_name: sourceLabelFromUrl(extUrl),
      topic: classifyNewsTopic(title, summary),
      published_ts: tsMs,
      published_at,
      date,
      views,
      paragraphs,
    });
  }

  for (const extraSettled of [oaiRes, hfRes, hnRes]) {
    if (extraSettled.status !== "fulfilled" || !Array.isArray(extraSettled.value)) continue;
    for (const it of extraSettled.value) {
      const normTitle = it.title.toLowerCase().replace(/\s+/g, "");
      if (seenIds.has(it.id) || seenTitles.has(normTitle)) continue;
      seenIds.add(it.id);
      seenTitles.add(normTitle);
      items.push(it);
    }
  }

  items.sort((a, b) => (b.published_ts - a.published_ts) || a.id.localeCompare(b.id));

  if (items.length < 10) {
    return Response.json(
      { error: "empty_upstream", count: items.length },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }

  return new Response(
    JSON.stringify({
      generated_at: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19) + "+08:00",
      total: items.length,
      topics: NEWS_TOPICS,
      items,
    }),
    {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": forceRefresh ? "no-store" : "public, max-age=120, s-maxage=300",
        "X-News-Source": "multi-live",
      },
    }
  );
}
