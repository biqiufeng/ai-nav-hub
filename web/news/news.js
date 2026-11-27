import {
  initSiteNav,
  initThemeToggle,
  initTopBarScrollHide,
  createToast,
  bindSearchBox,
  copyWithFeedback,
  safeHttpUrl,
  canTransitionDisplay,
  initSubmitToolDialog,
} from "../nav.js?v=6";

const PAGE_BATCH = 24;
const SUPPORTS_HAS = typeof CSS !== "undefined" && CSS.supports?.("selector(:has(*))");

const els = {
  topBar: document.getElementById("topBar"),
  themeToggle: document.getElementById("themeToggle"),
  themeToggleLabel: document.getElementById("themeToggleLabel"),
  newsSearchBox: document.getElementById("newsSearchBox"),
  newsSearch: document.getElementById("newsSearch"),
  newsSearchClear: document.getElementById("newsSearchClear"),
  siteMenu: document.getElementById("site-menu"),
  newsTopics: document.getElementById("newsTopics"),
  newsCount: document.getElementById("newsCount"),
  newsGrid: document.getElementById("newsGrid"),
  newsEmpty: document.getElementById("newsEmpty"),
  newsEmptyTitle: document.getElementById("newsEmptyTitle"),
  newsEmptyDesc: document.getElementById("newsEmptyDesc"),
  newsEmptyBtn: document.getElementById("newsEmptyBtn"),
  newsLoadMoreWrap: document.getElementById("newsLoadMoreWrap"),
  newsLoadMoreBtn: document.getElementById("newsLoadMoreBtn"),
  newsDialog: document.getElementById("newsDialog"),
  newsDialogMeta: document.getElementById("newsDialogMeta"),
  newsDialogTitle: document.getElementById("newsDialogTitle"),
  newsDialogCloseBtn: document.getElementById("newsDialogCloseBtn"),
  newsDialogCover: document.getElementById("newsDialogCover"),
  newsDialogBody: document.getElementById("newsDialogBody"),
  newsDialogToolsWrap: document.getElementById("newsDialogToolsWrap"),
  newsDialogToolsList: document.getElementById("newsDialogToolsList"),
  newsDialogVisitBtn: document.getElementById("newsDialogVisitBtn"),
  newsDialogSourceBtn: document.getElementById("newsDialogSourceBtn"),
  newsDialogCopyBtn: document.getElementById("newsDialogCopyBtn"),
  newsDialogCopyText: document.getElementById("newsDialogCopyText"),
  toast: document.getElementById("toast"),
};

const showToast = createToast(els.toast);

let items = [];
let topics = [];
let activeTopic = "全部";
let visibleLimit = PAGE_BATCH;
let loadFailed = false;
let generatedAt = "";
let activeDialogItem = null;
let isLoading = false;
let toolEntities = [];

fetch("../data/tool-slugs.json")
  .then((r) => (r.ok ? r.json() : null))
  .then((d) => {
    if (Array.isArray(d?.entities)) toolEntities = d.entities;
  })
  .catch(() => {});

function matchNewsTools(text) {
  if (!text || toolEntities.length === 0) return [];
  const low = text.toLowerCase();
  const out = [];
  for (const ent of toolEntities) {
    const nm = ent.name;
    const nl = nm.toLowerCase();
    const hasZh = /[\u4e00-\u9fff]/.test(nm);
    if (hasZh ? low.includes(nl) : new RegExp(`(?<![a-z0-9])${nl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9])`).test(low)) {
      out.push(ent);
      if (out.length >= 4) break;
    }
  }
  return out;
}

function supportsTopLayerExit() {
  return Boolean(window.CSS?.supports?.("overlay", "auto") && canTransitionDisplay());
}

async function closeTopLayer(dialogEl) {
  if (!dialogEl.open) return;
  if (!supportsTopLayerExit()) {
    dialogEl.setAttribute("data-closing", "");
    const animations = dialogEl.getAnimations({ subtree: true });
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => setTimeout(r, 400)),
      ]);
    }
    if (!dialogEl.hasAttribute("data-closing")) return;
    dialogEl.removeAttribute("data-closing");
  }
  dialogEl.close();
}

els.newsDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeTopLayer(els.newsDialog);
});

let pointerDownOutside = false;
function isOutsideDialog(event) {
  const rect = els.newsDialog.getBoundingClientRect();
  return (
    event.clientY < rect.top ||
    event.clientY > rect.top + rect.height ||
    event.clientX < rect.left ||
    event.clientX > rect.left + rect.width
  );
}

els.newsDialog.addEventListener("pointerdown", (event) => {
  pointerDownOutside = event.target === els.newsDialog && isOutsideDialog(event);
});

els.newsDialog.addEventListener("click", (event) => {
  if (event.target !== els.newsDialog) {
    pointerDownOutside = false;
    return;
  }
  const shouldDismiss = pointerDownOutside && isOutsideDialog(event);
  pointerDownOutside = false;
  if (!shouldDismiss) return;
  if (!("closedBy" in HTMLDialogElement.prototype) || !supportsTopLayerExit()) {
    closeTopLayer(els.newsDialog);
  }
});

els.newsDialogCloseBtn.addEventListener("click", () => closeTopLayer(els.newsDialog));

els.newsDialog.addEventListener("close", () => {
  if (location.search.includes("id=")) {
    const clean = new URL(location.href);
    clean.searchParams.delete("id");
    history.replaceState(null, "", clean.pathname + clean.search + clean.hash);
  }
});

function buildShareNewsUrl(item) {
  const u = new URL(location.href);
  u.search = "";
  u.hash = "";
  u.searchParams.set("id", item.id);
  return u.toString();
}

els.newsDialogCopyBtn.addEventListener("click", () => {
  if (!activeDialogItem) return;
  copyWithFeedback(buildShareNewsUrl(activeDialogItem), els.newsDialogCopyBtn, showToast, els.newsDialogCopyText);
});

function formatDisplayTime(tsMs, fallbackText = "") {
  if (!Number.isFinite(tsMs) || tsMs <= 0) return fallbackText;
  const d = new Date(tsMs);
  if (Number.isNaN(d.getTime())) return fallbackText;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfItem = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfItem) / 86400000);
  const hhmm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

  if (diffDays === 0) return `今天 ${hhmm}`;
  if (diffDays === 1) return `昨天 ${hhmm}`;
  if (d.getFullYear() === now.getFullYear()) {
    return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${hhmm}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function renderSkeletons() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 6; i++) {
    const card = document.createElement("div");
    card.className = "skeleton-card news-skeleton";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = `<div class="skeleton-line skeleton-line--short"></div><div class="skeleton-line skeleton-line--title"></div><div class="skeleton-line"></div><div class="skeleton-line"></div>`;
    frag.appendChild(card);
  }
  els.newsGrid.replaceChildren(frag);
}

function renderTopics(baseItems) {
  const counts = new Map();
  for (const it of baseItems) {
    counts.set(it.topic, (counts.get(it.topic) || 0) + 1);
  }

  const ordered = ["全部", ...topics.filter((t) => counts.get(t) > 0)];
  if (activeTopic !== "全部" && !counts.get(activeTopic)) {
    activeTopic = "全部";
  }

  const frag = document.createDocumentFragment();
  for (const topic of ordered) {
    const num = topic === "全部" ? baseItems.length : counts.get(topic) || 0;
    const active = activeTopic === topic;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-pill" + (active ? " is-active" : "");
    btn.setAttribute("aria-pressed", String(active));
    btn.textContent = topic + " ";

    const span = document.createElement("span");
    span.className = "cat-pill__num";
    span.textContent = String(num);
    btn.appendChild(span);

    btn.addEventListener("click", () => {
      activeTopic = activeTopic === topic && topic !== "全部" ? "全部" : topic;
      visibleLimit = PAGE_BATCH;
      renderNews(true);
    });
    frag.appendChild(btn);
  }
  els.newsTopics.replaceChildren(frag);
}

function openNewsDialog(item) {
  activeDialogItem = item;

  const badge = document.createElement("span");
  badge.className = "meta-badge";
  badge.textContent = item.topic || "AI 资讯";

  const timeSpan = document.createElement("span");
  timeSpan.className = "meta-badge";
  timeSpan.textContent = item.published_at || formatDisplayTime(item.published_ts);

  const badgeNodes = [badge, timeSpan];
  if (item.source_name) {
    const sSpan = document.createElement("span");
    sSpan.className = "meta-badge";
    sSpan.textContent = item.source_name;
    badgeNodes.push(sSpan);
  }
  if (item.views > 0) {
    const vSpan = document.createElement("span");
    vSpan.className = "meta-badge";
    vSpan.textContent = `${item.views} 热度`;
    badgeNodes.push(vSpan);
  }
  els.newsDialogMeta.replaceChildren(...badgeNodes);
  els.newsDialogTitle.textContent = item.title;

  const coverUrl = safeHttpUrl(item.cover);
  if (coverUrl) {
    els.newsDialogCover.src = coverUrl;
    els.newsDialogCover.hidden = false;
  } else {
    els.newsDialogCover.removeAttribute("src");
    els.newsDialogCover.hidden = true;
  }

  const bodyFrag = document.createDocumentFragment();
  const blocks = Array.isArray(item.paragraphs) && item.paragraphs.length > 0
    ? item.paragraphs
    : [{ type: "text", text: item.summary || item.title }];

  for (const blk of blocks) {
    if (!blk?.text) continue;
    const node = document.createElement(blk.type === "heading" ? "h3" : "p");
    node.className = blk.type === "heading" ? "news-dialog__subhead" : "news-dialog__para";
    node.textContent = blk.text;
    bodyFrag.appendChild(node);
  }
  els.newsDialogBody.replaceChildren(bodyFrag);
  els.newsDialogBody.scrollTop = 0;

  if (els.newsDialogToolsWrap && els.newsDialogToolsList) {
    const fullTxt = `${item.title || ""} ${item.summary || ""} ${(item.paragraphs || []).map((p) => p.text).join(" ")}`;
    const matched = matchNewsTools(fullTxt);
    if (matched.length > 0) {
      const tFrag = document.createDocumentFragment();
      for (const ent of matched) {
        const a = document.createElement("a");
        a.className = "dialog-alts__chip";
        a.href = `../tool/${ent.slug}/`;
        a.textContent = `${ent.name}（${ent.pricing}）→`;
        tFrag.appendChild(a);
      }
      els.newsDialogToolsList.replaceChildren(tFrag);
      els.newsDialogToolsWrap.hidden = false;
    } else {
      els.newsDialogToolsWrap.hidden = true;
    }
  }

  const rawSource = safeHttpUrl(item.source_url);
  const cleanSource = rawSource && !rawSource.includes("codefather.cn") ? rawSource : "";
  if (cleanSource) {
    els.newsDialogVisitBtn.href = cleanSource;
    els.newsDialogVisitBtn.textContent = `阅读原始出处（${item.source_name || "原文"}）↗`;
    els.newsDialogVisitBtn.hidden = false;
  } else {
    els.newsDialogVisitBtn.removeAttribute("href");
    els.newsDialogVisitBtn.hidden = true;
  }
  els.newsDialogSourceBtn.removeAttribute("href");
  els.newsDialogSourceBtn.hidden = true;

  els.newsDialogCopyBtn.classList.remove("is-copied");
  els.newsDialogCopyText.textContent = "复制本站分享链接";

  els.newsDialog.removeAttribute("data-closing");
  els.newsDialog.showModal();
}

function createNewsCard(item, index, isLcpCover) {
  const shareHref = `?id=${encodeURIComponent(item.id)}`;

  const article = document.createElement("article");
  article.className = "news-card";
  if (index >= 12) article.classList.add("card-deferred");
  if (index < 12) {
    article.classList.add("is-entering");
    article.style.setProperty("--enter-delay", `${Math.min(index, 10) * 14}ms`);
  }

  const coverHref = safeHttpUrl(item.cover);
  if (coverHref) {
    const img = document.createElement("img");
    img.src = coverHref;
    img.alt = "";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    // modern-web-guidance: optimize-image-priority
    if (isLcpCover) {
      img.fetchPriority = "high";
    } else if (index >= 4) {
      img.loading = "lazy";
    }
    if (!SUPPORTS_HAS) article.classList.add("has-cover");
    img.addEventListener("error", () => {
      img.remove();
      article.classList.remove("has-cover");
    });
    article.appendChild(img);
  }

  const header = document.createElement("header");
  header.className = "news-card__header";

  const meta = document.createElement("div");
  meta.className = "news-card__meta";

  const topicTag = document.createElement("span");
  topicTag.className = "tag-chip";
  topicTag.textContent = item.topic || "前沿速递";

  const timeEl = document.createElement("time");
  timeEl.className = "news-card__time";
  if (item.date) timeEl.dateTime = item.date;
  timeEl.textContent = formatDisplayTime(item.published_ts, item.published_at);

  meta.append(topicTag, timeEl);

  const title = document.createElement("h2");
  title.className = "news-card__title";
  const titleLink = document.createElement("a");
  titleLink.className = "card-link";
  titleLink.href = shareHref;
  titleLink.textContent = item.title;
  titleLink.addEventListener("click", (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    history.replaceState(null, "", shareHref);
    openNewsDialog(item);
  });
  title.appendChild(titleLink);

  header.append(meta, title);

  const summary = document.createElement("p");
  summary.className = "news-card__summary";
  summary.textContent = item.summary || item.title;

  const footer = document.createElement("footer");
  footer.className = "news-card__footer";

  const stats = document.createElement("span");
  stats.className = "news-card__stats";
  const srcPrefix = item.source_name ? `${item.source_name}` : "AI 快讯";
  stats.textContent = item.views > 0 ? `${srcPrefix} · ${item.views} 热度` : srcPrefix;

  const actions = document.createElement("div");
  actions.className = "news-card__actions";

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "news-action-btn";
  previewBtn.textContent = "速览正文";
  previewBtn.setAttribute("aria-label", `速览 ${item.title}`);
  previewBtn.addEventListener("click", () => {
    history.replaceState(null, "", shareHref);
    openNewsDialog(item);
  });

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "news-action-btn";
  copyBtn.textContent = "分享链接";
  copyBtn.setAttribute("aria-label", `复制 ${item.title} 的本站分享链接`);
  copyBtn.addEventListener("click", () => copyWithFeedback(buildShareNewsUrl(item), copyBtn, showToast));

  actions.append(previewBtn, copyBtn);
  footer.append(stats, actions);

  article.append(header, summary, footer);
  return article;
}

function renderNews() {
  const q = els.newsSearch.value.trim().toLowerCase();
  const queryMatched = q
    ? items.filter((it) => `${it.title} ${it.summary} ${it.topic}`.toLowerCase().includes(q))
    : items;

  renderTopics(queryMatched);

  const filtered = activeTopic === "全部"
    ? queryMatched
    : queryMatched.filter((it) => it.topic === activeTopic);

  const syncHint = generatedAt ? ` · 更新于 ${generatedAt.slice(5, 16).replace("T", " ")}` : "";
  els.newsCount.textContent = `共 ${filtered.length} 条 AI 资讯${syncHint}`;

  if (filtered.length === 0) {
    els.newsGrid.replaceChildren();
    els.newsLoadMoreWrap.hidden = true;
    els.newsEmpty.hidden = false;
    els.newsEmptyTitle.textContent = "没有找到匹配的 AI 资讯";
    els.newsEmptyDesc.textContent = "试试换个关键词，或者恢复查看全部主题。";
    els.newsEmptyBtn.textContent = "清空筛选";
    return;
  }

  els.newsEmpty.hidden = true;
  const shown = filtered.slice(0, visibleLimit);
  const frag = document.createDocumentFragment();
  let lcpAssigned = false;

  shown.forEach((it, idx) => {
    const hasCover = Boolean(safeHttpUrl(it.cover));
    const isLcp = !lcpAssigned && hasCover && idx < 4;
    if (isLcp) lcpAssigned = true;
    const card = createNewsCard(it, idx, isLcp);
    if (card) frag.appendChild(card);
  });
  els.newsGrid.replaceChildren(frag);

  const remaining = filtered.length - shown.length;
  els.newsLoadMoreWrap.hidden = remaining <= 0;
  if (remaining > 0) {
    els.newsLoadMoreBtn.textContent = `展开更多资讯（还有 ${remaining} 条）`;
  }
}

async function fetchNewsPayload(forceRefresh) {
  try {
    const apiUrl = forceRefresh ? `/api/news?refresh=1&t=${Date.now()}` : "/api/news";
    const res = await fetch(apiUrl, { cache: forceRefresh ? "no-store" : "default" });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.items) && data.items.length > 0) {
        return { data, fromLive: true };
      }
    }
  } catch {
    // Fall back to static news.json
  }

  const fallbackRes = await fetch(`../data/news.json?t=${Date.now()}`, { cache: "no-store" });
  if (!fallbackRes.ok) throw new Error(`HTTP ${fallbackRes.status}`);
  const fallbackData = await fallbackRes.json();
  return { data: fallbackData, fromLive: false };
}

async function loadNews(showFeedback = false) {
  if (isLoading) return;
  isLoading = true;
  loadFailed = false;
  els.newsEmpty.hidden = true;
  if (items.length === 0 && els.newsGrid.childElementCount === 0) renderSkeletons();

  try {
    const { data, fromLive } = await fetchNewsPayload(showFeedback);
    items = Array.isArray(data.items) ? data.items : [];
    topics = Array.isArray(data.topics) ? data.topics : [];
    generatedAt = String(data.generated_at || "");
    renderNews();
    const deepId = new URLSearchParams(location.search).get("id");
    if (deepId && !els.newsDialog.open) {
      const targetItem = items.find((x) => String(x.id) === deepId);
      if (targetItem) openNewsDialog(targetItem);
    }
    if (showFeedback) {
      showToast(fromLive ? "AI 资讯已同步最新数据" : "实时接口暂不可用，已加载缓存资讯");
    }
  } catch {
    loadFailed = true;
    if (items.length === 0) {
      els.newsGrid.replaceChildren();
      els.newsLoadMoreWrap.hidden = true;
      els.newsCount.textContent = "资讯加载失败";
      els.newsEmpty.hidden = false;
      els.newsEmptyTitle.textContent = "AI 资讯暂时无法读取";
      els.newsEmptyDesc.textContent = "请检查网络连接或点击下方按钮重试。";
      els.newsEmptyBtn.textContent = "重新加载";
    }
    if (showFeedback) showToast("AI 资讯刷新失败");
  } finally {
    isLoading = false;
  }
}

bindSearchBox({
  input: els.newsSearch,
  clearBtn: els.newsSearchClear,
  boxEl: els.newsSearchBox,
  onChange: () => {
    visibleLimit = PAGE_BATCH;
    renderNews();
  },
  enableGlobalShortcut: true,
});

els.newsEmptyBtn.addEventListener("click", () => {
  if (loadFailed) {
    loadNews(true);
    return;
  }
  els.newsSearch.value = "";
  activeTopic = "全部";
  visibleLimit = PAGE_BATCH;
  els.newsSearchBox.classList.remove("has-value");
  els.newsSearchClear.hidden = true;
  renderNews();
});

els.newsLoadMoreBtn.addEventListener("click", () => {
  visibleLimit += PAGE_BATCH;
  renderNews();
});

const currentNewsNavLink = els.siteMenu?.querySelector('a[aria-current="page"]');
currentNewsNavLink?.addEventListener("click", (event) => {
  event.preventDefault();
  if (els.siteMenu?.matches?.(":popover-open")) {
    try { els.siteMenu.hidePopover(); } catch {}
  } else {
    els.siteMenu?.classList.remove("is-fallback-open");
  }
  if (window.scrollY > 120) {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  loadNews(true);
});

initSiteNav();
initSubmitToolDialog(showToast);
initTopBarScrollHide(els.topBar);
initThemeToggle(els.themeToggle, els.themeToggleLabel, showToast);
loadNews(false);
