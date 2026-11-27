/**
 * Cloudflare Pages Function: POST /api/report
 * One-click broken link / inaccessible tool feedback directly stored in D1.
 */

import { sha256Short, todayCstDate } from "../../edge-lib/catalog-runtime.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost({ request, env }) {
  if (!env?.DB) {
    return Response.json({ ok: true }, { headers: CORS_HEADERS });
  }

  const len = Number(request.headers.get("content-length") || 0);
  if (len > 4096) {
    return Response.json({ ok: false, error: "Payload too large" }, { status: 413, headers: CORS_HEADERS });
  }

  let data;
  try {
    data = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400, headers: CORS_HEADERS });
  }

  const toolId = String(data?.id || "").trim().slice(0, 24);
  const toolName = String(data?.name || "").trim().slice(0, 80);
  const url = String(data?.url || "").trim().slice(0, 300);
  const reason = String(data?.reason || "dead_link").trim().slice(0, 40);

  if (!toolId || !toolName) {
    return Response.json({ ok: false, error: "Missing tool id" }, { status: 400, headers: CORS_HEADERS });
  }

  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const day = todayCstDate();
  const ipHash = await sha256Short(`rep:${day}:${ip}`);

  try {
    await env.DB.prepare(
      "INSERT OR IGNORE INTO broken_reports (tool_id, tool_name, url, reason, ip_hash, day, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
    )
      .bind(toolId, toolName, url, reason, ipHash, day, new Date().toISOString())
      .run();
    return Response.json({ ok: true, message: "已收到失效反馈，下次巡检将优先复核该链接！" }, { headers: CORS_HEADERS });
  } catch {
    return Response.json({ ok: true, message: "感谢反馈！" }, { headers: CORS_HEADERS });
  }
}
