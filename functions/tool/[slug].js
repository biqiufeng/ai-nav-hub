/**
 * Cloudflare Pages Dynamic Route: GET /tool/:slug
 * Serves all 8,240+ AI tool detail & domestic-alternative comparison pages at the Cloudflare Edge.
 * - Pre-built flagship static pages delegate to Pages ASSETS when present.
 * - Long-tail tools (7,600+ items) render full semantic HTML + SoftwareApplication/Offer/FAQPage JSON-LD at Edge
 *   and cache in Cloudflare Edge Cache for 24h (s-maxage=86400).
 */

import {
  CATEGORY_META,
  CAT_BY_RAW,
  avatarColor,
  ensureRuntimeIndex,
  escHtml,
  isDomestic,
  regionLabel,
  todayCstDate,
} from "../../edge-lib/catalog-runtime.js";

function pricingChipHtml(pricing) {
  if (!pricing) return "";
  let cls = "tag-chip tag-chip--pricing";
  if (pricing === "完全免费" || pricing === "开源免费") cls += " tag-chip--free";
  else if (pricing === "免费额度") cls += " tag-chip--freemium";
  else if (pricing === "付费订阅") cls += " tag-chip--paid";
  return `<span class="${cls}">${escHtml(pricing)}</span>`;
}

function avatarImgHtml(item, size = 38) {
  const rawIc = String(item.icon || "").trim();
  const dom = String(item.domain || "").trim().toLowerCase();
  let src = "";
  if (rawIc.startsWith("http://") || rawIc.startsWith("https://")) src = rawIc;
  else if (dom && dom.includes(".")) src = `/api/icon?d=${encodeURIComponent(dom)}`;
  else return "";
  return `<img src="${escHtml(src)}" alt="" width="${size}" height="${size}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`;
}

function renderStaticCard(item, catDisplay, relRoot = "../../") {
  const name = item.name || item.domain || "AI 工具";
  const domain = item.domain || "";
  const url = item.url || "#";
  const desc = item.description || `${catDisplay} · ${domain}`;
  const letter = (name.trim()[0] || "A").toUpperCase();
  const bg = avatarColor(domain || name);
  const iconImg = avatarImgHtml(item, 38);
  const pChip = pricingChipHtml(item.pricing);
  const tslug = item.slug;
  const titleHref = tslug ? `${relRoot}tool/${tslug}/` : url;
  return `        <article class="tool-card seo-tool-card">
          <div class="tool-card__top">
            <div class="tool-card__head">
              <div class="tool-avatar" style="--avatar-bg:${bg}" aria-hidden="true"><span>${escHtml(letter)}</span>${iconImg}</div>
              <div class="tool-card__titles">
                <h3 class="tool-card__name"><a class="seo-tool-card__title-link" href="${escHtml(titleHref)}">${escHtml(name)}</a></h3>
                <p class="tool-card__domain">${escHtml(domain)}</p>
              </div>
            </div>
            <div class="tool-card__quick">
              <a class="icon-btn" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer" aria-label="直接访问 ${escHtml(name)} 官网">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>
              </a>
            </div>
          </div>
          <p class="tool-card__desc">${escHtml(desc)}</p>
          <div class="tool-card__foot">
            <div class="tool-card__tags">
              <span class="tag-chip">${escHtml(catDisplay)}</span>
              ${pChip}
            </div>
            <a class="compare-table__link" style="font-size:12px;" href="${escHtml(titleHref)}">详情与平替 →</a>
          </div>
        </article>`;
}

function renderSubmitDialogHtml() {
  return `  <dialog class="tool-dialog submit-dialog" id="submitToolDialog" closedby="any" aria-labelledby="submitDialogTitle">
    <div class="tool-dialog__surface submit-dialog__surface">
      <div class="tool-dialog__header">
        <div class="tool-dialog__titles">
          <h1 class="tool-dialog__title" id="submitDialogTitle">免费提交 AI 工具收录</h1>
          <p class="tool-dialog__domain">免登录直投审核队列 · 欢迎自荐或推荐优质 AI 产品与开源项目</p>
        </div>
        <button class="icon-btn" id="submitDialogCloseBtn" type="button" command="close" commandfor="submitToolDialog" aria-label="关闭提交弹窗">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <form class="submit-form" id="submitToolForm" action="/api/submit" method="POST" aria-labelledby="submitDialogTitle" novalidate>
        <input type="text" name="website_hp" tabindex="-1" aria-hidden="true" autocomplete="off" class="sr-only">
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
          <button class="btn-primary" id="subPrimaryBtn" type="submit">免登录一键提交收录</button>
          <span class="copy-wrap">
            <button class="btn-secondary copy-button" id="subCopyBtn" type="button" command="--copy" commandfor="subMarkdownSnippet">复制收录信息</button>
            <span class="copy-tip" id="subCopyTip" role="status"></span>
          </span>
        </div>
      </form>
    </div>
  </dialog>`;
}

function renderShellHtml({ relRoot, title, description, canonicalUrl, jsonLdObj, mainHtml, keywords }) {
  const ldJson = JSON.stringify(jsonLdObj);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="color-scheme" content="light dark">
  <meta name="theme-color" content="#0071e3">
  <script>
    try {
      var savedScheme = localStorage.getItem("color-scheme");
      var validScheme = savedScheme === "light" || savedScheme === "dark" ? savedScheme : "light dark";
      document.querySelector('meta[name="color-scheme"]').content = validScheme;
    } catch (e) {}
  </script>
  <title>${escHtml(title)}</title>
  <meta name="description" content="${escHtml(description)}">
  <meta name="keywords" content="${escHtml(keywords)}">
  <link rel="canonical" href="${escHtml(canonicalUrl)}">
  <link rel="manifest" href="${relRoot}manifest.webmanifest">
  <link rel="search" type="application/opensearchdescription+xml" title="AI 导航聚合站" href="${relRoot}opensearch.xml">
  <link rel="alternate" type="application/rss+xml" title="AI 导航聚合站 · 每日 AI 资讯 RSS" href="https://dlzbkj-ai.pages.dev/feed.xml">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="AI 导航聚合站">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:title" content="${escHtml(title)}">
  <meta property="og:description" content="${escHtml(description)}">
  <meta property="og:url" content="${escHtml(canonicalUrl)}">
  <meta property="og:image" content="https://dlzbkj-ai.pages.dev/og-cover.png?v=2">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escHtml(title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escHtml(title)}">
  <meta name="twitter:description" content="${escHtml(description)}">
  <meta name="twitter:image" content="https://dlzbkj-ai.pages.dev/og-cover.png?v=2">
  <link rel="icon" type="image/png" sizes="64x64" href="${relRoot}favicon.png?v=5">
  <link rel="apple-touch-icon" sizes="180x180" href="${relRoot}apple-touch-icon.png?v=5">
  <link rel="stylesheet" href="${relRoot}styles.css?v=20">
  <link rel="stylesheet" href="${relRoot}seo-geo.css?v=2">
  <script type="application/ld+json">${ldJson}</script>
  <script type="module" src="${relRoot}subpage.js?v=4"></script>
</head>
<body>
  <header class="top-bar site-header" id="topBar">
    <div class="top-bar__inner">
      <div class="top-bar__left">
        <a class="brand" href="${relRoot}" aria-label="AI 导航聚合站首页">
          <img class="brand__icon" src="${relRoot}logo.jpg?v=5" alt="" width="28" height="28">
          <span class="brand__name">AI 导航聚合站</span>
        </a>
      </div>
      <div class="top-bar__actions">
        <nav class="site-nav" aria-label="主导航">
          <button class="menu-button" type="button" popovertarget="site-menu" popovertargetaction="toggle" aria-controls="site-menu">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16"/>
            </svg>
            <span>频道</span>
          </button>
          <ul id="site-menu" class="site-menu" popover="auto">
            <li><a href="${relRoot}">首页</a></li>
            <li><a href="${relRoot}scene/">场景专题</a></li>
            <li><a href="${relRoot}vs/">VS对比</a></li>
            <li><a href="${relRoot}category/" aria-current="page">分类榜单</a></li>
            <li><a href="${relRoot}news/">AI资讯</a></li>
            <li><a href="${relRoot}daily/">AI早报</a></li>
            <li><a href="${relRoot}moyu/">热榜</a></li>
          </ul>
        </nav>
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
${mainHtml}
  </main>
  <footer class="site-footer">
    <div class="site-footer__inner site-footer__bar">
      <p class="site-footer__copy">AI 导航聚合站 · 每日自动同步国内外主流 AI 工具、早报与热榜 · 零广告免登录</p>
      <nav class="site-footer__links" aria-label="站点底部导航">
        <button class="footer-link-btn" id="installAppBtn" type="button" hidden>安装桌面应用</button>
        <button class="footer-link-btn" type="button" command="show-modal" commandfor="submitToolDialog">免费提交工具收录</button>
        <a href="${relRoot}scene/">场景专题</a>
        <a href="${relRoot}vs/">VS对比库</a>
        <a href="${relRoot}category/">分类专题</a>
        <a href="${relRoot}tool/">热门工具库</a>
        <a href="${relRoot}daily/">每日AI早报</a>
        <a href="${relRoot}api/mcp">MCP服务</a>
        <a href="${relRoot}llms.txt">llms.txt</a>
        <a href="${relRoot}openapi.json">OpenAPI</a>
        <a href="${relRoot}feed.xml">RSS订阅</a>
        <a href="${relRoot}sitemap.xml">Sitemap</a>
        <a href="https://github.com/biqiufeng/ai-nav-hub" target="_blank" rel="noopener noreferrer">GitHub</a>
      </nav>
    </div>
  </footer>
${renderSubmitDialogHtml()}
  <div class="toast-region" aria-live="polite" aria-atomic="true">
    <div class="toast" id="toast" hidden></div>
  </div>
</body>
</html>`;
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const reqUrl = new URL(request.url);
  const rawSlug = String(params.slug || "")
    .trim()
    .toLowerCase()
    .replace(/\/+$/, "");

  if (!rawSlug || rawSlug === "index.html") {
    return env.ASSETS.fetch(request);
  }

  // Enforce trailing slash canonical URL for /tool/<slug>/
  if (!reqUrl.pathname.endsWith("/") && !reqUrl.pathname.endsWith(".html")) {
    const target = new URL(`/tool/${encodeURIComponent(rawSlug)}/${reqUrl.search}`, reqUrl.origin);
    return Response.redirect(target.toString(), 301);
  }

  const cache = caches.default;
  const originBase = `${reqUrl.protocol}//${reqUrl.host}`;
  const canonicalUrl = `${originBase}/tool/${encodeURIComponent(rawSlug)}/`;
  const cacheKey = new Request(canonicalUrl, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  let index;
  try {
    index = await ensureRuntimeIndex(request, env);
  } catch {
    return env.ASSETS.fetch(request);
  }

  const item = index.bySlug.get(rawSlug);
  if (!item) {
    const notFoundHtml = renderShellHtml({
      relRoot: "../../",
      title: "未找到该 AI 工具 · AI 导航聚合站",
      description: "该工具页面不存在或已合并更新，请返回首页检索 8,200+ 款国内外 AI 工具。",
      canonicalUrl: `${originBase}/tool/`,
      jsonLdObj: { "@context": "https://schema.org", "@type": "WebPage", name: "404 Not Found" },
      mainHtml: `    <section class="seo-hero">
      <span class="seo-hero__eyebrow">HTTP 404 · 页面不存在或已合并</span>
      <h1 class="seo-hero__title">未找到对应的 AI 工具详情页</h1>
      <p class="seo-hero__desc">该短链可能已归并至官方主域名。你可以直接前往首页实时搜索全库 ${index.items.length.toLocaleString("zh-CN")} 款 AI 工具。</p>
      <div class="seo-hero__stats">
        <a class="btn-primary" href="../../?q=${encodeURIComponent(rawSlug)}">在全库搜索「${escHtml(rawSlug)}」→</a>
        <a class="btn-secondary" href="../../category/">浏览 10 大分类榜单</a>
      </div>
    </section>`,
      keywords: "AI工具检索,AI导航聚合站",
    });
    return new Response(notFoundHtml, {
      status: 404,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "X-Robots-Tag": "noindex",
        "Cache-Control": "public, max-age=300, s-maxage=1800",
      },
    });
  }

  // Delegate pre-rendered flagship static pages to ASSETS when available
  if (index.flagshipIds.has(item.id) && env?.ASSETS) {
    const assetRes = await env.ASSETS.fetch(new Request(new URL(`/tool/${rawSlug}/index.html`, reqUrl.origin)));
    if (assetRes.ok && (assetRes.headers.get("content-type") || "").includes("text/html")) {
      return assetRes;
    }
  }

  const cfg = CAT_BY_RAW[item.category] || CATEGORY_META[CATEGORY_META.length - 1];
  const disp = cfg.display;
  const catSlug = cfg.slug;
  const name = item.name || item.domain || "AI 工具";
  const domain = item.domain || "";
  const url = item.url || "#";
  const desc = item.description || `${name} 是一款聚焦 ${disp} 场景的实用 AI 工具。`;
  const srcCnt = Math.max(1, (item.sources || []).length);
  const reg = regionLabel(item);
  const domFlag = isDomestic(item);
  const pricingStr = item.pricing || "免费额度";
  const todayStr = todayCstDate();

  const catList = index.byCategory.get(cfg.cat) || [];
  const peers = catList.filter((p) => p.id !== item.id);
  const domPeers = peers.filter((p) => isDomestic(p));
  const ovsPeers = peers.filter((p) => !isDomestic(p));
  const alts = [...domPeers.slice(0, 6), ...ovsPeers.slice(0, 4)].slice(0, 8);

  const altRows = alts
    .map((alt) => {
      const altDescRaw = alt.description || cfg.shortDesc;
      const altDesc = altDescRaw.length > 90 ? `${altDescRaw.slice(0, 90)}…` : altDescRaw;
      return `          <tr>
            <th scope="row"><a class="seo-tool-card__title-link" href="../${escHtml(alt.slug)}/">${escHtml(alt.name)}</a></th>
            <td>${escHtml(regionLabel(alt))}</td>
            <td>${Math.max(1, (alt.sources || []).length)} 大目录收录</td>
            <td class="compare-table__desc">${escHtml(altDesc)}</td>
            <td><a class="compare-table__link" href="${escHtml(alt.url)}" target="_blank" rel="noopener noreferrer">${escHtml(alt.domain || "官网")} ↗</a></td>
          </tr>`;
    })
    .join("\n");

  const siblingCards = peers
    .slice(0, 6)
    .map((sib) => renderStaticCard(sib, disp, "../../"))
    .join("\n");

  const altNamesTop5 = alts.slice(0, 5).map((a) => a.name).join("、") || disp;
  const domAltNames = domPeers.slice(0, 4).map((a) => a.name).join("、") || altNamesTop5;

  const accessAnswer = domFlag
    ? `${name} 的官方入口地址为 ${url}（主域名：${domain}）。该产品属于「${reg}」工具，国内网络环境下通常可直接打开访问使用。`
    : `${name} 的官方入口地址为 ${url}（主域名：${domain}）。该产品属于海外 AI 工具（${reg}），若希望寻找中文交互与国内免代理直连方案，可优先参考同赛道的国内平替工具：${domAltNames}。`;

  const faqs = [
    [`${name} 官网入口地址是什么？国内可以直接访问吗？`, accessAnswer],
    [
      `${name} 是免费的吗？主要有哪些核心功能？`,
      `${desc} 该工具当前计费模式标注为「${pricingStr}」，归属「${disp}」垂直赛道，已通过本站官方域名直连校验。`,
    ],
    [
      `2026 年有哪些好用的 ${name} 同类平替或国内替代工具？`,
      `在「${disp}」领域，与 ${name} 功能相近且口碑较高的热门替代或互补方案包括：${altNamesTop5}。其中支持国内免翻墙直连的代表工具有：${domAltNames}。`,
    ],
  ];

  const faqHtml = faqs
    .map(
      ([q, a], i) => `        <details class="faq-item" name="tool-faq"${i === 0 ? " open" : ""}>
          <summary>${escHtml(q)}</summary>
          <p class="faq-item__body">${escHtml(a)}</p>
        </details>`
    )
    .join("\n");

  const letter = (name.trim()[0] || "A").toUpperCase();
  const bg = avatarColor(domain || name);
  const heroIcon = avatarImgHtml(item, 48);
  const ogCardHref = `/api/og?type=tool&slug=${encodeURIComponent(rawSlug)}`;

  const mainHtml = `    <nav class="breadcrumb" aria-label="面包屑导航">
      <ol>
        <li><a href="../../">首页</a></li>
        <li><a href="../../category/${catSlug}/">${escHtml(disp)}</a></li>
        <li><a href="./" aria-current="page">${escHtml(name)}</a></li>
      </ol>
    </nav>

    <section class="seo-hero">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px;">
        <div class="tool-avatar tool-avatar--lg" style="--avatar-bg:${bg}" aria-hidden="true"><span>${escHtml(letter)}</span>${heroIcon}</div>
        <div>
          <span class="seo-hero__eyebrow" style="margin-bottom:4px;">${escHtml(disp)} · 官方直连已核验</span>
          <h1 class="seo-hero__title" style="margin:0;">${escHtml(name)}</h1>
        </div>
      </div>
      <p class="seo-hero__desc">${escHtml(desc)}</p>
      <div class="seo-hero__stats">
        <a class="btn-primary" href="${escHtml(url)}" target="_blank" rel="noopener noreferrer" data-track-tool="${escHtml(item.id)}">
          直达 ${escHtml(name)} 官方网站 (${escHtml(domain)})
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>
        </a>
        <span class="stat-pill">访问属性 <strong>${escHtml(reg)}</strong></span>
        <span class="stat-pill">计费模式 <strong>${escHtml(pricingStr)}</strong></span>
        <span class="stat-pill">所属赛道 <strong>${escHtml(disp)}</strong></span>
        <a class="btn-secondary" href="${escHtml(ogCardHref)}" target="_blank" rel="noopener" style="padding:7px 14px;font-size:13px;">生成专属分享海报</a>
        <a class="btn-secondary" href="../../category/${catSlug}/" style="padding:7px 14px;font-size:13px;">全部 ${catList.length} 款${escHtml(disp)}工具 →</a>
      </div>
    </section>

    <section class="seo-section" aria-labelledby="alt-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="alt-heading">${escHtml(name)} 同赛道平替与国内直连替代对比（Top ${alts.length}）</h2>
        <p class="seo-section__sub">优先列出同分类高共识及国内可直接访问的同类产品</p>
      </div>
      <div tabindex="0" role="region" aria-labelledby="alt-caption" class="table-wrapper">
        <table class="compare-table" style="--label-2:'访问区域';--label-3:'共识热度';--label-4:'核心特点对比';--label-5:'官网直达';">
          <caption id="alt-caption">${escHtml(name)} 同类 AI ${escHtml(disp)}平替工具对比表（${todayStr} 更新）</caption>
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
${altRows}
          </tbody>
        </table>
      </div>
    </section>

    <section class="seo-section" aria-labelledby="sib-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="sib-heading">更多「${escHtml(disp)}」高分工具推荐</h2>
        <a class="cat-section__more" href="../../?cat=${encodeURIComponent(cfg.cat)}">在全库实时搜索 →</a>
      </div>
      <div class="cards-grid">
${siblingCards}
      </div>
    </section>

    <section class="seo-section" aria-labelledby="tool-faq-heading">
      <div class="seo-section__head">
        <h2 class="seo-section__title" id="tool-faq-heading">关于 ${escHtml(name)} 的常见问答</h2>
      </div>
      <div class="faq-list">
${faqHtml}
      </div>
    </section>`;

  const swApp = {
    "@type": "SoftwareApplication",
    name,
    applicationCategory: cfg.appCat,
    operatingSystem: "Web",
    url,
    description: desc,
    inLanguage: "zh-CN",
  };
  if (["完全免费", "开源免费", "免费额度"].includes(pricingStr)) {
    swApp.offers = {
      "@type": "Offer",
      price: "0",
      priceCurrency: "CNY",
      availability: "https://schema.org/InStock",
      description: pricingStr,
    };
  }

  const ldObj = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首页", item: `${originBase}/` },
          { "@type": "ListItem", position: 2, name: disp, item: `${originBase}/category/${catSlug}/` },
          { "@type": "ListItem", position: 3, name, item: canonicalUrl },
        ],
      },
      swApp,
      {
        "@type": "FAQPage",
        mainEntity: faqs.map(([q, a]) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };

  const title = `${name} 官网入口、核心功能与 2026 国内直连平替推荐 · AI 导航聚合站`;
  const metaDesc = `${name}（${domain}）官方入口与功能解析：${desc.slice(0, 82)}… 同步整理 ${altNamesTop5} 等同赛道平替工具对比。`;
  const htmlDoc = renderShellHtml({
    relRoot: "../../",
    title,
    description: metaDesc,
    canonicalUrl,
    jsonLdObj: ldObj,
    mainHtml,
    keywords: `${name},${name}官网,${name}平替,${name}国内替代,${disp}AI工具`,
  });

  const out = new Response(htmlDoc, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
  context.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}
