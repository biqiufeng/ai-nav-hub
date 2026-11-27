#!/usr/bin/env python3
"""
Data Quality Deep-Water Governance Pipeline for AI Nav Hub (Zero 3rd-party dependencies).

Capabilities:
1. Persistent concurrent wrapper URL unwrapping (futuretools.link, futurepedia.io, ai.codefather.cn)
   using keep-alive HTTPS connection pools -> crawler/redirect_cache.json
2. FutureTools upstream metadata sync (pricing_tier, search_tags, categories) -> crawler/ft_meta_cache.json
3. Cross-source re-deduplication preserving existing canonical IDs (protecting user favorites)
4. Mojibake (UTF-8-as-Latin1) detection/repair, curated fixes, boilerplate stripping & sentence-boundary polish
5. Bilingual Chinese functional summary enrichment (0 pure-English blind spots) + standardized pricing tags
6. Accurate domestic vs overseas origin & mainland network accessibility classification (cn_native / overseas_direct / intl_network)
7. Concurrent DNS NXDOMAIN + parked-squatter dead-domain patrol -> crawler/dead_domains.json
"""
import argparse
import concurrent.futures
import datetime
import hashlib
import html
import http.client
import json
import os
import queue
import re
import socket
import ssl
import sys
import threading
import time
import urllib.parse
from collections import Counter

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REDIRECT_CACHE_PATH = os.path.join(SCRIPT_DIR, "redirect_cache.json")
FT_META_CACHE_PATH = os.path.join(SCRIPT_DIR, "ft_meta_cache.json")
DEAD_DOMAINS_PATH = os.path.join(SCRIPT_DIR, "dead_domains.json")

# Allow importing helpers from fetch_all.py whether invoked from repo root or crawler/
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)

from fetch_all import (  # noqa: E402
    CATEGORIES,
    SKIP_DOMAINS,
    UA,
    dedupe_key,
    domain_of,
    map_category,
    next_f_join,
    normalize_url,
)

WRAPPER_HOSTS = {
    "futuretools.link",
    "www.futuretools.link",
    "futuretools.io",
    "www.futuretools.io",
    "futurepedia.io",
    "www.futurepedia.io",
    "ai.codefather.cn",
    "producthunt.com",
    "www.producthunt.com",
}

PARKED_SQUATTER_HOSTS = {
    "hugedomains.com",
    "www.hugedomains.com",
    "dan.com",
    "www.dan.com",
    "sedo.com",
    "www.sedo.com",
    "afternic.com",
    "www.afternic.com",
    "bodis.com",
    "parkingcrew.net",
    "sedoparking.com",
    "forsale.godaddy.com",
    "sav.com",
    "squadhelp.com",
    "atom.com",
}

PARKED_HOST_PREFIX_RE = re.compile(r"^ww\d+\.", re.I)

# Known overseas services requiring international network in mainland China
INTL_NETWORK_DOMAINS = {
    "openai.com", "chatgpt.com", "sora.com",
    "claude.ai", "anthropic.com",
    "gemini.google.com", "aistudio.google.com", "labs.google", "notebooklm.google",
    "notebooklm.google.com", "bard.google.com", "google.com", "deepmind.google",
    "midjourney.com", "perplexity.ai", "poe.com", "character.ai",
    "huggingface.co", "x.ai", "grok.com", "meta.ai", "llama.meta.com",
    "copilot.microsoft.com", "bing.com",
    "ideogram.ai", "civitai.com", " suno.com", "suno.com", "udio.com",
    "elevenlabs.io", "heygen.com", "runwayml.com", "pika.art", "luma.ai", "lumalabs.ai",
    "replicate.com", "vercel.com", "v0.dev", "bolt.new", "lovable.dev", "replit.com",
    "reddit.com", "medium.com", "substack.com", "quora.com",
    "chrome.google.com", "chromewebstore.google.com", "play.google.com",
}

# Verified Chinese domestic / mainland-native AI & tech product root domains (non-.cn TLDs)
DOMESTIC_NON_CN_ROOTS = {
    "deepseek.com", "kimi.com", "doubao.com", "jianying.com", "klingai.com", "kuaishou.com",
    "aliyun.com", "tongyi.ai", "qianwen.com", "alibaba.com", "alipay.com", "dingtalk.com",
    "baidu.com", "baidubce.com", "bcebos.com",
    "qq.com", "tencent.com", "tencentcloud.com", "weixin.qq.com", "weiyun.com",
    "volcengine.com", "bytedance.com", "feishu.cn", "coze.com",
    "minimaxi.com", "hailuoai.com", "talkie-ai.com",
    "baichuan-ai.com", "01.ai", "lingyiwanwu.com", "stepfun.com",
    "360.com", "so.com", "n.cn",
    "meitu.com", "whee.com", "meipai.com",
    "gaoding.com", "chuangkit.com", "meijian.com", "mastergo.com", "js.design",
    "modao.cc", "processon.com", "flomoapp.com", "yuque.com", "csdn.net",
    "oschina.net", "gitee.com", "wenxiaobai.com", "liblib.art", "tusiart.com",
    "iflytek.com", "sensetime.com", "zhihu.com", "bilibili.com", "weibo.com",
    "xiaohongshu.com", "163.com", "126.com", "youdao.com", "netease.com",
    "wps.com", "kingsoft.com", "xmind.app", "xmind.cn", "immersivetranslate.com",
    "Monica.im", "ihuiwa.com", "tool.lu", "aigei.com", "ibaotu.com", "58pic.com",
    "huaban.com", "zcool.com.cn", "uisdc.com", "topbook.cc", "sspai.com", "36kr.com",
    "huxiu.com", "geekpark.net", "infoq.cn", "qbitai.com", "jiqizhixin.com",
    "streamlake.com", "docwrite.cn", "milvzn.com", "niumianoffer.com", "lipind.com",
    "meyo123.com", "longcat.chat", "gwb666.com", "tiangong.cn", "kunlun.com",
    "hunyuan.tencent.com", "yuanbao.tencent.com", "ima.qq.com", "effidit.qq.com",
    "skywork.ai", "hiascend.com", "huawei.com", "huaweicloud.com", "honor.com",
    "xiaomi.com", "mi.com", "oppo.com", "vivo.com", "jd.com", "meituan.com",
    "sankuai.com", "ctrip.com", "didiglobal.com", "kujiale.com", "manycore.com",
    "shimo.im", "wolai.com", "flowus.cn", "baklib.com", "apifox.com", "eolink.com",
    "authing.cn", "finclip.com", "sealos.io", "sealos.run", "laf.run", "1panel.cn",
    "halo.run", "fit2cloud.com", "dataease.io", "metersphere.io", "maxkb.cn",
    "fastgpt.in", "fastgpt.io", "lobehub.com", "cherry-ai.com", "chatboxai.app",
    "nextchat.dev", "oneapi.pro", "siliconflow.com",
}

# Known global/overseas root domains that Chinese directories frequently co-list
KNOWN_OVERSEAS_ROOTS = INTL_NETWORK_DOMAINS | {
    "github.com", "github.io", "gitlab.com", "bitbucket.org",
    "microsoft.com", "visualstudio.com", "azure.com", "office.com", "live.com",
    "apple.com", "icloud.com", "amazon.com", "aws.amazon.com",
    "adobe.com", "figma.com", "canva.com", "notion.so", "notion.com", "slack.com",
    "zoom.us", "airtable.com", "zapier.com", "make.com", "n8n.io",
    "cursor.com", "cursor.sh", "windsurf.com", "codeium.com", "tabnine.com",
    "jetbrains.com", "sourcegraph.com", "linear.app", "raycast.com", "warp.dev",
    "supabase.com", "cloudflare.com", "netlify.com", "render.com", "railway.app",
    "fly.io", "heroku.com", "digitalocean.com", "docker.com", " postman.com",
    "copyleaks.com", "consensus.app", "writer.com", "grammarly.com", "quillbot.com",
    "jasper.ai", "copy.ai", "writesonic.com", "rytr.me", "wordtune.com",
    "deepl.com", "otter.ai", "fireflies.ai", "tldv.io", "fathom.video",
    "gamma.app", "tome.app", "beautiful.ai", "pitch.com", "miro.com",
    "synthesia.io", "descript.com", "kapwing.com", "veed.io", "opus.pro", "invideo.io",
    "fliki.ai", "murf.ai", "speechify.com", "play.ht", "lovo.ai",
    "leonardo.ai", "clipdrop.co", "remove.bg", "photoroom.com", "cutout.pro",
    "krea.ai", "playground.com", "recraft.ai", "magnific.ai", "spline.design",
    "framer.com", "webflow.com", "wix.com", "shopify.com", "stripe.com",
    "producthunt.com", "futuretools.io", "futurepedia.io", "theresanaiforthat.com",
    "arxiv.org", "semanticscholar.org", "connectedpapers.com", "elicit.com",
    "scispace.com", "typeset.io", "chatpdf.com", "humata.ai",
    "langchain.com", "llamaindex.ai", "crewai.com", "autogen", "cohere.com",
    "mistral.ai", "groq.com", "together.ai", "fireworks.ai", "openrouter.ai",
    "anyscale.com", "modal.com", "runpod.io", "vast.ai", "lambda.ai", " pinecone.io",
    "weaviate.io", "qdrant.tech", "milvus.io", "chroma", "kaggle.com",
    "coursera.org", "edx.org", "udemy.com", "fast.ai", "deeplearning.ai",
    "poki.com", "crazygames.com", "itch.io", "steampowered.com", "freesound.org",
    "pixabay.com", "unsplash.com", "pexels.com", "freepik.com",
    "convertio.co", "ilovepdf.com", "smallpdf.com", "tinypng.com",
}

# Curated clean names & complete descriptions for the 17 Mojibake-corrupted entries + flagship tools
CURATED_FIXES = {
    "creao.ai": (
        "CREAO",
        "CREAO 是创新的零代码 AI 应用开发平台，支持通过自然语言描述快速构建、调试并发布完整的全栈 AI Web 应用与业务工具。",
    ),
    "digen.ai": (
        "Digen AI",
        "Digen AI 是一站式多模态 AI 视频创作平台，集成主流视频生成大模型与超写实数字人驱动能力，支持多语种口播与短视频批量生成。",
    ),
    "highreach.ai": (
        "HighReach",
        "HighReach 是面向品牌营销与电商增长的 AI 创意生成平台，支持产品广告视频、商业视觉海报与虚拟数字人素材的一站式制作。",
    ),
    "kevvee.com": (
        "Kevvee",
        "Kevvee 是面向出海品牌的 AI 内容营销与 GTM 增长策略智能体（Agent），自动化完成海外社媒选题、本土化脚本创作与投放洞察。",
    ),
    "lobsterai.youdao.com": (
        "LobsterAI",
        "LobsterAI 是网易有道推出的全场景个人办公助理 Agent，支持文档深度处理、日程任务编排、跨软件协同与本地自动化执行。",
    ),
    "lovtalent.com": (
        "LovTalent（小麦招聘）",
        "LovTalent（小麦招聘）是 AI 原生智能招聘与人才寻访平台，支持自然语言解析岗位画像、全球人才精准匹配与自动化候选人沟通评估。",
    ),
    "marble.worldlabs.ai": (
        "Marble",
        "Marble 是李飞飞创立的 World Labs 推出的 3D 空间智能世界生成平台，支持从单张图片或简短文本直接构建可交互漫游的精细 3D 场景。",
    ),
    "streamlake.com": (
        "StreamLake",
        "StreamLake 是快手旗下 B2B 音视频与 AI 技术品牌，提供智能视频编码、画质超分增强、AIGC 内容生产引擎与行业媒体云解决方案。",
    ),
    "docwrite.cn": (
        "华文笔杆",
        "华文笔杆是专为政企办公与文字工作者打造的 AI 公文写作平台，覆盖通知、报告、总结、讲话稿等标准公文体裁的智能起草、润色与格式校对。",
    ),
    "wulv.milvzn.com": (
        "吾律AI律师",
        "吾律AI律师是幂律智能推出的专业法律大模型服务助手，提供合同起草与风险审查、法律法规案例检索、法律文书撰写及合规咨询支持。",
    ),
    "niumianoffer.com": (
        "牛面AI面试",
        "牛面AI面试是面向互联网研发、产品与校招求职者的 AI 模拟面试训练平台，支持岗位真题追问、代码与项目复盘评估及针对性答题优化。",
    ),
    "ai.lipind.com": (
        "理聘AI",
        "理聘AI是青塔推出的科研与高层次人才 AI 求职智能体，面向硕博群体提供高校教职、科研院所与头部研发岗位的精准匹配与申报辅助。",
    ),
    "meyo123.com": (
        "觅游（Meyo）",
        "觅游（Meyo）是美团推出的 AI 原生智能体（Agent）互动与生活发现社区，汇聚实用效率助手、趣味角色互动与个性化场景推荐服务。",
    ),
    "miantuan.knowfuture.com.cn": (
        "面团AI",
        "面团AI是面向求职者的智能面试辅导与模拟演练工具，能够结合简历与目标岗位 JD 实时生成高分回答思路、追问模拟与复盘建议。",
    ),
    "longcat.chat": (
        "LongCat开放平台",
        "LongCat开放平台是美团 LongCat 大模型团队推出的推理与生成模型服务平台，面向开发者提供高性价比 API 接口、长文本理解与工具调用能力。",
    ),
    "skildart.cn": (
        "SkildArt",
        "SkildArt 是一站式商业营销 AI 视觉创作平台，支持电商商品图换景、AI 模特试衣、品牌海报生成与多尺寸营销素材批量出图。",
    ),
    "gwb666.com": (
        "公文宝",
        "公文宝是面向政务与企事业单位场景的 AI 公文辅助写作工具，内置丰富法定公文与事务文书模板，支持大纲拟定、材料扩写与规范审校。",
    ),
}

# Curated pricing overrides for flagship tools
CURATED_PRICING = {
    "deepseek.com": "完全免费",
    "chat.deepseek.com": "完全免费",
    "doubao.com": "完全免费",
    "yuanbao.tencent.com": "完全免费",
    "ima.qq.com": "完全免费",
    "metaso.cn": "完全免费",
    "zhida.zhihu.com": "完全免费",
    "tongyi.aliyun.com": "完全免费",
    "qianwen.com": "完全免费",
    "chatglm.cn": "免费额度",
    "kimi.com": "免费额度",
    "kimi.moonshot.cn": "免费额度",
    "coze.cn": "免费额度",
    "dify.ai": "开源免费",
    "lmarena.ai": "完全免费",
    "chat.lmsys.org": "完全免费",
    "notebooklm.google": "完全免费",
    "notebooklm.google.com": "完全免费",
    "aistudio.google.com": "免费额度",
    "gemini.google.com": "免费额度",
    "chatgpt.com": "免费额度",
    "openai.com": "免费额度",
    "claude.ai": "免费额度",
    "perplexity.ai": "免费额度",
    "grok.com": "免费额度",
    "cursor.com": "免费额度",
    "windsurf.com": "免费额度",
    "v0.dev": "免费额度",
    "bolt.new": "免费额度",
    "lovable.dev": "免费额度",
    "midjourney.com": "付费订阅",
    "sora.com": "付费订阅",
    "heygen.com": "免费额度",
    "synthesia.io": "付费订阅",
    "elevenlabs.io": "免费额度",
    "suno.com": "免费额度",
    "udio.com": "免费额度",
    "klingai.com": "免费额度",
    "jimeng.jianying.com": "免费额度",
    "gamma.app": "免费额度",
    "canva.com": "免费额度",
    "canva.cn": "免费额度",
    "effidit.qq.com": "完全免费",
    "wenxiaobai.com": "完全免费",
}

FT_PRICING_MAP = {
    "free": "完全免费",
    "open source": "开源免费",
    "open-source": "开源免费",
    "github": "开源免费",
    "freemium": "免费额度",
    "free trial": "免费额度",
    "free-trial": "免费额度",
    "paid": "付费订阅",
    "contact for pricing": "付费订阅",
    "deals": "付费订阅",
}

# Granular FutureTools / ProductHunt tag -> Chinese capability label
EN_TAG_TO_ZH = {
    "automation & agents": "自动化与智能体",
    "automation-agents": "自动化与智能体",
    "ai agents": "自主智能体",
    "generative code": "AI 代码生成与编程开发",
    "generative-code": "AI 代码生成与编程开发",
    "code assistant": "智能代码补全与重构",
    "generative art": "AI 视觉艺术与文生图创作",
    "generative-art": "AI 视觉艺术与文生图创作",
    "generative video": "AI 视频生成与剪辑制作",
    "generative-video": "AI 视频生成与剪辑制作",
    "video editing": "智能视频剪辑与后期包装",
    "video-editing": "智能视频剪辑与后期包装",
    "copywriting": "营销文案与爆款内容撰写",
    "marketing": "数字营销增长与获客自动化",
    "productivity": "办公提效与日常工作流自动化",
    "chat": "智能对话问答与在线助手",
    "research": "文献深度检索与智能调研分析",
    "text-to-speech": "超拟真语音合成（TTS）与配音",
    "speech-to-text": "高精度语音转写（ASR）与会议纪要",
    "voice modulation": "AI 变声、声音克隆与音频处理",
    "voice-modulation": "AI 变声、声音克隆与音频处理",
    "music": "AI 原创音乐作曲与编曲配乐",
    "podcasting": "播客录制剪辑与音质增强",
    "image improvement": "图片超分放大、去背景与画质修复",
    "image-improvement": "图片超分放大、去背景与画质修复",
    "image scanning": "OCR 图文识别与视觉信息提取",
    "avatar": "虚拟数字人形象与定制头像生成",
    "gaming": "游戏资产制作与智能 NPC 交互",
    "finance": "智能财务分析、记账与投研洞察",
    "self-improvement": "个人成长规划、学习与效率习惯",
    "for fun": "创意娱乐互动与趣味生成体验",
    "inspiration": "创意灵感探索与设计参考",
    "prompt guides": "大模型提示词（Prompt）优化与模板",
    "translation": "多语种精准机器翻译与本地化",
    "social media": "社交媒体内容策划与多平台分发",
    "social-media": "社交媒体内容策划与多平台分发",
    "ai detection": "AIGC 内容真实性检测与原创校验",
    "ai-detection": "AIGC 内容真实性检测与原创校验",
    "no-code": "零代码应用搭建与可视化工作流",
    "website builders": "AI 一键建站与落地页设计",
    "seo": "搜索引擎优化（SEO）与内容排名增长",
    "sales": "销售线索挖掘、外呼辅助与客户转化",
    "customer support": "7×24 小时智能客服与知识库问答",
    "e-commerce": "电商商品图精修、选品与详情页生成",
    "3d": "3D 模型生成、材质贴图与场景渲染",
    "presentations": "AI 幻灯片（PPT）一键排版与演示设计",
    "spreadsheets": "电子表格公式生成与数据可视化",
    "legal": "合同智能审查与法律文书辅助",
    "recruiting": "简历智能筛选与招聘面试评估",
    "healthcare": "医疗健康科普与临床科研辅助",
    "education": "个性化学习辅导、题库解析与课程备课",
}

# English keyword -> Chinese functional phrase dictionary for translating pure-EN taglines
EN_CONCEPT_RULES = [
    (r"\b(no[- ]code|low[- ]code)\b", "零代码/低代码开发"),
    (r"\b(build|create|generate)\s+(websites?|landing pages?|web apps?)\b", "快速生成网站与 Web 应用"),
    (r"\b(text[- ]to[- ]video|generate videos?|video generator)\b", "文生视频与动态短片创作"),
    (r"\b(video editing|edit videos?|short clips?|reels|shorts|tiktok)\b", "短视频智能剪辑与高光切片"),
    (r"\b(text[- ]to[- ]image|image generator|generate images?|ai art)\b", "高精度文生图与视觉创意生成"),
    (r"\b(background remov\w+|remove background)\b", "一键智能抠图与背景替换"),
    (r"\b(upscal\w+|enhance\s+(?:photo|image|video))\b", "画质无损超分放大与清晰度修复"),
    (r"\b(headshots?|portraits?|avatars?)\b", "AI 职业形象照与个性化数字人头像生成"),
    (r"\b(logo|brand identity|branding)\b", "品牌 Logo 与视觉识别设计"),
    (r"\b(3d\s+models?|text[- ]to[- ]3d|3d\s+assets?)\b", "3D 模型与三维资产快速生成"),
    (r"\b(text[- ]to[- ]speech|\btts\b|voiceover|voice cloning|realistic voices?)\b", "超拟真配音合成与声音克隆"),
    (r"\b(transcri\w+|speech[- ]to[- ]text|meeting notes?|minutes)\b", "音视频转写与智能会议纪要总结"),
    (r"\b(music|songs?|melod\w+|beats?|stems?|audio)\b", "AI 音乐作曲、伴奏分离与音频处理"),
    (r"\b(podcast\w*)\b", "播客录制剪辑与内容分发"),
    (r"\b(code\s+review|pull requests?|debugging|unit tests?|refactor\w*)\b", "代码审查、重构调试与自动化测试"),
    (r"\b(ide|coding assistant|autocomplete|code generation|software engineer\w*)\b", "智能编程开发与代码生成"),
    (r"\b(\bsql\b|database|queries)\b", "自然语言转 SQL 与数据库查询分析"),
    (r"\b(\bapi\b|sdk|serverless|cloud|devops|deploy\w*)\b", "开发者 API 集成与云端部署运维"),
    (r"\b(ai\s+agents?|autonomous|multi[- ]agent|workflows?|automat\w+)\b", "自主智能体（Agent）与跨平台工作流自动化"),
    (r"\b(customer\s+support|helpdesk|live\s+chat|chatbot)\b", "智能客服机器人与知识库自动应答"),
    (r"\b(\bseo\b|blog\s+posts?|articles?|content\s+marketing|keyword)\b", "SEO 文章创作与内容营销增长"),
    (r"\b(copywriting|ad\s+copy|product\s+descriptions?|marketing\s+copy)\b", "高转化广告文案与商品详情撰写"),
    (r"\b(social\s+media|linkedin|twitter|instagram|youtube|scheduled?\s+posts?)\b", "社媒内容策划、图文生成与定时分发"),
    (r"\b(emails?|cold\s+outreach|newsletter|inbox)\b", "智能邮件撰写、收件箱摘要与外联触达"),
    (r"\b(\bcrm\b|leads?|sales|prospect\w*|outreach)\b", "销售线索挖掘与客户关系跟进转化"),
    (r"\b(presentations?|slides?|pitch\s+decks?|powerpoint|\bppt\b)\b", "AI 演示文稿（PPT）与路演幻灯片生成"),
    (r"\b(spreadsheets?|excel|google\s+sheets|csv|data\s+analysis|dashboards?)\b", "电子表格处理、数据分析与可视化看板"),
    (r"\b(\bpdf\b|documents?|chat\s+with\s+pdf|summariz\w+)\b", "PDF 长文档解析、智能问答与核心摘要提炼"),
    (r"\b(research|academic|papers?|literature|citations?)\b", "学术论文检索、文献综述与引文溯源"),
    (r"\b(resumes?|\bcv\b|cover\s+letters?|job\s+search|interview\w*)\b", "简历优化定制、求职匹配与模拟面试辅导"),
    (r"\b(recruit\w*|hiring|candidates?|talent)\b", "智能人才筛选与招聘流程提效"),
    (r"\b(legal|contracts?|compliance|lawyers?)\b", "合同风险审查与法律合规辅助"),
    (r"\b(finance|accounting|bookkeeping|stocks?|trading|investing|tax)\b", "财务核算分析、税务处理与投研数据洞察"),
    (r"\b(e[- ]?commerce|shopify|amazon\s+sellers?|product\s+photos?)\b", "电商商品视觉制作与店铺运营提效"),
    (r"\b(translat\w+|multilingual|localization|dubbing)\b", "多语种精准翻译、视频译制与本地化"),
    (r"\b(flashcards?|quizzes|tutor\w*|study|learning|courses?|students?)\b", "个性化学习辅导、知识卡片生成与备考训练"),
    (r"\b(mind\s*maps?|brainstorm\w*|whiteboard|notes?|note[- ]taking|knowledge\s+base)\b", "思维导图构建、笔记整理与第二大脑知识库"),
    (r"\b(detect\w*\s+ai|plagiarism|humaniz\w*)\b", "AIGC 文本检测、原创性校验与表达自然化"),
    (r"\b(prompts?|prompt\s+engineering)\b", "提示词（Prompt）工程调优与灵感库"),
    (r"\b(interior\s+design|architecture|floor\s+plans?|real\s+estate|staging)\b", "室内家装效果图渲染与建筑空间设计"),
    (r"\b(fashion|virtual\s+try[- ]on|outfits?|clothing)\b", "AI 虚拟试衣与服装时尚设计"),
    (r"\b(health|fitness|mental\s+health|nutrition|medical|therapy)\b", "健康营养管理与身心状态辅助分析"),
    (r"\b(travel|itinerar\w*|trip\s+planner)\b", "智能旅行路线规划与定制出游攻略"),
]
COMPILED_CONCEPT_RULES = [(re.compile(pat, re.I), zh) for pat, zh in EN_CONCEPT_RULES]

CAT_DEFAULT_CAP_ZH = {
    "对话写作": ("智能对话问答与多场景文本创作", "日常问答、文案起草与资料归纳"),
    "编程开发": ("AI 辅助编程开发与工程提效", "代码补全、架构构建与开发者工具集成"),
    "图像设计": ("AI 视觉图像生成与智能平面设计", "创意生图、素材精修与品牌视觉设计"),
    "视频音频": ("AI 音视频生成、配音与多媒体创作", "短片制作、智能剪辑与语音音乐合成"),
    "办公效率": ("智能化日常办公与团队生产力提效", "文档总结、演示汇报与业务流程提速"),
    "Agent与自动化": ("自主 AI 智能体（Agent）与工作流编排", "多步任务自动执行与跨平台工具联动"),
    "学习知识库": ("AI 知识库检索、学术研究与技能学习", "文献精读、结构化笔记与深度学习辅导"),
    "划水摸鱼": ("数字影音娱乐、创意互动与休闲工具", "视听体验、在线小游戏与趣味工具探索"),
    "新品速递": ("新一代 AI 原生创新应用体验", "前沿大模型能力落地与个人效率探索"),
    "其他工具": ("垂直场景 AI 智能化辅助处理", "专业领域提效与在线自动化服务"),
}


def load_json_file(path, default):
    if not os.path.isfile(path):
        return default
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def save_json_atomic(path, data, indent=None):
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        if indent:
            json.dump(data, f, ensure_ascii=False, indent=indent)
        else:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)


# ---------- 1. Persistent Keep-Alive Wrapper URL Unwrapper ----------

class HostConnectionPool:
    """Thread-safe pool of keep-alive HTTPSConnection objects to a single host."""

    def __init__(self, host, timeout=7, max_size=36):
        self.host = host
        self.timeout = timeout
        self._pool = queue.Queue(maxsize=max_size)
        self._ctx = ssl.create_default_context()

    def _new_conn(self):
        return http.client.HTTPSConnection(self.host, timeout=self.timeout, context=self._ctx)

    def request_head_or_get(self, path, max_bytes=32768):
        conn = None
        try:
            conn = self._pool.get_nowait()
        except queue.Empty:
            conn = self._new_conn()

        headers = {
            "User-Agent": UA,
            "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
            "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
            "Connection": "keep-alive",
        }
        for attempt in range(2):
            try:
                conn.request("GET", path, headers=headers)
                resp = conn.getresponse()
                status = resp.status
                loc = resp.getheader("Location") or ""
                body = resp.read(max_bytes)
                # Drain remaining if small so keep-alive stays clean, else close & recreate next time
                if not resp.isclosed():
                    rem = resp.read(65536)
                    if len(rem) == 65536:
                        conn.close()
                        conn = None
                if conn is not None:
                    try:
                        self._pool.put_nowait(conn)
                    except queue.Full:
                        conn.close()
                return status, loc, body.decode("utf-8", "ignore")
            except Exception:
                try:
                    if conn:
                        conn.close()
                except Exception:
                    pass
                if attempt == 0:
                    conn = self._new_conn()
                else:
                    return 0, "", ""
        return 0, "", ""


META_REFRESH_RE = re.compile(
    r'<meta[^>]+http-equiv=["\']?refresh["\']?[^>]+content=["\'][^"\']*?\burl=([^"\'>\s]+)',
    re.I,
)
JS_LOC_RE = re.compile(
    r'(?:window\.location(?:\.href|\.replace)?)\s*(?:=|\()\s*["\'](https?://[^"\']+)["\']',
    re.I,
)
YUPI_EXT_RE = re.compile(r'"externalLink"\s*:\s*"(https?://[^"]+)"')
FP_EXT_RE = re.compile(r'href="(https?://(?!www\.futurepedia\.io)[^"]+)"', re.I)


def extract_target_from_wrapper(wrapper_url, status, location, html_body):
    dom = domain_of(wrapper_url)
    candidate = ""

    if status in (301, 302, 303, 307, 308) and location:
        candidate = urllib.parse.urljoin(wrapper_url, html.unescape(location.strip()))

    if not candidate and "futuretools.link" in dom:
        m = META_REFRESH_RE.search(html_body)
        if m:
            candidate = html.unescape(m.group(1).strip())
        if not candidate:
            jm = JS_LOC_RE.search(html_body)
            if jm:
                candidate = html.unescape(jm.group(1).strip())

    elif not candidate and dom == "ai.codefather.cn":
        joined = next_f_join(html_body) or html_body
        m = YUPI_EXT_RE.search(joined)
        if m:
            try:
                candidate = json.loads(f'"{m.group(1)}"')
            except Exception:
                candidate = m.group(1)

    elif not candidate and dom == "futurepedia.io":
        for m in FP_EXT_RE.finditer(html_body):
            u = html.unescape(m.group(1).strip())
            if "utm_source=futurepedia" in u or "ref=futurepedia" in u:
                candidate = u
                break
        if not candidate:
            for m in FP_EXT_RE.finditer(html_body):
                u = html.unescape(m.group(1).strip())
                d = domain_of(u)
                if d and d not in SKIP_DOMAINS and not any(
                    k in d for k in ("google", "gstatic", "twitter", "youtube", "linkedin", "discord", "facebook", "instagram", "tiktok")
                ):
                    candidate = u
                    break

    elif not candidate and dom == "futuretools.io":
        m = re.search(r'href="(https?://futuretools\.link/[^"]+)"', html_body)
        if m:
            return m.group(1)
        m2 = re.search(r'"(?:website_url|destination_url)":"(https?://[^"]+)"', html_body)
        if m2:
            candidate = html.unescape(m2.group(1))

    norm = normalize_url(candidate)
    if not norm:
        return ""
    target_dom = domain_of(norm)
    if not target_dom or target_dom in SKIP_DOMAINS:
        return ""
    if target_dom in WRAPPER_HOSTS and not ("futuretools.link" in dom and "producthunt.com" in target_dom):
        return ""
    return norm


def unwrap_wrapper_urls(urls, cache_path=REDIRECT_CACHE_PATH, max_workers=36):
    cache = load_json_file(cache_path, {})
    todo = []
    for u in urls:
        nu = normalize_url(u)
        if not nu:
            continue
        d = domain_of(nu)
        if d in ("futuretools.link", "ai.codefather.cn", "futurepedia.io", "futuretools.io") and nu not in cache:
            todo.append(nu)

    todo = sorted(set(todo))
    if not todo:
        print(f"[Unwrap] Cache hit 100% ({len(cache)} cached entries, 0 new requests needed).")
        return cache

    print(f"[Unwrap] Resolving {len(todo)} wrapper URLs using persistent keep-alive pools ({len(cache)} already cached)...")
    pools = {}
    pool_lock = threading.Lock()

    def get_pool(host):
        with pool_lock:
            if host not in pools:
                pools[host] = HostConnectionPool(host, timeout=8, max_size=max_workers)
            return pools[host]

    def resolve_one(u):
        p = urllib.parse.urlsplit(u)
        host = p.netloc
        path = p.path or "/"
        if p.query:
            path = f"{path}?{p.query}"
        max_b = 4096 if "futuretools.link" in host else 260000
        pool = get_pool(host)
        status, loc, body = pool.request_head_or_get(path, max_bytes=max_b)
        resolved = extract_target_from_wrapper(u, status, loc, body)
        # Handle two-hop futuretools.io -> futuretools.link -> real domain
        if resolved and "futuretools.link" in domain_of(resolved):
            p2 = urllib.parse.urlsplit(resolved)
            st2, loc2, bd2 = get_pool(p2.netloc).request_head_or_get(p2.path or "/", max_bytes=4096)
            resolved = extract_target_from_wrapper(resolved, st2, loc2, bd2)
        return u, resolved

    t0 = time.time()
    resolved_ok = 0
    done_cnt = 0
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        for u, target in ex.map(resolve_one, todo):
            done_cnt += 1
            # Store "" on permanent non-resolvable only if HTTP succeeded without link, else omit on network timeout
            if target:
                cache[u] = target
                resolved_ok += 1
            else:
                cache[u] = ""
            if done_cnt % 500 == 0 or done_cnt == len(todo):
                elapsed = time.time() - t0
                print(f"  [Unwrap] {done_cnt}/{len(todo)} processed ({resolved_ok} unwrapped) in {elapsed:.1f}s")
                save_json_atomic(cache_path, cache)

    save_json_atomic(cache_path, cache)
    return cache


# ---------- 2. FutureTools Upstream Metadata Sync (pricing_tier + search_tags + real URLs) ----------

def sync_futuretools_metadata(cache_path=FT_META_CACHE_PATH, redirect_cache_path=REDIRECT_CACHE_PATH, max_pages=210):
    meta_cache = load_json_file(cache_path, {})
    redir_cache = load_json_file(redirect_cache_path, {})

    pool = HostConnectionPool("www.futuretools.io", timeout=12, max_size=12)
    decoder = json.JSONDecoder()
    marker = '"tool":{"id":'

    def fetch_page(page):
        status, loc, raw_html = pool.request_head_or_get(f"/tools?page={page}", max_bytes=1500000)
        if status in (301, 302, 307, 308) and loc:
            p2 = urllib.parse.urlsplit(urllib.parse.urljoin("https://www.futuretools.io", loc))
            p_host = HostConnectionPool(p2.netloc, timeout=12, max_size=4)
            status, _, raw_html = p_host.request_head_or_get(
                f"{p2.path or '/'}{'?' + p2.query if p2.query else ''}", max_bytes=1500000
            )
        if status != 200 or not raw_html:
            return []
        joined = next_f_join(raw_html)
        pos = 0
        out = []
        while True:
            idx = joined.find(marker, pos)
            if idx == -1:
                break
            obj_start = idx + len('"tool":')
            try:
                tool, end_pos = decoder.raw_decode(joined, obj_start)
                pos = end_pos
                if isinstance(tool, dict) and tool.get("name"):
                    out.append(tool)
            except Exception:
                pos = obj_start + 1
        return out

    print(f"[FT-Meta] Syncing pricing_tier & tags from FutureTools (existing cache: {len(meta_cache)})...")
    t0 = time.time()
    wave = 10
    total_tools = 0
    for start in range(1, max_pages + 1, wave):
        pages = list(range(start, min(start + wave, max_pages + 1)))
        empty_pages = 0
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as ex:
            for tools in ex.map(fetch_page, pages):
                if not tools:
                    empty_pages += 1
                    continue
                for t in tools:
                    total_tools += 1
                    slug = (t.get("slug") or "").strip()
                    name_norm = re.sub(r"[^a-z0-9]+", "", (t.get("name") or "").lower())
                    w_url = normalize_url(t.get("website_url") or "")
                    d_url = normalize_url(t.get("destination_url") or "")
                    pricing_raw = str(t.get("pricing_tier") or "").strip().lower()
                    cats = [str(c.get("name") or "").strip() for c in (t.get("categories") or []) if isinstance(c, dict) and c.get("name")]
                    tags = [str(tg).strip() for tg in (t.get("search_tags") or []) if tg][:8]
                    entry = {
                        "pricing_tier": pricing_raw,
                        "categories": cats,
                        "tags": tags,
                    }
                    # Also opportunistically map futuretools.link -> real website if destination_url/website_url has real domain
                    real_u = ""
                    for cand in (d_url, w_url):
                        if cand and domain_of(cand) not in WRAPPER_HOSTS and domain_of(cand) not in SKIP_DOMAINS:
                            real_u = cand
                            break
                    if real_u:
                        entry["real_url"] = real_u
                        if w_url and "futuretools.link" in domain_of(w_url):
                            redir_cache[w_url] = real_u

                    for key in filter(None, [
                        f"dom:{domain_of(real_u)}" if real_u else "",
                        f"name:{name_norm}" if len(name_norm) >= 4 else "",
                    ]):
                        meta_cache[key] = {
                            "pricing_tier": pricing_raw,
                            "categories": cats[:3],
                            "tags": tags[:5],
                        }

        if start == 1 or (start - 1 + wave) % 40 == 0:
            print(f"  [FT-Meta] Scanned pages 1..{start + len(pages) - 1} -> {total_tools} tools in {time.time() - t0:.1f}s")
        if empty_pages == len(pages):
            break

    save_json_atomic(cache_path, meta_cache)
    save_json_atomic(redirect_cache_path, redir_cache)
    print(f"[FT-Meta] Saved {len(meta_cache)} lookup keys to {cache_path}.")
    return meta_cache


# ---------- 3. Mojibake Repair, Sentence Polish, Bilingual Enrichment & Pricing ----------

WRAPPER_PAREN_RE = re.compile(
    r"[（(](?:www\.)?(?:futuretools\.link|futuretools\.io|futurepedia\.io|ai\.codefather\.cn|producthunt\.com)[)）]"
)


def is_template_or_stub_desc(desc):
    d = (desc or "").strip()
    if len(d) < 8:
        return True
    if WRAPPER_PAREN_RE.search(d):
        return True
    if "是一款专注于" in d and ("的海外主流 AI 工具" in d or "的 AI 工具" in d):
        return True
    if "是一款面向「" in d and "场景的 AI 工具平台" in d:
        return True
    return False


def clean_wrapper_domain_mentions(desc, real_domain):
    if not desc:
        return ""
    if real_domain and real_domain not in WRAPPER_HOSTS:
        return WRAPPER_PAREN_RE.sub(f"（{real_domain}）", desc)
    return WRAPPER_PAREN_RE.sub("", desc)


def has_mojibake(text):
    if not text:
        return False
    latin_ext = sum(1 for c in text if "\u00c0" <= c <= "\u00ff")
    if latin_ext < 2:
        return False
    try:
        dec = text.encode("latin1", errors="ignore").decode("utf-8", errors="ignore")
        return sum(1 for c in dec if "\u4e00" <= c <= "\u9fff") >= 2
    except Exception:
        return False


def repair_mojibake(text):
    if not has_mojibake(text):
        return text
    try:
        dec = text.encode("latin1", errors="ignore").decode("utf-8", errors="ignore")
        if sum(1 for c in dec if "\u4e00" <= c <= "\u9fff") >= 2:
            return re.sub(r"\s+", " ", dec).strip()
    except Exception:
        pass
    return text


BOILERPLATE_SENTENCE_RE = re.compile(
    r"(?:产品背景方面，[^。！？]*[。！？]?|价格方面，未明确提及[^。！？]*[。！？]?|"
    r"产品的背景是[^。！？]*$|价格方面，推测[^。！？]*[。！？]?)"
)


def smart_polish_description(name, desc, max_len=175):
    d = repair_mojibake((desc or "").strip())
    if not d:
        return ""

    # Strip redundant leading "<Name>是什么 " pattern from domestic directories
    if name:
        esc_name = re.escape(name.strip())
        d = re.sub(rf"^{esc_name}\s*是什么[？?:\s，,。]*", "", d, flags=re.I).strip()
    d = re.sub(r"^[A-Za-z0-9\u4e00-\u9fff\-\s（）()]{1,28}是什么[？?:\s]+(?=[A-Za-z0-9\u4e00-\u9fff])", "", d).strip()

    # Remove AIbase machine-speculation filler clauses
    d = BOILERPLATE_SENTENCE_RE.sub("", d).strip()
    d = re.sub(r"\s+", " ", d).strip()
    if not d:
        return ""

    terminal_chars = set("。.!！?？）)】\"”'")
    has_zh = any("\u4e00" <= c <= "\u9fff" for c in d)

    # Detect if hard-truncated mid-sentence (either exceeds max_len OR >= 95 chars with no ending punctuation)
    needs_trim = len(d) > max_len or (len(d) >= 92 and d[-1] not in terminal_chars)
    if needs_trim:
        window = d[:max_len]
        # Prefer last full sentence terminator
        last_sent = max(window.rfind("。"), window.rfind("！"), window.rfind("？"), window.rfind(". "))
        if last_sent >= 36:
            d = window[: last_sent + 1].strip()
        else:
            # Fall back to last clause delimiter (，、；,) so we never cut mid-word like "生成技"
            last_clause = max(window.rfind("；"), window.rfind("，"), window.rfind("、"), window.rfind(", "))
            if last_clause >= 32:
                d = window[:last_clause].rstrip("，、；,; ") + ("。" if has_zh else ".")
            else:
                d = window.rstrip("，、；,;:： ") + ("。" if has_zh else ".")
    elif has_zh and len(d) >= 24 and d[-1] not in terminal_chars and not d[-1].isalnum():
        d = d.rstrip("，、；,;:： ") + "。"

    return d


def infer_pricing(item, ft_meta):
    dom = (item.get("domain") or "").lower()
    url = (item.get("url") or "").lower()
    if dom in CURATED_PRICING:
        return CURATED_PRICING[dom]
    for root, label in CURATED_PRICING.items():
        if dom.endswith("." + root):
            return label

    if dom in ("github.com", "gitee.com", "gitlab.com", "modelscope.cn") or "/github.com/" in url:
        return "开源免费"

    # Check FutureTools upstream pricing_tier
    name_norm = re.sub(r"[^a-z0-9]+", "", (item.get("name") or "").lower())
    for k in (f"url:{item.get('url', '')}", f"dom:{dom}", f"name:{name_norm}"):
        m = ft_meta.get(k)
        if m and m.get("pricing_tier"):
            mapped = FT_PRICING_MAP.get(m["pricing_tier"])
            if mapped:
                return mapped

    text = f"{item.get('name', '')} {item.get('description', '')}".lower()
    if re.search(r"(开源|open[- ]source|mit license|apache 2|self[- ]host|可本地部署|源码)", text):
        return "开源免费"
    if re.search(r"(完全免费|永久免费|免费无限制|100%\s*free|free forever|totally free|completely free|免费开源)", text):
        return "完全免费"
    if re.search(r"(免费试用|免费额度|免费版|免费体验|免费使用|freemium|free plan|free tier|free trial|start for free)", text):
        return "免费额度"
    if re.search(r"(付费订阅|按量计费|企业付费|paid plan|subscription)", text):
        return "付费订阅"
    if item.get("category") == "划水摸鱼":
        return "完全免费"
    return "免费额度"


def enrich_english_description(item, ft_meta):
    desc = (item.get("description") or "").strip()
    if len(desc) < 8 and not any("\u4e00" <= c <= "\u9fff" for c in desc):
        desc = ""
    if any("\u4e00" <= c <= "\u9fff" for c in desc):
        return desc

    name = (item.get("name") or "").strip()
    dom = (item.get("domain") or "").strip().lower()
    cat = item.get("category") or "其他工具"
    name_norm = re.sub(r"[^a-z0-9]+", "", name.lower())

    meta = (
        ft_meta.get(f"url:{item.get('url', '')}")
        or ft_meta.get(f"dom:{dom}")
        or ft_meta.get(f"name:{name_norm}")
        or {}
    )

    matched_caps = []
    # 1. Extract capabilities from English description & search tags via concept rules
    probe_text = f"{desc} {' '.join(meta.get('tags') or [])} {' '.join(meta.get('categories') or [])}"
    for rx, zh_phrase in COMPILED_CONCEPT_RULES:
        if rx.search(probe_text) and zh_phrase not in matched_caps:
            matched_caps.append(zh_phrase)
            if len(matched_caps) >= 2:
                break

    # 2. Supplement from FutureTools granular categories/tags
    if len(matched_caps) < 2:
        for raw_t in (meta.get("categories") or []) + (meta.get("tags") or []):
            tl = raw_t.strip().lower()
            if tl in EN_TAG_TO_ZH and EN_TAG_TO_ZH[tl] not in matched_caps:
                matched_caps.append(EN_TAG_TO_ZH[tl])
                if len(matched_caps) >= 2:
                    break

    default_cap, default_scene = CAT_DEFAULT_CAP_ZH.get(cat, CAT_DEFAULT_CAP_ZH["其他工具"])
    if matched_caps:
        cap_str = "与".join(matched_caps[:2])
    else:
        cap_str = default_cap

    clean_en = desc.rstrip()
    if clean_en and clean_en[-1] not in ".!?":
        clean_en += "."

    # Compose concise Chinese summary + original crisp English tagline within ~170 chars
    zh_prefix = f"{name} 是一款专注于{cap_str}的 AI 工具"
    if clean_en and len(clean_en) <= 105:
        combined = f"{zh_prefix}：{clean_en}"
    elif clean_en:
        short_en = clean_en[:92].rsplit(" ", 1)[0].rstrip(",;:") + "..."
        combined = f"{zh_prefix}（{short_en}）"
    else:
        combined = f"{zh_prefix}，适用于{default_scene}等场景。"
    return combined[:175]


# ---------- 4. Accurate Domestic vs Overseas Origin & Network Accessibility ----------

def _matches_domain_set(dom, domain_set):
    if not dom:
        return False
    if dom in domain_set:
        return True
    for root in domain_set:
        if dom.endswith("." + root):
            return True
    return False


DOMESTIC_SOURCES = {"ai-bot", "aibase", "yupi-ai", "ai-zhiku", "waytoagi", "baoboxs"}
OVERSEAS_SOURCES = {"futuretools", "futurepedia", "producthunt"}


def classify_origin_and_access(item):
    """
    Returns (true_region, regions_list, access_mode, cn_featured):
      - true_region: 'domestic' (genuinely Chinese mainland/native product) | 'overseas'
      - access_mode: 'cn_native' | 'overseas_direct' | 'intl_network'
      - cn_featured: bool (whether recommended by Chinese AI directories)
    """
    dom = (item.get("domain") or "").lower().strip()
    name = item.get("name") or ""
    srcs = set(item.get("sources") or [])
    has_cn_source = bool(srcs & DOMESTIC_SOURCES)
    has_ovs_source = bool(srcs & OVERSEAS_SOURCES)

    # 1. Explicit China TLDs or verified Chinese company root domains
    if (
        dom.endswith((".cn", ".com.cn", ".net.cn", ".org.cn", ".gov.cn", ".edu.cn"))
        or _matches_domain_set(dom, DOMESTIC_NON_CN_ROOTS)
    ):
        regs = ["domestic", "overseas"] if has_ovs_source else ["domestic"]
        return "domestic", regs, "cn_native", True

    # 2. Explicit known international-network-required domains
    if _matches_domain_set(dom, INTL_NETWORK_DOMAINS):
        return "overseas", ["overseas"], "intl_network", has_cn_source

    # 3. Explicit known global/overseas SaaS & developer domains
    if _matches_domain_set(dom, KNOWN_OVERSEAS_ROOTS):
        return "overseas", ["overseas"], "overseas_direct", has_cn_source

    # 4. Listed by overseas directories (FutureTools / Futurepedia / ProductHunt) -> overseas product
    if has_ovs_source:
        return "overseas", ["overseas"], "overseas_direct", has_cn_source

    # 5. Listed ONLY by Chinese directories: check if name is Chinese or Chinese-operated vs pure English global SaaS
    has_zh_name = any("\u4e00" <= c <= "\u9fff" for c in name)
    desc = item.get("description") or ""
    mentions_cn_company = bool(
        re.search(
            r"(阿里|腾讯|百度|字节|快手|美团|网易|华为|科大讯飞|智谱|月之暗面|商汤|百川|零一万物|"
            r"阶跃星辰|昆仑万维|蚂蚁|小红书|哔哩哔哩|知乎|京东|金山|美图|有道|360|国产|国内团队|自研大模型|备案)",
            desc,
        )
    )
    if has_zh_name or mentions_cn_company or item.get("category") == "划水摸鱼":
        return "domestic", ["domestic"], "cn_native", True

    return "overseas", ["overseas"], "overseas_direct", has_cn_source


# ---------- 5. Dead-Link & Parked-Domain Patrol ----------

SAFE_SKIP_PATROL_ROOTS = DOMESTIC_NON_CN_ROOTS | KNOWN_OVERSEAS_ROOTS


def patrol_dead_domains(domains, cache_path=DEAD_DOMAINS_PATH, max_workers=64):
    cache = load_json_file(cache_path, {"dead": [], "checked_ok": []})
    dead_set = set(cache.get("dead") or [])
    ok_set = set(cache.get("checked_ok") or [])

    todo = []
    for d in sorted(set(domains)):
        if not d or "." not in d:
            continue
        if PARKED_HOST_PREFIX_RE.match(d) or _matches_domain_set(d, PARKED_SQUATTER_HOSTS):
            dead_set.add(d)
            continue
        if d.endswith(".cn") or _matches_domain_set(d, SAFE_SKIP_PATROL_ROOTS) or d in WRAPPER_HOSTS:
            ok_set.add(d)
            continue
        if d not in dead_set and d not in ok_set:
            todo.append(d)

    if not todo:
        print(f"[Patrol] Domain health cache warm ({len(dead_set)} dead/parked, {len(ok_set)} alive).")
        return dead_set

    print(f"[Patrol] Checking DNS liveness across {len(todo)} unique domains ({max_workers} threads)...")
    t0 = time.time()
    newly_dead = []

    def check_dns(dom):
        for attempt in range(2):
            try:
                socket.getaddrinfo(dom, 443, proto=socket.IPPROTO_TCP)
                return dom, True
            except socket.gaierror as e:
                # EAI_NONAME (8 on macOS, -2 on Linux) = definitive NXDOMAIN
                if e.errno in (socket.EAI_NONAME, getattr(socket, "EAI_NODATA", -5)):
                    if attempt == 0:
                        time.sleep(0.35)
                        continue
                    return dom, False
                # Temporary DNS timeout / EAI_AGAIN -> treat conservatively as alive (no false data loss!)
                return dom, True
            except Exception:
                return dom, True
        return dom, True

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as ex:
        for dom, alive in ex.map(check_dns, todo):
            if alive:
                ok_set.add(dom)
            else:
                dead_set.add(dom)
                newly_dead.append(dom)

    elapsed = time.time() - t0
    print(f"[Patrol] Checked {len(todo)} domains in {elapsed:.1f}s -> found {len(newly_dead)} expired NXDOMAIN dead domains.")
    save_json_atomic(
        cache_path,
        {
            "updated_at": datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(timespec="seconds"),
            "dead_count": len(dead_set),
            "dead": sorted(dead_set),
            "checked_ok": sorted(ok_set),
        },
    )
    return dead_set


# ---------- 6. End-to-End Governance Application on catalog.json ----------

def govern_catalog_dict(catalog, redirect_cache=None, ft_meta=None, dead_domains=None):
    redirect_cache = redirect_cache if redirect_cache is not None else load_json_file(REDIRECT_CACHE_PATH, {})
    ft_meta = ft_meta if ft_meta is not None else load_json_file(FT_META_CACHE_PATH, {})
    if dead_domains is None:
        dd_raw = load_json_file(DEAD_DOMAINS_PATH, {"dead": []})
        dead_domains = set(dd_raw.get("dead") or [])

    raw_items = catalog.get("items") or []
    stats_report = {
        "input_total": len(raw_items),
        "unwrapped_urls": 0,
        "merged_duplicates": 0,
        "dropped_dead_or_parked": 0,
        "repaired_mojibake": 0,
        "bilingual_enriched": 0,
    }

    # Pre-index existing official keys -> original ID so user localStorage favorites never break!
    canonical_id_by_key = {}
    for it in raw_items:
        u = normalize_url(it.get("url") or "")
        if u and domain_of(u) not in WRAPPER_HOSTS:
            k = dedupe_key(u)
            if k not in canonical_id_by_key and it.get("id"):
                canonical_id_by_key[k] = it["id"]

    merged = {}
    for orig in raw_items:
        it = dict(orig)
        orig_url = normalize_url(it.get("url") or "")
        if not orig_url:
            continue

        # 1. Unwrap wrapper URL if resolved
        final_url = orig_url
        if domain_of(orig_url) in WRAPPER_HOSTS:
            unwrapped = redirect_cache.get(orig_url) or ""
            if unwrapped:
                final_url = normalize_url(unwrapped) or orig_url
                if final_url != orig_url:
                    stats_report["unwrapped_urls"] += 1

        dom = domain_of(final_url)
        if not dom or dom in SKIP_DOMAINS:
            continue

        # 2. Drop parked squatter domains or verified NXDOMAIN dead domains
        if (
            PARKED_HOST_PREFIX_RE.match(dom)
            or _matches_domain_set(dom, PARKED_SQUATTER_HOSTS)
            or dom in dead_domains
        ):
            stats_report["dropped_dead_or_parked"] += 1
            continue

        it["url"] = final_url
        it["domain"] = dom

        # 3. Repair Mojibake in name/description & apply curated fixes
        if has_mojibake(it.get("name", "")) or has_mojibake(it.get("description", "")):
            stats_report["repaired_mojibake"] += 1
            it["name"] = repair_mojibake(it.get("name", ""))
            it["description"] = repair_mojibake(it.get("description", ""))

        if dom in CURATED_FIXES:
            c_name, c_desc = CURATED_FIXES[dom]
            it["name"] = c_name
            it["description"] = c_desc

        # Re-evaluate category if previously stuck in 其他工具
        if it.get("category") == "其他工具":
            re_cat = map_category("", it.get("name", ""), it.get("description", ""))
            if re_cat != "其他工具":
                it["category"] = re_cat

        key = dedupe_key(final_url)
        if key not in merged:
            keep_id = canonical_id_by_key.get(key) or it.get("id") or hashlib.sha1(key.encode("utf-8")).hexdigest()[:12]
            it["id"] = keep_id
            it["sources"] = list(dict.fromkeys(it.get("sources") or []))
            it["regions"] = list(dict.fromkeys(it.get("regions") or ([it["region"]] if it.get("region") else [])))
            merged[key] = it
        else:
            stats_report["merged_duplicates"] += 1
            cur = merged[key]
            for s in it.get("sources") or []:
                if s and s not in cur["sources"]:
                    cur["sources"].append(s)
            for rg in it.get("regions") or []:
                if rg and rg not in cur["regions"]:
                    cur["regions"].append(rg)
            if not cur.get("icon") and it.get("icon"):
                cur["icon"] = it["icon"]
            # Prefer clean Chinese name when available
            if any("\u4e00" <= c <= "\u9fff" for c in it.get("name", "")) and not any(
                "\u4e00" <= c <= "\u9fff" for c in cur.get("name", "")
            ):
                cur["name"] = it["name"][:60]
            # Prefer human-written Chinese description over template/stub or English description
            cur_d = cur.get("description") or ""
            inc_d = it.get("description") or ""
            cur_zh = any("\u4e00" <= c <= "\u9fff" for c in cur_d)
            inc_zh = any("\u4e00" <= c <= "\u9fff" for c in inc_d)
            cur_tmpl = is_template_or_stub_desc(cur_d)
            inc_tmpl = is_template_or_stub_desc(inc_d)
            should_replace_desc = False
            if cur_tmpl and not inc_tmpl and (inc_zh or not cur_zh):
                should_replace_desc = True
            elif inc_zh and not cur_zh and not inc_tmpl:
                should_replace_desc = True
            elif cur_tmpl == inc_tmpl and inc_zh == cur_zh and len(inc_d) > len(cur_d):
                should_replace_desc = True
            if should_replace_desc and dom not in CURATED_FIXES:
                cur["description"] = inc_d
            if cur.get("category") == "其他工具" and it.get("category") and it["category"] != "其他工具":
                cur["category"] = it["category"]
            cur["score"] = max(cur.get("score") or 0, it.get("score") or 0)

    # Stage 2: Merge remaining wrapper-hosted items (where external link wasn't available) into unique exact-name official item
    official_by_name = {}
    for k, cur in merged.items():
        if cur["domain"] in WRAPPER_HOSTS:
            continue
        nn = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", (cur.get("name") or "").lower())
        if len(nn) >= 4:
            official_by_name.setdefault(nn, []).append(k)

    for k in list(merged.keys()):
        cur = merged[k]
        if cur["domain"] not in WRAPPER_HOSTS:
            continue
        nn = re.sub(r"[^a-z0-9\u4e00-\u9fff]+", "", (cur.get("name") or "").lower())
        matches = official_by_name.get(nn, [])
        if len(matches) == 1:
            target = merged[matches[0]]
            for s in cur.get("sources") or []:
                if s not in target["sources"]:
                    target["sources"].append(s)
            if not target.get("icon") and cur.get("icon"):
                target["icon"] = cur["icon"]
            merged.pop(k, None)
            stats_report["merged_duplicates"] += 1

    # Stage 3: Enrich descriptions, pricing, origin/access & recompute consensus score
    final_items = []
    for item in merged.values():
        polished = smart_polish_description(
            item.get("name", ""),
            clean_wrapper_domain_mentions(item.get("description") or "", item.get("domain") or ""),
        )
        item["description"] = polished
        had_zh = any("\u4e00" <= c <= "\u9fff" for c in polished)
        if not had_zh or len(polished) < 10:
            if len(polished) < 10:
                item["description"] = ""
            item["description"] = smart_polish_description(
                item.get("name", ""), enrich_english_description(item, ft_meta)
            )
            stats_report["bilingual_enriched"] += 1
        item["pricing"] = infer_pricing(item, ft_meta)

        true_region, regs, access_mode, cn_featured = classify_origin_and_access(item)
        item["region"] = true_region
        item["regions"] = regs
        item["access_mode"] = access_mode
        if cn_featured and true_region == "overseas":
            item["cn_featured"] = True
        else:
            item.pop("cn_featured", None)

        # Recompute clean consensus score (multi-source boost + icon + rich desc)
        base_editorial = max(0, (item.get("score") or 100) % 100)
        item["score"] = (
            len(item["sources"]) * 100
            + min(65, base_editorial)
            + (8 if item.get("icon") else 0)
            + (6 if item["domain"] not in WRAPPER_HOSTS else -15)
        )
        final_items.append(item)

    final_items.sort(key=lambda x: (-x["score"], x["name"].lower()))

    cat_counts = Counter(i["category"] for i in final_items)
    pricing_counts = Counter(i.get("pricing", "免费额度") for i in final_items)
    access_counts = Counter(i.get("access_mode", "overseas_direct") for i in final_items)
    dom_count = sum(1 for i in final_items if "domestic" in i["regions"])
    ovs_count = sum(1 for i in final_items if "overseas" in i["regions"])
    real_icon_count = sum(1 for i in final_items if i.get("icon"))

    out_catalog = dict(catalog)
    out_catalog["generated_at"] = datetime.datetime.now(
        datetime.timezone(datetime.timedelta(hours=8))
    ).isoformat(timespec="seconds")
    out_catalog["categories"] = CATEGORIES
    prev_stats = dict(catalog.get("stats") or {})
    prev_stats.update({
        "total": len(final_items),
        "domestic": dom_count,
        "overseas": ovs_count,
        "with_icon": real_icon_count,
        "by_category": dict(cat_counts),
        "by_pricing": dict(pricing_counts),
        "by_access": dict(access_counts),
    })
    out_catalog["stats"] = prev_stats
    out_catalog["items"] = final_items
    stats_report["output_total"] = len(final_items)
    stats_report["domestic_native"] = dom_count
    stats_report["overseas_total"] = ovs_count
    stats_report["by_pricing"] = dict(pricing_counts)
    stats_report["by_access"] = dict(access_counts)
    return out_catalog, stats_report


def main():
    ap = argparse.ArgumentParser(description="Run AI Nav Hub Data Quality Governance Pipeline")
    ap.add_argument("--catalog", default="web/data/catalog.json", help="Path to catalog.json")
    ap.add_argument("--sync-ft-meta", action="store_true", help="Fetch FutureTools pricing_tier & tags cache")
    ap.add_argument("--unwrap", action="store_true", help="Unwrap wrapper URLs in catalog.json")
    ap.add_argument("--patrol", action="store_true", help="Run DNS NXDOMAIN & parked-domain patrol")
    ap.add_argument("--workers", type=int, default=36, help="Concurrency for HTTP/DNS workers")
    args = ap.parse_args()

    cat_path = os.path.abspath(args.catalog)
    catalog = load_json_file(cat_path, None)
    if not catalog or not catalog.get("items"):
        raise SystemExit(f"Catalog not found or empty: {cat_path}")

    if args.sync_ft_meta:
        sync_futuretools_metadata(FT_META_CACHE_PATH, REDIRECT_CACHE_PATH)

    if args.unwrap:
        urls = [it.get("url") or "" for it in catalog["items"]]
        unwrap_wrapper_urls(urls, REDIRECT_CACHE_PATH, max_workers=args.workers)

    # First pass unwrap mapping so DNS patrol checks real unwrapped domains!
    redir_cache = load_json_file(REDIRECT_CACHE_PATH, {})
    if args.patrol:
        real_domains = set()
        for it in catalog["items"]:
            u = normalize_url(it.get("url") or "")
            if domain_of(u) in WRAPPER_HOSTS and redir_cache.get(u):
                u = normalize_url(redir_cache[u]) or u
            d = domain_of(u)
            if d:
                real_domains.add(d)
        dead_domains = patrol_dead_domains(real_domains, DEAD_DOMAINS_PATH, max_workers=64)
    else:
        dead_domains = set(load_json_file(DEAD_DOMAINS_PATH, {"dead": []}).get("dead") or [])

    ft_meta = load_json_file(FT_META_CACHE_PATH, {})
    governed, report = govern_catalog_dict(catalog, redir_cache, ft_meta, dead_domains)
    save_json_atomic(cat_path, governed)
    print("[Governance Complete]", json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
