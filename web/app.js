import {
  initSiteNav,
  initThemeToggle,
  initTopBarScrollHide,
  createToast,
  bindSearchBox,
  bindTwoStepConfirm,
  copyWithFeedback,
  prefersReducedMotion,
  canTransitionDisplay,
  safeHttpUrl,
  renderToolAvatar,
  initSubmitToolDialog,
  yieldToMain,
} from "./nav.js?v=5";

const CAT_ICONS = {
  "对话写作": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  "编程开发": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  "图像设计": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>`,
  "视频音频": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"/></svg>`,
  "办公效率": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9h8M8 13h5"/></svg>`,
  "Agent与自动化": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
  "学习知识库": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`,
  "划水摸鱼": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  "新品速递": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
  "其他工具": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
};

const QUICK_VIEWS = [
  { id: "all", label: "全部精选" },
  { id: "hot", label: "热门推荐" },
  { id: "domestic", label: "国内主流" },
  { id: "overseas", label: "海外主流" },
  { id: "dev", label: "开发效率" },
  { id: "leisure", label: "影音娱乐" },
  { id: "favorites", label: "我的收藏" },
];

const DEV_CATEGORIES = new Set(["编程开发", "办公效率", "图像设计", "Agent与自动化"]);
const LEISURE_CATS = ["全部", "影视动漫", "音乐音效", "在线游戏", "磁力与工具", "休闲趣味"];

function displayCategoryName(cat) {
  return cat === "划水摸鱼" ? "影音娱乐" : cat;
}

function classifyLeisure(it) {
  const text = `${it.name || ""} ${it.description || ""} ${it.domain || ""}`.toLowerCase();
  if (/(音乐|音频|音效|配乐|歌曲|mp3|k歌|钢琴|猫耳fm|freesound|freepd|soundstripe|music|audio|bgm|声带|耳聆|淘声)/.test(text)) {
    return "音乐音效";
  }
  if (/(磁力|\bbt\b|bt之家|bt联盟|种子|dht|网盘|解析下载|视频下载|av\/bv|语音转文字|提取音频|convertio|datatool|下载熊猫|vip视频解析)/.test(text)) {
    return "磁力与工具";
  }
  if (/(游戏|game|贪吃蛇|红色警戒|红色井界|minecraft|我的世界|闯关|冒险|手柄|脑力|benchmark|play cs|poki|台球|弹力球|暗室|放风筝|在线驾驶)/.test(text)) {
    return "在线游戏";
  }
  if (/(电影|影视|剧|动漫|综艺|片库|资源站|资源网|资源采集|预告片|netflix|奈飞|video|追剧|搜番|喵物|potplayer)/.test(text)) {
    return "影视动漫";
  }
  return "休闲趣味";
}

const FAVORITES_KEY = "ai_nav_hub_favorites_v1";
const REGION_KEY = "ai_nav_hub_region_v1";
const PAGE_BATCH = 60;
const SECTION_PREVIEW = 12;

const state = {
  catalog: null,
  globalCounts: null,
  isPartialCatalog: false,
  fullFetchPromise: null,
  items: [],
  filtered: [],
  visibleLimit: PAGE_BATCH,
  region: loadRegion(),
  category: "全部",
  query: "",
  favorites: loadFavorites(),
  activeTool: null,
  pendingFavoritesRefresh: false,
  loadFailed: false,
  scrollspyObserver: null,
  scrollendHandler: null,
};

const els = {
  topBar: document.getElementById("topBar"),
  heroDock: document.getElementById("heroDock"),
  themeToggle: document.getElementById("themeToggle"),
  themeToggleLabel: document.getElementById("themeToggleLabel"),
  desktopSidebar: document.getElementById("desktopSidebar"),
  mobileSidebarHost: document.getElementById("mobileSidebarHost"),
  mobileDrawer: document.getElementById("mobileDrawer"),
  drawerOpen: document.getElementById("drawerOpen"),
  drawerClose: document.getElementById("drawerClose"),
  searchInput: document.getElementById("searchInput"),
  searchClear: document.getElementById("searchClear"),
  searchBox: document.querySelector(".search-box"),
  regionSegmented: document.getElementById("regionSegmented"),
  segmentedThumb: document.getElementById("segmentedThumb"),
  categoryBar: document.getElementById("categoryBar"),
  resultCounter: document.getElementById("resultCounter"),
  shareFavBtn: document.getElementById("shareFavBtn"),
  exportFavBtn: document.getElementById("exportFavBtn"),
  clearFavBtn: document.getElementById("clearFavBtn"),
  catalogContainer: document.getElementById("catalogContainer"),
  emptyState: document.getElementById("emptyState"),
  emptyTitle: document.getElementById("emptyTitle"),
  emptyDesc: document.getElementById("emptyDesc"),
  emptyResetBtn: document.getElementById("emptyResetBtn"),
  loadMoreWrap: document.getElementById("loadMoreWrap"),
  loadMoreBtn: document.getElementById("loadMoreBtn"),
  toolDialog: document.getElementById("toolDialog"),
  dialogAvatar: document.getElementById("dialogAvatar"),
  dialogTitle: document.getElementById("dialogTitle"),
  dialogDomain: document.getElementById("dialogDomain"),
  dialogDesc: document.getElementById("dialogDesc"),
  dialogRegionBadge: document.getElementById("dialogRegionBadge"),
  dialogPricingBadge: document.getElementById("dialogPricingBadge"),
  dialogCategoryBadge: document.getElementById("dialogCategoryBadge"),
  dialogVisitBtn: document.getElementById("dialogVisitBtn"),
  dialogCopyBtn: document.getElementById("dialogCopyBtn"),
  dialogCopyText: document.getElementById("dialogCopyText"),
  dialogFavBtn: document.getElementById("dialogFavBtn"),
  dialogFavText: document.getElementById("dialogFavText"),
  dialogCloseBtn: document.getElementById("dialogCloseBtn"),
  toast: document.getElementById("toast"),
};

function catSlug(cat) {
  return "cat-" + encodeURIComponent(cat).replace(/%/g, "_");
}

const showToast = createToast(els.toast);

window.addEventListener("storage", (e) => {
  if (e.key === FAVORITES_KEY) {
    state.favorites = loadFavorites();
    applyFilters(false);
  }
});

/* ---------- Mobile navigation drawer (modern-web-guidance: navigation-drawer) ---------- */
const drawerScroller = els.mobileDrawer.querySelector(".Drawer-scroller");
const drawerSheet = els.mobileDrawer.querySelector(".Drawer-sheet");

async function openDrawer() {
  els.mobileDrawer.showModal();
  if (!CSS.supports("scroll-initial-target", "nearest")) {
    drawerScroller.scrollTo({ left: drawerScroller.offsetWidth, behavior: "instant" });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
  drawerScroller.scrollTo({ left: 0, behavior: "auto" });
}

function closeDrawer() {
  if (!els.mobileDrawer.open) return;
  drawerScroller.scrollTo({ left: drawerScroller.offsetWidth, behavior: "auto" });
}

if (!CSS.supports("animation-timeline: scroll()")) {
  drawerScroller.addEventListener("scroll", () => {
    const w = drawerSheet.offsetWidth || 1;
    const ratio = Math.max(0, Math.min(1, 1 - drawerScroller.scrollLeft / w));
    els.mobileDrawer.style.setProperty("--drawer-backdrop", String(ratio));
  });
}

const drawerVisibleThreshold = Math.max(0.001, 1 / Math.max(320, window.innerWidth));
const drawerObserver = new IntersectionObserver(
  (entries) => {
    const entry = entries[entries.length - 1];
    if (!entry) return;
    if (entry.intersectionRatio < drawerVisibleThreshold && els.mobileDrawer.open) {
      els.mobileDrawer.close();
      els.drawerOpen.setAttribute("aria-expanded", "false");
    }
    if (entry.intersectionRatio === 1) {
      els.drawerOpen.setAttribute("aria-expanded", "true");
    }
  },
  { root: els.mobileDrawer, threshold: [drawerVisibleThreshold, 1] }
);
drawerObserver.observe(drawerSheet);

els.drawerOpen.addEventListener("click", openDrawer);
els.drawerClose.addEventListener("click", closeDrawer);
els.mobileDrawer.addEventListener("click", (e) => {
  if (!drawerSheet.contains(e.target)) closeDrawer();
});
els.mobileDrawer.addEventListener("cancel", (e) => {
  if (e.cancelable) {
    e.preventDefault();
    closeDrawer();
  }
});

/* ---------- Tool details dialog ---------- */
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

els.toolDialog.addEventListener("cancel", (event) => {
  event.preventDefault();
  closeTopLayer(els.toolDialog);
});

els.toolDialog.addEventListener("close", () => {
  if (state.pendingFavoritesRefresh) {
    state.pendingFavoritesRefresh = false;
    applyFilters(false);
  }
});

let pointerDownOutside = false;
function isEventOutsideDialog(event) {
  const rect = els.toolDialog.getBoundingClientRect();
  return (
    event.clientY < rect.top ||
    event.clientY > rect.top + rect.height ||
    event.clientX < rect.left ||
    event.clientX > rect.left + rect.width
  );
}

els.toolDialog.addEventListener("pointerdown", (event) => {
  pointerDownOutside = event.target === els.toolDialog && isEventOutsideDialog(event);
});

els.toolDialog.addEventListener("click", (event) => {
  if (event.target !== els.toolDialog) {
    pointerDownOutside = false;
    return;
  }
  const shouldDismiss = pointerDownOutside && isEventOutsideDialog(event);
  pointerDownOutside = false;
  if (!shouldDismiss) return;
  if (!("closedBy" in HTMLDialogElement.prototype) || !supportsTopLayerExit()) {
    closeTopLayer(els.toolDialog);
  }
});

els.dialogCloseBtn.addEventListener("click", () => closeTopLayer(els.toolDialog));

/* ---------- Storage helpers ---------- */
function safeGetStorage(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function safeSetStorage(key, val) {
  try { localStorage.setItem(key, val); } catch {}
}
function safeRemoveStorage(key) {
  try { localStorage.removeItem(key); } catch {}
}

function loadFavorites() {
  try {
    const raw = safeGetStorage(FAVORITES_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveFavorites() {
  safeSetStorage(FAVORITES_KEY, JSON.stringify([...state.favorites]));
}

function loadRegion() {
  const val = safeGetStorage(REGION_KEY);
  return ["all", "hot", "domestic", "overseas", "dev", "leisure", "favorites"].includes(val) ? val : "all";
}

/* ---------- Segmented control thumb ---------- */
function positionThumb(instant = false) {
  const activeBtn = els.regionSegmented.querySelector(".segmented__btn.is-active");
  if (!activeBtn) return;
  if (instant) els.regionSegmented.classList.remove("is-ready");
  els.segmentedThumb.style.width = `${activeBtn.offsetWidth}px`;
  els.segmentedThumb.style.transform = `translateX(${activeBtn.offsetLeft}px)`;
  if (instant) {
    requestAnimationFrame(() => els.regionSegmented.classList.add("is-ready"));
  }
}

new ResizeObserver(() => positionThumb(false)).observe(els.regionSegmented);
document.fonts?.ready?.then(() => positionThumb(false));

/* ---------- Filtering & sidebar rendering ---------- */
function matchesRegion(item, region) {
  if (region === "favorites") return state.favorites.has(item.id);
  if (region === "hot") return (item.sources?.length || 0) >= 2;
  if (region === "dev") return DEV_CATEGORIES.has(item.category);
  if (region === "leisure") return item.category === "划水摸鱼" || item.category === "影音娱乐";
  if (region === "domestic") {
    return Array.isArray(item.regions) ? item.regions.includes("domestic") : item.region === "domestic";
  }
  if (region === "overseas") {
    return Array.isArray(item.regions) ? item.regions.includes("overseas") : item.region === "overseas";
  }
  return true;
}

function getBaseItems() {
  return state.items.filter((i) => matchesRegion(i, state.region));
}

function isSectionMode() {
  return state.region === "all" && state.category === "全部" && !state.query.trim();
}

function setRegion(nextRegion) {
  if (nextRegion === state.region && state.category === "全部") return;
  if (state.isPartialCatalog) hydrateFullCatalog();
  state.region = nextRegion;
  state.category = "全部";
  state.visibleLimit = PAGE_BATCH;
  safeSetStorage(REGION_KEY, nextRegion);
  els.regionSegmented.querySelectorAll(".segmented__btn").forEach((b) => {
    const active = b.dataset.region === nextRegion;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", String(active));
  });
  const activeSeg = els.regionSegmented.querySelector(".segmented__btn.is-active");
  activeSeg?.scrollIntoView({
    inline: "nearest",
    block: "nearest",
    container: "nearest",
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
  positionThumb(false);
  applyFilters(true);
}

function computeRegionCounts() {
  const favCount = state.isPartialCatalog
    ? state.favorites.size
    : state.items.filter((i) => state.favorites.has(i.id)).length;
  if (state.isPartialCatalog && state.globalCounts) {
    return {
      all: state.globalCounts.all ?? state.items.length,
      hot: state.globalCounts.hot ?? state.items.filter((i) => matchesRegion(i, "hot")).length,
      domestic: state.globalCounts.domestic ?? state.items.filter((i) => matchesRegion(i, "domestic")).length,
      overseas: state.globalCounts.overseas ?? state.items.filter((i) => matchesRegion(i, "overseas")).length,
      dev: state.globalCounts.dev ?? state.items.filter((i) => matchesRegion(i, "dev")).length,
      leisure: state.globalCounts.leisure ?? state.items.filter((i) => matchesRegion(i, "leisure")).length,
      favorites: favCount,
    };
  }
  return {
    all: state.items.length,
    hot: state.items.filter((i) => matchesRegion(i, "hot")).length,
    domestic: state.items.filter((i) => matchesRegion(i, "domestic")).length,
    overseas: state.items.filter((i) => matchesRegion(i, "overseas")).length,
    dev: state.items.filter((i) => matchesRegion(i, "dev")).length,
    leisure: state.items.filter((i) => matchesRegion(i, "leisure")).length,
    favorites: favCount,
  };
}

function renderSidebarInto(hostEl, isMobile = false) {
  const regionCounts = computeRegionCounts();

  const baseItems = getBaseItems();
  const isLeisureView = state.region === "leisure";
  const catCounts = new Map();
  if (state.isPartialCatalog && state.region === "all" && state.globalCounts?.by_category) {
    for (const [k, v] of Object.entries(state.globalCounts.by_category)) {
      catCounts.set(k, v);
    }
  } else {
    for (const it of baseItems) {
      const key = isLeisureView ? it._leisureSub : it.category;
      catCounts.set(key, (catCounts.get(key) || 0) + 1);
    }
  }

  const frag = document.createDocumentFragment();

  // 1. Quick views
  const gQuick = document.createElement("div");
  gQuick.className = "sidebar-group";
  gQuick.innerHTML = `<h2 class="sidebar-group__title">快速选择</h2>`;
  const ulQuick = document.createElement("ul");
  ulQuick.className = "sidebar-list";
  for (const qv of QUICK_VIEWS) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sidebar-item" + (state.region === qv.id ? " is-active" : "");
    btn.innerHTML = `<span class="sidebar-item__left"><span class="sidebar-item__label">${qv.label}</span></span><span class="sidebar-item__count">${regionCounts[qv.id]}</span>`;
    btn.addEventListener("click", () => {
      setRegion(qv.id);
      if (isMobile) closeDrawer();
    });
    li.appendChild(btn);
    ulQuick.appendChild(li);
  }
  gQuick.appendChild(ulQuick);
  frag.appendChild(gQuick);

  // 2. Categories (Scrollspy anchors in section overview mode, filter buttons otherwise)
  const gCats = document.createElement("div");
  gCats.className = "sidebar-group";
  gCats.innerHTML = `<h2 class="sidebar-group__title">分类导航</h2>`;
  const navCats = document.createElement("nav");
  navCats.className = "sidebar-list sidebar-cat-nav";
  navCats.setAttribute("aria-label", "分类快速导航");

  const sectionMode = isSectionMode();
  const navCategories = isLeisureView ? LEISURE_CATS.slice(1) : (state.catalog?.categories || []);
  for (const cat of navCategories) {
    const cnt = catCounts.get(cat) || 0;
    if (cnt === 0) continue;
    const iconSvg = CAT_ICONS[isLeisureView ? "划水摸鱼" : cat] || CAT_ICONS["其他工具"];
    const el = document.createElement(sectionMode ? "a" : "button");
    if (sectionMode) {
      el.href = `#${catSlug(cat)}`;
      el.className = "sidebar-item sidebar-cat-link";
    } else {
      el.type = "button";
      el.className = "sidebar-item" + (state.category === cat ? " is-active" : "");
    }
    el.innerHTML = `<span class="sidebar-item__left"><span class="sidebar-item__icon" aria-hidden="true">${iconSvg}</span><span class="sidebar-item__label">${isLeisureView ? cat : displayCategoryName(cat)}</span></span><span class="sidebar-item__count">${cnt}</span>`;
    el.addEventListener("click", () => {
      if (!sectionMode) {
        if (!isLeisureView && cat === "划水摸鱼") {
          setRegion("leisure");
        } else {
          state.category = state.category === cat ? "全部" : cat;
          state.visibleLimit = PAGE_BATCH;
          applyFilters(true);
        }
      }
      if (isMobile) closeDrawer();
    });
    navCats.appendChild(el);
  }
  gCats.appendChild(navCats);
  frag.appendChild(gCats);

  hostEl.replaceChildren(frag);
}

function setupScrollspy() {
  if (state.scrollspyObserver) {
    state.scrollspyObserver.disconnect();
    state.scrollspyObserver = null;
  }
  if (state.scrollendHandler) {
    document.removeEventListener("scrollend", state.scrollendHandler);
    state.scrollendHandler = null;
  }
  if (!isSectionMode()) return;

  const navLinks = [...document.querySelectorAll(".sidebar-cat-link")];
  const sections = [...document.querySelectorAll(".cat-section")];
  if (navLinks.length === 0 || sections.length === 0) return;

  if (CSS.supports("scroll-target-group: auto")) {
    const syncAriaCurrent = () => {
      const current = document.querySelector(".sidebar-cat-link:target-current");
      navLinks.forEach((link) => {
        link.setAttribute("aria-current", link === current ? "true" : "false");
      });
    };
    state.scrollendHandler = syncAriaCurrent;
    syncAriaCurrent();
    document.addEventListener("scrollend", state.scrollendHandler, { passive: true });
    return;
  }

  // Fallback for Firefox/Safari: IntersectionObserver
  state.scrollspyObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          navLinks.forEach((link) => {
            const active = link.getAttribute("href") === `#${id}`;
            link.classList.toggle("target-current", active);
            link.setAttribute("aria-current", String(active));
          });
        }
      }
    },
    { rootMargin: "-32% 0px -60% 0px", threshold: 0 }
  );
  sections.forEach((sec) => state.scrollspyObserver.observe(sec));
}

function updateCounts() {
  const map = computeRegionCounts();
  for (const [k, v] of Object.entries(map)) {
    const el = els.regionSegmented.querySelector(`[data-count="${k}"]`);
    if (el) el.textContent = String(v);
  }

  const showFavActions = state.region === "favorites" && map.favorites > 0;
  els.clearFavBtn.hidden = !showFavActions;
  if (els.shareFavBtn) els.shareFavBtn.hidden = !showFavActions;
  if (els.exportFavBtn) els.exportFavBtn.hidden = !showFavActions;
  if (els.clearFavBtn.hidden) clearFavConfirm.reset();

  positionThumb(false);
}

function renderCategories(baseItems) {
  const isLeisureView = state.region === "leisure";
  const counts = new Map();
  if (state.isPartialCatalog && state.region === "all" && state.globalCounts?.by_category) {
    for (const [k, v] of Object.entries(state.globalCounts.by_category)) {
      counts.set(k, v);
    }
  } else {
    for (const it of baseItems) {
      const key = isLeisureView ? it._leisureSub : it.category;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  const orderedCats = isLeisureView
    ? LEISURE_CATS
    : ["全部", ...(state.catalog?.categories || [])];
  if (state.category !== "全部" && !counts.get(state.category)) {
    state.category = "全部";
  }

  const totalBaseLen =
    state.isPartialCatalog && state.region === "all" && state.globalCounts?.all
      ? state.globalCounts.all
      : baseItems.length;

  const frag = document.createDocumentFragment();
  for (const cat of orderedCats) {
    const num = cat === "全部" ? totalBaseLen : counts.get(cat) || 0;
    if (cat !== "全部" && num === 0) continue;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-pill" + (state.category === cat ? " is-active" : "");
    btn.setAttribute("aria-pressed", String(state.category === cat));
    btn.dataset.category = cat;
    btn.textContent = (isLeisureView ? cat : displayCategoryName(cat)) + " ";

    const span = document.createElement("span");
    span.className = "cat-pill__num";
    span.textContent = String(num);
    btn.appendChild(span);

    btn.addEventListener("click", () => {
      if (!isLeisureView && cat === "划水摸鱼") {
        setRegion("leisure");
        return;
      }
      state.category = state.category === cat && cat !== "全部" ? "全部" : cat;
      state.visibleLimit = PAGE_BATCH;
      applyFilters(true);
    });
    frag.appendChild(btn);
  }

  els.categoryBar.replaceChildren(frag);
}

function updateCardFavButton(btnEl, item, nowFaved) {
  btnEl.classList.toggle("is-faved", nowFaved);
  btnEl.classList.remove("is-popping");
  void btnEl.offsetWidth;
  btnEl.classList.add("is-popping");
  btnEl.setAttribute("aria-pressed", String(nowFaved));
  btnEl.setAttribute("aria-label", nowFaved ? `取消收藏 ${item.name}` : `收藏 ${item.name}`);
  const poly = btnEl.querySelector("polygon");
  if (poly) poly.setAttribute("fill", nowFaved ? "currentColor" : "none");
}

function formatAccessLabel(item, compact = false) {
  const am = item.access_mode || "";
  const regs = Array.isArray(item.regions) ? item.regions : [item.region];
  if (am === "cn_native" || regs.includes("domestic")) {
    return compact ? "国内直连" : "国内直连";
  }
  if (am === "intl_network") {
    return compact ? "需国际网络" : "海外主流 · 需国际网络";
  }
  if (item.cn_featured) {
    return compact ? "海外直连" : "海外直连 · 国内热推";
  }
  return "海外直连";
}

function pricingChipClass(pricing) {
  if (pricing === "完全免费") return "tag-chip tag-chip--free";
  if (pricing === "开源免费") return "tag-chip tag-chip--oss";
  if (pricing === "付费订阅") return "tag-chip tag-chip--paid";
  return "tag-chip tag-chip--freemium";
}

function createCardElement(item, index, animateEnter, deferIndex = 16) {
  const card = document.createElement("article");
  card.className = "tool-card";
  card.dataset.id = item.id;
  if (index >= deferIndex) card.classList.add("card-deferred");
  if (animateEnter && index < 16) {
    card.classList.add("is-entering");
    card.style.setProperty("--enter-delay", `${Math.min(index, 12) * 12}ms`);
  }
  card.tabIndex = 0;
  card.setAttribute("role", "button");
  card.setAttribute("aria-label", `${item.name}，${displayCategoryName(item.category)}，点击查看详情`);

  const top = document.createElement("div");
  top.className = "tool-card__top";

  const head = document.createElement("div");
  head.className = "tool-card__head";

  const avatar = document.createElement("div");
  avatar.className = "tool-avatar";
  renderToolAvatar(avatar, item);

  const titles = document.createElement("div");
  titles.className = "tool-card__titles";

  const name = document.createElement("h3");
  name.className = "tool-card__name";
  name.textContent = item.name;

  const domain = document.createElement("p");
  domain.className = "tool-card__domain";
  domain.textContent = item.domain;

  titles.append(name, domain);
  head.append(avatar, titles);

  const quick = document.createElement("div");
  quick.className = "tool-card__quick";

  const favBtn = document.createElement("button");
  favBtn.type = "button";
  favBtn.dataset.favFor = item.id;
  const isFaved = state.favorites.has(item.id);
  favBtn.className = "icon-btn" + (isFaved ? " is-faved" : "");
  favBtn.setAttribute("aria-label", isFaved ? `取消收藏 ${item.name}` : `收藏 ${item.name}`);
  favBtn.setAttribute("aria-pressed", String(isFaved));
  favBtn.innerHTML = `<svg viewBox="0 0 24 24" width="17" height="17" fill="${isFaved ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`;
  favBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleFavorite(item, favBtn);
  });

  const safeHref = safeHttpUrl(item.url);
  if (safeHref) {
    const visitLink = document.createElement("a");
    visitLink.className = "icon-btn";
    visitLink.href = safeHref;
    visitLink.target = "_blank";
    visitLink.rel = "noopener noreferrer";
    visitLink.setAttribute("aria-label", `直接访问 ${item.name}`);
    visitLink.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10"/></svg>`;
    visitLink.addEventListener("click", (e) => e.stopPropagation());
    quick.append(favBtn, visitLink);
  } else {
    quick.append(favBtn);
  }

  top.append(head, quick);

  const desc = document.createElement("p");
  desc.className = "tool-card__desc";
  desc.textContent = item.description || `${item.category} · ${item.domain}`;

  const foot = document.createElement("div");
  foot.className = "tool-card__foot";

  const tagsWrap = document.createElement("div");
  tagsWrap.className = "tool-card__tags";

  const catTag = document.createElement("span");
  catTag.className = "tag-chip";
  catTag.textContent = item._leisureSub || displayCategoryName(item.category);
  tagsWrap.appendChild(catTag);

  if (item.pricing) {
    const pTag = document.createElement("span");
    pTag.className = pricingChipClass(item.pricing);
    pTag.textContent = item.pricing;
    tagsWrap.appendChild(pTag);
  }

  const regHint = document.createElement("span");
  regHint.className = "region-hint";
  regHint.textContent = formatAccessLabel(item, true);

  foot.append(tagsWrap, regHint);
  card.append(top, desc, foot);

  card.addEventListener("click", () => openDialog(item));
  card.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openDialog(item);
    }
  });

  return card;
}

function renderSectionedView(items, animateEnter) {
  const byCat = new Map();
  for (const cat of state.catalog?.categories || []) {
    byCat.set(cat, []);
  }
  for (const it of items) {
    if (!byCat.has(it.category)) byCat.set(it.category, []);
    byCat.get(it.category).push(it);
  }

  const frag = document.createDocumentFragment();
  let globalIdx = 0;

  for (const [cat, list] of byCat.entries()) {
    if (list.length === 0) continue;
    const sec = document.createElement("section");
    sec.className = "cat-section";
    sec.id = catSlug(cat);
    sec.tabIndex = -1;

    const head = document.createElement("div");
    head.className = "cat-section__head";

    const titleWrap = document.createElement("div");
    titleWrap.className = "cat-section__title-wrap";
    const sectionTitle = cat === "划水摸鱼" ? "影音娱乐精选" : cat;
    titleWrap.innerHTML = `<span class="cat-section__icon" aria-hidden="true">${CAT_ICONS[cat] || CAT_ICONS["其他工具"]}</span><h2 class="cat-section__title">${sectionTitle}</h2><span class="cat-section__count">${list.length} 款</span>`;

    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "cat-section__more";
    moreBtn.textContent = list.length > SECTION_PREVIEW ? `查看全部 ${list.length} 款 →` : "只看本类 →";
    moreBtn.addEventListener("click", () => {
      if (cat === "划水摸鱼") {
        setRegion("leisure");
      } else {
        state.category = cat;
        state.visibleLimit = PAGE_BATCH;
        applyFilters(true);
      }
      window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    });

    head.append(titleWrap, moreBtn);

    const grid = document.createElement("div");
    grid.className = "cards-grid";
    const slice = list.slice(0, SECTION_PREVIEW);
    slice.forEach((it) => {
      grid.appendChild(createCardElement(it, globalIdx, animateEnter, 12));
      globalIdx++;
    });

    sec.append(head, grid);
    frag.appendChild(sec);
  }

  els.catalogContainer.replaceChildren(frag);
  els.loadMoreWrap.hidden = true;
}

function applyFilters(animateEnter = false) {
  updateCounts();

  const baseItems = getBaseItems();
  renderCategories(baseItems);
  renderSidebarInto(els.desktopSidebar, false);
  renderSidebarInto(els.mobileSidebarHost, true);

  const isLeisureView = state.region === "leisure";
  const q = state.query.trim().toLowerCase();
  state.filtered = baseItems.filter((it) => {
    if (state.category !== "全部") {
      const catKey = isLeisureView ? it._leisureSub : it.category;
      if (catKey !== state.category) return false;
    }
    if (!q) return true;
    const hay = `${it.name} ${it.description} ${it.domain} ${it.category} ${it.pricing || ""} ${it._leisureSub || ""}`.toLowerCase();
    return hay.includes(q);
  });

  const totalDisplayed =
    state.isPartialCatalog && isSectionMode() && state.globalCounts?.all
      ? state.globalCounts.all
      : state.filtered.length;
  els.resultCounter.textContent = `共 ${totalDisplayed} 款工具`;

  if (state.filtered.length === 0) {
    els.catalogContainer.replaceChildren();
    els.emptyState.hidden = false;
    els.loadMoreWrap.hidden = true;
    if (state.region === "favorites" && state.favorites.size === 0) {
      els.emptyTitle.textContent = "还没有收藏任何工具";
      els.emptyDesc.textContent = "点击任意工具卡片右上角的星标，即可快速沉淀到你的个人常用区。";
      els.emptyResetBtn.textContent = "去逛逛全部工具";
    } else {
      els.emptyTitle.textContent = "没有找到匹配的工具";
      els.emptyDesc.textContent = "试试调整关键词，或切换回全部分类查看。";
      els.emptyResetBtn.textContent = "重置筛选条件";
    }
    setupScrollspy();
    return;
  }

  els.emptyState.hidden = true;

  if (isSectionMode()) {
    renderSectionedView(state.filtered, animateEnter);
  } else {
    const shown = state.filtered.slice(0, state.visibleLimit);
    const grid = document.createElement("div");
    grid.className = "cards-grid";
    shown.forEach((it, idx) => grid.appendChild(createCardElement(it, idx, animateEnter, 16)));
    els.catalogContainer.replaceChildren(grid);

    const remaining = state.filtered.length - shown.length;
    els.loadMoreWrap.hidden = remaining <= 0;
    if (remaining > 0) {
      els.loadMoreBtn.textContent = `展开更多（还有 ${remaining} 款）`;
    }
  }

  setupScrollspy();
}

/* ---------- Favorites ---------- */
function toggleFavorite(item, btnEl = null) {
  const wasFaved = state.favorites.has(item.id);
  const nowFaved = !wasFaved;
  if (wasFaved) {
    state.favorites.delete(item.id);
    if (!els.toolDialog.open) showToast(`已取消收藏 ${item.name}`);
  } else {
    state.favorites.add(item.id);
    if (!els.toolDialog.open) showToast(`已收藏 ${item.name}`);
  }
  saveFavorites();

  const cardBtn = btnEl || els.catalogContainer.querySelector(`[data-fav-for="${CSS.escape(item.id)}"]`);
  if (els.toolDialog.open && state.region === "favorites") {
    state.pendingFavoritesRefresh = true;
    if (cardBtn) updateCardFavButton(cardBtn, item, nowFaved);
    updateCounts();
  } else if (state.region !== "favorites") {
    if (cardBtn) updateCardFavButton(cardBtn, item, nowFaved);
    updateCounts();
    renderSidebarInto(els.desktopSidebar, false);
    renderSidebarInto(els.mobileSidebarHost, true);
  } else {
    applyFilters(false);
  }

  if (state.activeTool?.id === item.id) {
    els.dialogFavText.textContent = nowFaved ? "已收藏 ★" : "收藏";
  }
}

const clearFavConfirm = bindTwoStepConfirm(els.clearFavBtn, {
  idleText: "清空收藏",
  confirmText: "再次点击确认清空",
  onConfirm: () => {
    state.favorites.clear();
    saveFavorites();
    showToast("已清空全部收藏");
    applyFilters(false);
  },
});

els.shareFavBtn?.addEventListener("click", async () => {
  const ids = [...state.favorites].slice(0, 120);
  if (ids.length === 0) return;
  const shareUrl = `${location.origin}${location.pathname}?favs=${encodeURIComponent(ids.join(","))}`;
  const ok = await copyWithFeedback(shareUrl, els.shareFavBtn, showToast);
  if (ok) showToast(`已复制 ${ids.length} 款收藏工具分享链接`);
});

els.exportFavBtn?.addEventListener("click", async () => {
  if (state.isPartialCatalog) {
    await hydrateFullCatalog();
  }
  const favItems = state.items.filter((i) => state.favorites.has(i.id));
  if (favItems.length === 0) return;
  const escHtml = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const nowTs = Math.floor(Date.now() / 1000);
  const dtLines = favItems
    .map(
      (it) =>
        `    <DT><A HREF="${escHtml(it.url)}" ADD_DATE="${nowTs}">${escHtml(it.name)} — ${escHtml(displayCategoryName(it.category))}</A>`
    )
    .join("\n");
  const bookmarkHtml = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file. -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>AI 导航聚合站精选收藏</TITLE>
<H1>AI 导航聚合站精选收藏</H1>
<DL><p>
  <DT><H3 ADD_DATE="${nowTs}">AI 导航精选工具 (${favItems.length})</H3>
  <DL><p>
${dtLines}
  </DL><p>
</DL><p>
`;
  const blob = new Blob([bookmarkHtml], { type: "text/html;charset=utf-8" });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = `AI导航精选收藏-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(blobUrl), 1500);
  showToast(`已导出 ${favItems.length} 款浏览器书签文件`);
});

/* ---------- Dialog details ---------- */
function openDialog(item) {
  state.activeTool = item;
  renderToolAvatar(els.dialogAvatar, item);
  els.dialogTitle.textContent = item.name;
  els.dialogDomain.textContent = item.domain;
  els.dialogDesc.textContent = item.description || "暂无详细介绍，点击下方按钮前往官网体验。";
  els.dialogRegionBadge.textContent = formatAccessLabel(item, false);
  if (els.dialogPricingBadge) {
    if (item.pricing) {
      els.dialogPricingBadge.textContent = item.pricing;
      els.dialogPricingBadge.hidden = false;
    } else {
      els.dialogPricingBadge.hidden = true;
    }
  }
  const catLabel = displayCategoryName(item.category);
  els.dialogCategoryBadge.textContent = item._leisureSub
    ? `${catLabel} · ${item._leisureSub}`
    : catLabel;

  const safeHref = safeHttpUrl(item.url);
  if (safeHref) {
    els.dialogVisitBtn.href = safeHref;
    els.dialogVisitBtn.hidden = false;
  } else {
    els.dialogVisitBtn.removeAttribute("href");
    els.dialogVisitBtn.hidden = true;
  }

  els.dialogCopyBtn.classList.remove("is-copied");
  els.dialogCopyText.textContent = "复制链接";
  els.dialogFavText.textContent = state.favorites.has(item.id) ? "已收藏 ★" : "收藏";

  els.toolDialog.removeAttribute("data-closing");
  els.toolDialog.showModal();
}

els.dialogCopyBtn.addEventListener("click", () => {
  if (!state.activeTool) return;
  copyWithFeedback(state.activeTool.url, els.dialogCopyBtn, showToast, els.dialogCopyText);
});

els.dialogFavBtn.addEventListener("click", () => {
  if (state.activeTool) toggleFavorite(state.activeTool);
});

/* ---------- Events & keyboard shortcuts ---------- */
els.regionSegmented.querySelectorAll(".segmented__btn").forEach((btn) => {
  btn.addEventListener("click", () => setRegion(btn.dataset.region));
});

const searchController = bindSearchBox({
  input: els.searchInput,
  clearBtn: els.searchClear,
  boxEl: els.searchBox,
  onChange: (val) => {
    state.query = val;
    state.visibleLimit = PAGE_BATCH;
    if (state.isPartialCatalog && val.trim()) {
      hydrateFullCatalog();
    }
    applyFilters(false);
  },
  enableGlobalShortcut: true,
});

els.emptyResetBtn.addEventListener("click", () => {
  if (state.loadFailed) {
    location.reload();
    return;
  }
  els.searchInput.value = "";
  state.query = "";
  state.category = "全部";
  state.visibleLimit = PAGE_BATCH;
  searchController.sync();
  if (state.region === "favorites") {
    setRegion("all");
  } else {
    applyFilters(true);
  }
});

els.loadMoreBtn.addEventListener("click", () => {
  if (state.isPartialCatalog) hydrateFullCatalog();
  state.visibleLimit += PAGE_BATCH;
  applyFilters(false);
});

function renderCatalogSkeletons() {
  const grid = document.createElement("div");
  grid.className = "cards-grid";
  grid.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 6; i++) {
    const card = document.createElement("div");
    card.className = "skeleton-card";
    card.innerHTML = `<div class="skeleton-line skeleton-line--title"></div><div class="skeleton-line"></div><div class="skeleton-line skeleton-line--short"></div>`;
    grid.appendChild(card);
  }
  els.catalogContainer.replaceChildren(grid);
}

function syncStickyMetrics() {
  const topBarH = els.topBar?.getBoundingClientRect().height || 55;
  const heroH = els.heroDock?.getBoundingClientRect().height || 170;
  document.documentElement.style.setProperty("--topbar-h", `${Math.floor(topBarH)}px`);
  document.documentElement.style.setProperty("--sticky-offset", `${Math.round(topBarH + heroH + 8)}px`);
}

if (typeof ResizeObserver === "function") {
  const stickyRo = new ResizeObserver(syncStickyMetrics);
  if (els.topBar) stickyRo.observe(els.topBar);
  if (els.heroDock) stickyRo.observe(els.heroDock);
}

if (!CSS.supports("container-type", "scroll-state") && els.heroDock) {
  window.addEventListener(
    "scroll",
    () => {
      els.heroDock.classList.toggle("is-stuck", window.scrollY > 8);
    },
    { passive: true }
  );
}

/* ---------- Two-stage hot shard & chunked idle full hydration ---------- */
async function normalizeCatalogItemsChunked(rawItems) {
  const out = new Array(rawItems.length);
  for (let i = 0; i < rawItems.length; i++) {
    const it = rawItems[i];
    out[i] =
      it.category === "划水摸鱼" || it.category === "影音娱乐"
        ? { ...it, _leisureSub: classifyLeisure(it) }
        : it;
    if (i > 0 && i % 1500 === 0) {
      await yieldToMain();
    }
  }
  return out;
}

function hydrateFullCatalog() {
  if (!state.isPartialCatalog) return Promise.resolve();
  if (state.fullFetchPromise) return state.fullFetchPromise;

  state.fullFetchPromise = (async () => {
    try {
      const res = await fetch("./data/catalog.json", { cache: "no-cache" });
      if (!res.ok) return;
      const fullCatalog = await res.json();
      await yieldToMain();
      const fullItems = await normalizeCatalogItemsChunked(
        Array.isArray(fullCatalog.items) ? fullCatalog.items : []
      );
      state.catalog = fullCatalog;
      state.items = fullItems;
      state.isPartialCatalog = false;

      if (!isSectionMode()) {
        applyFilters(false);
      } else {
        updateCounts();
        renderCategories(getBaseItems());
        renderSidebarInto(els.desktopSidebar, false);
        renderSidebarInto(els.mobileSidebarHost, true);
        els.resultCounter.textContent = `共 ${state.items.length} 款工具`;
      }
    } catch {
      // Keep working seamlessly on hot shard if full fetch fails on flaky connection
    } finally {
      state.fullFetchPromise = null;
    }
  })();

  return state.fullFetchPromise;
}

/* ---------- Bootstrap & data fetch ---------- */
async function init() {
  initSiteNav();
  initSubmitToolDialog(showToast);
  initTopBarScrollHide(els.topBar, { enabled: false });
  initThemeToggle(els.themeToggle, els.themeToggleLabel, showToast);
  const params = new URLSearchParams(location.search);
  const initialQ = params.get("q");
  const initialCat = params.get("cat");
  const sharedFavs = params.get("favs");

  let importedFavCount = 0;
  if (sharedFavs) {
    const ids = sharedFavs
      .split(",")
      .map((s) => s.trim())
      .filter((s) => /^[a-f0-9]{6,20}$/i.test(s))
      .slice(0, 200);
    if (ids.length > 0) {
      ids.forEach((id) => state.favorites.add(id));
      saveFavorites();
      state.region = "favorites";
      importedFavCount = ids.length;
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete("favs");
      history.replaceState(null, "", cleanUrl.pathname + cleanUrl.search + cleanUrl.hash);
    }
  }

  if (initialQ && els.searchInput) {
    els.searchInput.value = initialQ;
    state.query = initialQ;
    searchController.sync();
  }
  if (initialCat) {
    if (initialCat === "划水摸鱼" || initialCat === "影音娱乐") {
      state.region = "leisure";
    } else {
      state.region = "all";
      state.category = initialCat;
    }
  }
  syncStickyMetrics();
  els.regionSegmented.querySelectorAll(".segmented__btn").forEach((b) => {
    const active = b.dataset.region === state.region;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", String(active));
  });
  positionThumb(true);
  const hadPrerender = els.catalogContainer.childElementCount > 0;
  if (!hadPrerender) {
    renderCatalogSkeletons();
  }

  const needsFullImmediately = Boolean(
    initialQ || initialCat || sharedFavs || state.region !== "all"
  );

  try {
    let loadedHot = false;
    if (!needsFullImmediately) {
      try {
        const hotRes = await fetch("./data/catalog-hot.json", { cache: "no-cache" });
        if (hotRes.ok) {
          const hotData = await hotRes.json();
          state.loadFailed = false;
          state.catalog = hotData;
          state.globalCounts = hotData.global_counts || null;
          state.isPartialCatalog = Boolean(hotData.is_partial);
          state.items = await normalizeCatalogItemsChunked(
            Array.isArray(hotData.items) ? hotData.items : []
          );
          applyFilters(!hadPrerender);
          loadedHot = true;
          const scheduleIdle = window.requestIdleCallback || ((cb) => setTimeout(cb, 180));
          scheduleIdle(() => hydrateFullCatalog());
        }
      } catch {}
    }

    if (!loadedHot) {
      const res = await fetch("./data/catalog.json", { cache: "no-cache" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const catalog = await res.json();
      state.loadFailed = false;
      state.catalog = catalog;
      state.isPartialCatalog = false;
      state.items = await normalizeCatalogItemsChunked(
        Array.isArray(catalog.items) ? catalog.items : []
      );
      applyFilters(!hadPrerender);
      if (importedFavCount > 0) {
        showToast(`已导入分享的 ${importedFavCount} 款精选 AI 工具`);
      }
    }
  } catch {
    state.loadFailed = true;
    els.catalogContainer.replaceChildren();
    els.resultCounter.textContent = "数据加载失败";
    els.emptyState.hidden = false;
    els.emptyTitle.textContent = "暂时无法读取工具索引";
    els.emptyDesc.textContent = "后台爬虫可能正在初始化，请稍后刷新页面重试。";
    els.emptyResetBtn.textContent = "重新加载";
  }
}

init();
