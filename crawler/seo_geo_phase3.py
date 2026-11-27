#!/usr/bin/env python3
"""
SEO & GEO Phase 3 Extension Module for AI Nav Hub:
1. Flagship tool entity index (web/data/tool-slugs.json) for frontend modal & news entity linking
2. 12 High-Intent Workflow & Persona Landing Pages (/scene/<slug>/ + /scene/ hub)
3. ~60 High-Intent Head-to-Head Comparison Pages (/vs/<a-vs-b>/ + /vs/ hub)
4. Static SSR Pre-rendering + JSON-LD ItemList for /news/ and /moyu/ (zero empty JS shells for crawlers)
5. OpenAPI 3.1.0 specification (/openapi.json) for AI Agents & LLM tool-use discovery
"""
import html
import json
import os
import re
import urllib.parse


def esc(val):
    return html.escape(str(val or ""), quote=True)


SCENE_CONFIGS = [
    {
        "slug": "free-ai-tools",
        "title": "完全免费 AI 工具精选大全",
        "short_title": "完全免费精选",
        "eyebrow": "零付费门槛 · 实测可用",
        "desc": "严选全库标记为「完全免费」的高口碑国内外 AI 工具，涵盖智能搜索、大模型对话、文档处理、在线修图与效率百宝箱，无需绑定信用卡即可直接上手。",
        "keywords": "完全免费AI工具,免费AI网站,白嫖AI神器,免登录免费AI,零成本AI工具",
        "query_hint": "完全免费",
        "workflow_steps": [
            "日常检索与问答优先使用「秘塔AI搜索」「问小白」「DeepSeek」等零广告免费大模型入口；",
            "长文档阅读与知识整理搭配「ima.copilot」「知乎直答」「NotebookLM」免费构建个人知识库；",
            "生图与创意制作可组合开源社区或完全免费在线工具完成日常配图与修图。",
        ],
        "filter_fn": lambda it: it.get("pricing") == "完全免费",
    },
    {
        "slug": "open-source-ai",
        "title": "开源免费与可本地部署 AI 项目排行榜",
        "short_title": "开源可自部署",
        "eyebrow": "GitHub 高星 · 数据隐私可控",
        "desc": "汇总支持源码开放、Docker 一键自部署或本地离线运行的开源大模型、RAG 知识库、AI Agent 框架与开发工具，满足企业内网与个人隐私合规需求。",
        "keywords": "开源AI项目,本地部署大模型,开源AI工具,GitHub热门AI,私有化AI知识库",
        "query_hint": "开源免费",
        "workflow_steps": [
            "应用编排与私有知识库首选 Dify、MaxKB、FastGPT 等成熟开源工作流平台；",
            "模型推理与客户端可结合 Ollama、vLLM、Cherry Studio 或 LobeChat 打造全本地桌面工作台；",
            "研发团队可将开源代码审查与自动化测试 Agent 集成进内部 Git 流水线。",
        ],
        "filter_fn": lambda it: it.get("pricing") == "开源免费",
    },
    {
        "slug": "china-direct-ai",
        "title": "国内免翻墙直连 AI 工具排行榜 Top 100",
        "short_title": "国内免代理直连",
        "eyebrow": "国产原生 · 国内网络秒开",
        "desc": "精选国内团队自研及服务器原生部署的优质 AI 产品，无需任何国际网络代理即可在电脑与手机端高速直连访问，覆盖中文公文、编程、设计、视频与办公全场景。",
        "keywords": "国内AI工具,免翻墙AI网站,国产大模型排行榜,国内直连AI,中文AI导航",
        "query_hint": "国内直连",
        "workflow_steps": [
            "中文深度推理与联网调研推荐组合 DeepSeek、秘塔AI搜索、Kimi 与豆包；",
            "视觉与视频创作优先体验即梦AI、可灵AI、稿定AI与美图设计室，中文提示词理解更精准；",
            "办公协同可接入飞书智能伙伴、WPS AI 或腾讯元宝，无缝适配本土文档格式。",
        ],
        "filter_fn": lambda it: it.get("access_mode") == "cn_native",
    },
    {
        "slug": "academic-paper-ai",
        "title": "写论文、文献综述与学术科研 AI 工具全套",
        "short_title": "论文文献科研",
        "eyebrow": "真实引文溯源 · 拒绝虚构参考文献",
        "desc": "专为高校师生、硕博研究生与科研人员整理的学术 AI 工具箱，覆盖中英文文献语义检索、PDF 论文精读速览、实验数据分析、学术语法润色与 AIGC 合规检测。",
        "keywords": "AI写论文工具,文献检索AI,科研AI工具,论文润色降重,PDF论文阅读AI",
        "query_hint": "论文",
        "workflow_steps": [
            "开题与文献调研阶段：用秘塔AI搜索（学术模式）、Consensus、Elicit 或知乎直答获取带真实出处引用的研究综述；",
            "精读与笔记阶段：将核心英文 PDF 导入阅读总结工具，提炼实验方法、创新点与公式推导；",
            "成稿与合规自查：使用文涌 Effidit 等学术润色工具优化中英表达，并用 CopyLeaks 校验原创合规性。",
        ],
        "filter_fn": lambda it: bool(
            re.search(
                r"(论文|文献|学术|科研|研究|引文|知网|润色|查重|检测|scholar|academic|research|consensus|elicit|scispace|copyleaks|effidit|arxiv)",
                f"{it.get('name','')} {it.get('description','')} {it.get('domain','')}".lower(),
            )
        ),
    },
    {
        "slug": "indie-dev-stack",
        "title": "独立开发者与全栈编程 AI 效率工具栈",
        "short_title": "独立开发者全栈",
        "eyebrow": "从灵感到上线 · 10 倍研发提效",
        "desc": "面向全栈工程师、独立开发者（OPC）与技术创业者的 AI 研发武器库，涵盖 AI 原生 IDE、自然语言生成前端 UI、自动化代码审查、SQL 助手与零代码应用构建平台。",
        "keywords": "AI编程工具推荐,独立开发者工具栈,AI代码编辑器,零代码生成网站,Cursor平替",
        "query_hint": "编程",
        "workflow_steps": [
            "原型与 UI 打样：用 v0、Bolt.new 或零代码平台通过一句话快速生成可交互高保真前端界面；",
            "核心编码与重构：在 Cursor、Windsurf、GitHub Copilot 或通义灵码中完成多文件上下文结对编程；",
            "联调与上线增长：配合 AI SQL 助手、自动化测试工具与 SEO 文案工具低成本完成独立产品冷启动。",
        ],
        "filter_fn": lambda it: it.get("category") == "编程开发"
        or bool(re.search(r"(零代码|无代码|建站|全栈|cursor|copilot|windsurf|ide\b)", f"{it.get('name','')} {it.get('description','')}".lower())),
    },
    {
        "slug": "short-video-creator",
        "title": "自媒体短视频创作、数字人口播与剪辑流水线",
        "short_title": "短视频自媒体",
        "eyebrow": "脚本 → 分镜 → 配音 → 切片全链路",
        "desc": "适合抖音、小红书、B站、YouTube 创作者与品牌短视频团队的 AI 视频生产力工具包，涵盖爆款脚本撰写、文生视频、数字人出镜口播、长视频自动高光切片与双语字幕。",
        "keywords": "AI短视频制作,数字人口播工具,AI文生视频,自动剪辑加字幕,自媒体AI工具",
        "query_hint": "视频",
        "workflow_steps": [
            "选题与口播脚本：借助大模型拆解同赛道爆款结构，批量生成黄金前 3 秒钩子与分镜台词；",
            "画面生成与数字人：使用可灵AI、即梦AI、Runway 生成空镜素材，或用 Synthesia / HeyGen 生成多语种数字人播报；",
            "后期混剪与分发：通过自动切片、语音转字幕与智能去冗余停顿工具一键导出竖屏成片。",
        ],
        "filter_fn": lambda it: it.get("category") == "视频音频"
        and bool(re.search(r"(视频|剪辑|数字人|字幕|切片|短片|口播|video|sora|runway|kling|synthesia)", f"{it.get('name','')} {it.get('description','')} {it.get('domain','')}".lower())),
    },
    {
        "slug": "ppt-office-report",
        "title": "打工人一键生成 PPT、会议纪要与周报办公神器",
        "short_title": "PPT与日常办公",
        "eyebrow": "告别排版熬夜 · 职场高频刚需",
        "desc": "聚焦职场汇报、项目复盘、公文拟定与日常会议协同，精选一键大纲转精美 PPT、录音实时转结构化会议纪要、Excel 公式自动编写及政企公文写作工具。",
        "keywords": "AI一键生成PPT,免费AI做PPT,AI会议纪要工具,AI写周报公文,Excel智能分析",
        "query_hint": "PPT",
        "workflow_steps": [
            "方案与汇报演示：输入主题或上传 Word 文档，用 Gamma、美间、讯飞智文等工具 3 分钟生成排版整齐的演示幻灯片；",
            "日常会议与访谈：开启实时语音转写与说话人区分，会后自动提炼结论、待办事项（Action Items）并分发；",
            "表格数据与周报：用自然语言生成复杂函数与可视化图表，快速汇总成结构化工作周报。",
        ],
        "filter_fn": lambda it: it.get("category") == "办公效率"
        or bool(re.search(r"(\bppt\b|幻灯片|演示文稿|会议纪要|公文|周报|电子表格|excel|slides|gamma)", f"{it.get('name','')} {it.get('description','')}".lower())),
    },
    {
        "slug": "ecommerce-design",
        "title": "电商商品图抠图换背景、AI 模特与海报设计合集",
        "short_title": "电商抠图与海报",
        "eyebrow": "无需摄影棚 · 批量出主图详情页",
        "desc": "面向淘宝、拼多多、跨境独立站卖家与平面设计师的商业视觉 AI 工具集，支持发丝级智能抠图、商品光影融合换景、虚拟模特试衣、无损超分放大与节日促销海报生成。",
        "keywords": "AI电商商品图,一键智能抠图免费,AI换背景模特,AI生成海报Logo,图片无损放大",
        "query_hint": "抠图",
        "workflow_steps": [
            "白底图与去杂物：使用一键智能抠图与涂抹消除工具秒级剥离杂乱背景并修复瑕疵；",
            "场景合成与试衣：通过电商场景生成或虚拟模特换装功能，低成本产出多国审美风格主图；",
            "画质放大与多尺寸延展：将压缩模糊素材无损放大至 4K 印刷级清晰度，并自适应延展横竖版海报。",
        ],
        "filter_fn": lambda it: it.get("category") == "图像设计"
        and bool(re.search(r"(抠图|电商|海报|商品|模特|背景|修图|放大|logo|商拍|design|photo)", f"{it.get('name','')} {it.get('description','')}".lower())),
    },
    {
        "slug": "ai-search-engines",
        "title": "新一代无广告 AI 搜索引擎对比与推荐",
        "short_title": "无广告AI搜索",
        "eyebrow": "直给结构化答案 · 附可验证信源",
        "desc": "告别传统搜索引擎满屏竞价广告与农场软文，汇总国内外主流 AI 对话式搜索引擎、社区深水区知识检索与学术多智能体搜索入口，一次提问即可获得带引用来源的深度解答。",
        "keywords": "AI搜索引擎推荐,无广告AI搜索,秘塔AI搜索平替,Perplexity国内替代,深度研究AI",
        "query_hint": "AI搜索",
        "workflow_steps": [
            "中文政策、行业研报与全网事实核查：优先使用秘塔AI搜索（开启深入研究模式）或问小白；",
            "真实行家经验与避坑测评：使用知乎直答直接检索高赞专业创作者的实测内容并溯源；",
            "英文技术文档与全球前沿资讯：结合 Perplexity、Phind 或多模型联网问答交叉验证。",
        ],
        "filter_fn": lambda it: bool(
            re.search(
                r"(ai搜索|搜索引擎|知乎直答|秘塔|metaso|perplexity|深度检索|联网搜索|无广告.*搜索)",
                f"{it.get('name','')} {it.get('description','')} {it.get('domain','')}".lower(),
            )
        ),
    },
    {
        "slug": "ai-agent-mcp",
        "title": "AI Agent 智能体搭建、MCP 服务与自动化工作流",
        "short_title": "Agent与自动化",
        "eyebrow": "从对话走向自主执行 · 多智能体协同",
        "desc": "精选国内外主流智能体（AI Agent）零代码搭建平台、多智能体（Multi-Agent）编排框架、MCP 协议工具生态及跨网页/软件 RPA 自动化机器人。",
        "keywords": "AI Agent平台推荐,智能体开发工具,扣子Dify对比,MCP工具生态,AI自动化工作流",
        "query_hint": "智能体",
        "workflow_steps": [
            "零代码快速验证：个人与业务团队可在扣子（Coze）快速挂载插件、知识库与定时触发器发布专属 Bot；",
            "企业级可控编排：研发团队使用 Dify、n8n 或 LangChain 将大模型能力嵌入现有业务 API 与数据库；",
            "跨端自主操作：结合浏览器自动化 Agent 处理表单填报、竞品监控与周期性数据采集。",
        ],
        "filter_fn": lambda it: it.get("category") == "Agent与自动化",
    },
    {
        "slug": "voice-tts-music",
        "title": "AI 真人配音（TTS）、声音克隆与原创音乐生成工具",
        "short_title": "配音克隆与音乐",
        "eyebrow": "多情感超拟真 · 免版税原创配乐",
        "desc": "汇聚超自然语音合成（Text-to-Speech）、3 秒样本声音克隆、人声伴奏分离降噪以及免版税 AI 作词作曲编曲工具，满足有声书、影视解说、播客与游戏配乐需求。",
        "keywords": "AI配音工具免费,AI声音克隆,文字转语音TTS,AI生成音乐歌曲,人声伴奏分离",
        "query_hint": "配音",
        "workflow_steps": [
            "旁白与多角色配音：选择支持情绪停顿控制的 TTS 工具生成有声读物、纪录片解说与多语种视频译制；",
            "原创 BGM 与主题曲：输入曲风、情绪与歌词，使用 Suno、Udio 等音乐模型生成商用免版税背景音乐；",
            "播客后期精修：利用 AI 降噪、房间混响消除与母带响度均衡器把普通麦克风录音提升至录音棚质感。",
        ],
        "filter_fn": lambda it: it.get("category") == "视频音频"
        and bool(re.search(r"(配音|语音|tts|克隆|音乐|作曲|编曲|音频|降噪|播客|voice|speech|music|audio|suno)", f"{it.get('name','')} {it.get('description','')} {it.get('domain','')}".lower())),
    },
    {
        "slug": "job-interview-resume",
        "title": "AI 简历定制优化、模拟面试与求职备考精选",
        "short_title": "简历与求职面试",
        "eyebrow": "精准匹配岗位 JD · 高频追问实战演练",
        "desc": "面向应届校招、社招跳槽、程序员技术面与海外远程求职人群，精选 ATS 友好型简历诊断改写、岗位 JD 匹配度分析、AI 面试官实时追问演练与职业规划助手。",
        "keywords": "AI改简历工具,AI模拟面试神器,程序员AI面试,求职AI助手,英文简历润色",
        "query_hint": "简历",
        "workflow_steps": [
            "简历针对性改写：对照目标岗位 JD 提炼量化STAR法则项目成果，避免千篇一律的海投模板；",
            "高压模拟面试：使用垂直岗位 AI 面试工具进行语音实战问答，提前演练项目深挖与算法八股追问；",
            "复盘与谈薪准备：根据模拟评估报告补齐表达短板，并结合行业薪酬数据制定投递策略。",
        ],
        "filter_fn": lambda it: bool(
            re.search(r"(简历|面试|求职|招聘|校招|社招|职位|resume|\bcv\b|interview|job|career|hiring)", f"{it.get('name','')} {it.get('description','')}".lower())
        ),
    },
]

STOP_ENTITY_NAMES = {
    "ai", "app", "web", "pro", "plus", "max", "chat", "code", "bot", "hub",
    "tool", "tools", "studio", "labs", "cloud", "open", "free", "auto", "flow",
    "data", "docs", "note", "notes", "work", " mind", "link", "page", "site",
    "人工智能", "大模型", "智能体", "知识库", "工作流", "浏览器", "搜索", "助手", "写作", "设计",
}


def clean_short_brand_name(raw_name):
    s = (raw_name or "").strip()
    # Strip trailing tagline after separators like " - ", "｜", "：", "—"
    s = re.split(r"\s*[-—｜|：:]\s*", s)[0].strip()
    s = re.sub(r"（[^）]{4,}）|\([^)]{4,}\)", "", s).strip()
    return s or raw_name.strip()


def write_tool_slugs_index(web_dir, flagship_items, slug_by_id):
    by_id = {}
    entities = []
    seen_match_keys = set()

    for it in flagship_items:
        tid = it.get("id")
        slug = slug_by_id.get(tid)
        if not tid or not slug:
            continue
        by_id[tid] = slug
        short_name = clean_short_brand_name(it.get("name") or "")
        low_key = short_name.lower()
        has_zh = any("\u4e00" <= c <= "\u9fff" for c in short_name)
        valid_entity = (has_zh and 2 <= len(short_name) <= 16) or (not has_zh and 4 <= len(short_name) <= 22)
        if valid_entity and low_key not in STOP_ENTITY_NAMES and low_key not in seen_match_keys:
            seen_match_keys.add(low_key)
            entities.append({
                "id": tid,
                "slug": slug,
                "name": short_name,
                "domain": it.get("domain") or "",
                "category": it.get("category") or "",
                "pricing": it.get("pricing") or "免费额度",
                "access_mode": it.get("access_mode") or "overseas_direct",
            })

    # Sort longest name first so specific names match before substrings
    entities.sort(key=lambda x: (-len(x["name"]), x["name"].lower()))
    payload = {
        "count": len(by_id),
        "by_id": by_id,
        "entities": entities[:380],
    }
    out_path = os.path.join(web_dir, "data", "tool-slugs.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    return entities[:380]


def match_entities_in_text(text, entities, limit=4):
    if not text or not entities:
        return []
    hay = text.lower()
    matched = []
    for ent in entities:
        nm = ent["name"]
        nl = nm.lower()
        if any("\u4e00" <= c <= "\u9fff" for c in nm):
            if nl in hay:
                matched.append(ent)
        else:
            if re.search(rf"(?<![a-z0-9]){re.escape(nl)}(?![a-z0-9])", hay):
                matched.append(ent)
        if len(matched) >= limit:
            break
    return matched


def build_scene_pages(
    web_dir,
    base_url,
    all_items,
    slug_by_id,
    today_str,
    sort_tools_fn,
    region_label_fn,
    is_domestic_fn,
    page_shell_html_fn,
    render_static_card_fn,
):
    scene_root = os.path.join(web_dir, "scene")
    os.makedirs(scene_root, exist_ok=True)
    generated_urls = []
    hub_cards = []
    hub_itemlist = []

    for idx, sc in enumerate(SCENE_CONFIGS, 1):
        slug = sc["slug"]
        matched = sort_tools_fn([it for it in all_items if sc["filter_fn"](it)])
        if not matched:
            continue
        dom_cnt = sum(1 for i in matched if is_domestic_fn(i))
        free_cnt = sum(1 for i in matched if i.get("pricing") in ("完全免费", "开源免费"))
        canon = f"{base_url}/scene/{slug}/"

        hub_itemlist.append({
            "@type": "ListItem",
            "position": idx,
            "name": f"{sc['title']}（{len(matched)} 款）",
            "url": canon,
        })
        top_names = "、".join(clean_short_brand_name(i["name"]) for i in matched[:4])
        hub_cards.append(f"""      <a class="daily-card" href="./{slug}/">
        <div>
          <div class="daily-card__date">{esc(sc['eyebrow'])} · 共 {len(matched)} 款</div>
          <h2 class="daily-card__title" style="margin-top:6px;">{esc(sc['title'])}</h2>
          <p class="tool-card__desc" style="margin-top:6px;">{esc(sc['desc'])}</p>
        </div>
        <div class="daily-card__meta">首选推荐：{esc(top_names)} →</div>
      </a>""")

        # Sibling scene pills
        pills = []
        for sib in SCENE_CONFIGS:
            active_cls = " is-active" if sib["slug"] == slug else ""
            aria_cur = ' aria-current="page"' if sib["slug"] == slug else ""
            pills.append(
                f'<a class="cat-pill{active_cls}" href="../{sib["slug"]}/"{aria_cur}>{esc(sib["short_title"])}</a>'
            )

        # Workflow steps list
        wf_lis = "\n".join(f"          <li>{esc(step)}</li>" for step in sc["workflow_steps"])

        # Top 15 table
        rows_html = []
        for it in matched[:15]:
            tslug = slug_by_id.get(it["id"])
            name_cell = (
                f'<a class="seo-tool-card__title-link" href="../../tool/{tslug}/">{esc(it["name"])}</a>'
                if tslug
                else esc(it["name"])
            )
            desc_short = (it.get("description") or "")[:90]
            if len(it.get("description") or "") > 90:
                desc_short += "…"
            reg_price = f"{region_label_fn(it)} · {it.get('pricing') or '免费额度'}"
            rows_html.append(f"""          <tr>
            <th scope="row">{name_cell}</th>
            <td>{esc(reg_price)}</td>
            <td>{len(it.get('sources') or [])} 大目录推荐</td>
            <td class="compare-table__desc">{esc(desc_short)}</td>
            <td><a class="compare-table__link" href="{esc(it['url'])}" target="_blank" rel="noopener noreferrer">{esc(it.get('domain') or '访问官网')} ↗</a></td>
          </tr>""")

        cards_html = "\n".join(
            render_static_card_fn(
                it,
                "影音娱乐" if it.get("category") == "划水摸鱼" else (it.get("category") or "精选工具"),
                rel_root="../../",
                slug_by_id=slug_by_id,
            )
            for it in matched[:48]
        )

        top5_all = "、".join(clean_short_brand_name(i["name"]) for i in matched[:5])
        dom_matched = [i for i in matched if is_domestic_fn(i)]
        top5_dom = "、".join(clean_short_brand_name(i["name"]) for i in dom_matched[:5]) or top5_all
        free_matched = [i for i in matched if i.get("pricing") in ("完全免费", "开源免费")]
        top5_free = "、".join(clean_short_brand_name(i["name"]) for i in free_matched[:5]) or top5_all

        faqs = [
            (
                f"2026 年「{sc['short_title']}」场景最推荐哪几款 AI 工具？",
                f"结合国内外 9 大权威 AI 目录交叉共识评分，该场景综合口碑最高的前 5 款工具依次为：{top5_all}（全场景共筛出 {len(matched)} 款匹配工具）。",
            ),
            (
                f"在「{sc['short_title']}」方向有哪些支持国内免翻墙直连或完全免费的方案？",
                f"支持国内网络直接访问的代表工具有：{top5_dom}（共 {dom_cnt} 款）；其中提供完全免费或开源免费模式的代表方案有：{top5_free}（共 {free_cnt} 款）。",
            ),
            (
                f"如何把多款「{sc['short_title']}」AI 工具串联成高效工作流？",
                " ".join(sc["workflow_steps"]),
            ),
        ]
        faq_html = "\n".join(
            f"""        <details class="faq-item" name="scene-faq"{' open' if i == 0 else ''}>
          <summary>{esc(q)}</summary>
          <p class="faq-item__body">{esc(a)}</p>
        </details>"""
            for i, (q, a) in enumerate(faqs)
        )

        q_link = f"../../?q={urllib.parse.quote(sc['query_hint'])}"
        main_html = f"""    <nav class="breadcrumb" aria-label="面包屑导航">
      <ol>
        <li><a href="../../">首页</a></li>
        <li><a href="../">场景工作流专题</a></li>
        <li><a href="./" aria-current="page">{esc(sc['short_title'])}</a></li>
      </ol>
    </nav>

    <section class="seo-hero">
      <span class="seo-hero__eyebrow">{esc(sc['eyebrow'])} · {today_str} 自动同步</span>
      <h1 class="seo-hero__title">{esc(sc['title'])}（精选 {len(matched)} 款）</h1>
      <p class="seo-hero__desc">{esc(sc['desc'])}</p>
      <div class="seo-hero__stats">
        <span class="stat-pill">匹配工具 <strong>{len(matched)} 款</strong></span>
        <span class="stat-pill">国内直连 <strong>{dom_cnt} 款</strong></span>
        <span class="stat-pill">免费/开源 <strong>{free_cnt} 款</strong></span>
        <a class="btn-primary" href="{q_link}" style="padding:6px 14px;font-size:13px;">在首页交互式搜索「{esc(sc['query_hint'])}」→</a>
      </div>
    </section>

    <nav class="seo-cat-strip" aria-label="切换其他高频 AI 应用场景">
      {chr(10).join("      " + p for p in pills)}
    </nav>

    <section class="seo-section" aria-labelledby="wf-heading" style="margin-block-start:18px;">
      <div class="seo-hero" style="margin-block-end:0;padding:18px 22px;">
        <h2 class="seo-section__title" id="wf-heading" style="font-size:16.5px;margin-bottom:10px;">实战工作流组合建议（3 步上手）</h2>
        <ol style="margin:0;padding-inline-start:20px;color:var(--text-secondary);font-size:14px;line-height:1.75;">
{wf_lis}
        </ol>
      </div>
    </section>

    <section class="seo-section" aria-labelledby="sc-table-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="sc-table-heading">{esc(sc['short_title'])} Top {min(15, len(matched))} 核心参数对比表</h2>
        <p class="seo-section__sub">含网络可达性、计费门槛与多源共识度</p>
      </div>
      <div tabindex="0" role="region" aria-labelledby="sc-caption" class="table-wrapper">
        <table class="compare-table" style="--label-2:'访问与计费';--label-3:'共识热度';--label-4:'功能亮点';--label-5:'官网入口';">
          <caption id="sc-caption">{esc(sc['title'])}代表产品对比清单（{today_str}）</caption>
          <thead>
            <tr>
              <th scope="col">工具名称</th>
              <th scope="col">访问与计费</th>
              <th scope="col">共识热度</th>
              <th scope="col">功能亮点</th>
              <th scope="col">官网入口</th>
            </tr>
          </thead>
          <tbody>
{chr(10).join(rows_html)}
          </tbody>
        </table>
      </div>
    </section>

    <section class="seo-section" aria-labelledby="sc-grid-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="sc-grid-heading">{esc(sc['short_title'])}工具直达名录（精选前 {min(48, len(matched))} 款）</h2>
        <a class="cat-section__more" href="{q_link}">在全库检索更多 →</a>
      </div>
      <div class="cards-grid">
{cards_html}
      </div>
    </section>

    <section class="seo-section" aria-labelledby="sc-faq-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="sc-faq-heading">关于「{esc(sc['short_title'])}」的常见选型问答</h2>
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
                        {"@type": "ListItem", "position": 2, "name": "场景工作流专题", "item": f"{base_url}/scene/"},
                        {"@type": "ListItem", "position": 3, "name": sc["title"], "item": canon},
                    ],
                },
                {
                    "@type": "CollectionPage",
                    "name": f"{sc['title']} · AI 导航聚合站",
                    "url": canon,
                    "description": sc["desc"],
                    "inLanguage": "zh-CN",
                    "mainEntity": {
                        "@type": "ItemList",
                        "numberOfItems": len(matched),
                        "itemListElement": [
                            {
                                "@type": "ListItem",
                                "position": i_pos,
                                "name": it["name"],
                                "url": f"{base_url}/tool/{slug_by_id[it['id']]}/" if it["id"] in slug_by_id else it["url"],
                            }
                            for i_pos, it in enumerate(matched[:20], 1)
                        ],
                    },
                },
                {
                    "@type": "FAQPage",
                    "mainEntity": [
                        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}}
                        for q, a in faqs
                    ],
                },
            ],
        }

        pdir = os.path.join(scene_root, slug)
        os.makedirs(pdir, exist_ok=True)
        with open(os.path.join(pdir, "index.html"), "w", encoding="utf-8") as f:
            f.write(
                page_shell_html_fn(
                    rel_root="../../",
                    title=f"{sc['title']}（精选 {len(matched)} 款对比与工作流） · AI 导航聚合站",
                    description=f"{sc['desc'][:95]} 涵盖 {top5_all} 等高口碑工具官网入口与免费平替。",
                    canonical_url=canon,
                    active_nav="category",
                    json_ld_obj=ld_obj,
                    main_html=main_html,
                    keywords=sc["keywords"],
                )
            )
        generated_urls.append((canon, today_str, "daily", "0.88"))

    # Scene Hub /scene/index.html
    hub_url = f"{base_url}/scene/"
    hub_main = f"""    <nav class="breadcrumb" aria-label="面包屑导航">
      <ol>
        <li><a href="../">首页</a></li>
        <li><a href="./" aria-current="page">场景工作流专题</a></li>
      </ol>
    </nav>

    <section class="seo-hero">
      <span class="seo-hero__eyebrow">按真实任务找工具 · 告别选择困难</span>
      <h1 class="seo-hero__title">12 大高频 AI 工作流与人群选型专题</h1>
      <p class="seo-hero__desc">围绕「完全免费」「开源本地部署」「国内免翻墙直连」「学术论文」「独立开发」「短视频自媒体」「PPT 办公」「电商设计」等真实业务痛点整理的一站式组合清单与三步上手指南。</p>
      <div class="seo-hero__stats">
        <a class="btn-primary" href="../vs/" style="padding:6px 14px;font-size:13px;">查看热门 AI 工具两两 VS 对比榜 →</a>
        <a class="btn-secondary" href="../category/" style="padding:6px 14px;font-size:13px;">按 10 大学科分类浏览</a>
      </div>
    </section>

    <section class="daily-archive-grid" aria-label="场景专题列表">
{chr(10).join(hub_cards)}
    </section>"""

    hub_ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "首页", "item": f"{base_url}/"},
                    {"@type": "ListItem", "position": 2, "name": "场景工作流专题", "item": hub_url},
                ],
            },
            {
                "@type": "CollectionPage",
                "name": "12 大高频 AI 工作流与人群选型专题 · AI 导航聚合站",
                "url": hub_url,
                "inLanguage": "zh-CN",
                "mainEntity": {"@type": "ItemList", "itemListElement": hub_itemlist},
            },
        ],
    }
    with open(os.path.join(scene_root, "index.html"), "w", encoding="utf-8") as f:
        f.write(
            page_shell_html_fn(
                rel_root="../",
                title="AI 场景工作流专题大全 · 免费/开源/论文/编程/短视频/电商选型指南 · AI 导航聚合站",
                description="按真实业务场景精选 12 套 AI 工具黄金组合：完全免费、开源部署、国内直连、写论文科研、独立开发者、短视频创作、PPT 办公与电商抠图。",
                canonical_url=hub_url,
                active_nav="category",
                json_ld_obj=hub_ld,
                main_html=hub_main,
                keywords="AI工作流,AI场景推荐,免费AI工具合集,论文AI工具,电商AI工具",
            )
        )
    generated_urls.insert(0, (hub_url, today_str, "daily", "0.9"))
    return generated_urls


def build_vs_pages(
    web_dir,
    base_url,
    by_cat,
    cat_configs,
    slug_by_id,
    today_str,
    sort_tools_fn,
    region_label_fn,
    is_domestic_fn,
    page_shell_html_fn,
    render_static_card_fn,
):
    vs_root = os.path.join(web_dir, "vs")
    os.makedirs(vs_root, exist_ok=True)

    pairs = []
    seen_pairs = set()

    def add_pair(a, b, cfg):
        if not a or not b or a["id"] == b["id"]:
            return
        if a["id"] not in slug_by_id or b["id"] not in slug_by_id:
            return
        key = tuple(sorted((a["id"], b["id"])))
        if key in seen_pairs:
            return
        seen_pairs.add(key)
        pairs.append((a, b, cfg))

    for cfg in cat_configs:
        cat_items = [i for i in sort_tools_fn(by_cat.get(cfg["cat"], [])) if i["id"] in slug_by_id]
        dom_list = [i for i in cat_items if is_domestic_fn(i)]
        ovs_list = [i for i in cat_items if not is_domestic_fn(i)]

        # 1. Top domestic #1 vs #2, #1 vs #3
        if len(dom_list) >= 2:
            add_pair(dom_list[0], dom_list[1], cfg)
        if len(dom_list) >= 3:
            add_pair(dom_list[0], dom_list[2], cfg)

        # 2. Top overseas #1 vs Top domestic #1 & #2 (High-intent domestic alternative query!)
        if ovs_list and dom_list:
            add_pair(ovs_list[0], dom_list[0], cfg)
            if len(ovs_list) >= 2:
                add_pair(ovs_list[1], dom_list[0], cfg)
            if len(dom_list) >= 2:
                add_pair(ovs_list[0], dom_list[1], cfg)

        # 3. Top overseas #1 vs #2
        if len(ovs_list) >= 2:
            add_pair(ovs_list[0], ovs_list[1], cfg)

    generated_urls = []
    vs_links_by_cat = {}
    vs_links_by_tool_id = {}

    for a, b, cfg in pairs[:64]:
        sa = slug_by_id[a["id"]]
        sb = slug_by_id[b["id"]]
        pair_slug = f"{sa}-vs-{sb}"
        na = clean_short_brand_name(a["name"])
        nb = clean_short_brand_name(b["name"])
        disp = cfg["display"]
        canon = f"{base_url}/vs/{pair_slug}/"

        vs_links_by_cat.setdefault(cfg["cat"], []).append((pair_slug, f"{na} vs {nb}"))
        vs_links_by_tool_id.setdefault(a["id"], []).append((pair_slug, f"{na} vs {nb}"))
        vs_links_by_tool_id.setdefault(b["id"], []).append((pair_slug, f"{na} vs {nb}"))

        ra = region_label_fn(a)
        rb = region_label_fn(b)
        pa = a.get("pricing") or "免费额度"
        pb = b.get("pricing") or "免费额度"
        ca = len(a.get("sources") or [])
        cb = len(b.get("sources") or [])

        # Actionable decision verdict
        if is_domestic_fn(a) and not is_domestic_fn(b):
            verdict = (
                f"如果你追求国内网络免配置秒开与中文语境深度适配，优先选择「{na}」（{ra} · {pa}）；"
                f"如果你需要对接全球化生态或海外工作流，可同步对比「{nb}」（{rb} · {pb}）。"
            )
        elif is_domestic_fn(b) and not is_domestic_fn(a):
            verdict = (
                f"「{na}」（{ra} · {pa}）在全球「{disp}」赛道拥有较高知名度；"
                f"而在国内直连网络环境与本土化场景下，「{nb}」（{rb} · {pb}）是非常成熟的高口碑平替与互补选择。"
            )
        elif pa in ("完全免费", "开源免费") and pb not in ("完全免费", "开源免费"):
            verdict = (
                f"两款均为「{disp}」赛道代表产品：预算敏感或偏好零门槛体验建议优先上手「{na}」（{pa}）；"
                f"追求特定商业特性与进阶服务可评估「{nb}」（{pb}）。"
            )
        elif pb in ("完全免费", "开源免费") and pa not in ("完全免费", "开源免费"):
            verdict = (
                f"两款均为「{disp}」赛道热门方案：「{nb}」提供「{pb}」低门槛方案；"
                f"而「{na}」（{pa}，获 {ca} 大目录推荐）在垂直功能成熟度上同样表现突出，建议按具体任务搭配使用。"
            )
        else:
            verdict = (
                f"「{na}」（获 {ca} 大目录推荐 · {pa}）与「{nb}」（获 {cb} 大目录推荐 · {pb}）同属「{disp}」头部阵营，"
                f"均支持 {ra if ra == rb else f'{ra} / {rb}'}，建议点击下方官网同时实测同一组提示词对比输出质感。"
            )

        faqs = [
            (
                f"{na} 和 {nb} 哪个更好用？核心区别是什么？",
                f"{na}（{a['domain']}）定位：{a.get('description','')} 而 {nb}（{b['domain']}）定位：{b.get('description','')} {verdict}",
            ),
            (
                f"国内网络环境下选 {na} 还是 {nb} 更稳定？",
                f"{na} 当前网络属性为「{ra}」，{nb} 当前网络属性为「{rb}」。日常高频使用建议优先将支持国内直连的一方作为主力入口。",
            ),
            (
                f"{na} 与 {nb} 的免费额度和收费模式对比如何？",
                f"计费门槛方面：{na} 属于「{pa}」，{nb} 属于「{pb}」。两款产品均可通过本站提供的纯净无追踪官网链接直接访问验证最新权益。",
            ),
        ]
        faq_html = "\n".join(
            f"""        <details class="faq-item" name="vs-faq"{' open' if i == 0 else ''}>
          <summary>{esc(q)}</summary>
          <p class="faq-item__body">{esc(ans)}</p>
        </details>"""
            for i, (q, ans) in enumerate(faqs)
        )

        peers = [
            p for p in sort_tools_fn(by_cat.get(cfg["cat"], []))
            if p["id"] not in (a["id"], b["id"]) and p["id"] in slug_by_id
        ][:4]
        peer_cards = "\n".join(render_static_card_fn(p, disp, rel_root="../../", slug_by_id=slug_by_id) for p in peers)

        main_html = f"""    <nav class="breadcrumb" aria-label="面包屑导航">
      <ol>
        <li><a href="../../">首页</a></li>
        <li><a href="../">AI工具VS对比库</a></li>
        <li><a href="../../category/{cfg['slug']}/">{esc(disp)}</a></li>
        <li><a href="./" aria-current="page">{esc(na)} vs {esc(nb)}</a></li>
      </ol>
    </nav>

    <section class="seo-hero">
      <span class="seo-hero__eyebrow">{esc(disp)}双强横评 · {today_str} 数据校准</span>
      <h1 class="seo-hero__title">{esc(na)} vs {esc(nb)}：功能定位、免费额度与国内直连深度对比</h1>
      <p class="seo-hero__desc"><strong>30 秒选型结论：</strong>{esc(verdict)}</p>
      <div class="seo-hero__stats">
        <a class="btn-primary" href="{esc(a['url'])}" target="_blank" rel="noopener noreferrer">访问 {esc(na)} 官网 ↗</a>
        <a class="btn-primary" href="{esc(b['url'])}" target="_blank" rel="noopener noreferrer">访问 {esc(nb)} 官网 ↗</a>
        <a class="btn-secondary" href="../../tool/{sa}/" style="padding:7px 14px;font-size:13px;">{esc(na)} 更多平替</a>
        <a class="btn-secondary" href="../../tool/{sb}/" style="padding:7px 14px;font-size:13px;">{esc(nb)} 更多平替</a>
      </div>
    </section>

    <section class="seo-section" aria-labelledby="vs-table-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="vs-table-heading">{esc(na)} 与 {esc(nb)} 核心维度同屏对比表</h2>
      </div>
      <div tabindex="0" role="region" aria-labelledby="vs-caption" class="table-wrapper">
        <table class="compare-table" style="--label-2:'{esc(na)}';--label-3:'{esc(nb)}';">
          <caption id="vs-caption">{esc(na)} vs {esc(nb)} 关键参数对照（{today_str}）</caption>
          <thead>
            <tr>
              <th scope="col">对比维度</th>
              <th scope="col"><a class="seo-tool-card__title-link" href="../../tool/{sa}/">{esc(a['name'])}</a></th>
              <th scope="col"><a class="seo-tool-card__title-link" href="../../tool/{sb}/">{esc(b['name'])}</a></th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">官方主域名</th>
              <td><a class="compare-table__link" href="{esc(a['url'])}" target="_blank" rel="noopener noreferrer">{esc(a['domain'])} ↗</a></td>
              <td><a class="compare-table__link" href="{esc(b['url'])}" target="_blank" rel="noopener noreferrer">{esc(b['domain'])} ↗</a></td>
            </tr>
            <tr>
              <th scope="row">所属核心赛道</th>
              <td>{esc(disp)}</td>
              <td>{esc(disp)}</td>
            </tr>
            <tr>
              <th scope="row">国内网络可达性</th>
              <td><strong>{esc(ra)}</strong></td>
              <td><strong>{esc(rb)}</strong></td>
            </tr>
            <tr>
              <th scope="row">计费与免费模式</th>
              <td><span class="tag-chip">{esc(pa)}</span></td>
              <td><span class="tag-chip">{esc(pb)}</span></td>
            </tr>
            <tr>
              <th scope="row">权威目录共识度</th>
              <td>获国内外 {ca} 大主流 AI 导航站收录</td>
              <td>获国内外 {cb} 大主流 AI 导航站收录</td>
            </tr>
            <tr>
              <th scope="row">核心功能与优势</th>
              <td class="compare-table__desc">{esc(a.get('description') or '')}</td>
              <td class="compare-table__desc">{esc(b.get('description') or '')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="seo-section" aria-labelledby="vs-peers-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="vs-peers-heading">除了 {esc(na)} 和 {esc(nb)}，同赛道还有哪些高分选择？</h2>
        <a class="cat-section__more" href="../../category/{cfg['slug']}/">查看全部{esc(disp)}排行榜 →</a>
      </div>
      <div class="cards-grid">
{peer_cards}
      </div>
    </section>

    <section class="seo-section" aria-labelledby="vs-faq-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="vs-faq-heading">{esc(na)} vs {esc(nb)} 常见选型问答</h2>
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
                        {"@type": "ListItem", "position": 2, "name": "AI工具VS对比库", "item": f"{base_url}/vs/"},
                        {"@type": "ListItem", "position": 3, "name": f"{na} vs {nb}", "item": canon},
                    ],
                },
                {
                    "@type": "FAQPage",
                    "mainEntity": [
                        {"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": ans}}
                        for q, ans in faqs
                    ],
                },
            ],
        }

        pdir = os.path.join(vs_root, pair_slug)
        os.makedirs(pdir, exist_ok=True)
        with open(os.path.join(pdir, "index.html"), "w", encoding="utf-8") as f:
            f.write(
                page_shell_html_fn(
                    rel_root="../../",
                    title=f"{na} vs {nb} 哪个好用？2026 功能、免费额度与国内直连对比 · AI 导航聚合站",
                    description=f"{na}（{a['domain']}）与 {nb}（{b['domain']}）全方位对比：{verdict[:95]}",
                    canonical_url=canon,
                    active_nav="category",
                    json_ld_obj=ld_obj,
                    main_html=main_html,
                    keywords=f"{na} vs {nb},{na}和{nb}哪个好,{na}平替,{nb}平替,{disp}对比",
                )
            )
        generated_urls.append((canon, today_str, "weekly", "0.82"))

    # Build /vs/index.html hub
    sections = []
    for cfg in cat_configs:
        cat_pairs = vs_links_by_cat.get(cfg["cat"], [])
        if not cat_pairs:
            continue
        links = "\n".join(
            f'          <a class="topic-link-card" href="./{pslug}/"><span>{esc(label)}</span><span>对比 →</span></a>'
            for pslug, label in cat_pairs
        )
        sections.append(f"""    <section class="seo-section" aria-labelledby="vshub-{cfg['slug']}">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="vshub-{cfg['slug']}">{esc(cfg['display'])}热门两两对比（{len(cat_pairs)} 组）</h2>
        <a class="cat-section__more" href="../category/{cfg['slug']}/">{esc(cfg['display'])}完整榜单 →</a>
      </div>
      <div class="topic-links-grid">
{links}
      </div>
    </section>""")

    vs_hub_url = f"{base_url}/vs/"
    vs_hub_main = f"""    <nav class="breadcrumb" aria-label="面包屑导航">
      <ol>
        <li><a href="../">首页</a></li>
        <li><a href="./" aria-current="page">AI工具VS对比库</a></li>
      </ol>
    </nav>

    <section class="seo-hero">
      <span class="seo-hero__eyebrow">二选一不再纠结 · 同屏横评</span>
      <h1 class="seo-hero__title">热门 AI 工具 VS 两两深度对比库（共 {len(generated_urls)} 组）</h1>
      <p class="seo-hero__desc">针对各大垂直赛道热度最高的海外标杆与国产直连主力产品，从网络可达性、免费额度、多源共识热度与适用人群进行结构化同屏对比。</p>
      <div class="seo-hero__stats">
        <a class="btn-primary" href="../scene/" style="padding:6px 14px;font-size:13px;">浏览 12 大 AI 工作流场景包 →</a>
        <a class="btn-secondary" href="../tool/" style="padding:6px 14px;font-size:13px;">浏览 {len(slug_by_id)} 款单品平替库</a>
      </div>
    </section>

{chr(10).join(sections)}"""

    vs_hub_ld = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "BreadcrumbList",
                "itemListElement": [
                    {"@type": "ListItem", "position": 1, "name": "首页", "item": f"{base_url}/"},
                    {"@type": "ListItem", "position": 2, "name": "AI工具VS对比库", "item": vs_hub_url},
                ],
            },
            {
                "@type": "CollectionPage",
                "name": f"热门 AI 工具 VS 两两深度对比库（{len(generated_urls)} 组） · AI 导航聚合站",
                "url": vs_hub_url,
                "inLanguage": "zh-CN",
            },
        ],
    }
    with open(os.path.join(vs_root, "index.html"), "w", encoding="utf-8") as f:
        f.write(
            page_shell_html_fn(
                rel_root="../",
                title=f"AI 工具 VS 对比排行榜（{len(generated_urls)} 组国内外主流大模型与工具横评） · AI 导航聚合站",
                description="收录国内外头部 AI 工具两两同屏横评：对比核心能力、免费额度、国内直连稳定性与选型建议。",
                canonical_url=vs_hub_url,
                active_nav="category",
                json_ld_obj=vs_hub_ld,
                main_html=vs_hub_main,
                keywords="AI工具对比,大模型对比,ChatGPT vs DeepSeek,Cursor对比,AI选型指南",
            )
        )
    generated_urls.insert(0, (vs_hub_url, today_str, "daily", "0.88"))
    return generated_urls, vs_links_by_cat, vs_links_by_tool_id


def prerender_news_and_moyu(web_dir, base_url, news_data, hotlist_data, entities, today_str):
    # 1. Pre-render web/news/index.html
    news_html_path = os.path.join(web_dir, "news", "index.html")
    news_items = (news_data or {}).get("items") or []
    if os.path.isfile(news_html_path) and news_items:
        with open(news_html_path, "r", encoding="utf-8") as f:
            raw = f.read()

        cards = []
        for idx, it in enumerate(news_items[:24]):
            href = it.get("source_url") or it.get("url") or "#"
            title = it.get("title") or ""
            summary = it.get("summary") or ""
            topic = it.get("topic") or "前沿速递"
            pub = it.get("published_at") or it.get("date") or today_str
            cover = it.get("cover") or ""
            cover_tag = ""
            if cover.startswith(("http://", "https://")):
                prio = ' fetchpriority="high"' if idx == 0 else (' loading="lazy"' if idx >= 4 else "")
                cover_tag = f'\n        <img src="{esc(cover)}" alt="" decoding="async" referrerpolicy="no-referrer"{prio}>'

            matched_ents = match_entities_in_text(f"{title} {summary}", entities, limit=2)
            ent_links = "".join(
                f' <a class="compare-table__link" style="font-size:12px;" href="../tool/{e["slug"]}/">{esc(e["name"])} →</a>'
                for e in matched_ents
            )

            cards.append(f"""      <article class="news-card{' card-deferred' if idx >= 12 else ''}">{cover_tag}
        <header class="news-card__header">
          <div class="news-card__meta">
            <span class="tag-chip">{esc(topic)}</span>
            <time class="news-card__time">{esc(pub)}</time>
          </div>
          <h2 class="news-card__title"><a class="card-link" href="{esc(href)}" target="_blank" rel="noopener noreferrer">{esc(title)}</a></h2>
        </header>
        <p class="news-card__summary">{esc(summary)}</p>
        <footer class="brief-item__foot" style="margin-top:auto;">
          <span>AI 行业快讯</span>{ent_links}
        </footer>
      </article>""")

        grid_block = (
            '<section class="news-grid" id="newsGrid" aria-label="AI 资讯列表">\n'
            "      <!-- NEWS_SSR_START -->\n"
            + "\n".join(cards)
            + "\n      <!-- NEWS_SSR_END -->\n    </section>"
        )
        raw = re.sub(
            r'<section class="news-grid" id="newsGrid"[^>]*>[\s\S]*?</section>',
            grid_block,
            raw,
            count=1,
        )
        raw = re.sub(
            r'(<span class="news-count" id="newsCount"[^>]*>)[^<]*(</span>)',
            rf"\g<1>共 {len(news_items)} 条快讯\g<2>",
            raw,
            count=1,
        )

        news_ld = {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": "AI 资讯速递 · AI 导航聚合站",
            "url": f"{base_url}/news/",
            "description": f"实时同步前沿 AI 行业动态、大模型发布、智能体开发与多模态技术速递（更新于 {today_str}）。",
            "inLanguage": "zh-CN",
            "mainEntity": {
                "@type": "ItemList",
                "numberOfItems": min(24, len(news_items)),
                "itemListElement": [
                    {
                        "@type": "ListItem",
                        "position": i_pos,
                        "name": ni.get("title") or "",
                        "url": ni.get("source_url") or ni.get("url") or f"{base_url}/news/",
                    }
                    for i_pos, ni in enumerate(news_items[:20], 1)
                ],
            },
        }
        ld_str = f'<script type="application/ld+json">{json.dumps(news_ld, ensure_ascii=False, separators=(",", ":"))}</script>'
        raw = re.sub(r'<script type="application/ld\+json">[\s\S]*?</script>', ld_str, raw, count=1)

        with open(news_html_path, "w", encoding="utf-8") as f:
            f.write(raw)

    # 2. Pre-render web/moyu/index.html
    moyu_html_path = os.path.join(web_dir, "moyu", "index.html")
    platforms = (hotlist_data or {}).get("platforms") or []
    if os.path.isfile(moyu_html_path) and platforms:
        with open(moyu_html_path, "r", encoding="utf-8") as f:
            mraw = f.read()

        pcards = []
        for plat in platforms:
            pname = plat.get("name") or plat.get("id") or "热榜"
            utime = (plat.get("updated_at") or "")[5:16]
            pitems = (plat.get("items") or [])[:8]
            if not pitems:
                continue
            lis = []
            for idx, pit in enumerate(pitems):
                top_cls = " hot-item__rank--top" if idx < 3 else ""
                lis.append(
                    f'          <li class="hot-item"><a href="{esc(pit.get("url") or "#")}" target="_blank" rel="noopener noreferrer">'
                    f'<span class="hot-item__left"><span class="hot-item__rank{top_cls}">{idx + 1}</span>'
                    f'<span class="hot-item__title">{esc(pit.get("title") or "")}</span></span></a></li>'
                )
            pcards.append(f"""      <article class="hot-card">
        <div class="hot-card__head">
          <div class="hot-card__brand"><h2 class="hot-card__title">{esc(pname)}</h2></div>
          <span class="hot-card__time">{esc(utime)}</span>
        </div>
        <ul class="hot-card__list">
{chr(10).join(lis)}
        </ul>
      </article>""")

        mgrid = (
            '<section class="hot-grid" id="hotGrid" aria-label="热榜卡片">\n'
            "      <!-- MOYU_SSR_START -->\n"
            + "\n".join(pcards)
            + "\n      <!-- MOYU_SSR_END -->\n    </section>"
        )
        mraw = re.sub(
            r'<section class="hot-grid" id="hotGrid"[^>]*>[\s\S]*?</section>',
            mgrid,
            mraw,
            count=1,
        )

        moyu_ld = {
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            "name": "全网实时热榜 · AI 导航聚合站",
            "url": f"{base_url}/moyu/",
            "description": f"聚合 36氪、少数派、掘金、CSDN、知乎、微博、B站等 {len(platforms)} 大平台实时热榜。",
            "inLanguage": "zh-CN",
            "mainEntity": {
                "@type": "ItemList",
                "numberOfItems": len(platforms),
                "itemListElement": [
                    {"@type": "ListItem", "position": i_pos, "name": f"{p.get('name')}实时热榜"}
                    for i_pos, p in enumerate(platforms, 1)
                ],
            },
        }
        mld_str = f'<script type="application/ld+json">{json.dumps(moyu_ld, ensure_ascii=False, separators=(",", ":"))}</script>'
        mraw = re.sub(r'<script type="application/ld\+json">[\s\S]*?</script>', mld_str, mraw, count=1)

        with open(moyu_html_path, "w", encoding="utf-8") as f:
            f.write(mraw)


def write_openapi_spec(web_dir, base_url, total_items):
    spec = {
        "openapi": "3.1.0",
        "info": {
            "title": "AI 导航聚合站 (AI Nav Hub) Open Discovery API",
            "version": "1.2.0",
            "description": (
                f"面向大模型智能体（AI Agents）、研究助手与开发者的零认证只读检索接口。"
                f"支持按中英文关键词、10 大分类、国内免翻墙直连属性及免费/开源模式实时检索全库 {total_items} 款已清洗 AI 工具。"
            ),
        },
        "servers": [{"url": base_url}],
        "paths": {
            "/api/search": {
                "get": {
                    "operationId": "searchAiTools",
                    "summary": "按关键词、分类、网络可达性与计费模式检索 AI 工具",
                    "parameters": [
                        {
                            "name": "q",
                            "in": "query",
                            "required": False,
                            "description": "搜索关键词（支持空格多词组合与中英同义词，如 '论文 免费'、'抠图'、'MCP'）",
                            "schema": {"type": "string"},
                        },
                        {
                            "name": "category",
                            "in": "query",
                            "required": False,
                            "description": "一级分类（对话写作/编程开发/图像设计/视频音频/办公效率/Agent与自动化/学习知识库/划水摸鱼/新品速递/其他工具）",
                            "schema": {"type": "string"},
                        },
                        {
                            "name": "region",
                            "in": "query",
                            "required": False,
                            "description": "区域过滤：domestic（仅国内原生直连）或 overseas（海外工具）",
                            "schema": {"type": "string", "enum": ["all", "domestic", "overseas"]},
                        },
                        {
                            "name": "pricing",
                            "in": "query",
                            "required": False,
                            "description": "计费模式过滤：完全免费 / 开源免费 / 免费额度 / 付费订阅",
                            "schema": {"type": "string"},
                        },
                        {
                            "name": "limit",
                            "in": "query",
                            "required": False,
                            "description": "返回条数上限（默认 20，最大 50）",
                            "schema": {"type": "integer", "default": 20, "maximum": 50},
                        },
                    ],
                    "responses": {
                        "200": {
                            "description": "匹配的 AI 工具数组及全局统计",
                        }
                    },
                }
            },
            "/api/news": {
                "get": {
                    "operationId": "getLatestAiNews",
                    "summary": "获取最新 AI 行业快讯流",
                    "responses": {"200": {"description": "最新 AI 资讯 JSON"}},
                }
            },
            "/api/hotlist": {
                "get": {
                    "operationId": "getRealtimeTechHotlist",
                    "summary": "获取 14 大科技与社区平台实时热榜",
                    "responses": {"200": {"description": "多平台实时热榜 JSON"}},
                }
            },
        },
    }
    out_path = os.path.join(web_dir, "openapi.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(spec, f, ensure_ascii=False, indent=2)
