#!/usr/bin/env python3
"""
Multi-source AI navigation aggregator (zero third-party dependencies).
Performs full paginated/category crawls across domestic & overseas AI tool directories,
strips lazy-load placeholders, normalizes URLs, applies two-stage cross-source
deduplication & consensus scoring, and writes catalog.json atomically.
"""
import argparse
import base64
import concurrent.futures
import datetime
import hashlib
import html
import json
import os
import re
import shutil
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections import Counter

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

CATEGORIES = [
    "对话写作",
    "编程开发",
    "图像设计",
    "视频音频",
    "办公效率",
    "Agent与自动化",
    "学习知识库",
    "新品速递",
    "其他工具",
]

TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "ref", "from", "spm", "source", "via", "share", "invite", "code",
    "sourcepage", "ch", "invitecode",
}

SKIP_DOMAINS = {
    "ai-bot.cn", "www.ai-bot.cn",
    "aibase.com", "www.aibase.com", "app.aibase.com", "top.aibase.com",
    "news.aibase.com", "mcp.aibase.com", "model.aibase.com", "geo.aibase.com",
    "ai-zhiku.com", "www.ai-zhiku.com",
    "waytoagi.com", "www.waytoagi.com", "assets.waytoagi.com",
    "beian.miit.gov.cn", "www.beian.gov.cn", "beian.mps.gov.cn",
    "googletagmanager.com", "www.googletagmanager.com",
    "pagead2.googlesyndication.com", "googlesyndication.com",
    "schema.org", "www.w3.org", "w3.org",
    "facebook.com", "www.facebook.com", "x.com", "twitter.com",
    "instagram.com", "www.instagram.com", "linkedin.com", "www.linkedin.com",
    "youtube.com", "www.youtube.com", "tiktok.com", "www.tiktok.com",
    "discord.gg", "discord.com", "t.me",
    "res.wx.qq.com", "mp.weixin.qq.com",
    "space.bilibili.com", "xiaohongshu.com", "www.xiaohongshu.com",
}

AGGREGATOR_HOSTS = {
    "ai.codefather.cn",
    "futurepedia.io",
    "futuretools.io",
    "producthunt.com",
}


class RateLimitError(RuntimeError):
    """Raised when an upstream source explicitly rate-limits requests (HTTP 429)."""


def fetch_text(url, timeout=18, retries=2, max_bytes=10 * 1024 * 1024):
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    last_err = None
    for attempt in range(retries + 1):
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                charset = r.headers.get_content_charset() or "utf-8"
                raw = r.read(max_bytes)
                return raw.decode(charset, "ignore")
        except urllib.error.HTTPError as e:
            last_err = f"HTTP {e.code}"
            if e.code in (403, 404):
                raise RuntimeError(last_err) from e
            if e.code == 429:
                if attempt < retries:
                    time.sleep(3.0 * (attempt + 1))
                    continue
                raise RateLimitError(last_err) from e
        except Exception as e:
            last_err = str(e)
        if attempt < retries:
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(last_err or "fetch failed")


def strip_tags(raw):
    txt = re.sub(r"<[^>]+>", " ", raw or "")
    txt = html.unescape(txt)
    return re.sub(r"\s+", " ", txt).strip()


def next_f_join(raw_html):
    parts = []
    for c in re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', raw_html, re.S):
        try:
            parts.append(json.loads(c))
        except Exception:
            pass
    return "".join(parts)


def normalize_url(raw_url):
    u = html.unescape((raw_url or "").strip())
    if not u or not u.startswith(("http://", "https://")):
        return ""
    try:
        p = urllib.parse.urlsplit(u)
    except Exception:
        return ""
    host = p.netloc.lower()
    if not host or "." not in host:
        return ""
    query_pairs = [
        (k, v)
        for k, v in urllib.parse.parse_qsl(p.query, keep_blank_values=False)
        if k.lower() not in TRACKING_PARAMS
    ]
    path = p.path.rstrip("/")
    if path == "/":
        path = ""
    new_query = urllib.parse.urlencode(query_pairs)
    return urllib.parse.urlunsplit((p.scheme.lower(), host, path, new_query, ""))


def safe_icon_url(raw_url):
    u = normalize_url(raw_url)
    if not u.startswith(("http://", "https://")):
        return ""
    low = u.lower()
    if "onenav/images/favicon.png" in low or "placeholder" in low or "default-avatar" in low:
        return ""
    return u


def extract_best_img(fragment):
    for attr in ("data-src", "data-original", "data-lazy-src", "src"):
        m = re.search(rf'{attr}="(https?://[^"]+)"', fragment, re.I)
        if m:
            u = safe_icon_url(m.group(1))
            if u:
                return u
    return ""


def dedupe_key(norm_url):
    p = urllib.parse.urlsplit(norm_url)
    host = re.sub(r"^www\.", "", p.netloc.lower())
    path = p.path.rstrip("/").lower()
    path = re.sub(r"^/(?:zh-hans-cn|zh-hans|zh-cn|en-us|zh|en|cn)(?=/|$)", "", path)
    if path in ("", "/index.html", "/home"):
        return host
    path = re.sub(r"/index\.html$", "", path)
    return f"{host}{path}"


def domain_of(norm_url):
    host = urllib.parse.urlsplit(norm_url).netloc.lower()
    return re.sub(r"^www\.", "", host)


def has_word(text, words):
    for w in words:
        if any("\u4e00" <= c <= "\u9fff" for c in w):
            if w in text:
                return True
        else:
            if re.search(rf"\b{re.escape(w)}\b", text):
                return True
    return False


def _match_category(text):
    if has_word(text, (
        "agent", "agents", "智能体", "工作流", "workflow", "workflows",
        "automation", "automations", "自动化", "mcp", "openclaw", "dify", "coze", "扣子",
        "no code", "nocode", "personal assistant", "aggregators",
    )):
        return "Agent与自动化"
    if has_word(text, (
        "编程", "代码", "开发", "框架", "模型", "code", "coding", "code assistant",
        "generative code", "ide", "github", "cursor", "copilot", "sql", "sql assistant",
        "api", "前端", "后端", "website builders", "ai coding", "ai frameworks", "ai models",
        "developer", "programming",
    )):
        return "编程开发"
    if has_word(text, (
        "视频", "音频", "配音", "音乐", "剪辑", "数字人", "播客", "语音", "字幕",
        "video", "videos", "audio", "music", "music generator", "voice", "tts",
        "speech", "podcast", "podcasting", "transcriber", "voice modulation",
        "text to video", "text to speech", "speech to text", "video editing",
        "video enhancer", "video generators", "audio editing", "audio generators",
        "ai video", "ai audio", "sora", "runway",
    )):
        return "视频音频"
    if has_word(text, (
        "图像", "绘画", "画图", "设计", "修图", "海报", "抠图", "放大", "插画", "头像", "logo", "3d",
        "image", "images", "art", "generative art", "draw", "design", "design generators",
        "avatar", "avatar generator", "cartoon", "cartoon generators", "logo generator",
        "portrait", "portrait generators", "image editing", "image generators",
        "image improvement", "text to image", "ai image", "ai design",
        "ai illustration", "ai background", "midjourney", "flux", "figma",
    )):
        return "图像设计"
    if has_word(text, (
        "办公", "ppt", "表格", "excel", "文档", "会议", "邮件", "简历", "思维导图",
        "效率", "生产力", "商业", "营销", "金融", "财务",
        "productivity", "presentations", "slides", "spreadsheet", "spreadsheet assistant",
        "project management", "office", "document", "meeting", "mind mapping",
        "business", "marketing", "finance", "ai office", "ai ppt", "notion",
    )):
        return "办公效率"
    if has_word(text, (
        "对话", "聊天", "写作", "文案", "翻译", "总结", "搜索", "内容检测",
        "chat", "chatbot", "chatbots", "writing", "writing generators", "copywriting",
        "copywriting assistant", "paraphrasing", "translators", "translation",
        "storyteller", "text generators", "search", "ai search", "ai chat", "ai chatbots",
        "ai writing", "ai detection", "ai content detection", "llm", "gpt",
        "deepseek", "claude", "gemini", "kimi",
    )):
        return "对话写作"
    if has_word(text, (
        "教程", "学习", "知识库", "prompt", "prompts", "prompt generators",
        "prompt guides", "提示词", "百科", "论文", "课程", "学术", "研究",
        "research", "research assistant", "study", "paper", "education",
        "tutorial", "ai tutorial", "for fun", "self improvement", "gaming", "health",
    )):
        return "学习知识库"
    if has_word(text, ("新品", "producthunt", "新品速递", "newly added")):
        return "新品速递"
    return None


def map_category(raw_cat, name="", desc=""):
    clean_cat = re.sub(r"[-_/]+", " ", (raw_cat or "")).lower().strip()
    if clean_cat:
        matched = _match_category(clean_cat)
        if matched:
            return matched
    fallback_text = f"{name} {desc}".lower()
    return _match_category(fallback_text) or "其他工具"


# ---------- Source parsers ----------

def _parse_aibot_cards(raw_html, seen, start_rank, default_cat=""):
    tokens = re.split(r"(<h4[^>]*>.*?</h4>)", raw_html, flags=re.S)
    current_cat = default_cat
    items = []
    rank = start_rank
    for part in tokens:
        if part.startswith("<h4"):
            heading = strip_tags(part)
            if heading:
                current_cat = heading
            continue
        for blk in re.split(r'<div class="url-card\b', part)[1:]:
            blk = blk[:3500]
            url_m = re.search(r'data-url="(https?://[^"]+)"', blk)
            name_m = re.search(r"<strong>([^<]+)</strong>", blk)
            if not url_m or not name_m:
                continue
            url = normalize_url(url_m.group(1))
            name = strip_tags(name_m.group(1))
            desc_m = re.search(r'overflowClip_1[^>]*>([^<]+)<', blk)
            desc = strip_tags(desc_m.group(1)) if desc_m else ""
            icon = extract_best_img(blk)
            if not url or not name or domain_of(url) in SKIP_DOMAINS or url in seen:
                continue
            seen.add(url)
            rank += 1
            items.append({
                "name": name,
                "url": url,
                "description": desc,
                "icon": icon,
                "raw_cat": current_cat,
                "source": "ai-bot",
                "region": "domestic",
                "source_rank": rank,
            })
    return items, rank


def parse_aibot():
    home_html = fetch_text("https://ai-bot.cn/")
    seen = set()
    items, rank = _parse_aibot_cards(home_html, seen, 0)

    fav_urls = []
    seen_fav = set()
    for m in re.finditer(r'https?://ai-bot\.cn/favorites/([a-z0-9-]+)/?', home_html):
        slug = m.group(1)
        u = f"https://ai-bot.cn/favorites/{slug}/"
        if u not in seen_fav:
            seen_fav.add(u)
            fav_urls.append((slug, u))

    def _fetch_fav(entry):
        slug, u = entry
        time.sleep(0.15)
        try:
            html_body = fetch_text(u, timeout=15, retries=1)
        except Exception:
            return slug, ""
        return slug, html_body

    if fav_urls:
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
            for slug, html_body in ex.map(_fetch_fav, fav_urls):
                if not html_body:
                    continue
                h1_m = re.search(r"<h1[^>]*>(.*?)</h1>", html_body, re.S)
                title_m = re.search(r"<title>(.*?)</title>", html_body, re.S)
                cat_label = strip_tags(h1_m.group(1)) if h1_m else ""
                if not cat_label and title_m:
                    cat_label = re.split(r"[-–|｜]", strip_tags(title_m.group(1)))[0].strip()
                cat_label = f"{cat_label} {slug}".strip()
                cat_items, rank = _parse_aibot_cards(html_body, seen, rank, default_cat=cat_label)
                items.extend(cat_items)

    return items


def parse_aibase():
    items = []
    seen = set()
    rank = 0

    try:
        app_html = fetch_text("https://app.aibase.com/zh/tools", timeout=18)
        tokens = re.split(r"(<h2[^>]*>.*?</h2>)", app_html, flags=re.S)
        current_cat = ""
        for part in tokens:
            if part.startswith("<h2"):
                heading = strip_tags(part)
                if heading and len(heading) < 40:
                    current_cat = heading
                continue
            for m in re.finditer(r'<a[^>]+href="(https?://[^"]+)"[^>]*>(.*?)</a>', part, re.S):
                inner = m.group(2)
                h3_m = re.search(r"<h3[^>]*>(.*?)</h3>", inner, re.S)
                if not h3_m:
                    continue
                url = normalize_url(m.group(1))
                name = strip_tags(h3_m.group(1))
                if not url or not name or domain_of(url) in SKIP_DOMAINS or url in seen:
                    continue
                p_m = re.search(r"<p[^>]*>(.*?)</p>", inner, re.S)
                if not p_m:
                    p_m = re.search(r'<div[^>]+item-desc[^>]*>(.*?)</div>', inner, re.S)
                desc = strip_tags(p_m.group(1)) if p_m else ""
                icon = extract_best_img(inner)
                seen.add(url)
                rank += 1
                items.append({
                    "name": name,
                    "url": url,
                    "description": desc,
                    "icon": icon,
                    "raw_cat": current_cat,
                    "source": "aibase",
                    "region": "domestic",
                    "source_rank": rank,
                })
    except Exception:
        pass

    try:
        www_html = fetch_text("https://www.aibase.com/zh/tools", timeout=18)
        for m in re.finditer(r'<a[^>]+href="(https?://[^"]+)"[^>]*>(.*?)</a>', www_html, re.S):
            inner = m.group(2)
            if "<h3" not in inner or "item-desc" not in inner:
                continue
            h3_m = re.search(r"<h3[^>]*>(.*?)</h3>", inner, re.S)
            desc_m = re.search(r'<div[^>]+item-desc[^>]*>(.*?)</div>', inner, re.S)
            if not h3_m or not desc_m:
                continue
            url = normalize_url(m.group(1))
            name = strip_tags(h3_m.group(1))
            desc = strip_tags(desc_m.group(1))
            if not url or not name or domain_of(url) in SKIP_DOMAINS or url in seen:
                continue
            seen.add(url)
            rank += 1
            icon = extract_best_img(inner)
            items.append({
                "name": name,
                "url": url,
                "description": desc,
                "icon": icon,
                "raw_cat": "",
                "source": "aibase",
                "region": "domestic",
                "source_rank": rank,
            })
    except Exception:
        if not items:
            raise

    return items


def parse_yupi_ai():
    raw_html = fetch_text("https://ai.codefather.cn/tool")
    joined = next_f_join(raw_html)
    items = []
    seen = set()
    rank = 0
    for m in re.finditer(
        r'\{"id":"(\d{15,22})","title":"((?:[^"\\]|\\.)*)","description":"((?:[^"\\]|\\.)*)","plainTextDescription":"((?:[^"\\]|\\.)*)","category":"tool","tags":\[(.*?)\]',
        joined,
        re.S,
    ):
        tid = m.group(1)
        if tid in seen:
            continue
        try:
            name = strip_tags(json.loads(f'"{m.group(2)}"'))
            raw_desc = json.loads(f'"{m.group(4) or m.group(3)}"')
            desc = strip_tags(raw_desc)
            tags = json.loads(f"[{m.group(5)}]")
        except Exception:
            continue
        if not name:
            continue
        seen.add(tid)
        rank += 1
        tail = joined[m.end():m.end() + 260]
        cov_m = re.search(r'"cover":"((?:[^"\\]|\\.)*)"', tail)
        icon = safe_icon_url(cov_m.group(1)) if cov_m else ""
        items.append({
            "name": name,
            "url": f"https://ai.codefather.cn/tool/{tid}",
            "description": desc,
            "icon": icon,
            "raw_cat": " ".join(str(t) for t in tags),
            "source": "yupi-ai",
            "region": "domestic",
            "source_rank": rank,
        })
    return items


def _parse_aizhiku_cards(raw_html, seen, start_rank, default_cat=""):
    items = []
    rank = start_rank
    for blk in re.split(r'<div class="url-card\b', raw_html)[1:]:
        blk = blk[:3500]
        name_m = re.search(r"<strong>([^<]+)</strong>", blk)
        if not name_m:
            continue
        name = re.sub(r"^[🔥⭐✨\s]+", "", strip_tags(name_m.group(1))).strip()
        if not name:
            continue
        url = ""
        go_m = re.search(r'href="https?://ai-zhiku\.com/index\.php\?[^"]*url=([^"&]+)', blk)
        if go_m:
            try:
                b64 = urllib.parse.unquote(go_m.group(1))
                b64 += "=" * (-len(b64) % 4)
                decoded = base64.b64decode(b64).decode("utf-8", "ignore").strip()
                url = normalize_url(decoded)
            except Exception:
                url = ""
        if not url:
            ext_m = re.search(r'href="(https?://(?!ai-zhiku\.com)[^"]+)"', blk)
            if ext_m:
                url = normalize_url(ext_m.group(1))
        if not url or domain_of(url) in SKIP_DOMAINS or url in seen:
            continue
        seen.add(url)
        rank += 1
        desc_m = re.search(r'<p class="overflowClip_1[^"]*"[^>]*>([^<]+)</p>', blk)
        if not desc_m:
            desc_m = re.search(r'title="([^"]+)"', blk)
        desc = strip_tags(desc_m.group(1)) if desc_m else ""
        cat_m = re.search(r'/webnav/([a-z0-9-]+)/show/', blk)
        raw_cat = cat_m.group(1).replace("-", " ") if cat_m else default_cat
        icon = extract_best_img(blk)
        items.append({
            "name": name,
            "url": url,
            "description": desc,
            "icon": icon,
            "raw_cat": raw_cat,
            "source": "ai-zhiku",
            "region": "domestic",
            "source_rank": rank,
        })
    return items, rank


def parse_aizhiku():
    home_html = fetch_text("https://ai-zhiku.com/")
    seen = set()
    items, rank = _parse_aizhiku_cards(home_html, seen, 0)

    cat_entries = []
    seen_cats = set()
    try:
        sm = fetch_text("https://ai-zhiku.com/sitemap.xml", timeout=15)
        for m in re.finditer(r"https://ai-zhiku\.com/webnav/([a-z0-9-]+)/(\d+)\.html", sm):
            slug, cid = m.group(1), m.group(2)
            key = (slug, cid)
            if key not in seen_cats:
                seen_cats.add(key)
                cat_entries.append(key)
    except Exception:
        pass

    def _crawl_cat(entry):
        slug, cid = entry
        collected = []
        local_seen = set()
        page_url = f"https://ai-zhiku.com/webnav/{slug}/{cid}.html"
        for page in range(1, 26):
            time.sleep(0.1)
            try:
                body = fetch_text(page_url, timeout=14, retries=1)
            except Exception:
                break
            page_items, _ = _parse_aizhiku_cards(body, local_seen, 0, default_cat=slug.replace("-", " "))
            if not page_items:
                break
            collected.extend(page_items)
            next_path = f"/webnav/{slug}/{cid}/p{page + 1}.html"
            if next_path not in body:
                break
            page_url = f"https://ai-zhiku.com{next_path}"
        return collected

    if cat_entries:
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as ex:
            for batch in ex.map(_crawl_cat, cat_entries):
                for it in batch:
                    if it["url"] in seen:
                        continue
                    seen.add(it["url"])
                    rank += 1
                    it["source_rank"] = rank
                    items.append(it)

    return items


def _parse_waytoagi_next_f(joined, seen, start_rank):
    items = []
    rank = start_rank
    for seg in joined.split('{"href":"/sites/')[1:]:
        chunk = seg[:3200]
        ext_m = re.search(
            r'"href":"(https?://(?!www\.waytoagi\.com|assets\.waytoagi\.com|pagead2\.)[^"]+)"',
            chunk,
        )
        if not ext_m:
            continue
        url = normalize_url(ext_m.group(1))
        if not url or domain_of(url) in SKIP_DOMAINS or url in seen:
            continue

        desc_m = re.search(r'text-gray-500[^}]*"children":"((?:[^"\\]|\\.)*)"', chunk)
        desc = ""
        if desc_m:
            try:
                desc = strip_tags(json.loads(f'"{desc_m.group(1)}"'))
            except Exception:
                desc = strip_tags(desc_m.group(1))

        head_before_desc = chunk[:desc_m.start()] if desc_m else chunk[:1500]
        titles = re.findall(r'"children":"((?:[^"\\]|\\.)*)"', head_before_desc)
        name = ""
        for raw_t in reversed(titles):
            try:
                cand = strip_tags(json.loads(f'"{raw_t}"'))
            except Exception:
                cand = strip_tags(raw_t)
            if cand and len(cand) <= 60 and cand != "...":
                name = cand
                break
        if not name:
            continue

        icon = ""
        asset_imgs = re.findall(r'"src":"(https://assets\.waytoagi\.com/[^"]+)"', chunk)
        for img in asset_imgs:
            if "image_process=resize" not in img:
                icon = safe_icon_url(img)
                if icon:
                    break
        if not icon and asset_imgs:
            icon = safe_icon_url(asset_imgs[0])

        seen.add(url)
        rank += 1
        items.append({
            "name": name,
            "url": url,
            "description": desc or "WaytoAGI 开源 AI 知识库与工具入口",
            "icon": icon,
            "raw_cat": "学习知识库",
            "source": "waytoagi",
            "region": "domestic",
            "source_rank": rank,
        })
    return items, rank


def parse_waytoagi():
    items = []
    seen = set()
    rank = 0

    for page in range(1, 51):
        time.sleep(0.15)
        try:
            raw_html = fetch_text(f"https://www.waytoagi.com/zh/sites?page={page}", timeout=14, retries=1)
        except Exception:
            if page == 1:
                break
            break
        joined = next_f_join(raw_html)
        page_items, rank = _parse_waytoagi_next_f(joined, seen, rank)
        if not page_items:
            break
        items.extend(page_items)

    if not items:
        for page_url in ("https://www.waytoagi.com/zh", "https://www.waytoagi.com/zh/sites"):
            try:
                raw_html = fetch_text(page_url, timeout=12)
            except Exception:
                continue
            for m in re.finditer(r'<a[^>]+href="(https?://[^"]+)"[^>]*>(.*?)</a>', raw_html, re.S):
                url = normalize_url(m.group(1))
                name = strip_tags(m.group(2))
                if not url or not name or len(name) > 50 or len(name) < 2:
                    continue
                if any(k in name for k in ("备案", "公网安备", "ICP", "致谢")):
                    continue
                if domain_of(url) in SKIP_DOMAINS or url in seen:
                    continue
                seen.add(url)
                rank += 1
                items.append({
                    "name": name,
                    "url": url,
                    "description": "WaytoAGI 开源 AI 知识库与工具社区入口",
                    "icon": "",
                    "raw_cat": "学习知识库",
                    "source": "waytoagi",
                    "region": "domestic",
                    "source_rank": rank,
                })
    return items


def parse_producthunt():
    feed_urls = (
        "https://www.producthunt.com/feed",
        "https://www.producthunt.com/feed?category=artificial-intelligence",
    )
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    items = []
    seen = set()
    rank = 0
    for feed_url in feed_urls:
        try:
            xml_text = fetch_text(feed_url, timeout=15)
            root = ET.fromstring(xml_text)
        except Exception:
            if not items and feed_url == feed_urls[-1]:
                raise
            continue
        for entry in root.findall("atom:entry", ns):
            title_el = entry.find("atom:title", ns)
            link_el = entry.find("atom:link", ns)
            content_el = entry.find("atom:content", ns)
            name = strip_tags(title_el.text if title_el is not None else "")
            url = normalize_url(link_el.attrib.get("href", "") if link_el is not None else "")
            raw_content = content_el.text if content_el is not None else ""
            desc = strip_tags(raw_content)
            desc = re.sub(r"\s*Discussion\s*\|\s*Link\s*$", "", desc).strip()
            if not name or not url or url in seen:
                continue
            seen.add(url)
            rank += 1
            items.append({
                "name": name,
                "url": url,
                "description": desc,
                "icon": "",
                "raw_cat": "新品速递",
                "source": "producthunt",
                "region": "overseas",
                "source_rank": rank,
            })
    return items


def _extract_futuretools_page(page):
    time.sleep(0.15)
    raw_html = fetch_text(f"https://www.futuretools.io/tools?page={page}", timeout=16, retries=1)
    joined = next_f_join(raw_html)
    decoder = json.JSONDecoder()
    marker = '"tool":{"id":'
    pos = 0
    extracted = []
    while True:
        idx = joined.find(marker, pos)
        if idx == -1:
            break
        obj_start = idx + len('"tool":')
        try:
            tool, end_pos = decoder.raw_decode(joined, obj_start)
            pos = end_pos
        except Exception:
            pos = obj_start + 1
            continue
        if isinstance(tool, dict) and tool.get("name"):
            extracted.append(tool)
    return extracted


def parse_futuretools():
    collected = []
    seen_slugs = set()
    max_pages = 220
    wave_size = 12
    idx_counter = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as ex:
        for start in range(1, max_pages + 1, wave_size):
            pages = list(range(start, min(start + wave_size, max_pages + 1)))
            futures = {ex.submit(_extract_futuretools_page, p): p for p in pages}
            page_results = {}
            hit_rate_limit = False
            for fut, p in futures.items():
                try:
                    page_results[p] = fut.result()
                except RateLimitError:
                    hit_rate_limit = True
                    page_results[p] = []
                except Exception:
                    page_results[p] = []

            wave_new = 0
            for p in pages:
                for tool in page_results.get(p, []):
                    slug = (tool.get("slug") or "").strip()
                    tid = (tool.get("id") or "").strip()
                    uniq = slug or tid
                    if not uniq or uniq in seen_slugs:
                        continue
                    seen_slugs.add(uniq)
                    wave_new += 1

                    raw_url = tool.get("website_url") or tool.get("destination_url") or ""
                    url = normalize_url(raw_url)
                    if not url or domain_of(url) in SKIP_DOMAINS:
                        if slug:
                            url = f"https://www.futuretools.io/tools/{slug}"
                        else:
                            continue

                    name = strip_tags(tool.get("name") or "")
                    if not name:
                        continue
                    desc = strip_tags(tool.get("description_short") or "")
                    icon = safe_icon_url(tool.get("logo_url") or "")
                    cats = tool.get("categories") or []
                    cat_tokens = []
                    for c in cats:
                        if isinstance(c, dict):
                            cat_tokens.append(str(c.get("name") or ""))
                            cat_tokens.append(str(c.get("slug") or ""))
                    raw_cat = " ".join(cat_tokens).strip()
                    upvotes = int(tool.get("upvotes") or 0)
                    idx_counter += 1
                    collected.append((
                        -upvotes,
                        idx_counter,
                        {
                            "name": name[:60],
                            "url": url,
                            "description": desc or f"FutureTools 收录海外 AI 工具：{name}",
                            "icon": icon,
                            "raw_cat": raw_cat,
                            "source": "futuretools",
                            "region": "overseas",
                        },
                    ))

            if wave_new == 0 or hit_rate_limit:
                break

    collected.sort(key=lambda x: (x[0], x[1]))
    items = []
    seen_urls = set()
    rank = 0
    for _, _, item in collected:
        if item["url"] in seen_urls:
            continue
        seen_urls.add(item["url"])
        rank += 1
        item["source_rank"] = rank
        items.append(item)
    return items


def parse_futurepedia():
    cats_html = fetch_text("https://www.futurepedia.io/ai-tools", timeout=16)
    cat_slugs = []
    seen_cat = set()
    for m in re.finditer(r'href="(?:/ai-tools/|https://www\.futurepedia\.io/ai-tools/)([a-z0-9-]+)"', cats_html):
        slug = m.group(1)
        if slug not in seen_cat:
            seen_cat.add(slug)
            cat_slugs.append(slug)

    if not cat_slugs:
        cat_slugs = [
            "productivity", "code-assistant", "image-generators",
            "video-generators", "writing-generators", "automation-tools",
        ]

    def _crawl_fp_cat(cat_slug):
        cat_items = []
        cat_seen = set()
        time.sleep(0.1)
        page_url = f"https://www.futurepedia.io/ai-tools/{cat_slug}"
        try:
            raw_html = fetch_text(page_url, timeout=12, retries=0)
        except Exception:
            return cat_items
        for m in re.finditer(r'href="(https?://www\.futurepedia\.io)?(/tool/([a-z0-9-]+))"', raw_html):
            slug = m.group(3)
            url = f"https://www.futurepedia.io/tool/{slug}"
            if url in cat_seen:
                continue
            cat_seen.add(url)
            ctx = raw_html[max(0, m.start() - 100):min(len(raw_html), m.end() + 700)]
            alt_m = re.search(r'alt="([^"]{2,60})"', ctx)
            p_m = re.search(r'<p[^>]*>([^<]{8,200})</p>', ctx)
            name = strip_tags(alt_m.group(1)) if alt_m else slug.replace("-", " ").title()
            name = re.sub(r"\s+logo$", "", name, flags=re.I).strip()
            desc = strip_tags(p_m.group(1)) if p_m else f"Futurepedia 收录的海外 AI 工具（{cat_slug}）"
            icon = extract_best_img(ctx)
            cat_items.append({
                "name": name,
                "url": url,
                "description": desc,
                "icon": icon,
                "raw_cat": cat_slug,
                "source": "futurepedia",
                "region": "overseas",
            })
        return cat_items

    items = []
    seen = set()
    rank = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
        for batch in ex.map(_crawl_fp_cat, cat_slugs):
            for it in batch:
                if it["url"] in seen:
                    continue
                seen.add(it["url"])
                rank += 1
                it["source_rank"] = rank
                items.append(it)
    return items


SOURCES = [
    ("ai-bot", "AI 工具集", "domestic", parse_aibot),
    ("aibase", "AIbase 基地", "domestic", parse_aibase),
    ("yupi-ai", "鱼皮 AI 导航", "domestic", parse_yupi_ai),
    ("ai-zhiku", "AI 智库", "domestic", parse_aizhiku),
    ("waytoagi", "WaytoAGI", "domestic", parse_waytoagi),
    ("producthunt", "Product Hunt", "overseas", parse_producthunt),
    ("futuretools", "FutureTools", "overseas", parse_futuretools),
    ("futurepedia", "Futurepedia", "overseas", parse_futurepedia),
]


def _norm_tool_name(name):
    return re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", (name or "").lower())


def _merge_item_into(cur, inc, cat):
    for s in inc.get("sources", [inc.get("source")]):
        if s and s not in cur["sources"]:
            cur["sources"].append(s)
    for rg in inc.get("regions", [inc.get("region")]):
        if rg and rg not in cur["regions"]:
            cur["regions"].append(rg)
    inc_rank = inc.get("min_rank", inc.get("source_rank", 999))
    if inc_rank < cur["min_rank"]:
        cur["min_rank"] = inc_rank

    inc_desc = (inc.get("description") or "")[:160]
    cur_has_zh = any("\u4e00" <= c <= "\u9fff" for c in cur["description"])
    inc_has_zh = any("\u4e00" <= c <= "\u9fff" for c in inc_desc)
    if (inc_has_zh and not cur_has_zh) or (inc_has_zh == cur_has_zh and len(inc_desc) > len(cur["description"])):
        cur["description"] = inc_desc

    if not cur["icon"] and inc.get("icon"):
        cur["icon"] = inc["icon"]
    inc_region = inc.get("region", "")
    if inc_region == "domestic" and any("\u4e00" <= c <= "\u9fff" for c in inc.get("name", "")):
        if not any("\u4e00" <= c <= "\u9fff" for c in cur["name"]):
            cur["name"] = inc["name"][:60]
    if cur["category"] == "其他工具" and cat != "其他工具":
        cur["category"] = cat


def merge_and_build(raw_items, source_stats):
    # Stage 1: Merge by normalized canonical URL / domain+path
    merged = {}
    for it in raw_items:
        url = it["url"]
        key = dedupe_key(url)
        dom = domain_of(url)
        cat = map_category(it.get("raw_cat", ""), it.get("name", ""), it.get("description", ""))
        r = it.get("source_rank", 999)
        if key not in merged:
            merged[key] = {
                "id": hashlib.sha1(key.encode("utf-8")).hexdigest()[:12],
                "name": it["name"][:60],
                "url": url,
                "domain": dom,
                "description": it["description"][:160],
                "icon": it["icon"],
                "category": cat,
                "region": it["region"],
                "regions": [it["region"]],
                "sources": [it["source"]],
                "min_rank": r,
            }
        else:
            _merge_item_into(merged[key], it, cat)

    # Stage 2: Consolidate aggregator-hosted wrappers into uniquely matching official-domain tools
    official_by_name = {}
    for key, cur in merged.items():
        if cur["domain"] in AGGREGATOR_HOSTS:
            continue
        nn = _norm_tool_name(cur["name"])
        if len(nn) >= 4:
            official_by_name.setdefault(nn, []).append(key)

    drop_keys = []
    for key, cur in list(merged.items()):
        if cur["domain"] not in AGGREGATOR_HOSTS:
            continue
        nn = _norm_tool_name(cur["name"])
        matches = official_by_name.get(nn, [])
        if len(matches) == 1:
            target = merged[matches[0]]
            _merge_item_into(target, cur, cur["category"])
            drop_keys.append(key)

    for dk in drop_keys:
        merged.pop(dk, None)

    items = list(merged.values())

    # Detect and strip repeated site-default placeholder icons (appearing >= 4 times across distinct tools)
    icon_freq = Counter(i["icon"] for i in items if i["icon"])
    placeholder_icons = {u for u, cnt in icon_freq.items() if cnt >= 4}
    for item in items:
        if item["icon"] in placeholder_icons:
            item["icon"] = ""

    for item in items:
        min_rank = item.pop("min_rank", 999)
        editorial_boost = max(0, 60 - min_rank)
        has_zh = any("\u4e00" <= c <= "\u9fff" for c in item["description"])
        item["score"] = (
            len(item["sources"]) * 100
            + editorial_boost
            + (8 if item["icon"] else 0)
            + (5 if has_zh else 0)
        )

    items.sort(key=lambda x: (-x["score"], x["name"].lower()))

    cat_counts = Counter(i["category"] for i in items)
    dom_count = sum(1 for i in items if "domestic" in i["regions"])
    ovs_count = sum(1 for i in items if "overseas" in i["regions"])
    real_icon_count = sum(1 for i in items if i["icon"])

    return {
        "generated_at": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec="seconds"),
        "schedule": "每日 04:00 自动爬取更新",
        "categories": CATEGORIES,
        "stats": {
            "total": len(items),
            "domestic": dom_count,
            "overseas": ovs_count,
            "with_icon": real_icon_count,
            "placeholder_stripped": len(placeholder_icons),
            "by_category": dict(cat_counts),
        },
        "sources_summary": source_stats,
        "items": items,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", required=True, help="Output catalog.json path")
    parser.add_argument("--min-items", type=int, default=500, help="Safety threshold before overwriting")
    args = parser.parse_args()

    raw_items = []
    source_stats = []

    for src_id, src_name, region, fn in SOURCES:
        t0 = time.time()
        try:
            res = fn()
            elapsed = round(time.time() - t0, 2)
            raw_items.extend(res)
            status = "ok" if len(res) > 0 else "empty"
            source_stats.append({
                "id": src_id,
                "name": src_name,
                "region": region,
                "status": status,
                "count": len(res),
                "elapsed_s": elapsed,
            })
            print(f"[OK] {src_id:12} ({region:8}) -> {len(res):4} items in {elapsed}s")
        except Exception as e:
            elapsed = round(time.time() - t0, 2)
            source_stats.append({
                "id": src_id,
                "name": src_name,
                "region": region,
                "status": "error",
                "count": 0,
                "note": str(e)[:80],
                "elapsed_s": elapsed,
            })
            print(f"[WARN] {src_id:12} failed: {e}")

    catalog = merge_and_build(raw_items, source_stats)
    total = catalog["stats"]["total"]
    print(
        f"Merged total={total} (domestic={catalog['stats']['domestic']}, "
        f"overseas={catalog['stats']['overseas']}, with_icon={catalog['stats']['with_icon']}, "
        f"stripped_placeholders={catalog['stats']['placeholder_stripped']})"
    )

    if total < args.min_items:
        raise SystemExit(f"Aborting overwrite: merged total {total} < min_items {args.min_items}")

    out_dir = os.path.dirname(os.path.abspath(args.output))
    os.makedirs(out_dir, exist_ok=True)
    tmp_path = args.output + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(catalog, f, ensure_ascii=False, separators=(",", ":"))
    os.chmod(tmp_path, 0o644)

    if os.path.exists(args.output):
        prev_tmp = os.path.join(out_dir, "catalog.prev.json.tmp")
        prev_path = os.path.join(out_dir, "catalog.prev.json")
        try:
            shutil.copy2(args.output, prev_tmp)
            os.chmod(prev_tmp, 0o644)
            os.replace(prev_tmp, prev_path)
        except Exception:
            pass

    os.replace(tmp_path, args.output)
    print(f"Atomically wrote {args.output}")


if __name__ == "__main__":
    main()
