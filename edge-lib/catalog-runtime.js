/**
 * Shared zero-dependency Edge runtime utilities for AI Nav Hub Pages Functions.
 * Placed outside ./functions and ./web so Wrangler esbuild bundles it cleanly without exposing extra routes.
 */

let cachedIndex = null;
let cachedAtMs = 0;
const MEM_TTL_MS = 5 * 60 * 1000;

export const CATEGORY_META = [
  { cat: "对话写作", display: "对话写作", slug: "chat-writing", appCat: "BusinessApplication", shortDesc: "通用大模型对话、AI 搜索引擎、长文公文写作、学术润色与 AI 检测工具" },
  { cat: "编程开发", display: "编程开发", slug: "coding", appCat: "DeveloperApplication", shortDesc: "AI 代码编辑器（IDE）、终端编程 Agent、代码补全审查、开源模型与开发者平台" },
  { cat: "图像设计", display: "图像设计", slug: "image-design", appCat: "DesignApplication", shortDesc: "AI 文生图绘画、电商海报生成、智能抠图修图、无损放大、Logo 与 UI/3D 设计工具" },
  { cat: "视频音频", display: "视频音频", slug: "video-audio", appCat: "MultimediaApplication", shortDesc: "AI 文生视频、图生视频、数字人口播、TTS 真人配音、语音克隆、AI 音乐与字幕剪辑工具" },
  { cat: "办公效率", display: "办公效率", slug: "office-productivity", appCat: "BusinessApplication", shortDesc: "一键生成 PPT、AI 表格公式分析、音视频会议纪要、PDF 文档总结、思维导图与协同效率工具" },
  { cat: "Agent与自动化", display: "Agent与自动化", slug: "agents-automation", appCat: "BusinessApplication", shortDesc: "多智能体开发平台、MCP 服务生态、自动化工作流编排与无代码机器人" },
  { cat: "学习知识库", display: "学习知识库", slug: "learning-knowledge", appCat: "EducationalApplication", shortDesc: "RAG 个人与企业知识库、科研文献语义检索、Prompt 提示词工程指南与 AI 公开课教程" },
  { cat: "划水摸鱼", display: "影音娱乐", slug: "media-leisure", appCat: "EntertainmentApplication", shortDesc: "精选影视动漫检索、无损音乐音效素材、在线趣味小游戏与数字休闲实用工具" },
  { cat: "新品速递", display: "新品速递", slug: "new-releases", appCat: "WebApplication", shortDesc: "每日同步 Product Hunt 及国内外最新发布的创新 AI 原生应用与独立开发者新产品" },
  { cat: "其他工具", display: "其他工具", slug: "other-tools", appCat: "UtilitiesApplication", shortDesc: "垂直行业 AI 解决方案、翻译测评、数据工具与跨领域实用效率百宝箱" },
];

export const CAT_BY_RAW = Object.fromEntries(CATEGORY_META.map((c) => [c.cat, c]));

const AVATAR_PALETTE = ["#0A84FF", "#5E5CE6", "#BF5AF2", "#FF375F", "#FF9F0A", "#30B0C7", "#34C759", "#AF52DE"];

const COMMON_TLDS = new Set([
  "com", "cn", "ai", "io", "dev", "app", "org", "net", "co", "so",
  "cc", "top", "xyz", "me", "tech", "tools", "work", "club", "pro",
  "ink", "art", "design", "video", "chat", "gg", "sh", "ly", "tv",
]);

export const SYNONYM_MAP = [
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

export function escHtml(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}

export function avatarColor(seed) {
  let h = 0;
  const s = String(seed || "?");
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

export function isDomestic(item) {
  const regs = item.regions || [item.region];
  return regs.includes("domestic") || item.access_mode === "cn_native";
}

export function regionLabel(item) {
  const am = item.access_mode || "";
  if (am === "cn_native") return "国内直连";
  if (am === "intl_network") return "需国际网络";
  if (am === "overseas_direct") return "海外可直连";
  return isDomestic(item) ? "国内直连" : "海外主流";
}

function fallbackSlug(item, usedSlugs) {
  const dom = String(item.domain || "").toLowerCase().replace(/^www\./, "");
  let parts = dom.split(".").filter(Boolean);
  if (parts.length >= 2 && COMMON_TLDS.has(parts[parts.length - 1])) {
    parts = parts.slice(0, -1);
  }
  if (parts.length >= 2 && ["com", "org", "net", "gov", "edu", "co"].includes(parts[parts.length - 1])) {
    parts = parts.slice(0, -1);
  }
  let base = parts.join("-");
  try {
    const pathParts = new URL(item.url || "").pathname
      .split("/")
      .map((p) => p.trim())
      .filter((p) => p && !["zh", "en", "cn", "zh-cn", "app", "home", "index.html"].includes(p.toLowerCase()));
    if (["github.com", "huggingface.co", "open.bigmodel.cn", "tongyi.aliyun.com"].includes(dom) && pathParts.length > 0) {
      base = `${base}-${pathParts[pathParts.length - 1]}`;
    }
  } catch {}
  let slug = base.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!slug || slug.length < 2) {
    slug = `tool-${String(item.id || "item").slice(0, 8)}`;
  }
  slug = slug.slice(0, 48).replace(/-+$/g, "");
  let cand = slug;
  let idx = 2;
  while (usedSlugs.has(cand)) {
    cand = `${slug}-${idx}`;
    idx++;
  }
  usedSlugs.add(cand);
  return cand;
}

export function expandTermGroup(term) {
  const t = term.toLowerCase();
  const out = new Set([t]);
  for (const [triggers, expansions] of SYNONYM_MAP) {
    if (triggers.includes(t)) {
      for (const ex of expansions) out.add(ex.toLowerCase());
    }
  }
  return [...out];
}

export function scoreTool(it, groups) {
  if (groups.length === 0) return it.score || 0;
  const nameL = (it.name || "").toLowerCase();
  const domL = (it.domain || "").toLowerCase();
  const catL = (it.category || "").toLowerCase();
  const priceL = (it.pricing || "").toLowerCase();
  const accessL = `${it.access_mode || ""} ${isDomestic(it) ? "国内直连" : "海外"}`.toLowerCase();
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

export async function ensureRuntimeIndex(request, env) {
  const now = Date.now();
  if (cachedIndex && now - cachedAtMs < MEM_TTL_MS) {
    return cachedIndex;
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
  const catalog = await catRes.json();
  const flagshipById = slugRes && slugRes.ok ? ((await slugRes.json())?.by_id || {}) : {};
  const rawItems = Array.isArray(catalog.items) ? catalog.items : [];

  const usedSlugs = new Set();
  const bySlug = new Map();
  const byId = new Map();
  const byCategory = new Map();

  // Register explicit or flagship slugs first so canonical URLs never shift
  for (const it of rawItems) {
    const preset = it.slug || flagshipById[it.id];
    if (preset && !usedSlugs.has(preset)) {
      it.slug = preset;
      usedSlugs.add(preset);
    }
  }
  for (const it of rawItems) {
    if (!it.slug) {
      it.slug = fallbackSlug(it, usedSlugs);
    }
    bySlug.set(it.slug, it);
    byId.set(it.id, it);
    const c = it.category || "其他工具";
    if (!byCategory.has(c)) byCategory.set(c, []);
    byCategory.get(c).push(it);
  }
  for (const [, arr] of byCategory.entries()) {
    arr.sort((a, b) => (b.score || 0) - (a.score || 0) || (b.sources?.length || 0) - (a.sources?.length || 0));
  }

  cachedIndex = {
    catalog,
    items: rawItems,
    bySlug,
    byId,
    byCategory,
    flagshipIds: new Set(Object.keys(flagshipById)),
  };
  cachedAtMs = now;
  return cachedIndex;
}

export async function sha256Short(input) {
  const buf = new TextEncoder().encode(String(input || ""));
  const hash = await crypto.subtle.digest("SHA-256", buf);
  const bytes = new Uint8Array(hash);
  let hex = "";
  for (let i = 0; i < 8; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

export function todayCstDate() {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}
