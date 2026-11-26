import {
  initSiteNav,
  initThemeToggle,
  initTopBarScrollHide,
  createToast,
  bindSearchBox,
  setRefreshBusy,
  copyWithFeedback,
  safeHttpUrl,
  canTransitionDisplay,
} from "../nav.js?v=3";

const PAGE_BATCH = 24;
const SUPPORTS_HAS = typeof CSS !== "undefined" && CSS.supports?.("selector(:has(*))");

const els = {
  topBar: document.getElementById("topBar"),
  themeToggle: document.getElementById("themeToggle"),
  themeToggleLabel: document.getElementById("themeToggleLabel"),
  newsSearchBox: document.getElementById("newsSearchBox"),
  newsSearch: document.getElementById("newsSearch"),
  newsSearchClear: document.getElementById("newsSearchClear"),
  refreshNewsBtn: document.getElementById("refreshNewsBtn"),
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

els.newsDialogCopyBtn.addEventListener("click", () => {
  if (!activeDialogItem) return;
  const url = safeHttpUrl(activeDialogItem.url);
  if (url) {
    copyWithFeedback(url, els.newsDialogCopyBtn, showToast, els.newsDialogCopyText);
  }
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
  if (item.views > 0) {
    const vSpan = document.createElement("span");
    vSpan.className = "meta-badge";
    vSpan.textContent = `${item.views} 次浏览`;
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

  const visitHref = safeHttpUrl(item.url);
  if (visitHref) {
    els.newsDialogVisitBtn.href = visitHref;
    els.newsDialogVisitBtn.hidden = false;
  } else {
    els.newsDialogVisitBtn.removeAttribute("href");
    els.newsDialogVisitBtn.hidden = true;
  }

  const sourceHref = safeHttpUrl(item.source_url);
  if (sourceHref && sourceHref !== visitHref) {
    els.newsDialogSourceBtn.href = sourceHref;
    els.newsDialogSourceBtn.hidden = false;
  } else {
    els.newsDialogSourceBtn.removeAttribute("href");
    els.newsDialogSourceBtn.hidden = true;
  }

  els.newsDialogCopyBtn.classList.remove("is-copied");
  els.newsDialogCopyText.textContent = "复制链接";

  els.newsDialog.removeAttribute("data-closing");
  els.newsDialog.showModal();
}

function createNewsCard(item, index, isLcpCover) {
  const safeHref = safeHttpUrl(item.url);
  if (!safeHref) return null;

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
  titleLink.href = safeHref;
  titleLink.target = "_blank";
  titleLink.rel = "noopener noreferrer";
  titleLink.textContent = item.title;
  title.appendChild(titleLink);

  header.append(meta, title);

  const summary = document.createElement("p");
  summary.className = "news-card__summary";
  summary.textContent = item.summary || item.title;

  const footer = document.createElement("footer");
  footer.className = "news-card__footer";

  const stats = document.createElement("span");
  stats.className = "news-card__stats";
  stats.textContent = item.views > 0 ? `${item.views} 次浏览` : "";

  const actions = document.createElement("div");
  actions.className = "news-card__actions";

  const previewBtn = document.createElement("button");
  previewBtn.type = "button";
  previewBtn.className = "news-action-btn";
  previewBtn.textContent = "速览正文";
  previewBtn.setAttribute("aria-label", `速览 ${item.title}`);
  previewBtn.addEventListener("click", () => openNewsDialog(item));

  const copyBtn = document.createElement("button");
  copyBtn.type = "button";
  copyBtn.className = "news-action-btn";
  copyBtn.textContent = "复制链接";
  copyBtn.setAttribute("aria-label", `复制 ${item.title} 的链接`);
  copyBtn.addEventListener("click", () => copyWithFeedback(safeHref, copyBtn, showToast));

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

async function loadNews(showFeedback = false) {
  loadFailed = false;
  els.newsEmpty.hidden = true;
  setRefreshBusy(els.refreshNewsBtn, true, "刷新资讯", "刷新中…");
  if (items.length === 0) renderSkeletons();

  try {
    const res = await fetch(`../data/news.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    items = Array.isArray(data.items) ? data.items : [];
    topics = Array.isArray(data.topics) ? data.topics : [];
    generatedAt = String(data.generated_at || "");
    renderNews();
    if (showFeedback) showToast("AI 资讯已刷新");
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
    setRefreshBusy(els.refreshNewsBtn, false, "刷新资讯", "刷新中…");
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

els.refreshNewsBtn.addEventListener("click", () => loadNews(true));

initSiteNav();
initTopBarScrollHide(els.topBar);
initThemeToggle(els.themeToggle, els.themeToggleLabel, showToast);
loadNews(false);
