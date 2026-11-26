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

export async function onRequestGet({ request }) {
  const reqUrl = new URL(request.url);
  const forceRefresh = reqUrl.searchParams.get("refresh") === "1";

  const pages = [1, 2, 3];
  const results = await Promise.allSettled(
    pages.map(async (page) => {
      const apiUrl = `https://api.codefather.cn/api/ai_post/list/page/vo?current=${page}&pageSize=50&category=news`;
      const res = await fetch(apiUrl, {
        headers: {
          "User-Agent": UA,
          Referer: "https://ai.codefather.cn/news",
          Accept: "application/json,text/plain,*/*",
        },
        signal: AbortSignal.timeout(10000),
        cf: {
          cacheTtl: forceRefresh ? 0 : 180,
          cacheEverything: !forceRefresh,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json?.code !== 0) throw new Error(`API ${json?.code}`);
      return json?.data?.records || [];
    })
  );

  const rawRecords = [];
  for (const r of results) {
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
    const detailUrl = `https://ai.codefather.cn/news/${pid}`;
    let extUrl = normalizeUrl(rec?.externalLink || "");
    if (extUrl === detailUrl) extUrl = "";

    const tsMs = Number(rec?.createTime) || 0;
    const { published_at, date } = formatUtc8(tsMs);
    const views = Math.max(0, Number(rec?.viewNum) || 0);

    items.push({
      id: pid,
      title,
      summary,
      cover,
      url: detailUrl,
      source_url: extUrl,
      topic: classifyNewsTopic(title, summary),
      published_ts: tsMs,
      published_at,
      date,
      views,
      paragraphs,
    });
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
        "X-News-Source": "live",
      },
    }
  );
}
