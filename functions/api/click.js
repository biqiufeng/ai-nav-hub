/**
 * Cloudflare Pages Function: POST /api/click
 * Receives deferred click telemetry (via fetchLater) and records daily deduplicated clicks in D1.
 */

import { sha256Short, todayCstDate } from "../../edge-lib/catalog-runtime.js";

const ID_RE = /^[a-f0-9]{6,24}$/i;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env?.DB) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  const len = Number(request.headers.get("content-length") || 0);
  if (len > 4096) {
    return new Response(null, { status: 413, headers: CORS_HEADERS });
  }

  let payload;
  try {
    const rawText = await request.text();
    payload = rawText ? JSON.parse(rawText) : null;
  } catch {
    return new Response(null, { status: 400, headers: CORS_HEADERS });
  }

  const rawIds = Array.isArray(payload?.ids)
    ? payload.ids
    : payload?.id
      ? [payload.id]
      : [];
  const validIds = [...new Set(rawIds.map((x) => String(x || "").trim().toLowerCase()).filter((x) => ID_RE.test(x)))].slice(0, 8);

  if (validIds.length === 0) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  const ip = request.headers.get("cf-connecting-ip") || "0.0.0.0";
  const ua = (request.headers.get("user-agent") || "").slice(0, 64);
  if (/bot|spider|crawler|headless|curl|python/i.test(ua)) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }

  const day = todayCstDate();

  context.waitUntil(
    (async () => {
      try {
        for (const tid of validIds) {
          const dedupKey = await sha256Short(`clk:${day}:${ip}:${tid}`);
          const ins = await env.DB.prepare(
            "INSERT OR IGNORE INTO click_dedup (dedup_key, day) VALUES (?1, ?2)"
          )
            .bind(dedupKey, day)
            .run();
          if ((ins?.meta?.changes || 0) > 0) {
            await env.DB.prepare(
              "INSERT INTO tool_clicks (tool_id, day, clicks) VALUES (?1, ?2, 1) ON CONFLICT(tool_id, day) DO UPDATE SET clicks = clicks + 1"
            )
              .bind(tid, day)
              .run();
          }
        }
      } catch {
        // Non-blocking telemetry write
      }
    })()
  );

  return new Response(null, { status: 202, headers: CORS_HEADERS });
}
