/**
 * Cloudflare Pages Function: /api/mcp
 * Stateless Streamable HTTP Model Context Protocol (MCP) Server (2025-03-26 & 2024-11-05 compatible).
 * Enables Claude Desktop, Cursor, Cherry Studio, Antigravity, Windsurf & AI Agents to directly query:
 *   1. search_ai_tools — Search 8,240+ domestic & global AI tools by keyword, category, region, pricing
 *   2. get_tool_alternatives — Find direct domestic & free/open-source alternatives for any AI tool
 *   3. get_latest_ai_news — Read multi-source authoritative AI news (OpenAI, HF Daily Papers, HN, CN tech)
 */

import {
  ensureRuntimeIndex,
  expandTermGroup,
  isDomestic,
  regionLabel,
  scoreTool,
} from "../../edge-lib/catalog-runtime.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Accept, Mcp-Session-Id, MCP-Protocol-Version",
};

const MCP_TOOLS = [
  {
    name: "search_ai_tools",
    description:
      "检索 AI 导航聚合站收录的 8,240+ 款国内外主流 AI 工具，支持多关键词同义词检索、分类过滤、国内免翻墙直连筛选及免费/开源计费筛选。",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词（如 'PPT'、'论文润色'、'文生视频'、'MCP'、'电商抠图'）",
        },
        category: {
          type: "string",
          description: "可选一级分类：对话写作 | 编程开发 | 图像设计 | 视频音频 | 办公效率 | Agent与自动化 | 学习知识库 | 影音娱乐 | 新品速递 | 其他工具",
        },
        region: {
          type: "string",
          enum: ["all", "domestic", "overseas"],
          description: "访问区域过滤：domestic 仅返回国内免代理直连工具，overseas 返回海外工具，默认 all",
        },
        pricing: {
          type: "string",
          enum: ["all", "free", "完全免费", "开源免费", "免费额度", "付费订阅"],
          description: "计费过滤：free 返回完全免费+开源免费工具，默认 all",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 30,
          default: 10,
          description: "返回结果条数（1-30，默认 10）",
        },
      },
    },
  },
  {
    name: "get_tool_alternatives",
    description:
      "查询指定 AI 工具（如 ChatGPT、Midjourney、Cursor、Perplexity、Sora）的官方直达信息、网络可达性与计费模式，并推荐同赛道高口碑国内免翻墙平替与免费开源替代方案。",
    inputSchema: {
      type: "object",
      properties: {
        tool: {
          type: "string",
          description: "目标工具名称、域名或 slug（如 'ChatGPT'、'midjourney.com'、'cursor'）",
        },
        prefer_domestic: {
          type: "boolean",
          default: true,
          description: "是否优先排序国内可直连平替工具（默认 true）",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 20,
          default: 8,
        },
      },
      required: ["tool"],
    },
  },
  {
    name: "get_latest_ai_news",
    description:
      "获取最新聚合的一手权威 AI 行业资讯（涵盖 OpenAI 官方动态、Hugging Face 每日高赞论文、Hacker News AI 热议及国内前沿快讯）。",
    inputSchema: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description: "可选过滤关键词（如 'OpenAI'、'Agent'、'开源'、'DeepSeek'）",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 25,
          default: 10,
        },
      },
    },
  },
];

async function executeMcpTool(name, args, request, env) {
  const reqUrl = new URL(request.url);
  const originBase = `${reqUrl.protocol}//${reqUrl.host}`;

  if (name === "search_ai_tools") {
    const index = await ensureRuntimeIndex(request, env);
    const rawQ = String(args?.query || "").trim().slice(0, 80);
    const category = String(args?.category || "").trim();
    const region = String(args?.region || "all").trim().toLowerCase();
    const pricing = String(args?.pricing || "all").trim().toLowerCase();
    const limit = Math.max(1, Math.min(30, Number(args?.limit) || 10));

    const terms = rawQ ? rawQ.split(/\s+/).filter(Boolean).slice(0, 6) : [];
    const groups = terms.map(expandTermGroup);
    const scored = [];

    for (const it of index.items) {
      if (category && it.category !== category && !(category === "影音娱乐" && it.category === "划水摸鱼")) continue;
      if (region === "domestic" && !isDomestic(it)) continue;
      if (region === "overseas" && isDomestic(it)) continue;
      if (pricing && pricing !== "all") {
        const p = String(it.pricing || "").toLowerCase();
        if (pricing === "free") {
          if (p !== "完全免费" && p !== "开源免费") continue;
        } else if (!p.includes(pricing)) continue;
      }
      const sc = scoreTool(it, groups);
      if (sc < 0) continue;
      scored.push({ sc, it });
    }
    scored.sort((a, b) => b.sc - a.sc || a.it.name.localeCompare(b.it.name));
    const results = scored.slice(0, limit).map(({ it }) => ({
      name: it.name,
      url: it.url,
      domain: it.domain,
      category: it.category === "划水摸鱼" ? "影音娱乐" : it.category,
      access: regionLabel(it),
      pricing: it.pricing || "免费额度",
      description: it.description,
      detail_page: `${originBase}/tool/${it.slug}/`,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { total_matches: scored.length, returned: results.length, items: results },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "get_tool_alternatives") {
    const index = await ensureRuntimeIndex(request, env);
    const q = String(args?.tool || "").trim().toLowerCase();
    if (!q) {
      return { isError: true, content: [{ type: "text", text: "Missing required parameter: tool" }] };
    }
    const preferDomestic = args?.prefer_domestic !== false;
    const limit = Math.max(1, Math.min(20, Number(args?.limit) || 8));

    let target =
      index.bySlug.get(q) ||
      index.items.find((i) => (i.name || "").toLowerCase() === q || (i.domain || "").toLowerCase() === q) ||
      index.items.find((i) => (i.name || "").toLowerCase().includes(q) || (i.domain || "").toLowerCase().includes(q));

    if (!target) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: `未找到匹配「${args.tool}」的工具，请调用 search_ai_tools 按功能词检索。` }),
          },
        ],
      };
    }

    const peers = (index.byCategory.get(target.category) || []).filter((p) => p.id !== target.id);
    const ordered = preferDomestic
      ? [...peers.filter((p) => isDomestic(p)), ...peers.filter((p) => !isDomestic(p))]
      : peers;
    const alternatives = ordered.slice(0, limit).map((alt) => ({
      name: alt.name,
      url: alt.url,
      access: regionLabel(alt),
      pricing: alt.pricing || "免费额度",
      description: alt.description,
      detail_page: `${originBase}/tool/${alt.slug}/`,
    }));

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              target: {
                name: target.name,
                url: target.url,
                domain: target.domain,
                category: target.category,
                access: regionLabel(target),
                pricing: target.pricing || "免费额度",
                description: target.description,
                detail_page: `${originBase}/tool/${target.slug}/`,
              },
              alternatives,
            },
            null,
            2
          ),
        },
      ],
    };
  }

  if (name === "get_latest_ai_news") {
    const kw = String(args?.keyword || "").trim().toLowerCase();
    const limit = Math.max(1, Math.min(25, Number(args?.limit) || 10));
    const newsRes = env?.ASSETS
      ? await env.ASSETS.fetch(new URL("/data/news.json", reqUrl))
      : await fetch(new URL("/data/news.json", reqUrl));
    const newsJson = newsRes.ok ? await newsRes.json() : { items: [] };
    let list = Array.isArray(newsJson.items) ? newsJson.items : [];
    if (kw) {
      list = list.filter((n) => `${n.title || ""} ${n.summary || ""} ${n.source_name || ""}`.toLowerCase().includes(kw));
    }
    const items = list.slice(0, limit).map((n) => ({
      title: n.title,
      published_at: n.published_at || n.date,
      source: n.source_name || "AI快讯",
      topic: n.topic || "行业速递",
      summary: n.summary,
      url: String(n.url || "").startsWith("/") ? `${originBase}${n.url}` : n.url,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify({ returned: items.length, items }, null, 2) }],
    };
  }

  return { isError: true, content: [{ type: "text", text: `Unknown tool: ${name}` }] };
}

async function handleRpcMessage(msg, request, env) {
  if (!msg || typeof msg !== "object" || msg.jsonrpc !== "2.0") {
    return { jsonrpc: "2.0", id: msg?.id ?? null, error: { code: -32600, message: "Invalid JSON-RPC 2.0 request" } };
  }

  const { id, method, params } = msg;
  const isNotification = id === undefined;

  if (method === "notifications/initialized" || isNotification) {
    return null;
  }

  if (method === "initialize") {
    const clientVer = String(params?.protocolVersion || "");
    const supported = ["2025-03-26", "2024-11-05"];
    const protocolVersion = supported.includes(clientVer) ? clientVer : "2025-03-26";
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: {
          name: "ai-nav-hub-mcp",
          version: "1.0.0",
        },
        instructions:
          "AI 导航聚合站（https://dlzbkj-ai.pages.dev/）官方远程 MCP 服务：可按关键词/场景/计费/国内直连检索 8,240+ 款 AI 工具、查询任意海外工具的国内免翻墙平替，以及获取最新 OpenAI / Hugging Face / Hacker News 一手 AI 动态。",
      },
    };
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  if (method === "tools/list") {
    return { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } };
  }

  if (method === "tools/call") {
    try {
      const toolName = String(params?.name || "");
      const toolArgs = params?.arguments || {};
      const out = await executeMcpTool(toolName, toolArgs, request, env);
      return { jsonrpc: "2.0", id, result: out };
    } catch (err) {
      return {
        jsonrpc: "2.0",
        id,
        error: { code: -32603, message: String(err?.message || err) },
      };
    }
  }

  return { jsonrpc: "2.0", id, error: { code: -32601, message: `Method not found: ${method}` } };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet({ request }) {
  const reqUrl = new URL(request.url);
  const endpoint = `${reqUrl.protocol}//${reqUrl.host}/api/mcp`;
  return new Response(
    JSON.stringify(
      {
        name: "ai-nav-hub-mcp",
        title: "AI 导航聚合站 · 官方无状态远程 MCP Server (Streamable HTTP)",
        protocol: "Model Context Protocol (Streamable HTTP 2025-03-26 / 2024-11-05)",
        endpoint,
        auth: "none (free public endpoint)",
        tools: MCP_TOOLS.map((t) => ({ name: t.name, description: t.description })),
        client_config_example: {
          mcpServers: {
            "ai-nav-hub": {
              type: "streamable-http",
              url: endpoint,
            },
          },
        },
      },
      null,
      2
    ),
    {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=600, s-maxage=3600",
      },
    }
  );
}

export async function onRequestPost({ request, env }) {
  const len = Number(request.headers.get("content-length") || 0);
  if (len > 65536) {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Payload too large" } },
      { status: 413, headers: CORS_HEADERS }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (Array.isArray(body)) {
    const responses = (await Promise.all(body.slice(0, 10).map((m) => handleRpcMessage(m, request, env)))).filter(Boolean);
    if (responses.length === 0) {
      return new Response(null, { status: 202, headers: CORS_HEADERS });
    }
    return Response.json(responses, { status: 200, headers: CORS_HEADERS });
  }

  const reply = await handleRpcMessage(body, request, env);
  if (!reply) {
    return new Response(null, { status: 202, headers: CORS_HEADERS });
  }
  return Response.json(reply, { status: 200, headers: CORS_HEADERS });
}
