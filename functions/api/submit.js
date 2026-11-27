/**
 * Cloudflare Pages Function: /api/submit
 * - POST /api/submit: Zero-login AI tool submission directly into Cloudflare D1 with honeypot spam guard,
 *   per-IP rate limit, and automatic backlink badge detection (badge.svg / dlzbkj-ai.pages.dev).
 * - GET /api/submit: Returns non-PII queue summary & recent items for the ops dashboard.
 */

import { sha256Short, todayCstDate } from "../../edge-lib/catalog-runtime.js";

const VALID_CATEGORIES = new Set([
  "对话写作",
  "编程开发",
  "图像设计",
  "视频音频",
  "办公效率",
  "Agent与自动化",
  "学习知识库",
  "影音娱乐",
  "新品速递",
  "其他工具",
]);

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept",
};

async function detectBacklinkBadge(targetUrl) {
  try {
    const res = await fetch(targetUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AI-Nav-Hub-BadgeVerifier/1.0; +https://dlzbkj-ai.pages.dev/)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return false;
    const reader = res.body?.getReader();
    if (!reader) return false;
    const decoder = new TextDecoder();
    let scanned = 0;
    let snippet = "";
    while (scanned < 131072) {
      const { done, value } = await reader.read();
      if (done) break;
      scanned += value.byteLength;
      snippet += decoder.decode(value, { stream: true });
      if (snippet.includes("dlzbkj-ai.pages.dev") || snippet.includes("AI 导航聚合站")) {
        await reader.cancel().catch(() => {});
        return true;
      }
    }
    return snippet.includes("dlzbkj-ai.pages.dev");
  } catch {
    return false;
  }
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet({ env }) {
  if (!env?.DB) {
    return Response.json(
      { ok: true, pending_count: 0, broken_count: 0, submissions: [], reports: [] },
      { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } }
    );
  }

  try {
    const [subRes, repRes, cntSub, cntRep] = await Promise.all([
      env.DB.prepare(
        "SELECT id, name, url, domain, category, description, has_badge, status, created_at FROM tool_submissions ORDER BY has_badge DESC, id DESC LIMIT 30"
      ).all(),
      env.DB.prepare(
        "SELECT id, tool_id, tool_name, url, reason, created_at FROM broken_reports ORDER BY id DESC LIMIT 30"
      ).all(),
      env.DB.prepare("SELECT COUNT(*) AS cnt FROM tool_submissions").first(),
      env.DB.prepare("SELECT COUNT(*) AS cnt FROM broken_reports").first(),
    ]);

    return Response.json(
      {
        ok: true,
        pending_count: Number(cntSub?.cnt || 0),
        broken_count: Number(cntRep?.cnt || 0),
        submissions: subRes?.results || [],
        reports: repRes?.results || [],
      },
      { headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } }
    );
  } catch (err) {
    return Response.json(
      { ok: false, error: String(err?.message || err), submissions: [], reports: [] },
      { status: 500, headers: { ...CORS_HEADERS, "Cache-Control": "no-store" } }
    );
  }
}

export async function onRequestPost({ request, env }) {
  const ct = (request.headers.get("content-type") || "").toLowerCase();
  const isFormPost = ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data");

  const len = Number(request.headers.get("content-length") || 0);
  if (len > 16384) {
    return Response.json({ ok: false, error: "提交内容过长" }, { status: 413, headers: CORS_HEADERS });
  }

  let data = {};
  try {
    if (isFormPost) {
      const fd = await request.formData();
      data = Object.fromEntries(fd.entries());
    } else {
      data = await request.json();
    }
  } catch {
    return Response.json({ ok: false, error: "请求格式无效" }, { status: 400, headers: CORS_HEADERS });
  }

  // Honeypot anti-spam trap (hidden from screen readers & keyboard users)
  if (String(data.website_hp || "").trim() !== "") {
    return Response.json({ ok: true, message: "已收到提交，感谢推荐！" }, { status: 200, headers: CORS_HEADERS });
  }

  const name = String(data.name || "").trim().slice(0, 60);
  const rawUrl = String(data.url || "").trim().slice(0, 300);
  const rawCat = String(data.category || "对话写作").trim();
  const category = VALID_CATEGORIES.has(rawCat) ? rawCat : "其他工具";
  const description = String(data.description || "").trim().slice(0, 240);

  if (!name || name.length < 2) {
    return Response.json({ ok: false, error: "请填写有效的 AI 工具名称（至少 2 个字符）。" }, { status: 400, headers: CORS_HEADERS });
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("protocol");
    }
    if (!parsedUrl.hostname.includes(".") || parsedUrl.hostname === "localhost") {
      throw new Error("hostname");
    }
  } catch {
    return Response.json({ ok: false, error: "请输入以 https:// 开头的有效工具官网地址。" }, { status: 400, headers: CORS_HEADERS });
  }

  if (!description || description.length < 6) {
    return Response.json({ ok: false, error: "请填写至少 6 个字的核心亮点与功能说明。" }, { status: 400, headers: CORS_HEADERS });
  }

  const cleanDomain = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");
  const cleanUrl = parsedUrl.toString();

  if (!env?.DB) {
    return Response.json({ ok: false, error: "存储服务暂未就绪，请稍后重试。" }, { status: 503, headers: CORS_HEADERS });
  }

  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const day = todayCstDate();
  const ipHash = await sha256Short(`sub:${day}:${ip}`);

  const rateCheck = await env.DB.prepare(
    "SELECT COUNT(*) AS cnt FROM tool_submissions WHERE ip_hash = ?1"
  )
    .bind(ipHash)
    .first();
  if (Number(rateCheck?.cnt || 0) >= 6) {
    return Response.json(
      { ok: false, error: "今日提交次数已达上限（每日最多 6 款），请明日再试。" },
      { status: 429, headers: CORS_HEADERS }
    );
  }

  const dupCheck = await env.DB.prepare(
    "SELECT id, has_badge FROM tool_submissions WHERE domain = ?1 LIMIT 1"
  )
    .bind(cleanDomain)
    .first();

  const hasBadge = (await detectBacklinkBadge(cleanUrl)) ? 1 : 0;
  const createdAt = new Date().toISOString();

  if (dupCheck?.id) {
    if (hasBadge && !dupCheck.has_badge) {
      await env.DB.prepare("UPDATE tool_submissions SET has_badge = 1 WHERE id = ?1").bind(dupCheck.id).run();
    }
    return Response.json(
      {
        ok: true,
        duplicate: true,
        has_badge: Boolean(hasBadge || dupCheck.has_badge),
        message: hasBadge
          ? "已检测到贵站友链徽章，该工具已在优先审核队列置顶！"
          : "该域名已在待审收录队列中，无需重复提交。",
      },
      { status: 200, headers: CORS_HEADERS }
    );
  }

  const ins = await env.DB.prepare(
    "INSERT INTO tool_submissions (name, url, domain, category, description, has_badge, status, ip_hash, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'pending', ?7, ?8)"
  )
    .bind(name, cleanUrl, cleanDomain, category, description, hasBadge, ipHash, createdAt)
    .run();

  if (isFormPost) {
    return Response.redirect(`${new URL(request.url).origin}/?submitted=1`, 303);
  }

  return Response.json(
    {
      ok: true,
      id: ins?.meta?.last_row_id || null,
      has_badge: Boolean(hasBadge),
      message: hasBadge
        ? "提交成功！已自动检测到贵站嵌入友链徽章，已为您置顶优先收录审核！"
        : "提交成功！已进入站长收录审核队列，无需跳转登录 GitHub。",
    },
    { status: 200, headers: CORS_HEADERS }
  );
}
