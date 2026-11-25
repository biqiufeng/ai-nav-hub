#!/usr/bin/env python3
"""
Multi-source AI navigation aggregator (zero third-party dependencies).
Fetches domestic & overseas AI tool directories, strips lazy-load placeholders,
normalizes, deduplicates, scores by consensus + editorial rank, and writes catalog.json atomically.
"""
import argparse
import base64
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
    "sourcepage", "ch",
}

SKIP_DOMAINS = {
    "ai-bot.cn", "www.ai-bot.cn",
    "aibase.com", "www.aibase.com",
    "ai-zhiku.com", "www.ai-zhiku.com",
    "waytoagi.com", "www.waytoagi.com",
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
        except Exception as e:
            last_err = str(e)
        if attempt < retries:
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(last_err or "fetch failed")


def strip_tags(raw):
    txt = re.sub(r"<[^>]+>", " ", raw or "")
    txt = html.unescape(txt)
    return re.sub(r"\s+", " ", txt).strip()


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
    if path in ("", "/zh", "/en", "/cn", "/index.html"):
        return host
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


def map_category(raw_cat, name="", desc=""):
    text = f"{raw_cat} {name} {desc}".lower()
    if has_word(text, ("agent", "agents", "智能体", "工作流", "workflow", "automation", "自动化", "mcp", "openclaw", "dify", "coze", "扣子")):
        return "Agent与自动化"
    if has_word(text, ("编程", "代码", "开发", "code", "coding", "generative code", "ide", "github", "cursor", "copilot", "sql", "api", "前端", "后端")):
        return "编程开发"
    if has_word(text, ("视频", "音频", "配音", "音乐", "剪辑", "数字人", "播客", "video", "audio", "music", "voice", "tts", "sora", "runway")):
        return "视频音频"
    if has_word(text, ("图像", "绘画", "画图", "设计", "修图", "海报", "logo", "3d", "image", "images", "generative art", "draw", "design", "midjourney", "flux", "figma")):
        return "图像设计"
    if has_word(text, ("办公", "ppt", "表格", "excel", "文档", "会议", "邮件", "简历", "效率", "生产力", "productivity", "slides", "notion")):
        return "办公效率"
    if has_word(text, ("对话", "聊天", "写作", "文案", "翻译", "总结", "搜索", "chat", "writing", "copywriting", "search", "llm", "gpt", "deepseek", "claude", "gemini", "kimi")):
        return "对话写作"
    if has_word(text, ("教程", "学习", "知识库", "prompt", "prompts", "提示词", "百科", "论文", "课程", "学术", "research", "study", "paper")):
        return "学习知识库"
    if has_word(text, ("新品", "producthunt", "新品速递")):
        return "新品速递"
    return "其他工具"


# ---------- Source parsers ----------

def parse_aibot():
    raw_html = fetch_text("https://ai-bot.cn/")
    tokens = re.split(r"(<h4[^>]*>.*?</h4>)", raw_html, flags=re.S)
    current_cat = ""
    items = []
    seen = set()
    rank = 0
    for part in tokens:
        if part.startswith("<h4"):
            current_cat = strip_tags(part)
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
    return items


def parse_aizhiku():
    raw_html = fetch_text("https://ai-zhiku.com/")
    items = []
    seen = set()
    rank = 0
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
        raw_cat = cat_m.group(1).replace("-", " ") if cat_m else ""
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
    return items


def parse_aibase():
    raw_html = fetch_text("https://www.aibase.com/zh/tools")
    items = []
    seen = set()
    rank = 0
    for m in re.finditer(r'<a[^>]+href="(https?://[^"]+)"[^>]*>(.*?)</a>', raw_html, re.S):
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
    return items


def parse_yupi_ai():
    raw_html = fetch_text("https://ai.codefather.cn/tool")
    raw_chunks = re.findall(r'self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)', raw_html, re.S)
    decoded_parts = []
    for c in raw_chunks:
        try:
            decoded_parts.append(json.loads(c))
        except Exception:
            pass
    joined = "".join(decoded_parts)
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


def parse_waytoagi():
    items = []
    seen = set()
    rank = 0
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
    xml_text = fetch_text("https://www.producthunt.com/feed")
    root = ET.fromstring(xml_text)
    ns = {"atom": "http://www.w3.org/2005/Atom"}
    items = []
    seen = set()
    rank = 0
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


FT_BADGE_SUFFIX = re.compile(
    r"\s+(?:Generative Code|Generative Art|Generative Video|Text-To-Video|Text-To-Speech|"
    r"Speech-To-Text|Productivity|Automation & Agents|Chat|Research|Marketing|Copywriting|"
    r"Music|Avatar|Social Media|Finance|For Fun|Self-Improvement|Gaming|Image Improvement|"
    r"Podcasting|Prompt Guides|Aggregators|Translation|Video Editing|Voice Modulation).*$",
    re.I,
)


def parse_futuretools():
    raw_html = fetch_text("https://www.futuretools.io/")
    items = []
    seen = set()
    rank = 0
    for m in re.finditer(r'<a[^>]+href="(/tools/[a-z0-9-]+)"[^>]*>(.*?)</a>', raw_html, re.S):
        slug_path = m.group(1)
        inner = m.group(2)
        txt = strip_tags(inner)
        txt = re.sub(r"^\d+\s+", "", txt).strip()
        if not txt or len(txt) < 2:
            continue
        url = f"https://www.futuretools.io{slug_path}"
        if url in seen:
            continue
        seen.add(url)
        rank += 1
        img_m = re.search(r'url=(https?%3A%2F%2F[^&"\s]+|https?://[^&"\s]+)', inner, re.I)
        icon = safe_icon_url(urllib.parse.unquote(img_m.group(1))) if img_m else ""
        clean_name = FT_BADGE_SUFFIX.sub("", txt).strip() or txt
        items.append({
            "name": clean_name[:60],
            "url": url,
            "description": f"FutureTools 精选海外 AI 工具：{txt}",
            "icon": icon,
            "raw_cat": txt,
            "source": "futuretools",
            "region": "overseas",
            "source_rank": rank,
        })
    return items


def parse_futurepedia():
    pages = [
        ("https://www.futurepedia.io/ai-tools/productivity", "办公效率"),
        ("https://www.futurepedia.io/ai-tools/code-assistant", "编程开发"),
        ("https://www.futurepedia.io/ai-tools/image-generators", "图像设计"),
        ("https://www.futurepedia.io/ai-tools/video-generators", "视频音频"),
        ("https://www.futurepedia.io/ai-tools/writing-generators", "对话写作"),
        ("https://www.futurepedia.io/ai-tools/automation-tools", "Agent与自动化"),
    ]
    items = []
    seen = set()
    rank = 0
    for page_url, fallback_cat in pages:
        try:
            raw_html = fetch_text(page_url, timeout=14)
        except Exception:
            continue
        for m in re.finditer(r'href="(https?://www\.futurepedia\.io)?(/tool/([a-z0-9-]+))"', raw_html):
            slug = m.group(3)
            url = f"https://www.futurepedia.io/tool/{slug}"
            if url in seen:
                continue
            seen.add(url)
            rank += 1
            ctx = raw_html[max(0, m.start() - 100):min(len(raw_html), m.end() + 700)]
            alt_m = re.search(r'alt="([^"]{2,60})"', ctx)
            p_m = re.search(r'<p[^>]*>([^<]{8,200})</p>', ctx)
            name = strip_tags(alt_m.group(1)) if alt_m else slug.replace("-", " ").title()
            name = re.sub(r"\s+logo$", "", name, flags=re.I).strip()
            desc = strip_tags(p_m.group(1)) if p_m else f"Futurepedia 收录的海外 AI 工具（{fallback_cat}）"
            icon = extract_best_img(ctx)
            items.append({
                "name": name,
                "url": url,
                "description": desc,
                "icon": icon,
                "raw_cat": fallback_cat,
                "source": "futurepedia",
                "region": "overseas",
                "source_rank": rank,
            })
        time.sleep(0.3)
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


def merge_and_build(raw_items, source_stats):
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
                "description": it["description"][:220],
                "icon": it["icon"],
                "category": cat,
                "region": it["region"],
                "regions": [it["region"]],
                "sources": [it["source"]],
                "min_rank": r,
            }
        else:
            cur = merged[key]
            if it["source"] not in cur["sources"]:
                cur["sources"].append(it["source"])
            if it["region"] not in cur["regions"]:
                cur["regions"].append(it["region"])
            if r < cur["min_rank"]:
                cur["min_rank"] = r
            if len(it["description"]) > len(cur["description"]):
                cur["description"] = it["description"][:220]
            if not cur["icon"] and it["icon"]:
                cur["icon"] = it["icon"]
            if it["region"] == "domestic" and any("\u4e00" <= c <= "\u9fff" for c in it["name"]):
                if not any("\u4e00" <= c <= "\u9fff" for c in cur["name"]):
                    cur["name"] = it["name"][:60]
            if cur["category"] == "其他工具" and cat != "其他工具":
                cur["category"] = cat

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
        "schedule": "每周一 04:00 自动爬取更新",
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
    parser.add_argument("--min-items", type=int, default=100, help="Safety threshold before overwriting")
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

    source_stats.extend([
        {"id": "taaft", "name": "There's An AI For That", "region": "overseas", "status": "ref_only", "count": 0, "note": "友链参考（HTTP 403 不绕过）"},
        {"id": "toolify", "name": "Toolify.ai", "region": "overseas", "status": "ref_only", "count": 0, "note": "友链参考（HTTP 403 不绕过）"},
    ])

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

    if os.path.exists(args.output):
        prev_tmp = os.path.join(out_dir, "catalog.prev.json.tmp")
        prev_path = os.path.join(out_dir, "catalog.prev.json")
        try:
            shutil.copy2(args.output, prev_tmp)
            os.replace(prev_tmp, prev_path)
        except Exception:
            pass

    os.replace(tmp_path, args.output)
    print(f"Atomically wrote {args.output}")


if __name__ == "__main__":
    main()
