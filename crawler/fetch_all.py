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
    "划水摸鱼",
    "新品速递",
    "其他工具",
]

TRACKING_PARAMS = {
    "utm", "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "utm_id", "utm_from", "utm_type", "utm_page", "utm_plan", "utm_unit", "utm_keyword",
    "ref", "referrer", "referrer_s", "from", "fromid", "regfrom", "spm", "sqm",
    "source", "via", "share", "invite", "invite_code", "invitecode",
    "invitationcode", "invitationtype", "inviterid", "huiwainvitecode", "usercode",
    "code", "sourcepage", "ch", "channel", "channelcode", "_channel_track_key",
    "hmmd", "hmsr", "hmpl", "hmkw", "hmci", "track_id", "adtag", "fpr",
    "_bhlid", "_f", "cgv", "rmd", "bd_vid", "gclid", "fbclid", "msclkid",
    "aff", "aff_id", "promo",
}

PROMO_VALUE_PREFIXES = (
    "aibot", "aigjj", "botrm", "dlz_aibot", "futuretools", "futurepedia",
    "xftj932", "g5dp", "lksadjknxzc812ad",
)


def is_tracking_param(key, val):
    kl = (key or "").strip().lower()
    vl = (val or "").strip().lower()
    if kl in TRACKING_PARAMS or kl.startswith(("utm_", "hmsr", "hmmd")):
        return True
    if kl in ("s", "f", "id", "pic", "c") and any(vl.startswith(p) for p in PROMO_VALUE_PREFIXES):
        return True
    return False

SKIP_DOMAINS = {
    "ai-bot.cn", "www.ai-bot.cn",
    "aibase.com", "www.aibase.com", "app.aibase.com", "top.aibase.com",
    "news.aibase.com", "mcp.aibase.com", "model.aibase.com", "geo.aibase.com",
    "ai-zhiku.com", "www.ai-zhiku.com",
    "baoboxs.com", "www.baoboxs.com",
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


def fetch_text(url, timeout=18, retries=2, max_bytes=10 * 1024 * 1024, extra_headers=None):
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
    if extra_headers:
        headers.update(extra_headers)
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
        if not is_tracking_param(k, v)
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
        "划水摸鱼", "摸鱼", "在线游戏", "运动健康", "音乐 影视", "影音影视", "磁力搜索",
    )):
        return "划水摸鱼"
    if has_word(text, (
        "agent", "agents", "智能体", "工作流", "workflow", "workflows",
        "automation", "automations", "自动化", "mcp", "openclaw", "dify", "coze", "扣子",
        "no code", "nocode", "personal assistant", "aggregators",
    )):
        return "Agent与自动化"
    if has_word(text, (
        "编程", "代码", "开发", "框架", "模型", "软件 cli", "skills", "模型社区",
        "开放平台", "站长助手", "代码托管", "网络工具", "编辑工具", "云服务商", "云计算",
        "插件", "idea插件", "vscode插件", "浏览器插件", "remote", "ssl",
        "code", "coding", "code assistant", "generative code", "ide", "github", "cursor",
        "copilot", "sql", "sql assistant", "api", "前端", "后端", "website builders",
        "ai coding", "ai frameworks", "ai models", "developer", "programming",
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
        "图片资源", "在线作图", "图床", "截图", "录屏", "取色配色", "字库",
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
        "协同工作", "专业邮箱", "临时邮箱", "网盘", "传输", "搜索 下载", "资源分享",
        "软件下载", "nas", "政务门户", "信息安全", "常用推荐", "热门推荐",
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
        "编程学习", "电子书籍", "练习专区", "技能提升", "学生教辅", "技术社区", "求职", "副业",
        "research", "research assistant", "study", "paper", "education",
        "tutorial", "ai tutorial", "for fun", "self improvement", "gaming", "health",
    )):
        return "学习知识库"
    if has_word(text, ("新品", "producthunt", "新品速递", "newly added")):
        return "新品速递"
    return None


def map_category(raw_cat, name="", desc=""):
    clean_cat = re.sub(r"[|｜\-_/]+", " ", (raw_cat or ""))
    clean_cat = re.sub(r"\s+", " ", clean_cat).lower().strip()
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
    max_pages = 250
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


def parse_baoboxs():
    raw_html = fetch_text("https://www.baoboxs.com/", timeout=18)
    joined = next_f_join(raw_html)
    marker = '"initialCategories":'
    idx = joined.find(marker)
    if idx == -1:
        raise RuntimeError("baoboxs initialCategories payload not found")
    cats, _ = json.JSONDecoder().raw_decode(joined, idx + len(marker))

    items = []
    seen = set()
    rank = 0
    for cat in cats:
        if not isinstance(cat, dict):
            continue
        cname = strip_tags(cat.get("cname") or "")
        for grp in cat.get("glist") or []:
            if not isinstance(grp, dict):
                continue
            gname = strip_tags(grp.get("groupName") or "")
            raw_cat = f"{cname} {gname}".strip()
            for tool in grp.get("tools") or []:
                if not isinstance(tool, dict):
                    continue
                url = normalize_url(tool.get("url") or "")
                name = strip_tags(tool.get("title") or "")
                if not url or not name or domain_of(url) in SKIP_DOMAINS or url in seen:
                    continue
                seen.add(url)
                rank += 1
                desc = strip_tags(tool.get("desc") or "") or f"{cname or '程序员宝盒'} · {gname}".strip(" ·")
                icon = safe_icon_url(tool.get("img") or "")
                items.append({
                    "name": name,
                    "url": url,
                    "description": desc,
                    "icon": icon,
                    "raw_cat": raw_cat,
                    "source": "baoboxs",
                    "region": "domestic",
                    "source_rank": rank,
                })
    return items


def fetch_and_write_hotlist(hotlist_path):
    raw_json = fetch_text(
        "https://www.baoboxs.com/api/utility/proxy/hotlist",
        timeout=15,
        retries=2,
        extra_headers={
            "Referer": "https://www.baoboxs.com/",
            "Accept": "application/json,text/plain,*/*",
        },
    )
    payload = json.loads(raw_json)
    platforms = []
    for entry in payload.get("data") or []:
        cfg = entry.get("config") or {}
        pid = str(cfg.get("platformId") or "").strip()
        pname = strip_tags(cfg.get("platformName") or pid)
        if not pid or not pname:
            continue
        norm_items = []
        for it in (entry.get("items") or [])[:30]:
            title = strip_tags(it.get("title") or "")
            url = normalize_url(it.get("url") or "")
            if not title or not url:
                continue
            norm_items.append({
                "title": title,
                "url": url,
                "hot_value": str(it.get("hotValue") or ""),
                "is_hot": bool(it.get("isHot")),
                "is_new": bool(it.get("isNew")),
                "is_rising": bool(it.get("isRising")),
            })
        if not norm_items:
            continue
        platforms.append({
            "id": pid,
            "name": pname,
            "short_name": strip_tags(cfg.get("platformShortName") or pname),
            "icon": safe_icon_url(cfg.get("iconUrl") or ""),
            "color": str(cfg.get("color") or "#0071e3"),
            "updated_at": str(cfg.get("lastUpdateTime") or ""),
            "items": norm_items,
        })

    if not platforms:
        raise RuntimeError("hotlist returned 0 valid platforms")

    data = {
        "generated_at": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec="seconds"),
        "platforms_count": len(platforms),
        "platforms": platforms,
    }
    out_dir = os.path.dirname(os.path.abspath(hotlist_path))
    os.makedirs(out_dir, exist_ok=True)
    tmp_path = hotlist_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.chmod(tmp_path, 0o644)

    if os.path.exists(hotlist_path):
        prev_tmp = os.path.join(out_dir, "hotlist.prev.json.tmp")
        prev_path = os.path.join(out_dir, "hotlist.prev.json")
        try:
            shutil.copy2(hotlist_path, prev_tmp)
            os.chmod(prev_tmp, 0o644)
            os.replace(prev_tmp, prev_path)
        except Exception:
            pass

    os.replace(tmp_path, hotlist_path)
    print(f"[OK] hotlist      -> {len(platforms)} platforms atomically written to {hotlist_path}")
    return len(platforms)


NEWS_TOPICS = [
    "大模型",
    "开发与Agent",
    "多模态",
    "芯片与算力",
    "行业动态",
    "前沿速递",
]


def classify_news_topic(title, summary=""):
    text = f"{title or ''} {summary or ''}".lower()
    if re.search(
        r"openai|anthropic|claude|gpt|gemini|deepseek|qwen|千问|llama|grok|豆包|kimi|"
        r"大模型|推理模型|基础模型|预训练|停训|开源模型|模型发布|百川|智谱|glm|minimax|mistral",
        text,
    ):
        return "大模型"
    if re.search(
        r"\bagent\b|智能体|\bmcp\b|cursor|claude code|codex|openclaw|编程|代码|github|"
        r"\bide\b|vs code|开发框架|benchmark|工作流|自动化|skill|cline|windsurf",
        text,
    ):
        return "开发与Agent"
    if re.search(
        r"视频|图像|绘画|音频|语音|sora|kling|可灵|veo|midjourney|短剧|漫剧|3d|"
        r"视觉|生图|多模态|音乐|播客|数字人|配音|render|runway",
        text,
    ):
        return "多模态"
    if re.search(
        r"英伟达|nvidia|\bgpu\b|芯片|算力|数据中心|\btpu\b|\bamd\b|昇腾|机器人|具身|"
        r"硬件|服务器|半导体|intel|amd|huawei|华为",
        text,
    ):
        return "芯片与算力"
    if re.search(
        r"融资|财报|营收|收购|监管|政策|版权|微信|微软|谷歌|google|苹果|apple|小米|"
        r"字节|阿里|腾讯|亚马逊|amazon|meta|裁员|估值|投入|收入|合规|起诉",
        text,
    ):
        return "行业动态"
    return "前沿速递"


def _parse_news_content(raw_html):
    html_str = raw_html or ""
    cover = ""
    img_m = re.search(r'<img[^>]+src=["\']([^"\']+)["\']', html_str, re.I)
    if img_m:
        cover = safe_icon_url(img_m.group(1))

    cleaned = re.sub(r'<div[^>]*border-left[^>]*>[\s\S]*?</div>', "", html_str, flags=re.I)
    cleaned = re.sub(r'<div[^>]*>[^<]*原文链接[\s\S]*?</div>', "", cleaned, flags=re.I)
    cleaned = re.sub(r"<img\b[^>]*>", "", cleaned, flags=re.I)
    cleaned = re.sub(r"<br\s*/?>", " ", cleaned, flags=re.I)

    paragraphs = []
    total_chars = 0
    for m in re.finditer(r"<(h[1-6]|p|li)\b[^>]*>([\s\S]*?)</\1>", cleaned, re.I):
        tag = m.group(1).lower()
        inner = m.group(2)
        text = strip_tags(inner)
        if not text or text.startswith("原文链接"):
            continue
        is_heading = tag.startswith("h")
        if not is_heading and len(text) <= 48:
            if re.fullmatch(r"\s*<(strong|b)\b[^>]*>[\s\S]*?</\1>\s*", inner, re.I):
                is_heading = True
        paragraphs.append({"type": "heading" if is_heading else "text", "text": text})
        total_chars += len(text)
        if len(paragraphs) >= 20 or total_chars >= 3600:
            break

    return cover, paragraphs


def fetch_and_write_news(news_path, max_pages=4):
    tz8 = datetime.timezone(datetime.timedelta(hours=8))
    raw_records = []
    for page in range(1, max_pages + 1):
        api_url = (
            "https://api.codefather.cn/api/ai_post/list/page/vo"
            f"?current={page}&pageSize=50&category=news"
        )
        try:
            raw_json = fetch_text(
                api_url,
                timeout=15,
                retries=2,
                extra_headers={
                    "Referer": "https://ai.codefather.cn/news",
                    "Accept": "application/json,text/plain,*/*",
                },
            )
            payload = json.loads(raw_json)
            if payload.get("code") != 0:
                raise RuntimeError(f"API code={payload.get('code')} {payload.get('message', '')}")
            recs = (payload.get("data") or {}).get("records") or []
            if not recs:
                break
            raw_records.extend(recs)
        except Exception as e:
            if page == 1 and not raw_records:
                raise
            print(f"[WARN] yupi-news page {page} skipped: {e}")
            break

    seen_ids = set()
    seen_titles = set()
    items = []
    for rec in raw_records:
        pid = str(rec.get("id") or "").strip()
        title = strip_tags(rec.get("title") or "")
        if not pid or not title:
            continue
        norm_t = re.sub(r"\s+", "", title.lower())
        if pid in seen_ids or norm_t in seen_titles:
            continue
        seen_ids.add(pid)
        seen_titles.add(norm_t)

        content_cover, paragraphs = _parse_news_content(rec.get("content") or "")
        cover = safe_icon_url(rec.get("cover") or "") or content_cover
        summary = strip_tags(rec.get("plainTextDescription") or "")
        if not summary:
            summary = next((p["text"] for p in paragraphs if p["type"] == "text"), "")
        if not summary:
            summary = title
        summary = summary[:220]
        if not paragraphs and summary:
            paragraphs = [{"type": "text", "text": summary}]

        detail_url = f"https://ai.codefather.cn/news/{pid}"
        ext_url = normalize_url(rec.get("externalLink") or "")
        if ext_url == detail_url:
            ext_url = ""

        try:
            ts_ms = int(rec.get("createTime") or 0)
        except (TypeError, ValueError):
            ts_ms = 0
        if ts_ms > 0:
            dt = datetime.datetime.fromtimestamp(ts_ms / 1000, tz8)
            published_at = dt.strftime("%Y-%m-%d %H:%M")
            date_str = dt.strftime("%Y-%m-%d")
        else:
            published_at = ""
            date_str = ""

        try:
            views = max(0, int(rec.get("viewNum") or 0))
        except (TypeError, ValueError):
            views = 0

        items.append({
            "id": pid,
            "title": title,
            "summary": summary,
            "cover": cover,
            "url": detail_url,
            "source_url": ext_url,
            "topic": classify_news_topic(title, summary),
            "published_ts": ts_ms,
            "published_at": published_at,
            "date": date_str,
            "views": views,
            "paragraphs": paragraphs,
        })

    items.sort(key=lambda x: (-x["published_ts"], x["id"]))
    if len(items) < 10:
        raise RuntimeError(f"news returned too few valid items: {len(items)}")

    data = {
        "generated_at": datetime.datetime.now(tz8).isoformat(timespec="seconds"),
        "total": len(items),
        "topics": NEWS_TOPICS,
        "items": items,
    }
    out_dir = os.path.dirname(os.path.abspath(news_path))
    os.makedirs(out_dir, exist_ok=True)
    tmp_path = news_path + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.chmod(tmp_path, 0o644)

    if os.path.exists(news_path):
        prev_tmp = os.path.join(out_dir, "news.prev.json.tmp")
        prev_path = os.path.join(out_dir, "news.prev.json")
        try:
            shutil.copy2(news_path, prev_tmp)
            os.chmod(prev_tmp, 0o644)
            os.replace(prev_tmp, prev_path)
        except Exception:
            pass

    os.replace(tmp_path, news_path)
    print(f"[OK] ai-news      -> {len(items)} articles atomically written to {news_path}")
    return len(items)


SOURCES = [
    ("ai-bot", "AI 工具集", "domestic", parse_aibot),
    ("aibase", "AIbase 基地", "domestic", parse_aibase),
    ("yupi-ai", "鱼皮 AI 导航", "domestic", parse_yupi_ai),
    ("ai-zhiku", "AI 智库", "domestic", parse_aizhiku),
    ("waytoagi", "WaytoAGI", "domestic", parse_waytoagi),
    ("baoboxs", "程序员宝盒", "domestic", parse_baoboxs),
    ("producthunt", "Product Hunt", "overseas", parse_producthunt),
    ("futuretools", "FutureTools", "overseas", parse_futuretools),
    ("futurepedia", "Futurepedia", "overseas", parse_futurepedia),
]


GARBAGE_DESC_RE = re.compile(
    r"(由于Cloudflare安全防护|无法访问\s*lmarena|403\s*Forbidden|Just a moment|"
    r"Attention Required|Access Denied|从页面内容来看，该产品可能是|当前页面主要展示了由于)",
    re.I,
)

FUTUREPEDIA_PLACEHOLDER_RE = re.compile(r"^Futurepedia\s*收录的海外\s*AI\s*工具（([^）]+)）$")

CURATED_DESCRIPTIONS = {
    "chat.lmsys.org": "LMSYS Chatbot Arena（原 StableVicuna 评测竞技场）是由加州大学伯克利分校等机构联合打造的开源大模型盲测对比与对话评测平台，支持多模型同屏盲测投票与权威 Leaderboard 榜单查询。",
    "lmarena.ai": "Chatbot Arena（LMArena）是由 LMSYS 团队运营的全球权威大模型众包盲测对战与排行榜平台，支持主流闭源与开源模型同台实时对比评测。",
    "codefuse.alipay.com": "CodeFuse 是蚂蚁集团自研的全生命周期研发大模型与智能编码助手，提供代码补全、单元测试生成、代码解释与 DevOps 智能体支持，兼容 VS Code 与 JetBrains 系列 IDE。",
}

FUTUREPEDIA_TAG_ZH = {
    "business": ("商业决策与企业运营自动化", "商业分析、流程优化与智能增长"),
    "video-enhancer": ("视频画质修复、超分放大与帧率增强", "老片修复、清晰度提升与画质降噪"),
    "personal-assistant": ("全天候个人智能助理与日程管理", "任务规划、信息摘要与跨平台协作"),
    "spreadsheet-assistant": ("电子表格公式生成与智能数据分析", "Excel/Google Sheets 公式编写、数据透视与图表解读"),
    "translators": ("多语种神经网络机器翻译与本地化", "文档实时互译、语境润色与跨语言沟通"),
    "presentations": ("AI 演示文稿与幻灯片一键生成", "大纲自动排版、商务路演 PPT 设计与视觉美化"),
    "health": ("数字健康管理与身心状态辅助分析", "健康习惯追踪、运动营养建议与科普问答"),
    "prompt-generators": ("大模型提示词（Prompt）工程优化与生成", "结构化提示词调优、模板复用与多模型效果提升"),
    "design-generators": ("智能平面视觉设计与品牌素材生成", "海报排版、UI 灵感探索与多尺寸营销图制作"),
    "portrait-generators": ("AI 人像写真与职业形象照生成", "商务头像定制、风格化艺术人像与灯光重塑"),
    "gaming": ("游戏资产生成、NPC 智能交互与关卡辅助开发", "游戏美术创意、剧情对话生成与玩家体验增强"),
    "cartoon-generators": ("动漫卡通风格转换与二次元角色生成", "插画转绘、漫画分镜创作与卡通形象设计"),
    "paraphrasing": ("文本智能改写、降重润色与语气转换", "多风格句式重构、学术与商务表达精炼"),
    "website-builders": ("AI 一键建站与响应式落地页生成", "零代码生成独立站、组件排版与文案自动填充"),
    "research-assistant": ("学术文献深度检索与研究综述辅助", "论文语义搜索、核心观点提炼与引文溯源"),
    "video-generators": ("AI 视频内容生成与多模态动态创作", "脚本转视频、镜头合成与短视频批量制作"),
    "sql-assistant": ("自然语言转 SQL 查询与数据库优化辅助", "复杂 SQL 编写、表结构解析与慢查询调优"),
    "logo-generator": ("品牌 Logo 标志设计与视觉识别生成", "矢量图标创意、字体搭配与品牌 VI 快速打样"),
    "ai-agents": ("自主任务规划与多工具调用智能体（AI Agent）", "复杂目标拆解、网页自动化与业务流自主执行"),
    "project-management": ("智能项目管理、任务排期与团队进度协同", "里程碑拆解、风险预警与会议待办自动跟进"),
    "text-to-image": ("高精度文生图（Text-to-Image）艺术创作", "创意插画生成、写实摄影合成与风格控制"),
    "social-media": ("社交媒体爆款内容策划与多平台排期分发", "图文脚本生成、互动增长分析与账号矩阵运营"),
    "finance": ("智能财务分析、报表解读与投研数据洞察", "财报摘要提取、收支预测与量化信息梳理"),
    "ai-detection": ("AIGC 生成内容检测与文本原创性校验", "AI 写作痕迹识别、学术合规审查与真实度评估"),
    "storyteller": ("互动故事创作、小说世界观构思与剧本续写", "角色设定延展、情节分支推演与创意写作"),
    "writing-generators": ("长文智能起草、多体裁写作与内容扩写", "博客文章撰写、结构大纲生成与语言润色"),
    "text-to-video": ("文本提示词直接生成高清动态视频（Text-to-Video）", "分镜画面生成、动态特效合成与创意短片制作"),
    "video-editing": ("智能视频剪辑、自动高光切片与字幕包装", "口播冗余片段剔除、多机位混剪与横竖屏自适应"),
    "audio-editing": ("AI 音频降噪、人声伴奏分离与母带级音质增强", "播客后期精修、杂音消除与音频剪辑自动化"),
    "code-assistant": ("AI 智能代码补全、重构审查与结对编程", "多语言代码生成、Bug 定位修复与单元测试编写"),
    "music-generator": ("AI 原创音乐作曲、编曲配乐与免版税旋律生成", "视频背景音乐定制、多曲风伴奏生成与人声合成"),
    "copywriting-assistant": ("高转化营销文案、广告语与商品详情页撰写", "A/B 测试标题生成、品牌故事打磨与邮件营销写作"),
    "chatbots": ("智能对话机器人与企业级在线客服构建", "知识库接入问答、7×24 小时客户响应与线索转化"),
    "text-to-speech": ("超拟真语音合成（TTS）、多情感配音与声音克隆", "有声书朗读、短视频多语种配音与数字人播报"),
    "productivity": ("日常办公自动化与个人生产力全面提效", "重复性文书处理、跨软件协同与专注力管理"),
    "marketing": ("全渠道数字营销策划、投放洞察与获客增长", "受众画像分析、SEO 内容布局与转化率优化"),
    "avatar-generator": ("3D/2D 虚拟数字人形象定制与个性化头像生成", "社交专属头像创作、虚拟主播建模与表情驱动"),
    "workflows": ("跨应用 AI 自动化工作流编排与数据同步", "触发器联动、非结构化数据处理与免代码集成"),
    "transcriber": ("高精度语音转文字（ASR）、录音转写与双语字幕生成", "会议录音实时纪要、访谈整理与多说话人区分"),
    "image-editing": ("AI 智能修图、背景擦除替换与局部重绘", "电商商品图精修、光影融合与无痕消除杂物"),
    "art": ("数字艺术风格探索、概念原画与创意视觉实验", "多画风融合创作、纹理生成与艺术灵感延展"),
    "image-generators": ("多风格 AI 图像生成与视觉创意快速打样", "插画素材制作、写实场景渲染与批量出图"),
    "no-code": ("无代码/低代码 AI 原生应用可视化搭建", "拖拽式组件拼装、大模型接口封装与快速上线验证"),
    "text-generators": ("智能文本生成、摘要提炼与结构化内容输出", "日常文案辅助、信息归纳整理与多场景写作"),
}


def is_low_quality_desc(desc):
    d = (desc or "").strip()
    if not d:
        return True
    if GARBAGE_DESC_RE.search(d):
        return True
    if FUTUREPEDIA_PLACEHOLDER_RE.match(d):
        return True
    return False


def clean_and_enrich_description(name, domain, category, desc):
    dom = (domain or "").strip().lower()
    if dom in CURATED_DESCRIPTIONS:
        return CURATED_DESCRIPTIONS[dom]
    d = (desc or "").strip()
    m = FUTUREPEDIA_PLACEHOLDER_RE.match(d)
    if m:
        tag = m.group(1).strip().lower()
        cap, scene = FUTUREPEDIA_TAG_ZH.get(tag, (f"{category}智能化处理", "日常创作与办公提效"))
        return f"{name}（{dom}）是一款专注于{cap}的海外主流 AI 工具，适用于{scene}等场景。"
    if GARBAGE_DESC_RE.search(d):
        return f"{name}（{dom}）是一款面向「{category}」场景的 AI 工具平台，提供便捷的在线智能化功能体验。"
    return d


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

    inc_desc = (inc.get("description") or "")[:180]
    cur_bad = is_low_quality_desc(cur["description"])
    inc_bad = is_low_quality_desc(inc_desc)
    if cur_bad and not inc_bad:
        cur["description"] = inc_desc
    elif not inc_bad:
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
        item["description"] = clean_and_enrich_description(
            item["name"], item["domain"], item["category"], item["description"]
        )[:180]
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


def refresh_sitemap_lastmod(data_or_out_path):
    if not data_or_out_path:
        return
    web_dir = os.path.dirname(os.path.dirname(os.path.abspath(data_or_out_path)))
    sitemap_path = os.path.join(web_dir, "sitemap.xml")
    if not os.path.isfile(sitemap_path):
        return
    today = datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).strftime("%Y-%m-%d")
    try:
        with open(sitemap_path, "r", encoding="utf-8") as f:
            raw = f.read()
        updated = re.sub(r"<lastmod>\d{4}-\d{2}-\d{2}</lastmod>", f"<lastmod>{today}</lastmod>", raw)
        if updated != raw:
            with open(sitemap_path, "w", encoding="utf-8") as f:
                f.write(updated)
    except Exception:
        pass


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", help="Output catalog.json path")
    parser.add_argument("--hotlist-output", help="Output hotlist.json path (defaults beside --output)")
    parser.add_argument("--hotlist-only", action="store_true", help="Refresh only hotlist.json and exit")
    parser.add_argument("--news-output", help="Output news.json path (defaults beside --output)")
    parser.add_argument("--news-only", action="store_true", help="Refresh only news.json and exit")
    parser.add_argument("--min-items", type=int, default=500, help="Safety threshold before overwriting")
    args = parser.parse_args()

    if args.hotlist_only or args.news_only:
        base_dir = os.path.dirname(os.path.abspath(args.output)) if args.output else ""
        if args.hotlist_only:
            hl_path = args.hotlist_output or (os.path.join(base_dir, "hotlist.json") if base_dir else "")
            if not hl_path:
                parser.error("--hotlist-output or --output is required with --hotlist-only")
            fetch_and_write_hotlist(hl_path)
        if args.news_only:
            news_path = args.news_output or (os.path.join(base_dir, "news.json") if base_dir else "")
            if not news_path:
                parser.error("--news-output or --output is required with --news-only")
            fetch_and_write_news(news_path)
        refresh_sitemap_lastmod(args.hotlist_output or args.news_output or args.output)
        return

    if not args.output:
        parser.error("--output is required unless --hotlist-only or --news-only is specified")

    out_dir = os.path.dirname(os.path.abspath(args.output))
    hl_path = args.hotlist_output or os.path.join(out_dir, "hotlist.json")
    news_path = args.news_output or os.path.join(out_dir, "news.json")

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

    try:
        fetch_and_write_hotlist(hl_path)
    except Exception as e:
        print(f"[WARN] hotlist refresh failed: {e}")

    try:
        fetch_and_write_news(news_path)
    except Exception as e:
        print(f"[WARN] news refresh failed: {e}")

    refresh_sitemap_lastmod(args.output)


if __name__ == "__main__":
    main()
