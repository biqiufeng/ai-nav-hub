#!/usr/bin/env python3
"""
Zero-dependency Static SEO & GEO Builder (Phase 1 + Phase 2) for AI Nav Hub.

Generates:
1. web/data/catalog-hot.json — Lightweight first-screen hot shard (~1,450 top tools + exact global counts)
2. Homepage SSR pre-rendering (Top 6 tools per category inside #catalogContainer + Topic/FAQ hub + FAQPage JSON-LD)
3. 10 Category static landing pages (/category/<slug>/index.html) + /category/index.html hub
4. ~439 Flagship Tool detail & domestic-alternative comparison pages (/tool/<slug>/index.html) + /tool/index.html hub
5. Persistent Daily AI Morning Brief archive (/daily/history.json, /daily/index.html, /daily/YYYY-MM-DD/index.html)
6. GEO & Syndication files: /llms.txt, /llms-full.txt, /feed.xml (RSS 2.0), /robots.txt, /sitemap.xml
7. Optional IndexNow instant URL push (--push-indexnow)
"""
import argparse
import datetime
import email.utils
import hashlib
import html
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict

from seo_geo_phase3 import (
    SCENE_CONFIGS,
    build_scene_pages,
    build_vs_pages,
    match_entities_in_text,
    prerender_news_and_moyu,
    write_openapi_spec,
    write_tool_slugs_index,
)

CST = datetime.timezone(datetime.timedelta(hours=8))

CATEGORY_CONFIG = [
    {
        "cat": "对话写作",
        "display": "对话写作",
        "slug": "chat-writing",
        "app_cat": "BusinessApplication",
        "short_desc": "通用大模型对话、AI 搜索引擎、长文公文写作、学术润色与 AI 检测工具",
        "keywords": "AI对话,大模型问答,AI搜索,AI写作工具,论文润色",
    },
    {
        "cat": "编程开发",
        "display": "编程开发",
        "slug": "coding",
        "app_cat": "DeveloperApplication",
        "short_desc": "AI 代码编辑器（IDE）、终端编程 Agent、代码补全审查、开源模型与开发者平台",
        "keywords": "AI编程工具,AI代码助手,AI IDE,代码生成,开发者工具",
    },
    {
        "cat": "图像设计",
        "display": "图像设计",
        "slug": "image-design",
        "app_cat": "DesignApplication",
        "short_desc": "AI 文生图绘画、电商海报生成、智能抠图修图、无损放大、Logo 与 UI/3D 设计工具",
        "keywords": "AI绘画,文生图,AI设计工具,智能抠图,AI海报Logo",
    },
    {
        "cat": "视频音频",
        "display": "视频音频",
        "slug": "video-audio",
        "app_cat": "MultimediaApplication",
        "short_desc": "AI 文生视频、图生视频、数字人口播、TTS 真人配音、语音克隆、AI 音乐与字幕剪辑工具",
        "keywords": "AI视频生成,AI配音,数字人,AI音乐生成,视频剪辑AI",
    },
    {
        "cat": "办公效率",
        "display": "办公效率",
        "slug": "office-productivity",
        "app_cat": "BusinessApplication",
        "short_desc": "一键生成 PPT、AI 表格公式分析、音视频会议纪要、PDF 文档总结、思维导图与协同效率工具",
        "keywords": "AI办公工具,AI一键生成PPT,AI会议纪要,AI表格,效率工具",
    },
    {
        "cat": "Agent与自动化",
        "display": "Agent与自动化",
        "slug": "agents-automation",
        "app_cat": "BusinessApplication",
        "short_desc": "多智能体（Multi-Agent）开发平台、MCP 服务生态、自动化工作流编排与无代码机器人",
        "keywords": "AI Agent,智能体平台,MCP工具,AI工作流,自动化编排",
    },
    {
        "cat": "学习知识库",
        "display": "学习知识库",
        "slug": "learning-knowledge",
        "app_cat": "EducationalApplication",
        "short_desc": "RAG 个人与企业知识库、科研文献语义检索、Prompt 提示词工程指南与 AI 公开课教程",
        "keywords": "AI知识库,科研文献AI,Prompt提示词,AI学习教程,RAG",
    },
    {
        "cat": "划水摸鱼",
        "display": "影音娱乐",
        "slug": "media-leisure",
        "app_cat": "EntertainmentApplication",
        "short_desc": "精选影视动漫检索、无损音乐音效素材、在线趣味小游戏与数字休闲实用工具",
        "keywords": "在线影音工具,免费音效库,休闲小游戏,数字娱乐导航",
    },
    {
        "cat": "新品速递",
        "display": "新品速递",
        "slug": "new-releases",
        "app_cat": "WebApplication",
        "short_desc": "每日同步 Product Hunt 及国内外最新发布的创新 AI 原生应用与独立开发者新产品",
        "keywords": "最新AI产品,Product Hunt今日新品,AI新品发布,独立开发AI",
    },
    {
        "cat": "其他工具",
        "display": "其他工具",
        "slug": "other-tools",
        "app_cat": "UtilitiesApplication",
        "short_desc": "垂直行业 AI 解决方案、翻译测评、数据工具与跨领域实用效率百宝箱",
        "keywords": "垂直行业AI,实用AI工具箱,免费在线工具",
    },
]

CAT_BY_RAW = {c["cat"]: c for c in CATEGORY_CONFIG}
DEV_CATS = {"编程开发", "办公效率", "图像设计", "Agent与自动化"}

AVATAR_PALETTE = [
    "#0A84FF", "#5E5CE6", "#BF5AF2", "#FF375F",
    "#FF9F0A", "#30B0C7", "#34C759", "#AF52DE",
]

COMMON_TLDS = {
    "com", "cn", "ai", "io", "dev", "app", "org", "net", "co", "so",
    "cc", "top", "xyz", "me", "tech", "tools", " work", "club", "pro",
    "ink", "art", "design", "video", "chat", "gg", "sh", "ly", "tv",
}


def esc(val):
    return html.escape(str(val or ""), quote=True)


def avatar_color(seed):
    h = 0
    for ch in (seed or "?"):
        h = ((h << 5) - h + ord(ch)) & 0xFFFFFFFF
        if h >= 0x80000000:
            h -= 0x100000000
    return AVATAR_PALETTE[abs(h) % len(AVATAR_PALETTE)]


def is_domestic(item):
    regs = item.get("regions") or [item.get("region")]
    return "domestic" in regs


def is_overseas(item):
    regs = item.get("regions") or [item.get("region")]
    return "overseas" in regs


def region_label(item):
    am = item.get("access_mode") or ""
    if am == "cn_native" or is_domestic(item):
        return "国内直连"
    if am == "intl_network":
        return "海外主流（需国际网络）"
    if item.get("cn_featured"):
        return "海外直连 · 国内热推"
    return "海外直连"


def pricing_chip_html(pricing):
    p = (pricing or "").strip()
    if not p:
        return ""
    mod = "tag-chip--freemium"
    if p == "完全免费":
        mod = "tag-chip--free"
    elif p == "开源免费":
        mod = "tag-chip--oss"
    elif p == "付费订阅":
        mod = "tag-chip--paid"
    return f'<span class="tag-chip {mod}">{esc(p)}</span>'


def sort_tools(items):
    return sorted(
        items,
        key=lambda x: (len(x.get("sources") or []), x.get("score") or 0),
        reverse=True,
    )


def make_tool_slug(item, used_slugs):
    url = item.get("url") or ""
    p = urllib.parse.urlsplit(url)
    host = re.sub(r"^www\.", "", (p.netloc or item.get("domain") or "").lower())
    parts = [seg for seg in host.split(".") if seg]
    while len(parts) > 1 and parts[-1] in COMMON_TLDS:
        parts.pop()
    if len(parts) > 1 and parts[-1] in ("com", "org", "net", "gov", "edu"):
        parts.pop()
    host_slug = "-".join(parts) if parts else host.replace(".", "-")
    path_segs = [s for s in (p.path or "").lower().split("/") if s and s not in ("zh", "en", "cn", "zh-cn", "home", "index.html")]
    if host in ("github.com", "huggingface.co") and len(path_segs) >= 2:
        raw_slug = f"{path_segs[0]}-{path_segs[1]}"
    elif path_segs and host_slug in ("aws-amazon", "cloud-google", "aliyun", "tencent", "baidu", "volcengine", "feishu"):
        raw_slug = f"{host_slug}-{path_segs[-1]}"
    else:
        raw_slug = host_slug

    slug = re.sub(r"[^a-z0-9]+", "-", raw_slug).strip("-")[:42].strip("-")
    if len(slug) < 2:
        slug = "tool-" + (item.get("id") or hashlib.sha1(url.encode()).hexdigest()[:8])
    base = slug
    if slug in used_slugs:
        suffix = (item.get("id") or hashlib.sha1(url.encode()).hexdigest())[:4]
        slug = f"{base}-{suffix}"
    used_slugs.add(slug)
    return slug


def build_hot_catalog_shard(web_dir, catalog, by_cat):
    """Generates web/data/catalog-hot.json (~400KB raw, <100KB Brotli) for <80ms mobile interactive paint."""
    all_items = catalog.get("items") or []
    selected_ids = set()
    hot_list = []

    # 1. Include all multi-source hot tools (>=2 sources) up to 1000 + top 70 per category
    for cfg in CATEGORY_CONFIG:
        cat_sorted = sort_tools(by_cat.get(cfg["cat"], []))
        limit = 110 if cfg["cat"] == "划水摸鱼" else 80
        for it in cat_sorted[:limit]:
            if it["id"] not in selected_ids:
                selected_ids.add(it["id"])
                hot_list.append(it)

    for it in sort_tools(all_items):
        if len(hot_list) >= 1500:
            break
        if len(it.get("sources") or []) >= 2 and it["id"] not in selected_ids:
            selected_ids.add(it["id"])
            hot_list.append(it)

    hot_list = sort_tools(hot_list)

    global_counts = {
        "all": len(all_items),
        "hot": sum(1 for i in all_items if len(i.get("sources") or []) >= 2),
        "domestic": sum(1 for i in all_items if is_domestic(i)),
        "overseas": sum(1 for i in all_items if is_overseas(i)),
        "dev": sum(1 for i in all_items if i.get("category") in DEV_CATS),
        "leisure": sum(1 for i in all_items if i.get("category") in ("划水摸鱼", "影音娱乐")),
        "by_category": {cfg["cat"]: len(by_cat.get(cfg["cat"], [])) for cfg in CATEGORY_CONFIG},
    }

    shard = {
        "generated_at": catalog.get("generated_at", ""),
        "is_partial": True,
        "categories": catalog.get("categories") or [c["cat"] for c in CATEGORY_CONFIG],
        "global_counts": global_counts,
        "items": hot_list,
    }
    hot_path = os.path.join(web_dir, "data", "catalog-hot.json")
    with open(hot_path, "w", encoding="utf-8") as f:
        json.dump(shard, f, ensure_ascii=False, separators=(",", ":"))
    return len(hot_list), os.path.getsize(hot_path)


def submit_dialog_html():
    return """  <dialog class="tool-dialog submit-dialog" id="submitToolDialog" closedby="any" aria-labelledby="submitDialogTitle">
    <div class="tool-dialog__surface submit-dialog__surface">
      <div class="tool-dialog__header">
        <div class="tool-dialog__titles">
          <h1 class="tool-dialog__title" id="submitDialogTitle">免费提交 AI 工具收录</h1>
          <p class="tool-dialog__domain">零广告纯净收录 · 欢迎自荐或推荐优质 AI 产品与开源项目</p>
        </div>
        <button class="icon-btn" id="submitDialogCloseBtn" type="button" command="close" commandfor="submitToolDialog" aria-label="关闭提交弹窗">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>

      <form class="submit-form" id="submitToolForm" aria-labelledby="submitDialogTitle" novalidate>
        <div class="form-field">
          <label for="subToolName">工具名称 <span class="req-mark" aria-hidden="true">*</span></label>
          <input id="subToolName" name="name" type="text" maxlength="60" enterkeyhint="next" required autofocus placeholder="例如：DeepSeek / 秘塔 AI 搜索">
        </div>

        <div class="form-field">
          <label for="subToolUrl">官网链接 <span class="req-mark" aria-hidden="true">*</span></label>
          <input id="subToolUrl" name="url" type="url" inputmode="url" autocorrect="off" autocapitalize="none" spellcheck="false" enterkeyhint="next" required placeholder="https://example.com">
        </div>

        <div class="form-field">
          <label for="subToolCat">推荐分类</label>
          <select id="subToolCat" name="category">
            <option value="对话写作">对话写作</option>
            <option value="编程开发">编程开发</option>
            <option value="图像设计">图像设计</option>
            <option value="视频音频">视频音频</option>
            <option value="办公效率">办公效率</option>
            <option value="Agent与自动化">Agent与自动化</option>
            <option value="学习知识库">学习知识库</option>
            <option value="影音娱乐">影音娱乐</option>
            <option value="新品速递">新品速递</option>
            <option value="其他工具">其他工具</option>
          </select>
        </div>

        <div class="form-field">
          <label for="subToolDesc">核心亮点简介 <span class="req-mark" aria-hidden="true">*</span></label>
          <textarea id="subToolDesc" name="description" rows="3" maxlength="240" required placeholder="简述核心功能、适用人群与免费额度（200 字以内）"></textarea>
        </div>

        <p class="submit-form__error" id="subFormError" role="status" aria-live="polite"></p>

        <pre class="sr-only"><code id="subMarkdownSnippet"></code></pre>

        <div class="tool-dialog__actions submit-form__actions">
          <button class="btn-primary" type="submit">
            通过 GitHub Issue 提交收录
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M7 17 17 7M7 7h10v10"/>
            </svg>
          </button>
          <span class="copy-wrap">
            <button class="btn-secondary copy-button" id="subCopyBtn" type="button" command="--copy" commandfor="subMarkdownSnippet">复制收录信息</button>
            <span class="copy-tip" id="subCopyTip" role="status"></span>
          </span>
          <button class="btn-secondary" id="subMailBtn" type="button">邮件直投站长</button>
        </div>

        <details class="faq-item" style="margin-top:12px;">
          <summary style="padding:10px 14px;font-size:13px;">获取「已收录徽章」官网嵌入代码（互换友链优先审核）</summary>
          <div class="faq-item__body" style="padding:10px 14px;">
            <p style="margin:0 0 8px;font-size:12.5px;">将以下徽章代码添加至贵站页脚或 README，提交时注明即可获得优先展示：</p>
            <pre class="sr-only"><code id="subBadgeCode">&lt;a href="https://dlzbkj-ai.pages.dev/" target="_blank" rel="noopener"&gt;&lt;img src="https://dlzbkj-ai.pages.dev/badge.svg" alt="已收录于 AI 导航聚合站" width="212" height="36"&gt;&lt;/a&gt;</code></pre>
            <span class="copy-wrap">
              <button class="btn-secondary copy-button" type="button" command="--copy" commandfor="subBadgeCode" style="padding:6px 12px;font-size:12.5px;">一键复制 SVG 徽章代码</button>
              <span class="copy-tip" role="status"></span>
            </span>
          </div>
        </details>
      </form>
    </div>
  </dialog>"""


def page_shell_html(
    *,
    rel_root,
    title,
    description,
    canonical_url,
    active_nav,
    json_ld_obj,
    main_html,
    keywords="",
):
    ld_json = json.dumps(json_ld_obj, ensure_ascii=False, separators=(",", ":"))
    kw_tag = f'\n  <meta name="keywords" content="{esc(keywords)}">' if keywords else ""

    def nav_attr(key):
        return ' aria-current="page"' if active_nav == key else ""

    return f"""<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#0071e3">
  <script>
    try {{
      var savedScheme = localStorage.getItem("color-scheme");
      var validScheme = savedScheme === "light" || savedScheme === "dark" ? savedScheme : "light dark";
      document.querySelector('meta[name="color-scheme"]').content = validScheme;
    }} catch (e) {{}}
  </script>
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(description)}">{kw_tag}
  <link rel="canonical" href="{esc(canonical_url)}">
  <link rel="manifest" href="{rel_root}manifest.webmanifest">
  <link rel="search" type="application/opensearchdescription+xml" title="AI 导航聚合站" href="{rel_root}opensearch.xml">
  <link rel="alternate" type="application/rss+xml" title="AI 导航聚合站 · 每日 AI 资讯 RSS" href="https://dlzbkj-ai.pages.dev/feed.xml">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="AI 导航聚合站">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:title" content="{esc(title)}">
  <meta property="og:description" content="{esc(description)}">
  <meta property="og:url" content="{esc(canonical_url)}">
  <meta property="og:image" content="https://dlzbkj-ai.pages.dev/og-cover.png?v=2">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="{esc(title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="{esc(title)}">
  <meta name="twitter:description" content="{esc(description)}">
  <meta name="twitter:image" content="https://dlzbkj-ai.pages.dev/og-cover.png?v=2">
  <link rel="icon" type="image/png" sizes="64x64" href="{rel_root}favicon.png?v=5">
  <link rel="apple-touch-icon" sizes="180x180" href="{rel_root}apple-touch-icon.png?v=5">
  <link rel="stylesheet" href="{rel_root}styles.css?v=19">
  <link rel="stylesheet" href="{rel_root}seo-geo.css?v=2">
  <script type="application/ld+json">{ld_json}</script>
  <script type="module" src="{rel_root}subpage.js?v=2"></script>
</head>
<body>
  <header class="top-bar site-header" id="topBar">
    <div class="top-bar__inner">
      <div class="top-bar__left">
        <a class="brand" href="{rel_root}" aria-label="AI 导航聚合站首页">
          <img class="brand__icon" src="{rel_root}logo.jpg?v=5" alt="" width="28" height="28">
          <span class="brand__name">AI 导航聚合站</span>
        </a>
      </div>

      <div class="top-bar__actions">
        <nav class="site-nav" aria-label="主导航">
          <button
            class="menu-button"
            type="button"
            popovertarget="site-menu"
            popovertargetaction="toggle"
            aria-controls="site-menu"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16"/>
            </svg>
            <span>频道</span>
          </button>
          <ul id="site-menu" class="site-menu" popover="auto">
            <li><a href="{rel_root}"{nav_attr("home")}>首页</a></li>
            <li><a href="{rel_root}scene/"{nav_attr("scene")}>场景专题</a></li>
            <li><a href="{rel_root}vs/"{nav_attr("vs")}>VS对比</a></li>
            <li><a href="{rel_root}category/"{nav_attr("category")}>分类榜单</a></li>
            <li><a href="{rel_root}news/"{nav_attr("news")}>AI资讯</a></li>
            <li><a href="{rel_root}daily/"{nav_attr("daily")}>AI早报</a></li>
            <li><a href="{rel_root}moyu/"{nav_attr("moyu")}>热榜</a></li>
          </ul>
        </nav>

        <button class="submit-trigger" type="button" command="show-modal" commandfor="submitToolDialog">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
            <path d="M12 5v14M5 12h14"/>
          </svg>
          <span><span class="submit-trigger__prefix">提交</span>收录</span>
        </button>

        <button class="theme-toggle" id="themeToggle" type="button" aria-label="切换浅色或深色外观" title="切换外观（可收回至跟随系统）">
          <span class="theme-toggle__icon theme-toggle__icon--sun" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4"/>
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
            </svg>
          </span>
          <span class="theme-toggle__icon theme-toggle__icon--moon" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>
            </svg>
          </span>
          <span class="sr-only" id="themeToggleLabel">切换外观</span>
        </button>
      </div>
    </div>
  </header>

  <main class="seo-shell">
{main_html}
  </main>

  <footer class="site-footer">
    <div class="site-footer__inner site-footer__bar">
      <p class="site-footer__copy">AI 导航聚合站 · 每日自动同步国内外主流 AI 工具、早报与热榜 · 零广告免登录</p>
      <nav class="site-footer__links" aria-label="站点底部导航">
        <button class="footer-link-btn" id="installAppBtn" type="button" hidden>安装桌面应用</button>
        <button class="footer-link-btn" type="button" command="show-modal" commandfor="submitToolDialog">免费提交工具收录</button>
        <a href="{rel_root}scene/">场景专题</a>
        <a href="{rel_root}vs/">VS对比库</a>
        <a href="{rel_root}category/">分类专题</a>
        <a href="{rel_root}tool/">热门工具库</a>
        <a href="{rel_root}daily/">每日AI早报</a>
        <a href="{rel_root}llms.txt">llms.txt</a>
        <a href="{rel_root}openapi.json">OpenAPI</a>
        <a href="{rel_root}feed.xml">RSS订阅</a>
        <a href="{rel_root}sitemap.xml">Sitemap</a>
        <a href="https://github.com/biqiufeng/ai-nav-hub" target="_blank" rel="noopener noreferrer">GitHub</a>
      </nav>
    </div>
  </footer>

{submit_dialog_html()}

  <div class="toast-region" aria-live="polite" aria-atomic="true">
    <div class="toast" id="toast" hidden></div>
  </div>
</body>
</html>
"""


def render_static_card(item, cat_display, rel_root="", slug_by_id=None):
    name = item.get("name") or item.get("domain") or "AI 工具"
    domain = item.get("domain") or ""
    url = item.get("url") or "#"
    desc = item.get("description") or f"{cat_display} · {domain}"
    letter = name.strip()[0].upper() if name.strip() else "A"
    bg = avatar_color(domain or name)
    reg = region_label(item)
    p_chip = pricing_chip_html(item.get("pricing"))
    tslug = (slug_by_id or {}).get(item.get("id"))
    title_href = f"{rel_root}tool/{tslug}/" if tslug else url
    title_target = "" if tslug else ' target="_blank" rel="noopener noreferrer"'
    detail_hint = (
        f'<a class="compare-table__link" style="font-size:12px;" href="{rel_root}tool/{tslug}/">详情与平替 →</a>'
        if tslug
        else f'<span class="region-hint">{esc(reg)}</span>'
    )
    return f"""        <article class="tool-card seo-tool-card">
          <div class="tool-card__top">
            <div class="tool-card__head">
              <div class="tool-avatar" style="--avatar-bg:{bg}" aria-hidden="true"><span>{esc(letter)}</span></div>
              <div class="tool-card__titles">
                <h3 class="tool-card__name"><a class="seo-tool-card__title-link" href="{esc(title_href)}"{title_target}>{esc(name)}</a></h3>
                <p class="tool-card__domain">{esc(domain)}</p>
              </div>
            </div>
            <div class="tool-card__quick">
              <a class="icon-btn" href="{esc(url)}" target="_blank" rel="noopener noreferrer" aria-label="直接访问 {esc(name)} 官网">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>
              </a>
            </div>
          </div>
          <p class="tool-card__desc">{esc(desc)}</p>
          <div class="tool-card__foot">
            <div class="tool-card__tags">
              <span class="tag-chip">{esc(cat_display)}</span>
              {p_chip}
            </div>
            {detail_hint}
          </div>
        </article>"""


def build_flagship_tool_pages(web_dir, base_url, by_cat, today_str):
    """Generates ~439 static /tool/<slug>/index.html pages for high-consensus (>=3 sources) tools + /tool/index.html."""
    tool_root = os.path.join(web_dir, "tool")
    os.makedirs(tool_root, exist_ok=True)

    used_slugs = set()
    flagship_items = []
    for cfg in CATEGORY_CONFIG:
        for it in sort_tools(by_cat.get(cfg["cat"], [])):
            if len(it.get("sources") or []) >= 3:
                flagship_items.append(it)

    slug_by_id = {}
    for it in flagship_items:
        slug_by_id[it["id"]] = make_tool_slug(it, used_slugs)

    generated_urls = []

    # 1. /tool/ directory hub
    hub_sections = []
    for cfg in CATEGORY_CONFIG:
        cat_flags = [i for i in sort_tools(by_cat.get(cfg["cat"], [])) if i["id"] in slug_by_id]
        if not cat_flags:
            continue
        links = "\n".join(
            f'          <a class="topic-link-card" href="./{slug_by_id[it["id"]]}/"><span>{esc(it["name"])}</span><span>{esc(region_label(it).split(" ")[0])} →</span></a>'
            for it in cat_flags
        )
        hub_sections.append(f"""    <section class="seo-section" aria-labelledby="thub-{cfg['slug']}">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="thub-{cfg['slug']}">{esc(cfg['display'])}热门工具（{len(cat_flags)} 款）</h2>
        <a class="cat-section__more" href="../category/{cfg['slug']}/">进入{esc(cfg['display'])}完整对比榜 →</a>
      </div>
      <div class="topic-links-grid">
{links}
      </div>
    </section>""")

    tool_hub_url = f"{base_url}/tool/"
    tool_hub_main = f"""    <nav class="breadcrumb" aria-label="面包屑导航">
      <ol>
        <li><a href="../">首页</a></li>
        <li><a href="./" aria-current="page">热门工具详情库</a></li>
      </ol>
    </nav>

    <section class="seo-hero">
      <span class="seo-hero__eyebrow">多源权威共识 · 官网入口与平替对比</span>
      <h1 class="seo-hero__title">精选 {len(flagship_items)} 款高热度 AI 工具详情与平替索引</h1>
      <p class="seo-hero__desc">汇总同时获 3 家及以上主流导航目录推荐的 {len(flagship_items)} 款代表性 AI 工具，每款工具均提供干净无广告官网直达、国内直连状态说明与同赛道热门平替对比。</p>
    </section>

{chr(10).join(hub_sections)}"""

    tool_hub_ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "首页", "item": f"{base_url}/"},
                    {"@type": "ListItem", "position": 2, "name": "热门工具详情库", "item": tool_hub_url},
                ],
            },
            {
                "@type": "CollectionPage",
                "name": f"精选 {len(flagship_items)} 款高热度 AI 工具详情与平替索引 · AI 导航聚合站",
                "url": tool_hub_url,
                "inLanguage": "zh-CN",
            },
        ],
    }
    with open(os.path.join(tool_root, "index.html"), "w", encoding="utf-8") as f:
        f.write(
            page_shell_html(
                rel_root="../",
                title=f"精选 {len(flagship_items)} 款热门 AI 工具官网入口与国内平替大全 · AI 导航聚合站",
                description=f"收录 {len(flagship_items)} 款多源共识头部 AI 工具独立评测、官网直达入口与同赛道国内直连平替推荐。",
                canonical_url=tool_hub_url,
                active_nav="category",
                json_ld_obj=tool_hub_ld,
                main_html=tool_hub_main,
                keywords="AI工具大全,AI平替推荐,AI官网入口,国内外AI工具对比",
            )
        )
    generated_urls.append((tool_hub_url, today_str, "weekly", "0.85"))

    # 2. Individual /tool/<slug>/index.html pages
    for it in flagship_items:
        tslug = slug_by_id[it["id"]]
        cfg = CAT_BY_RAW.get(it.get("category"), CATEGORY_CONFIG[-1])
        disp = cfg["display"]
        cat_slug = cfg["slug"]
        name = it.get("name") or it.get("domain") or "AI 工具"
        domain = it.get("domain") or ""
        url = it.get("url") or "#"
        desc = it.get("description") or f"{name} 是一款聚焦 {disp} 场景的主流 AI 工具。"
        src_cnt = len(it.get("sources") or [])
        reg = region_label(it)
        dom_flag = is_domestic(it)

        # Pick Top 8 same-category alternatives (prioritizing domestic direct-access + high consensus)
        peers = [p for p in sort_tools(by_cat.get(cfg["cat"], [])) if p["id"] != it["id"]]
        dom_peers = [p for p in peers if is_domestic(p)]
        ovs_peers = [p for p in peers if not is_domestic(p)]
        alts = (dom_peers[:6] + ovs_peers[:4])[:8]
        if len(alts) < 8:
            seen_alt = {a["id"] for a in alts}
            for p in peers:
                if p["id"] not in seen_alt:
                    alts.append(p)
                    seen_alt.add(p["id"])
                if len(alts) >= 8:
                    break

        alt_rows = []
        for alt in alts:
            alt_slug = slug_by_id.get(alt["id"])
            alt_name_cell = (
                f'<a class="seo-tool-card__title-link" href="../{alt_slug}/">{esc(alt["name"])}</a>'
                if alt_slug
                else esc(alt["name"])
            )
            alt_desc = (alt.get("description") or cfg["short_desc"])[:90]
            if len(alt.get("description") or "") > 90:
                alt_desc += "…"
            alt_rows.append(f"""          <tr>
            <th scope="row">{alt_name_cell}</th>
            <td>{esc(region_label(alt))}</td>
            <td>{len(alt.get('sources') or [])} 大目录收录</td>
            <td class="compare-table__desc">{esc(alt_desc)}</td>
            <td><a class="compare-table__link" href="{esc(alt['url'])}" target="_blank" rel="noopener noreferrer">{esc(alt.get('domain') or '官网')} ↗</a></td>
          </tr>""")

        sibling_cards = "\n".join(
            render_static_card(sib, disp, rel_root="../../", slug_by_id=slug_by_id)
            for sib in [p for p in peers if p["id"] in slug_by_id][:6]
        )

        alt_names_top5 = "、".join(a["name"] for a in alts[:5]) or disp
        dom_alt_names = "、".join(a["name"] for a in dom_peers[:4]) or alt_names_top5

        access_answer = (
            f"{name} 的官方入口地址为 {url}（主域名：{domain}）。该产品属于「{reg}」工具，国内网络环境下通常可直接打开访问使用。"
            if dom_flag
            else f"{name} 的官方入口地址为 {url}（主域名：{domain}）。该产品属于海外主流 AI 工具，若在部分网络环境下加载较慢，可优先参考下方同赛道的国内直连平替方案：{dom_alt_names}。"
        )
        faqs = [
            (f"{name} 官网入口地址是什么？国内可以直接访问吗？", access_answer),
            (f"{name} 主要有哪些核心功能与适用人群？", f"{desc} 在分类体系中属于「{disp}」赛道，目前已获得国内外 {src_cnt} 大权威 AI 导航目录交叉共识推荐。"),
            (f"2026 年有哪些好用的 {name} 同类平替或国内替代工具？", f"在「{disp}」领域，与 {name} 定位相近且口碑较高的热门替代或互补工具包括：{alt_names_top5}。其中支持国内免翻墙直连的代表方案有：{dom_alt_names}。"),
        ]
        faq_html = "\n".join(
            f"""        <details class="faq-item" name="tool-faq"{' open' if i == 0 else ''}>
          <summary>{esc(q)}</summary>
          <p class="faq-item__body">{esc(a)}</p>
        </details>"""
            for i, (q, a) in enumerate(faqs)
        )

        canon = f"{base_url}/tool/{tslug}/"
        letter = name.strip()[0].upper() if name.strip() else "A"
        bg = avatar_color(domain or name)

        main_html = f"""    <nav class="breadcrumb" aria-label="面包屑导航">
      <ol>
        <li><a href="../../">首页</a></li>
        <li><a href="../../category/{cat_slug}/">{esc(disp)}</a></li>
        <li><a href="./" aria-current="page">{esc(name)}</a></li>
      </ol>
    </nav>

    <section class="seo-hero">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
        <div class="tool-avatar tool-avatar--lg" style="--avatar-bg:{bg}" aria-hidden="true"><span>{esc(letter)}</span></div>
        <div>
          <span class="seo-hero__eyebrow" style="margin-bottom:4px;">{esc(disp)} · 获 {src_cnt} 大导航站共识推荐</span>
          <h1 class="seo-hero__title" style="margin:0;">{esc(name)}</h1>
        </div>
      </div>
      <p class="seo-hero__desc">{esc(desc)}</p>
      <div class="seo-hero__stats">
        <a class="btn-primary" href="{esc(url)}" target="_blank" rel="noopener noreferrer">
          直达 {esc(name)} 官方网站 ({esc(domain)})
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>
        </a>
        <span class="stat-pill">访问属性 <strong>{esc(reg)}</strong></span>
        <span class="stat-pill">计费模式 <strong>{esc(it.get('pricing') or '免费额度')}</strong></span>
        <span class="stat-pill">所属赛道 <strong>{esc(disp)}</strong></span>
        <a class="btn-secondary" href="../../category/{cat_slug}/" style="padding:7px 14px;font-size:13px;">浏览全部 {len(by_cat.get(cfg['cat'], []))} 款{esc(disp)}工具 →</a>
      </div>
    </section>

    <section class="seo-section" aria-labelledby="alt-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="alt-heading">{esc(name)} 同赛道平替与国内直连替代对比（Top {len(alts)}）</h2>
        <p class="seo-section__sub">优先列出同分类高共识及国内可直接访问的同类产品</p>
      </div>
      <div tabindex="0" role="region" aria-labelledby="alt-caption" class="table-wrapper">
        <table class="compare-table" style="--label-2:'访问区域';--label-3:'共识热度';--label-4:'核心特点对比';--label-5:'官网直达';">
          <caption id="alt-caption">{esc(name)} 同类 AI {esc(disp)}平替工具对比表（{today_str} 更新）</caption>
          <thead>
            <tr>
              <th scope="col">平替工具</th>
              <th scope="col">访问区域</th>
              <th scope="col">共识热度</th>
              <th scope="col">核心特点对比</th>
              <th scope="col">官网直达</th>
            </tr>
          </thead>
          <tbody>
{chr(10).join(alt_rows)}
          </tbody>
        </table>
      </div>
    </section>

    <section class="seo-section" aria-labelledby="sib-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="sib-heading">更多「{esc(disp)}」高分工具推荐</h2>
        <a class="cat-section__more" href="../../?cat={urllib.parse.quote(cfg['cat'])}">在全库实时搜索 →</a>
      </div>
      <div class="cards-grid">
{sibling_cards}
      </div>
    </section>

    <section class="seo-section" aria-labelledby="tool-faq-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="tool-faq-heading">关于 {esc(name)} 的常见问答</h2>
      </div>
      <div class="faq-list">
{faq_html}
      </div>
    </section>"""

        ld_obj = {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        {"@type": "ListItem", "position": 1, "name": "首页", "item": f"{base_url}/"},
                        {"@type": "ListItem", "position": 2, "name": disp, "item": f"{base_url}/category/{cat_slug}/"},
                        {"@type": "ListItem", "position": 3, "name": name, "item": canon},
                    ],
                },
                {
                    "@type": "SoftwareApplication",
                    "name": name,
                    "applicationCategory": cfg["app_cat"],
                    "operatingSystem": "Web",
                    "url": url,
                    "description": desc,
                    "inLanguage": "zh-CN",
                },
                {
                    "@type": "FAQPage",
                    "mainEntity": [
                        {
                            "@type": "Question",
                            "name": q,
                            "acceptedAnswer": {"@type": "Answer", "text": a},
                        }
                        for q, a in faqs
                    ],
                },
            ],
        }

        page_dir = os.path.join(tool_root, tslug)
        os.makedirs(page_dir, exist_ok=True)
        title = f"{name} 官网入口、核心功能与 2026 国内直连平替推荐 · AI 导航聚合站"
        meta_desc = f"{name}（{domain}）官方入口与功能解析：{desc[:82]}… 同步整理 {alt_names_top5} 等同赛道平替工具对比。"
        with open(os.path.join(page_dir, "index.html"), "w", encoding="utf-8") as f:
            f.write(
                page_shell_html(
                    rel_root="../../",
                    title=title,
                    description=meta_desc,
                    canonical_url=canon,
                    active_nav="category",
                    json_ld_obj=ld_obj,
                    main_html=main_html,
                    keywords=f"{name},{name}官网,{name}平替,{name}国内替代,{disp}AI工具",
                )
            )
        generated_urls.append((canon, today_str, "weekly", "0.75"))

    return generated_urls, slug_by_id, flagship_items


def build_category_pages(web_dir, base_url, by_cat, today_str, slug_by_id):
    cat_root = os.path.join(web_dir, "category")
    os.makedirs(cat_root, exist_ok=True)
    generated_urls = []

    hub_cards = []
    hub_itemlist = []
    for idx, cfg in enumerate(CATEGORY_CONFIG, 1):
        items = by_cat.get(cfg["cat"], [])
        dom_cnt = sum(1 for i in items if is_domestic(i))
        url = f"{base_url}/category/{cfg['slug']}/"
        hub_itemlist.append({
            "@type": "ListItem",
            "position": idx,
            "name": f"AI {cfg['display']}工具大全（{len(items)} 款）",
            "url": url,
        })
        top_names = "、".join(i["name"] for i in sort_tools(items)[:4])
        hub_cards.append(f"""      <a class="daily-card" href="./{cfg['slug']}/">
        <div>
          <div class="daily-card__date">共 {len(items)} 款 · 国内直连 {dom_cnt} 款</div>
          <h2 class="daily-card__title" style="margin-top:6px;">{esc(cfg['display'])} AI 工具专题</h2>
          <p class="tool-card__desc" style="margin-top:6px;">{esc(cfg['short_desc'])}</p>
        </div>
        <div class="daily-card__meta">代表工具：{esc(top_names)} →</div>
      </a>""")

    total_all = sum(len(v) for v in by_cat.values())
    hub_main = f"""    <nav class="breadcrumb" aria-label="面包屑导航">
      <ol>
        <li><a href="../">首页</a></li>
        <li><a href="./" aria-current="page">分类专题</a></li>
      </ol>
    </nav>

    <section class="seo-hero">
      <span class="seo-hero__eyebrow">10 大垂直赛道全量索引</span>
      <h1 class="seo-hero__title">AI 工具分类专题大全（共 {total_all:,} 款）</h1>
      <p class="seo-hero__desc">按真实工作流整理的 10 大 AI 工具专题目录，涵盖国内外主流大模型、AI 编程、设计绘画、音视频生成、PPT 办公与智能体平台，支持多源共识对比与免登录直达。</p>
      <div class="seo-hero__stats">
        <a class="btn-secondary" href="../tool/" style="padding:6px 14px;font-size:13px;">浏览 {len(slug_by_id)} 款头部工具平替详情库 →</a>
      </div>
    </section>

    <section class="daily-archive-grid" aria-label="全部分类专题">
{chr(10).join(hub_cards)}
    </section>"""

    hub_url = f"{base_url}/category/"
    hub_ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "首页", "item": f"{base_url}/"},
                    {"@type": "ListItem", "position": 2, "name": "分类专题", "item": hub_url},
                ],
            },
            {
                "@type": "CollectionPage",
                "name": f"AI 工具分类专题大全（{total_all} 款） · AI 导航聚合站",
                "url": hub_url,
                "inLanguage": "zh-CN",
                "mainEntity": {"@type": "ItemList", "itemListElement": hub_itemlist},
            },
        ],
    }
    with open(os.path.join(cat_root, "index.html"), "w", encoding="utf-8") as f:
        f.write(
            page_shell_html(
                rel_root="../",
                title=f"AI 工具分类专题大全 · 10 大赛道 {total_all} 款工具对比与导航",
                description="涵盖对话写作、AI 编程开发、图像设计、视频音频、办公效率、Agent 智能体等 10 大垂直分类专题对比与官网直达。",
                canonical_url=hub_url,
                active_nav="category",
                json_ld_obj=hub_ld,
                main_html=hub_main,
                keywords="AI工具分类,AI导航大全,国内AI工具,免费AI网站对比",
            )
        )
    generated_urls.append((hub_url, today_str, "daily", "0.9"))

    for cfg in CATEGORY_CONFIG:
        slug = cfg["slug"]
        disp = cfg["display"]
        items = sort_tools(by_cat.get(cfg["cat"], []))
        total_cnt = len(items)
        dom_items = [i for i in items if is_domestic(i)]
        ovs_items = [i for i in items if is_overseas(i)]
        hot_items = [i for i in items if len(i.get("sources") or []) >= 2]

        page_dir = os.path.join(cat_root, slug)
        os.makedirs(page_dir, exist_ok=True)
        canon = f"{base_url}/category/{slug}/"

        pills = []
        for sib in CATEGORY_CONFIG:
            sib_cnt = len(by_cat.get(sib["cat"], []))
            active_cls = " is-active" if sib["slug"] == slug else ""
            aria_cur = ' aria-current="page"' if sib["slug"] == slug else ""
            pills.append(
                f'<a class="cat-pill{active_cls}" href="../{sib["slug"]}/"{aria_cur}>{esc(sib["display"])} <span class="cat-pill__num">{sib_cnt}</span></a>'
            )

        rows_html = []
        for it in items[:15]:
            src_cnt = len(it.get("sources") or [])
            desc_short = (it.get("description") or cfg["short_desc"])[:96]
            if len(it.get("description") or "") > 96:
                desc_short += "…"
            tslug = slug_by_id.get(it["id"])
            name_cell = (
                f'<a class="seo-tool-card__title-link" href="../../tool/{tslug}/">{esc(it["name"])}</a>'
                if tslug
                else esc(it["name"])
            )
            rows_html.append(f"""          <tr>
            <th scope="row">{name_cell}</th>
            <td>{esc(region_label(it))}</td>
            <td>{src_cnt} 大导航站共识收录</td>
            <td class="compare-table__desc">{esc(desc_short)}</td>
            <td><a class="compare-table__link" href="{esc(it['url'])}" target="_blank" rel="noopener noreferrer">{esc(it.get('domain') or '访问官网')} ↗</a></td>
          </tr>""")

        cards_html = "\n".join(
            render_static_card(it, disp, rel_root="../../", slug_by_id=slug_by_id)
            for it in items[:96]
        )

        top5_all = "、".join(i["name"] for i in items[:5]) or disp
        top5_dom = "、".join(i["name"] for i in dom_items[:5]) or top5_all
        top5_ovs = "、".join(i["name"] for i in ovs_items[:5]) or top5_all

        faqs = [
            (
                f"2026 年最值得推荐的「{disp}」AI 工具有哪些？",
                f"根据国内外 9 大公开 AI 目录交叉共识评分，当前「{disp}」赛道综合推荐度最高的前 5 款工具依次为：{top5_all}。本站共收录该分类工具 {total_cnt} 款，其中被多个权威榜单共同推荐的高热度工具有 {len(hot_items)} 款。",
            ),
            (
                f"国内可免代理直连的「{disp}」AI 工具推荐哪几个？",
                f"针对国内网络环境，可直接访问且体验成熟的代表性「{disp}」工具包括：{top5_dom}（共收录 {len(dom_items)} 款国内主流工具）；若需对比海外前沿方案，也可参考 {top5_ovs} 等 {len(ovs_items)} 款海外工具。",
            ),
            (
                f"如何检索全部 {total_cnt} 款「{disp}」工具或提交新产品收录？",
                f"本专题页静态直出多源共识度最高的前 {min(total_cnt, 96)} 款代表产品；点击顶部「在全库实时筛选本分类」即可秒级检索全部 {total_cnt} 款工具，开发者亦可通过右上角「提交收录」免费自荐新品。",
            ),
        ]

        faq_dom = "\n".join(
            f"""        <details class="faq-item" name="cat-faq"{' open' if i == 0 else ''}>
          <summary>{esc(q)}</summary>
          <p class="faq-item__body">{esc(a)}</p>
        </details>"""
            for i, (q, a) in enumerate(faqs)
        )

        filter_link = f"../../?cat={urllib.parse.quote(cfg['cat'])}"
        main_html = f"""    <nav class="breadcrumb" aria-label="面包屑导航">
      <ol>
        <li><a href="../../">首页</a></li>
        <li><a href="../">分类专题</a></li>
        <li><a href="./" aria-current="page">{esc(disp)}</a></li>
      </ol>
    </nav>

    <section class="seo-hero">
      <span class="seo-hero__eyebrow">2026 每日自动同步 · 零广告精选榜单</span>
      <h1 class="seo-hero__title">AI {esc(disp)}工具推荐与对比大全（共 {total_cnt} 款）</h1>
      <p class="seo-hero__desc">{esc(cfg['short_desc'])}。基于国内外 9 大主流 AI 导航目录自动去重与多源共识加权排序，免注册一键直达各产品官网。</p>
      <div class="seo-hero__stats">
        <span class="stat-pill">收录总数 <strong>{total_cnt}</strong></span>
        <span class="stat-pill">国内直连 <strong>{len(dom_items)}</strong></span>
        <span class="stat-pill">海外主流 <strong>{len(ovs_items)}</strong></span>
        <span class="stat-pill">多源热门 <strong>{len(hot_items)}</strong></span>
        <a class="btn-primary" href="{filter_link}" style="padding:6px 14px;font-size:13px;">在全库实时筛选全部 {total_cnt} 款 →</a>
      </div>
    </section>

    <nav class="seo-cat-strip" aria-label="切换其他 AI 工具分类">
      {chr(10).join("      " + p for p in pills)}
    </nav>

    <section class="seo-section" aria-labelledby="compare-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="compare-heading">{esc(disp)} Top {min(15, total_cnt)} 多源共识对比速览表</h2>
        <p class="seo-section__sub">点击工具名查看平替详情，点击右侧域名直达官网</p>
      </div>
      <div tabindex="0" role="region" aria-labelledby="compare-caption" class="table-wrapper">
        <table class="compare-table" style="--label-2:'访问区域';--label-3:'推荐热度';--label-4:'核心功能定位';--label-5:'官网入口';">
          <caption id="compare-caption">AI {esc(disp)}主流工具核心对比清单（更新于 {today_str}）</caption>
          <thead>
            <tr>
              <th scope="col">工具名称</th>
              <th scope="col">访问区域</th>
              <th scope="col">推荐热度</th>
              <th scope="col">核心功能定位</th>
              <th scope="col">官网入口</th>
            </tr>
          </thead>
          <tbody>
{chr(10).join(rows_html)}
          </tbody>
        </table>
      </div>
    </section>

    <section class="seo-section" aria-labelledby="grid-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="grid-heading">精选 {esc(disp)} AI 工具名录（前 {min(96, total_cnt)} 款直达）</h2>
        <a class="cat-section__more" href="{filter_link}">打开交互式搜索查看全部 {total_cnt} 款 →</a>
      </div>
      <div class="cards-grid">
{cards_html}
      </div>
    </section>

    <section class="seo-section" aria-labelledby="faq-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="faq-heading">关于「{esc(disp)}」AI 工具的常见问题</h2>
      </div>
      <div class="faq-list">
{faq_dom}
      </div>
    </section>"""

        ld_obj = {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        {"@type": "ListItem", "position": 1, "name": "首页", "item": f"{base_url}/"},
                        {"@type": "ListItem", "position": 2, "name": "分类专题", "item": f"{base_url}/category/"},
                        {"@type": "ListItem", "position": 3, "name": disp, "item": canon},
                    ],
                },
                {
                    "@type": "CollectionPage",
                    "name": f"AI {disp}工具推荐与对比大全（{total_cnt} 款） · AI 导航聚合站",
                    "url": canon,
                    "description": cfg["short_desc"],
                    "inLanguage": "zh-CN",
                    "mainEntity": {
                        "@type": "ItemList",
                        "numberOfItems": total_cnt,
                        "itemListElement": [
                            {
                                "@type": "ListItem",
                                "position": idx,
                                "name": it["name"],
                                "url": f"{base_url}/tool/{slug_by_id[it['id']]}/" if it["id"] in slug_by_id else it["url"],
                                "description": (it.get("description") or "")[:160],
                            }
                            for idx, it in enumerate(items[:20], 1)
                        ],
                    },
                },
                {
                    "@type": "FAQPage",
                    "mainEntity": [
                        {
                            "@type": "Question",
                            "name": q,
                            "acceptedAnswer": {"@type": "Answer", "text": a},
                        }
                        for q, a in faqs
                    ],
                },
            ],
        }

        title = f"AI {disp}工具推荐排行榜（精选 {total_cnt} 款国内外直连对比） · AI 导航聚合站"
        desc = f"2026 最新 {total_cnt} 款 AI {disp}工具大全与对比表：{cfg['short_desc']}。涵盖 {top5_all} 等热门工具官网直达与国内平替推荐。"
        with open(os.path.join(page_dir, "index.html"), "w", encoding="utf-8") as f:
            f.write(
                page_shell_html(
                    rel_root="../../",
                    title=title,
                    description=desc,
                    canonical_url=canon,
                    active_nav="category",
                    json_ld_obj=ld_obj,
                    main_html=main_html,
                    keywords=cfg["keywords"],
                )
            )
        generated_urls.append((canon, today_str, "daily", "0.85"))

    return generated_urls


def build_daily_archives(web_dir, base_url, news_data, today_str, entities=None):
    daily_root = os.path.join(web_dir, "daily")
    os.makedirs(daily_root, exist_ok=True)
    history_path = os.path.join(daily_root, "history.json")

    history = {}
    if os.path.isfile(history_path):
        try:
            with open(history_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, dict):
                    history = loaded
        except Exception:
            history = {}

    grouped_live = defaultdict(list)
    for it in news_data.get("items", []):
        dt = (it.get("date") or "").strip()
        if re.match(r"^\d{4}-\d{2}-\d{2}$", dt) and it.get("title"):
            grouped_live[dt].append({
                "id": str(it.get("id") or ""),
                "title": (it.get("title") or "").strip(),
                "summary": (it.get("summary") or "").strip()[:280],
                "url": (it.get("source_url") or it.get("url") or "").strip(),
                "topic": (it.get("topic") or "前沿速递").strip(),
                "published_at": (it.get("published_at") or dt).strip(),
            })

    for dt, lst in grouped_live.items():
        existing = {x.get("title"): x for x in history.get(dt, []) if isinstance(x, dict)}
        for x in lst:
            existing[x["title"]] = x
        merged = list(existing.values())[:28]
        if len(merged) >= 3 or dt in history:
            history[dt] = merged

    sorted_dates = sorted(history.keys(), reverse=True)[:180]
    history = {d: history[d] for d in sorted_dates}

    with open(history_path, "w", encoding="utf-8") as f:
        json.dump(history, f, ensure_ascii=False, separators=(",", ":"))

    generated_urls = []

    for idx, dt in enumerate(sorted_dates):
        entries = history[dt]
        if not entries:
            continue
        day_dir = os.path.join(daily_root, dt)
        os.makedirs(day_dir, exist_ok=True)
        canon = f"{base_url}/daily/{dt}/"

        lead_title = entries[0]["title"][:32]
        page_title = f"{dt} AI 早报：{lead_title} 等 {len(entries)} 条大模型与行业快讯 · AI 导航聚合站"
        page_desc = f"{dt} 每日 AI 行业早报归档，汇总大模型发布、AI Agent 开发、多模态与算力动态共 {len(entries)} 条核心速递。"

        items_html = []
        for n_idx, item in enumerate(entries, 1):
            href = item.get("url") or f"{base_url}/news/"
            matched_ents = match_entities_in_text(
                f"{item.get('title') or ''} {item.get('summary') or ''}", entities or [], limit=3
            )
            ent_html = ""
            if matched_ents:
                links_str = " · ".join(
                    f'<a href="../../tool/{e["slug"]}/">{esc(e["name"])} 平替与官网</a>'
                    for e in matched_ents
                )
                ent_html = f'<span>关联工具：{links_str}</span>'
            items_html.append(f"""        <li class="brief-item">
          <div class="brief-item__head">
            <span class="brief-item__num">{n_idx:02d}</span>
            <span class="tag-chip">{esc(item.get('topic') or 'AI快讯')}</span>
            <span class="region-hint">{esc(item.get('published_at') or dt)}</span>
          </div>
          <h2 class="brief-item__title"><a href="{esc(href)}" target="_blank" rel="noopener noreferrer">{esc(item['title'])}</a></h2>
          <p class="brief-item__summary">{esc(item.get('summary') or '')}</p>
          <div class="brief-item__foot">
            <a href="{esc(href)}" target="_blank" rel="noopener noreferrer">阅读消息源原文 ↗</a>
            {ent_html}
          </div>
        </li>""")

        newer_dt = sorted_dates[idx - 1] if idx > 0 else None
        older_dt = sorted_dates[idx + 1] if idx + 1 < len(sorted_dates) else None
        pager_links = []
        if newer_dt:
            pager_links.append(f'<a class="btn-secondary" href="../{newer_dt}/">← 新一期（{newer_dt}）</a>')
        else:
            pager_links.append('<a class="btn-secondary" href="../../news/">查看实时滚动快讯 →</a>')
        if older_dt:
            pager_links.append(f'<a class="btn-secondary" href="../{older_dt}/">上一期（{older_dt}）→</a>')

        cat_pills = " ".join(
            f'<a class="cat-pill" href="../../category/{c["slug"]}/">{esc(c["display"])}工具</a>'
            for c in CATEGORY_CONFIG[:6]
        )

        main_html = f"""    <nav class="breadcrumb" aria-label="面包屑导航">
      <ol>
        <li><a href="../../">首页</a></li>
        <li><a href="../">每日AI早报</a></li>
        <li><a href="./" aria-current="page">{dt} 早报</a></li>
      </ol>
    </nav>

    <section class="seo-hero">
      <span class="seo-hero__eyebrow">每日 AI 早报归档 · {dt}</span>
      <h1 class="seo-hero__title">{dt} AI 行业早报（精选 {len(entries)} 条前沿动态）</h1>
      <p class="seo-hero__desc">自动聚合当日国内外大模型权重开源、智能体工程、多模态应用与芯片算力核心动态，3 分钟速览全天 AI 关键进展。</p>
      <div class="seo-hero__stats">
        <span class="stat-pill">本期收录 <strong>{len(entries)} 条</strong></span>
        <a class="btn-secondary" href="../../news/" style="padding:6px 14px;font-size:13px;">前往实时资讯流 →</a>
      </div>
    </section>

    <ol class="brief-list">
{chr(10).join(items_html)}
    </ol>

    <nav class="daily-pager" aria-label="早报上下期翻页">
      {"".join(pager_links)}
    </nav>

    <section class="seo-section" aria-labelledby="rel-cats">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="rel-cats">顺手探索热门 AI 工具分类</h2>
      </div>
      <div class="seo-cat-strip">
        {cat_pills}
      </div>
    </section>"""

        ld_obj = {
            "@context": "https://schema.org",
            "@graph": [
                {
                    "@type": "BreadcrumbList",
                    "itemListElement": [
                        {"@type": "ListItem", "position": 1, "name": "首页", "item": f"{base_url}/"},
                        {"@type": "ListItem", "position": 2, "name": "每日AI早报", "item": f"{base_url}/daily/"},
                        {"@type": "ListItem", "position": 3, "name": f"{dt} AI 早报", "item": canon},
                    ],
                },
                {
                    "@type": "CollectionPage",
                    "name": page_title,
                    "url": canon,
                    "datePublished": dt,
                    "inLanguage": "zh-CN",
                    "mainEntity": {
                        "@type": "ItemList",
                        "numberOfItems": len(entries),
                        "itemListElement": [
                            {
                                "@type": "ListItem",
                                "position": i_pos,
                                "name": ent["title"],
                                "url": ent.get("url") or canon,
                            }
                            for i_pos, ent in enumerate(entries[:20], 1)
                        ],
                    },
                },
            ],
        }

        with open(os.path.join(day_dir, "index.html"), "w", encoding="utf-8") as f:
            f.write(
                page_shell_html(
                    rel_root="../../",
                    title=page_title,
                    description=page_desc,
                    canonical_url=canon,
                    active_nav="daily",
                    json_ld_obj=ld_obj,
                    main_html=main_html,
                    keywords=f"AI早报,{dt} AI新闻,大模型动态,人工智能快讯",
                )
            )
        lastmod = today_str if idx == 0 else dt
        generated_urls.append((canon, lastmod, "daily" if idx == 0 else "monthly", "0.8"))

    archive_cards = []
    for dt in sorted_dates:
        entries = history[dt]
        if not entries:
            continue
        headline = entries[0]["title"]
        second = entries[1]["title"] if len(entries) > 1 else ""
        archive_cards.append(f"""      <a class="daily-card" href="./{dt}/">
        <div>
          <div class="daily-card__date">{dt} · 共 {len(entries)} 条快讯</div>
          <h2 class="daily-card__title" style="margin-top:6px;">{esc(headline)}</h2>
          {f'<p class="tool-card__desc" style="margin-top:6px;">以及：{esc(second)}</p>' if second else ''}
        </div>
        <div class="daily-card__meta">阅读本期完整早报 →</div>
      </a>""")

    daily_hub_url = f"{base_url}/daily/"
    daily_hub_main = f"""    <nav class="breadcrumb" aria-label="面包屑导航">
      <ol>
        <li><a href="../">首页</a></li>
        <li><a href="./" aria-current="page">每日AI早报</a></li>
      </ol>
    </nav>

    <section class="seo-hero">
      <span class="seo-hero__eyebrow">自动化历史归档 · 支持 RSS 订阅</span>
      <h1 class="seo-hero__title">每日 AI 行业早报归档（共 {len(sorted_dates)} 期）</h1>
      <p class="seo-hero__desc">按日期沉淀每日大模型开源、AI Agent 架构、多模态生成与算力产业重点快讯，方便回溯近期技术脉络。</p>
      <div class="seo-hero__stats">
        <a class="btn-primary" href="../news/" style="padding:6px 14px;font-size:13px;">查看 24 小时实时快讯流 →</a>
        <a class="btn-secondary" href="../feed.xml" style="padding:6px 14px;font-size:13px;">RSS 订阅源</a>
      </div>
    </section>

    <section class="daily-archive-grid" aria-label="历史早报列表">
{chr(10).join(archive_cards)}
    </section>"""

    daily_hub_ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "首页", "item": f"{base_url}/"},
                    {"@type": "ListItem", "position": 2, "name": "每日AI早报", "item": daily_hub_url},
                ],
            },
            {
                "@type": "CollectionPage",
                "name": "每日 AI 行业早报归档 · AI 导航聚合站",
                "url": daily_hub_url,
                "inLanguage": "zh-CN",
            },
        ],
    }

    with open(os.path.join(daily_root, "index.html"), "w", encoding="utf-8") as f:
        f.write(
            page_shell_html(
                rel_root="../",
                title="每日 AI 行业早报历史归档 · 大模型与智能体前沿速递 · AI 导航聚合站",
                description="按日归档国内外大模型发布、AI Agent、多模态与算力动态早报，支持全文检索与 RSS 订阅。",
                canonical_url=daily_hub_url,
                active_nav="daily",
                json_ld_obj=daily_hub_ld,
                main_html=daily_hub_main,
                keywords="AI早报,AI日报,人工智能每日新闻,大模型周报归档",
            )
        )
    generated_urls.insert(0, (daily_hub_url, today_str, "daily", "0.9"))
    return generated_urls, history, sorted_dates


def update_homepage_prerender(web_dir, base_url, by_cat, sorted_dates, total_items, dom_total, ovs_total, slug_by_id):
    index_path = os.path.join(web_dir, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        raw = f.read()

    sections_html = []
    for cfg in CATEGORY_CONFIG:
        items = sort_tools(by_cat.get(cfg["cat"], []))
        if not items:
            continue
        disp = cfg["display"]
        sec_title = "影音娱乐精选" if cfg["cat"] == "划水摸鱼" else disp
        cat_id = "cat-" + urllib.parse.quote(cfg["cat"]).replace("%", "_")
        cards = "\n".join(render_static_card(it, disp, rel_root="./", slug_by_id=slug_by_id) for it in items[:6])
        sections_html.append(f"""          <section class="cat-section" id="{cat_id}" tabindex="-1">
            <div class="cat-section__head">
              <div class="cat-section__title-wrap">
                <h2 class="cat-section__title">{esc(sec_title)}</h2>
                <span class="cat-section__count">{len(items)} 款</span>
              </div>
              <a class="cat-section__more" href="./category/{cfg['slug']}/">查看全部 {len(items)} 款 →</a>
            </div>
            <div class="cards-grid">
{cards}
            </div>
          </section>""")

    prerender_block = (
        '<div id="catalogContainer">\n'
        "          <!-- SEO_PRERENDER_START -->\n"
        + "\n".join(sections_html)
        + "\n          <!-- SEO_PRERENDER_END -->\n        </div>"
    )

    raw = re.sub(
        r'<div id="catalogContainer">[\s\S]*?</div>\s*(?=<div class="empty-state")',
        prerender_block + "\n\n        ",
        raw,
        count=1,
    )

    topic_cards = "\n".join(
        f'          <a class="topic-link-card" href="./category/{c["slug"]}/"><span>AI {esc(c["display"])}专题</span><span>{len(by_cat.get(c["cat"], []))} 款 →</span></a>'
        for c in CATEGORY_CONFIG
    )
    latest_daily_links = " · ".join(
        f'<a href="./daily/{dt}/">{dt} AI早报</a>' for dt in sorted_dates[:4]
    )

    home_faqs = [
        (
            "AI 导航聚合站收录了哪些 AI 工具？是否收费或有广告？",
            f"本站每日自动聚合国内外 9 大主流公开目录并去重校验，当前共收录 {total_items:,} 款 AI 工具（含国内可直连工具 {dom_total:,} 款、海外主流工具 {ovs_total:,} 款，并为 {len(slug_by_id)} 款头部工具提供独立平替对比页），全站纯静态零广告、免注册登录。",
        ),
        (
            "如何快速查找国内免翻墙可直连的免费 AI 工具或在浏览器地址栏直接搜索？",
            "在首页切换「国内主流」标签或按「/」键即可秒级筛选；Chrome / Edge 用户还可在地址栏输入本站域名后按 Tab 键（OpenSearch）直接搜索全库，或点击顶部安装按钮将本站添加至电脑 Dock 栏 / 手机桌面。",
        ),
        (
            "个人收藏的 AI 工具如何跨设备同步或分享给同事？",
            "切换到「我的收藏」视图后，可使用「分享收藏单」一键生成免登录专属分享链接，或点击「导出书签」下载标准浏览器书签 HTML 文件直接导入 Chrome / Safari / Edge。",
        ),
    ]

    faq_html = "\n".join(
        f"""          <details class="faq-item" name="home-faq"{' open' if idx == 0 else ''}>
            <summary>{esc(q)}</summary>
            <p class="faq-item__body">{esc(a)}</p>
          </details>"""
        for idx, (q, a) in enumerate(home_faqs)
    )

    scene_cards = "\n".join(
        f'          <a class="topic-link-card" href="./scene/{sc["slug"]}/"><span>{esc(sc["short_title"])}</span><span>场景包 →</span></a>'
        for sc in SCENE_CONFIGS
    )
    hub_block = f"""      <!-- SEO_GEO_HUB_START -->
      <section class="home-seo-hub" aria-labelledby="hubTopicHeading">
        <div class="seo-section__head">
          <h2 class="seo-section__title" id="hubSceneHeading">12 大高频 AI 工作流场景包 · <a href="./vs/" style="color:var(--accent);font-size:14px;">热门工具两两 VS 横评库 →</a></h2>
          <p class="seo-section__sub">按具体工作任务精选三步黄金搭配与免翻墙平替</p>
        </div>
        <div class="topic-links-grid">
{scene_cards}
        </div>

        <div class="seo-section__head">
          <h2 class="seo-section__title" id="hubTopicHeading">10 大 AI 垂直领域专题排行榜 · <a href="./tool/" style="color:var(--accent);font-size:14px;">{len(slug_by_id)} 款头部工具平替库 →</a></h2>
          <p class="seo-section__sub">近期早报归档：{latest_daily_links} · <a href="./daily/" style="color:var(--accent);">全部归档 →</a></p>
        </div>
        <div class="topic-links-grid">
{topic_cards}
        </div>

        <div class="seo-section__head">
          <h2 class="seo-section__title" id="hubFaqHeading">常见问题解答（FAQ）</h2>
        </div>
        <div class="faq-list">
{faq_html}
        </div>
      </section>
      <!-- SEO_GEO_HUB_END -->"""

    if "<!-- SEO_GEO_HUB_START -->" in raw:
        raw = re.sub(
            r"<!-- SEO_GEO_HUB_START -->[\s\S]*?<!-- SEO_GEO_HUB_END -->",
            hub_block.strip(),
            raw,
            count=1,
        )
    else:
        raw = raw.replace("    </main>", f"{hub_block}\n    </main>", 1)

    home_ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebSite",
                "name": "AI 导航聚合站",
                "url": f"{base_url}/",
                "description": f"零广告、免登录、国内直连秒开的 AI 工具、每日早报与实时热榜聚合站（收录 {total_items} 款工具）。",
                "inLanguage": "zh-CN",
                "potentialAction": {
                    "@type": "SearchAction",
                    "target": f"{base_url}/?q={{search_term_string}}",
                    "query-input": "required name=search_term_string",
                },
            },
            {
                "@type": "ItemList",
                "name": "AI 工具 10 大核心分类专题",
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": idx,
                        "name": f"AI {c['display']}工具大全",
                        "url": f"{base_url}/category/{c['slug']}/",
                    }
                    for idx, c in enumerate(CATEGORY_CONFIG, 1)
                ],
            },
            {
                "@type": "FAQPage",
                "mainEntity": [
                    {
                        "@type": "Question",
                        "name": q,
                        "acceptedAnswer": {"@type": "Answer", "text": a},
                    }
                    for q, a in home_faqs
                ],
            },
        ],
    }
    ld_script = f'<script type="application/ld+json">{json.dumps(home_ld, ensure_ascii=False, separators=(",", ":"))}</script>'
    raw = re.sub(
        r'<script type="application/ld\+json">[\s\S]*?</script>',
        ld_script,
        raw,
        count=1,
    )

    with open(index_path, "w", encoding="utf-8") as f:
        f.write(raw)


def write_llms_files(web_dir, base_url, by_cat, news_data, sorted_dates, total_items, today_str, slug_by_id):
    lines = [
        "# AI 导航聚合站 (AI Nav Hub)",
        "",
        f"> 零广告、免登录、国内直连秒开的国内外主流 AI 工具、每日 AI 行业早报与 14 平台实时科技热榜聚合站。每日自动去重更新，当前共收录 {total_items:,} 款 AI 工具，并为 {len(slug_by_id)} 款多源高共识工具提供独立详情与国内平替对比页（更新日期：{today_str}）。",
        "",
        "## 核心频道与智能体开放接口 (GEO / Agent API)",
        "",
        f"- [首页 · 全库 {total_items:,} 款 AI 工具检索]({base_url}/): 支持多词加权秒搜、计费模式筛选与 10 大分类浏览",
        f"- [实时工具检索 JSON API (免鉴权 CORS)]({base_url}/api/search?q=AI搜索&region=domestic&limit=10): 支持参数 `q`、`category`、`region=domestic|overseas`、`pricing=完全免费|开源免费`、`limit`",
        f"- [OpenAPI 3.1.0 工具规范描述]({base_url}/openapi.json): 供外部 AI Agent / GPT Actions / Dify / Coze 直接挂载调用",
        f"- [12 大 AI 场景工作流专题]({base_url}/scene/): 覆盖完全免费、开源本地部署、国内免翻墙、写论文、独立开发、短视频、PPT 与电商抠图",
        f"- [热门 AI 工具两两 VS 对比库]({base_url}/vs/): 60+ 组国内外主流大模型与工具同屏横评选型",
        f"- [分类专题大全]({base_url}/category/): 10 大 AI 垂直赛道多源共识对比排行榜",
        f"- [热门工具详情与平替库]({base_url}/tool/): {len(slug_by_id)} 款高共识 AI 工具官网直达与国内替代推荐",
        f"- [实时 AI 资讯速递]({base_url}/news/): 每 2 小时更新大模型、Agent、多模态与算力动态",
        f"- [每日 AI 早报历史归档]({base_url}/daily/): 按日沉淀 AI 行业核心进展摘要",
        f"- [全网实时热榜]({base_url}/moyu/): 聚合 GitHub、掘金、少数派、36氪、知乎、B站等 14 平台热榜",
        f"- [完整大模型语料索引 (llms-full.txt)]({base_url}/llms-full.txt): 包含各赛道 Top 25 代表工具详情与最新快讯摘要",
        "",
        "## 10 大垂直分类专题页",
        "",
    ]
    for cfg in CATEGORY_CONFIG:
        cnt = len(by_cat.get(cfg["cat"], []))
        lines.append(
            f"- [AI {cfg['display']}工具推荐（{cnt} 款）]({base_url}/category/{cfg['slug']}/): {cfg['short_desc']}"
        )

    lines.extend(["", "## 各赛道多源共识代表工具速查（Top 8 / 分类）", ""])
    for cfg in CATEGORY_CONFIG:
        items = sort_tools(by_cat.get(cfg["cat"], []))[:8]
        if not items:
            continue
        lines.append(f"### {cfg['display']} ({base_url}/category/{cfg['slug']}/)")
        for it in items:
            desc = (it.get("description") or "").strip()[:85]
            tslug = slug_by_id.get(it["id"])
            detail_ref = f" | [平替对比]({base_url}/tool/{tslug}/)" if tslug else ""
            lines.append(f"- [{it['name']}]({it['url']}) ({region_label(it)}{detail_ref}): {desc}")
        lines.append("")

    if sorted_dates:
        lines.extend(["## 近期每日 AI 早报归档", ""])
        for dt in sorted_dates[:7]:
            lines.append(f"- [{dt} AI 行业早报]({base_url}/daily/{dt}/)")
        lines.append("")

    with open(os.path.join(web_dir, "llms.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(lines).strip() + "\n")

    full_lines = [
        "# AI 导航聚合站 — 完整精选工具与前沿快讯索引 (llms-full.txt)",
        "",
        f"> 站点地址：{base_url}/ | 收录总量：{total_items:,} 款 | 独立工具平替页：{len(slug_by_id)} 款 | 最近同步：{today_str}",
        "",
    ]
    for cfg in CATEGORY_CONFIG:
        items = sort_tools(by_cat.get(cfg["cat"], []))[:25]
        full_lines.append(f"## {cfg['display']}（共 {len(by_cat.get(cfg['cat'], []))} 款，专题页：{base_url}/category/{cfg['slug']}/）")
        full_lines.append("")
        for idx, it in enumerate(items, 1):
            desc = (it.get("description") or "").strip()[:160]
            tslug = slug_by_id.get(it["id"])
            detail_str = f" | 详情页:{base_url}/tool/{tslug}/" if tslug else ""
            full_lines.append(
                f"{idx}. **{it['name']}** — {it['url']} [{region_label(it)} | 共识源:{len(it.get('sources') or [])}{detail_str}]：{desc}"
            )
        full_lines.append("")

    news_items = (news_data.get("items") or [])[:30]
    if news_items:
        full_lines.append(f"## 最新 AI 行业资讯摘要（实时流：{base_url}/news/）")
        full_lines.append("")
        for idx, ni in enumerate(news_items, 1):
            t = (ni.get("title") or "").strip()
            s = (ni.get("summary") or "").strip()[:180]
            u = (ni.get("source_url") or ni.get("url") or f"{base_url}/news/").strip()
            dt = (ni.get("published_at") or ni.get("date") or today_str).strip()
            full_lines.append(f"{idx}. [{dt}] **{t}** ({u})：{s}")
        full_lines.append("")

    with open(os.path.join(web_dir, "llms-full.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(full_lines).strip() + "\n")


def write_rss_feed(web_dir, base_url, news_data):
    now_rfc = email.utils.format_datetime(datetime.datetime.now(CST))
    items_xml = []
    for ni in (news_data.get("items") or [])[:35]:
        title = esc(ni.get("title") or "AI 快讯")
        link = esc(ni.get("source_url") or ni.get("url") or f"{base_url}/news/")
        desc = esc(ni.get("summary") or "")
        guid = esc(str(ni.get("id") or link))
        cat = esc(ni.get("topic") or "AI资讯")
        items_xml.append(f"""    <item>
      <title>{title}</title>
      <link>{link}</link>
      <guid isPermaLink="false">{guid}</guid>
      <category>{cat}</category>
      <description>{desc}</description>
    </item>""")

    rss = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI 导航聚合站 · 每日 AI 资讯与早报</title>
    <link>{base_url}/news/</link>
    <atom:link href="{base_url}/feed.xml" rel="self" type="application/rss+xml"/>
    <description>每日自动同步国内外主流 AI 工具、大模型发布与智能体前沿快讯。</description>
    <language>zh-cn</language>
    <lastBuildDate>{now_rfc}</lastBuildDate>
{chr(10).join(items_xml)}
  </channel>
</rss>
"""
    with open(os.path.join(web_dir, "feed.xml"), "w", encoding="utf-8") as f:
        f.write(rss)


def write_robots_and_sitemap(web_dir, base_url, extra_urls, today_str):
    robots = f"""User-agent: *
Allow: /
Disallow: /admin

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Bytespider
Allow: /

Sitemap: {base_url}/sitemap.xml
"""
    with open(os.path.join(web_dir, "robots.txt"), "w", encoding="utf-8") as f:
        f.write(robots)

    core_urls = [
        (f"{base_url}/", today_str, "daily", "1.0"),
        (f"{base_url}/news/", today_str, "hourly", "0.9"),
        (f"{base_url}/moyu/", today_str, "hourly", "0.9"),
    ]
    all_urls = core_urls + extra_urls

    url_blocks = []
    seen = set()
    unique_locs = []
    for loc, lastmod, freq, prio in all_urls:
        if loc in seen:
            continue
        seen.add(loc)
        unique_locs.append(loc)
        url_blocks.append(f"""  <url>
    <loc>{esc(loc)}</loc>
    <lastmod>{esc(lastmod)}</lastmod>
    <changefreq>{esc(freq)}</changefreq>
    <priority>{esc(prio)}</priority>
  </url>""")

    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(url_blocks)
        + "\n</urlset>\n"
    )
    with open(os.path.join(web_dir, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write(sitemap)

    return unique_locs


def push_indexnow(base_url, key, urls):
    host = urllib.parse.urlsplit(base_url).netloc
    payload = {
        "host": host,
        "key": key,
        "keyLocation": f"{base_url}/{key}.txt",
        "urlList": urls[:10000],
    }
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        "https://api.indexnow.org/indexnow",
        data=body,
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "User-Agent": "AI-Nav-Hub-SEO-Builder/2.0",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            print(f"[IndexNow] Pushed {len(urls)} URLs -> HTTP {resp.status}")
            return True
    except urllib.error.HTTPError as e:
        print(f"[IndexNow] HTTP {e.code}: {e.read().decode('utf-8', 'ignore')[:200]}")
        return False
    except Exception as e:
        print(f"[IndexNow] Push warning: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Build static SEO & GEO Phase 2 assets for AI Nav Hub")
    parser.add_argument("--web-dir", default="web", help="Path to web directory")
    parser.add_argument("--base-url", default="https://dlzbkj-ai.pages.dev", help="Canonical base URL")
    parser.add_argument("--indexnow-key", default="d84f92c1e6a34b7095c21e8f4a6b3d90", help="IndexNow key")
    parser.add_argument("--push-indexnow", action="store_true", help="Push all sitemap URLs to IndexNow API")
    args = parser.parse_args()

    web_dir = os.path.abspath(args.web_dir)
    base_url = args.base_url.rstrip("/")
    today_str = datetime.datetime.now(CST).strftime("%Y-%m-%d")

    cat_path = os.path.join(web_dir, "data", "catalog.json")
    news_path = os.path.join(web_dir, "data", "news.json")

    with open(cat_path, "r", encoding="utf-8") as f:
        catalog = json.load(f)
    news_data = {"items": []}
    if os.path.isfile(news_path):
        with open(news_path, "r", encoding="utf-8") as f:
            news_data = json.load(f)

    items = catalog.get("items") or []
    by_cat = defaultdict(list)
    for it in items:
        by_cat[it.get("category") or "其他工具"].append(it)

    dom_total = sum(1 for i in items if is_domestic(i))
    ovs_total = sum(1 for i in items if is_overseas(i))

    if args.indexnow_key:
        with open(os.path.join(web_dir, f"{args.indexnow_key}.txt"), "w", encoding="utf-8") as f:
            f.write(args.indexnow_key)

    hotlist_path = os.path.join(web_dir, "data", "hotlist.json")
    hotlist_data = {"platforms": []}
    if os.path.isfile(hotlist_path):
        with open(hotlist_path, "r", encoding="utf-8") as f:
            hotlist_data = json.load(f)

    hot_cnt, hot_bytes = build_hot_catalog_shard(web_dir, catalog, by_cat)
    tool_urls, slug_by_id, flagship_items = build_flagship_tool_pages(web_dir, base_url, by_cat, today_str)
    entities = write_tool_slugs_index(web_dir, flagship_items, slug_by_id)
    scene_urls = build_scene_pages(
        web_dir,
        base_url,
        items,
        slug_by_id,
        today_str,
        sort_tools,
        region_label,
        is_domestic,
        page_shell_html,
        render_static_card,
    )
    vs_urls, _, _ = build_vs_pages(
        web_dir,
        base_url,
        by_cat,
        CATEGORY_CONFIG,
        slug_by_id,
        today_str,
        sort_tools,
        region_label,
        is_domestic,
        page_shell_html,
        render_static_card,
    )
    cat_urls = build_category_pages(web_dir, base_url, by_cat, today_str, slug_by_id)
    daily_urls, _, sorted_dates = build_daily_archives(web_dir, base_url, news_data, today_str, entities=entities)
    prerender_news_and_moyu(web_dir, base_url, news_data, hotlist_data, entities, today_str)
    write_openapi_spec(web_dir, base_url, len(items))
    update_homepage_prerender(web_dir, base_url, by_cat, sorted_dates, len(items), dom_total, ovs_total, slug_by_id)
    write_llms_files(web_dir, base_url, by_cat, news_data, sorted_dates, len(items), today_str, slug_by_id)
    write_rss_feed(web_dir, base_url, news_data)
    all_urls = write_robots_and_sitemap(
        web_dir, base_url, scene_urls + vs_urls + cat_urls + daily_urls + tool_urls, today_str
    )

    print(
        f"[SEO+GEO v3] Hot shard={hot_cnt} items ({hot_bytes // 1024} KB), "
        f"{len(scene_urls)} scene pages, {len(vs_urls)} VS pages, "
        f"{len(cat_urls)} category pages, {len(tool_urls)} tool pages, "
        f"{len(daily_urls)} daily briefs -> {len(all_urls)} total sitemap URLs."
    )

    if args.push_indexnow and args.indexnow_key:
        push_indexnow(base_url, args.indexnow_key, all_urls)


if __name__ == "__main__":
    main()
