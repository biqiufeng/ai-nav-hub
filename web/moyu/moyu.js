import {
  initSiteNav,
  initThemeToggle,
  initTopBarScrollHide,
  createToast,
  bindSearchBox,
  setRefreshBusy,
  prefersReducedMotion,
} from "../nav.js?v=2";

const GROUP_MAP = {
  tech: new Set(["36kr", "sspai", "ithome", "juejin", "csdn"]),
  social: new Set(["weibo", "zhihu", "baidu", "toutiao", "thepaper"]),
  media: new Set(["bilibili", "douyin", "doubannew", "tieba"]),
};

const HOT_PREVIEW = 15;

const els = {
  topBar: document.getElementById("topBar"),
  themeToggle: document.getElementById("themeToggle"),
  themeToggleLabel: document.getElementById("themeToggleLabel"),
  hotlistMeta: document.getElementById("hotlistMeta"),
  hotSearchBox: document.getElementById("hotSearchBox"),
  hotSearch: document.getElementById("hotSearch"),
  hotSearchClear: document.getElementById("hotSearchClear"),
  refreshHotBtn: document.getElementById("refreshHotBtn"),
  hotGroups: document.getElementById("hotGroups"),
  hotGrid: document.getElementById("hotGrid"),
  hotEmpty: document.getElementById("hotEmpty"),
  hotEmptyTitle: document.getElementById("hotEmptyTitle"),
  hotEmptyDesc: document.getElementById("hotEmptyDesc"),
  hotEmptyBtn: document.getElementById("hotEmptyBtn"),
  leisureCount: document.getElementById("leisureCount"),
  leisureGrid: document.getElementById("leisureGrid"),
  toast: document.getElementById("toast"),
};

const showToast = createToast(els.toast);

function safeUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

let platforms = [];
let activeGroup = "all";
let hotLoadFailed = false;
const expandedSet = new Set();

function formatHotVal(v) {
  const num = Number(v);
  if (!Number.isFinite(num) || num <= 0) return v ? String(v) : "";
  if (num >= 10000) return `${(num / 10000).toFixed(1)}w`;
  return String(num);
}

function renderHotSkeletons() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 6; i++) {
    const card = document.createElement("div");
    card.className = "skeleton-card hot-skeleton";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = `<div class="skeleton-line skeleton-line--title"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line skeleton-line--short"></div>`;
    frag.appendChild(card);
  }
  els.hotGrid.replaceChildren(frag);
}

function renderLeisureSkeletons() {
  const frag = document.createDocumentFragment();
  for (let i = 0; i < 8; i++) {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    card.style.minHeight = "108px";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = `<div class="skeleton-line skeleton-line--title"></div><div class="skeleton-line"></div><div class="skeleton-line skeleton-line--short"></div>`;
    frag.appendChild(card);
  }
  els.leisureGrid.replaceChildren(frag);
}

function createHotItemLi(item, idx, reveal = false) {
  const href = safeUrl(item.url);
  if (!href) return null;

  const li = document.createElement("li");
  li.className = "hot-item" + (reveal ? " hot-item--reveal" : "");

  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";

  const left = document.createElement("span");
  left.className = "hot-item__left";
  const rank = document.createElement("span");
  rank.className = "hot-item__rank" + (idx < 3 ? " hot-item__rank--top" : "");
  rank.textContent = String(idx + 1);
  const tSpan = document.createElement("span");
  tSpan.className = "hot-item__title";
  tSpan.textContent = item.title;
  left.append(rank, tSpan);

  const meta = document.createElement("span");
  meta.className = "hot-item__meta";
  if (item.is_new) {
    const tag = document.createElement("span");
    tag.className = "hot-tag hot-tag--new";
    tag.textContent = "新";
    meta.appendChild(tag);
  } else if (item.is_rising) {
    const tag = document.createElement("span");
    tag.className = "hot-tag hot-tag--up";
    tag.textContent = "升";
    meta.appendChild(tag);
  } else if (item.is_hot) {
    const tag = document.createElement("span");
    tag.className = "hot-tag hot-tag--hot";
    tag.textContent = "热";
    meta.appendChild(tag);
  }
  const hv = formatHotVal(item.hot_value);
  if (hv) {
    const val = document.createElement("span");
    val.className = "hot-item__val";
    val.textContent = hv;
    meta.appendChild(val);
  }

  a.append(left, meta);
  li.appendChild(a);
  return li;
}

function syncGroupPills() {
  els.hotGroups.querySelectorAll(".cat-pill").forEach((btn) => {
    const active = btn.dataset.group === activeGroup;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-pressed", String(active));
  });
}

function renderHotGrid() {
  const q = els.hotSearch.value.trim().toLowerCase();
  const frag = document.createDocumentFragment();
  let rendered = 0;

  for (const plat of platforms) {
    if (activeGroup !== "all" && !GROUP_MAP[activeGroup]?.has(plat.id)) continue;

    const matchedItems = q
      ? (plat.items || []).filter((it) => it.title.toLowerCase().includes(q))
      : plat.items || [];
    if (q && matchedItems.length === 0) continue;

    rendered++;
    const card = document.createElement("article");
    card.className = "hot-card";

    const head = document.createElement("div");
    head.className = "hot-card__head";
    const brand = document.createElement("div");
    brand.className = "hot-card__brand";

    const iconHref = safeUrl(plat.icon);
    if (iconHref) {
      const img = document.createElement("img");
      img.className = "hot-card__icon";
      img.src = iconHref;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      img.addEventListener("error", () => { img.hidden = true; });
      brand.appendChild(img);
    }
    const title = document.createElement("h2");
    title.className = "hot-card__title";
    title.textContent = plat.name;
    brand.appendChild(title);

    const timeEl = document.createElement("span");
    timeEl.className = "hot-card__time";
    timeEl.textContent = plat.updated_at ? plat.updated_at.slice(5, 16) : "";
    head.append(brand, timeEl);

    const isExpanded = expandedSet.has(plat.id) || Boolean(q);
    const visible = isExpanded ? matchedItems : matchedItems.slice(0, HOT_PREVIEW);
    const ul = document.createElement("ul");
    ul.className = "hot-card__list";

    visible.forEach((item, idx) => {
      const li = createHotItemLi(item, idx, false);
      if (li) ul.appendChild(li);
    });

    card.append(head, ul);

    if (!q && matchedItems.length > HOT_PREVIEW) {
      const foot = document.createElement("div");
      foot.className = "hot-card__foot";
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "btn-secondary hot-more-btn";
      moreBtn.setAttribute("aria-expanded", String(isExpanded));
      moreBtn.textContent = isExpanded ? "收起部分榜单" : `展开全部 ${matchedItems.length} 条`;

      moreBtn.addEventListener("click", () => {
        const nextExpanded = !expandedSet.has(plat.id);
        if (nextExpanded) {
          expandedSet.add(plat.id);
          const extraFrag = document.createDocumentFragment();
          const animateReveal = !prefersReducedMotion();
          for (let i = HOT_PREVIEW; i < matchedItems.length; i++) {
            const li = createHotItemLi(matchedItems[i], i, animateReveal);
            if (li) extraFrag.appendChild(li);
          }
          ul.appendChild(extraFrag);
        } else {
          expandedSet.delete(plat.id);
          while (ul.children.length > HOT_PREVIEW) {
            ul.removeChild(ul.lastElementChild);
          }
        }
        moreBtn.setAttribute("aria-expanded", String(nextExpanded));
        moreBtn.textContent = nextExpanded ? "收起部分榜单" : `展开全部 ${matchedItems.length} 条`;
      });

      foot.appendChild(moreBtn);
      card.appendChild(foot);
    }

    frag.appendChild(card);
  }

  els.hotGrid.replaceChildren(frag);
  if (rendered === 0) {
    els.hotEmpty.hidden = false;
    els.hotEmptyTitle.textContent = "没有找到匹配的热榜标题";
    els.hotEmptyDesc.textContent = "试试调整关键词，或切换回全部平台查看。";
    els.hotEmptyBtn.textContent = "清空筛选";
  } else {
    els.hotEmpty.hidden = true;
  }
}

async function loadHotlist(showFeedback = false) {
  hotLoadFailed = false;
  els.hotEmpty.hidden = true;
  setRefreshBusy(els.refreshHotBtn, true, "刷新热榜", "刷新中…");
  if (platforms.length === 0) renderHotSkeletons();

  try {
    const res = await fetch(`../data/hotlist.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    platforms = Array.isArray(data.platforms) ? data.platforms : [];
    const syncTime = data.generated_at ? data.generated_at.replace("T", " ").slice(0, 16) : "";
    els.hotlistMeta.textContent = `已聚合 ${platforms.length} 大平台实时榜单 · 最近刷新 ${syncTime}`;
    renderHotGrid();
    if (showFeedback) showToast("热榜已刷新");
  } catch {
    hotLoadFailed = true;
    els.hotlistMeta.textContent = "热榜加载失败，请稍后刷新重试";
    if (platforms.length === 0) {
      els.hotGrid.replaceChildren();
      els.hotEmpty.hidden = false;
      els.hotEmptyTitle.textContent = "热榜暂时无法读取";
      els.hotEmptyDesc.textContent = "请检查网络连接或点击下方按钮重试。";
      els.hotEmptyBtn.textContent = "重新加载";
    }
    if (showFeedback) showToast("热榜刷新失败");
  } finally {
    setRefreshBusy(els.refreshHotBtn, false, "刷新热榜", "刷新中…");
  }
}

async function loadLeisureSites() {
  renderLeisureSkeletons();
  try {
    const res = await fetch("../data/catalog.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const list = (data.items || []).filter((it) => it.category === "划水摸鱼").slice(0, 48);
    els.leisureCount.textContent = `共收录 ${list.length} 个精选休闲站点`;
    const frag = document.createDocumentFragment();
    for (const it of list) {
      const href = safeUrl(it.url);
      if (!href) continue;
      const a = document.createElement("a");
      a.className = "leisure-card";
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      const h = document.createElement("h3");
      h.className = "leisure-card__name";
      h.textContent = it.name;
      const p = document.createElement("p");
      p.className = "leisure-card__desc";
      p.textContent = it.description || it.domain;
      const d = document.createElement("span");
      d.className = "leisure-card__domain";
      d.textContent = it.domain;
      a.append(h, p, d);
      frag.appendChild(a);
    }
    els.leisureGrid.replaceChildren(frag);
  } catch {
    els.leisureGrid.replaceChildren();
    els.leisureCount.textContent = "休闲站点加载失败";
  }
}

els.hotGroups.querySelectorAll(".cat-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    const clicked = btn.dataset.group;
    activeGroup = activeGroup === clicked && clicked !== "all" ? "all" : clicked;
    syncGroupPills();
    renderHotGrid();
  });
});

const hotSearchController = bindSearchBox({
  input: els.hotSearch,
  clearBtn: els.hotSearchClear,
  boxEl: els.hotSearchBox,
  onChange: renderHotGrid,
  enableGlobalShortcut: true,
});

els.hotEmptyBtn.addEventListener("click", () => {
  if (hotLoadFailed) {
    loadHotlist(true);
    return;
  }
  els.hotSearch.value = "";
  activeGroup = "all";
  syncGroupPills();
  hotSearchController.sync();
  renderHotGrid();
});

els.refreshHotBtn.addEventListener("click", () => loadHotlist(true));

initSiteNav();
initTopBarScrollHide(els.topBar);
initThemeToggle(els.themeToggle, els.themeToggleLabel, showToast);
loadHotlist(false);
loadLeisureSites();
