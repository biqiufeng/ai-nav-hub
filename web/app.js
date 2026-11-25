const SOURCE_LABELS = {
  "ai-bot": { name: "AI 工具集", url: "https://ai-bot.cn/" },
  "aibase": { name: "AIbase 基地", url: "https://www.aibase.com/zh/tools" },
  "yupi-ai": { name: "鱼皮 AI 导航", url: "https://ai.codefather.cn/" },
  "ai-zhiku": { name: "AI 智库", url: "https://ai-zhiku.com/" },
  "waytoagi": { name: "WaytoAGI", url: "https://www.waytoagi.com/zh" },
  "producthunt": { name: "Product Hunt", url: "https://www.producthunt.com/" },
  "futuretools": { name: "FutureTools", url: "https://www.futuretools.io/" },
  "futurepedia": { name: "Futurepedia", url: "https://www.futurepedia.io/" },
};

const CAT_ICONS = {
  "对话写作": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  "编程开发": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  "图像设计": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/></svg>`,
  "视频音频": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="6 4 20 12 6 20 6 4"/></svg>`,
  "办公效率": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9h8M8 13h5"/></svg>`,
  "Agent与自动化": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
  "学习知识库": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/></svg>`,
  "新品速递": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>`,
  "其他工具": `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>`,
};

const QUICK_VIEWS = [
  { id: "all", label: "全部精选" },
  { id: "hot", label: "多源热门" },
  { id: "domestic", label: "国内主流" },
  { id: "overseas", label: "海外主流" },
  { id: "favorites", label: "我的收藏" },
];

const AGGREGATOR_HOSTS = new Set([
  "ai.codefather.cn",
  "futuretools.io",
  "futurepedia.io",
  "producthunt.com",
  "ai-bot.cn",
  "ai-zhiku.com",
  "aibase.com",
]);

const AVATAR_PALETTE = [
  "#0A84FF", "#5E5CE6", "#BF5AF2", "#FF375F",
  "#FF9F0A", "#30B0C7", "#34C759", "#AF52DE",
];

const FAVORITES_KEY = "ai_nav_hub_favorites_v1";
const REGION_KEY = "ai_nav_hub_region_v1";
const PAGE_BATCH = 60;
const SECTION_PREVIEW = 12;

const state = {
  catalog: null,
  items: [],
  filtered: [],
  visibleLimit: PAGE_BATCH,
  region: loadRegion(),
  category: "全部",
  sourceFilter: "",
  query: "",
  favorites: loadFavorites(),
  activeTool: null,
  pendingFavoritesRefresh: false,
  loadFailed: false,
  clearConfirmTimer: null,
  copyResetTimer: null,
  toastTimer: null,
  scrollspyObserver: null,
};

const els = {
  topBar: document.getElementById("topBar"),
  syncText: document.getElementById("syncText"),
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
  sourceFilterPill: document.getElementById("sourceFilterPill"),
  sourceFilterLabel: document.getElementById("sourceFilterLabel"),
  sourceFilterClear: document.getElementById("sourceFilterClear"),
  resultCounter: document.getElementById("resultCounter"),
  clearFavBtn: document.getElementById("clearFavBtn"),
  catalogContainer: document.getElementById("catalogContainer"),
  emptyState: document.getElementById("emptyState"),
  emptyTitle: document.getElementById("emptyTitle"),
  emptyDesc: document.getElementById("emptyDesc"),
  emptyResetBtn: document.getElementById("emptyResetBtn"),
  loadMoreWrap: document.getElementById("loadMoreWrap"),
  loadMoreBtn: document.getElementById("loadMoreBtn"),
  crawlSummaryBody: document.getElementById("crawlSummaryBody"),
  toolDialog: document.getElementById("toolDialog"),
  dialogAvatar: document.getElementById("dialogAvatar"),
  dialogTitle: document.getElementById("dialogTitle"),
  dialogDomain: document.getElementById("dialogDomain"),
  dialogDesc: document.getElementById("dialogDesc"),
  dialogRegionBadge: document.getElementById("dialogRegionBadge"),
  dialogCategoryBadge: document.getElementById("dialogCategoryBadge"),
  dialogSources: document.getElementById("dialogSources"),
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

function safeHttpUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  try {
    const parsed = new URL(raw.trim(), location.href);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

/* ---------- Theme management (dark-mode-toggle) ---------- */
function getMetaScheme() {
  return document.querySelector('meta[name="color-scheme"]');
}

function getEffectiveScheme() {
  const metaVal = getMetaScheme()?.content;
  if (metaVal === "light" || metaVal === "dark") return metaVal;
  const stored = safeGetStorage("color-scheme");
  if (stored === "light" || stored === "dark") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function syncThemeAria() {
  const eff = getEffectiveScheme();
  const nextLabel = eff === "dark" ? "切换到浅色外观" : "切换到深色外观";
  els.themeToggle.setAttribute("aria-label", nextLabel);
  els.themeToggleLabel.textContent = nextLabel;
}

function toggleTheme() {
  const sysScheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  const currentRendered = getEffectiveScheme();
  const target = currentRendered === "dark" ? "light" : "dark";

  if (target === sysScheme) {
    safeRemoveStorage("color-scheme");
    getMetaScheme().content = "light dark";
    showToast("已恢复跟随系统外观");
  } else {
    safeSetStorage("color-scheme", target);
    getMetaScheme().content = target;
    showToast(target === "dark" ? "已切换为深色外观" : "已切换为浅色外观");
  }
  syncThemeAria();
}

window.addEventListener("storage", (e) => {
  if (e.key === "color-scheme") {
    const valid = e.newValue === "light" || e.newValue === "dark" ? e.newValue : "light dark";
    getMetaScheme().content = valid;
    syncThemeAria();
  }
  if (e.key === FAVORITES_KEY) {
    state.favorites = loadFavorites();
    applyFilters(false);
  }
});

window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => syncThemeAria());

/* ---------- Scroll-state fallback for top bar ---------- */
if (!CSS.supports("container-type", "scroll-state")) {
  let lastY = window.scrollY;
  let barHeight = els.topBar.offsetHeight || 56;
  window.addEventListener("resize", () => { barHeight = els.topBar.offsetHeight || 56; });
  window.addEventListener(
    "scroll",
    () => {
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.max(0, Math.min(window.scrollY, maxY));
      if (Math.abs(y - lastY) < 6 && y > 0) return;
      els.topBar.classList.toggle("is-hidden", y > lastY && y > barHeight);
      lastY = y;
    },
    { passive: true }
  );
}

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
let supportsDisplayTransition;
function canTransitionDisplay() {
  if (supportsDisplayTransition !== undefined) return supportsDisplayTransition;
  if (!window.CSS?.supports?.("transition-behavior", "allow-discrete") || !document.body) {
    supportsDisplayTransition = false;
    return false;
  }
  const probe = document.createElement("div");
  probe.style.cssText = "transition: display 1s allow-discrete !important; display: block;";
  document.body.appendChild(probe);
  getComputedStyle(probe).display;
  probe.style.display = "none";
  supportsDisplayTransition = getComputedStyle(probe).display === "block";
  probe.remove();
  return supportsDisplayTransition;
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
  return ["all", "hot", "domestic", "overseas", "favorites"].includes(val) ? val : "all";
}

/* ---------- UI feedback & three-layer icon fallback ---------- */
function showToast(msg) {
  clearTimeout(state.toastTimer);
  els.toast.textContent = msg;
  els.toast.hidden = false;
  state.toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2000);
}

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

function renderAvatar(container, item) {
  container.textContent = "";
  const letter = (item.name || item.domain || "?").trim().charAt(0).toUpperCase();
  container.style.setProperty("--avatar-bg", hashColor(item.domain || item.name));
  const fallback = document.createElement("span");
  fallback.textContent = letter;
  container.appendChild(fallback);

  const primaryIcon = safeHttpUrl(item.icon);
  const canTryDomainFavicon = item.domain && !AGGREGATOR_HOSTS.has(item.domain);
  const faviconUrl = canTryDomainFavicon
    ? `https://favicon.im/${encodeURIComponent(item.domain)}?larger=true`
    : "";

  const firstTry = primaryIcon || faviconUrl;
  if (!firstTry) return;

  const img = document.createElement("img");
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  let triedFallback = !primaryIcon;

  img.addEventListener("error", () => {
    if (!triedFallback && faviconUrl && img.src !== faviconUrl) {
      triedFallback = true;
      img.src = faviconUrl;
    } else {
      img.remove();
    }
  });
  img.src = firstTry;
  container.appendChild(img);
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
  if (region === "domestic") {
    return Array.isArray(item.regions) ? item.regions.includes("domestic") : item.region === "domestic";
  }
  if (region === "overseas") {
    return Array.isArray(item.regions) ? item.regions.includes("overseas") : item.region === "overseas";
  }
  return true;
}

function getBaseItems() {
  let list = state.items.filter((i) => matchesRegion(i, state.region));
  if (state.sourceFilter) {
    list = list.filter((i) => (i.sources || []).includes(state.sourceFilter));
  }
  return list;
}

function isSectionMode() {
  return state.region === "all" && state.category === "全部" && !state.query.trim() && !state.sourceFilter;
}

function setRegion(nextRegion) {
  if (nextRegion === state.region && !state.sourceFilter && state.category === "全部") return;
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
  activeSeg?.scrollIntoView({ inline: "nearest", block: "nearest", behavior: "smooth" });
  positionThumb(false);
  applyFilters(true);
}

function renderSidebarInto(hostEl, isMobile = false) {
  const allCount = state.items.length;
  const hotCount = state.items.filter((i) => matchesRegion(i, "hot")).length;
  const domCount = state.items.filter((i) => matchesRegion(i, "domestic")).length;
  const ovsCount = state.items.filter((i) => matchesRegion(i, "overseas")).length;
  const favCount = state.items.filter((i) => state.favorites.has(i.id)).length;
  const regionCounts = { all: allCount, hot: hotCount, domestic: domCount, overseas: ovsCount, favorites: favCount };

  const baseItems = getBaseItems();
  const catCounts = new Map();
  for (const it of baseItems) {
    catCounts.set(it.category, (catCounts.get(it.category) || 0) + 1);
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
    btn.className = "sidebar-item" + (state.region === qv.id && !state.sourceFilter ? " is-active" : "");
    btn.innerHTML = `<span class="sidebar-item__left"><span class="sidebar-item__label">${qv.label}</span></span><span class="sidebar-item__count">${regionCounts[qv.id]}</span>`;
    btn.addEventListener("click", () => {
      state.sourceFilter = "";
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
  for (const cat of state.catalog?.categories || []) {
    const cnt = catCounts.get(cat) || 0;
    if (cnt === 0) continue;
    const iconSvg = CAT_ICONS[cat] || CAT_ICONS["其他工具"];
    const el = document.createElement(sectionMode ? "a" : "button");
    if (sectionMode) {
      el.href = `#${catSlug(cat)}`;
      el.className = "sidebar-item sidebar-cat-link";
    } else {
      el.type = "button";
      el.className = "sidebar-item" + (state.category === cat ? " is-active" : "");
    }
    el.innerHTML = `<span class="sidebar-item__left"><span class="sidebar-item__icon" aria-hidden="true">${iconSvg}</span><span class="sidebar-item__label">${cat}</span></span><span class="sidebar-item__count">${cnt}</span>`;
    el.addEventListener("click", () => {
      if (!sectionMode) {
        state.category = state.category === cat ? "全部" : cat;
        state.visibleLimit = PAGE_BATCH;
        applyFilters(true);
      }
      if (isMobile) closeDrawer();
    });
    navCats.appendChild(el);
  }
  gCats.appendChild(navCats);
  frag.appendChild(gCats);

  // 3. Sources quick filter
  const srcCounts = new Map();
  for (const it of state.items) {
    for (const s of it.sources || []) {
      srcCounts.set(s, (srcCounts.get(s) || 0) + 1);
    }
  }
  const gSrc = document.createElement("div");
  gSrc.className = "sidebar-group";
  gSrc.innerHTML = `<h2 class="sidebar-group__title">来源站点</h2>`;
  const ulSrc = document.createElement("ul");
  ulSrc.className = "sidebar-list";
  for (const [srcId, meta] of Object.entries(SOURCE_LABELS)) {
    const cnt = srcCounts.get(srcId) || 0;
    if (cnt === 0) continue;
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "sidebar-item" + (state.sourceFilter === srcId ? " is-active" : "");
    btn.innerHTML = `<span class="sidebar-item__left"><span class="sidebar-item__label">${meta.name}</span></span><span class="sidebar-item__count">${cnt}</span>`;
    btn.addEventListener("click", () => {
      state.sourceFilter = state.sourceFilter === srcId ? "" : srcId;
      state.category = "全部";
      state.visibleLimit = PAGE_BATCH;
      applyFilters(true);
      if (isMobile) closeDrawer();
    });
    li.appendChild(btn);
    ulSrc.appendChild(li);
  }
  gSrc.appendChild(ulSrc);
  frag.appendChild(gSrc);

  hostEl.replaceChildren(frag);
}

function setupScrollspy() {
  if (state.scrollspyObserver) {
    state.scrollspyObserver.disconnect();
    state.scrollspyObserver = null;
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
    syncAriaCurrent();
    document.addEventListener("scrollend", syncAriaCurrent, { passive: true });
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
    { rootMargin: "-25% 0px -65% 0px", threshold: 0 }
  );
  sections.forEach((sec) => state.scrollspyObserver.observe(sec));
}

function updateCounts() {
  const map = {
    all: state.items.length,
    hot: state.items.filter((i) => matchesRegion(i, "hot")).length,
    domestic: state.items.filter((i) => matchesRegion(i, "domestic")).length,
    overseas: state.items.filter((i) => matchesRegion(i, "overseas")).length,
    favorites: state.items.filter((i) => state.favorites.has(i.id)).length,
  };
  for (const [k, v] of Object.entries(map)) {
    const el = els.regionSegmented.querySelector(`[data-count="${k}"]`);
    if (el) el.textContent = String(v);
  }

  els.clearFavBtn.hidden = !(state.region === "favorites" && map.favorites > 0);
  if (els.clearFavBtn.hidden) resetClearFavConfirm();

  if (state.sourceFilter) {
    els.sourceFilterPill.hidden = false;
    els.sourceFilterLabel.textContent = `来源：${SOURCE_LABELS[state.sourceFilter]?.name || state.sourceFilter}`;
  } else {
    els.sourceFilterPill.hidden = true;
  }

  positionThumb(false);
}

function renderCategories(baseItems) {
  const counts = new Map();
  for (const it of baseItems) {
    counts.set(it.category, (counts.get(it.category) || 0) + 1);
  }

  const orderedCats = ["全部", ...(state.catalog?.categories || [])];
  if (state.category !== "全部" && !counts.get(state.category)) {
    state.category = "全部";
  }

  const frag = document.createDocumentFragment();
  for (const cat of orderedCats) {
    const num = cat === "全部" ? baseItems.length : counts.get(cat) || 0;
    if (cat !== "全部" && num === 0) continue;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "cat-pill" + (state.category === cat ? " is-active" : "");
    btn.setAttribute("aria-pressed", String(state.category === cat));
    btn.dataset.category = cat;
    btn.textContent = cat + " ";

    const span = document.createElement("span");
    span.className = "cat-pill__num";
    span.textContent = String(num);
    btn.appendChild(span);

    btn.addEventListener("click", () => {
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
  card.setAttribute("aria-label", `${item.name}，${item.category}，点击查看详情`);

  const top = document.createElement("div");
  top.className = "tool-card__top";

  const head = document.createElement("div");
  head.className = "tool-card__head";

  const avatar = document.createElement("div");
  avatar.className = "tool-avatar";
  renderAvatar(avatar, item);

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

  const catTag = document.createElement("span");
  catTag.className = "tag-chip";
  catTag.textContent = item.category;

  const srcText = (item.sources || [])
    .map((s) => SOURCE_LABELS[s]?.name || s)
    .slice(0, 2)
    .join(" · ");
  const srcHint = document.createElement("span");
  srcHint.className = "source-hint";
  srcHint.textContent =
    (item.sources?.length || 0) > 2 ? `${srcText} +${item.sources.length - 2}` : srcText;

  foot.append(catTag, srcHint);
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
    titleWrap.innerHTML = `<span class="cat-section__icon" aria-hidden="true">${CAT_ICONS[cat] || CAT_ICONS["其他工具"]}</span><h2 class="cat-section__title">${cat}</h2><span class="cat-section__count">${list.length} 款</span>`;

    const moreBtn = document.createElement("button");
    moreBtn.type = "button";
    moreBtn.className = "cat-section__more";
    moreBtn.textContent = list.length > SECTION_PREVIEW ? `查看全部 ${list.length} 款 →` : "只看本类 →";
    moreBtn.addEventListener("click", () => {
      state.category = cat;
      state.visibleLimit = PAGE_BATCH;
      applyFilters(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
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

  const q = state.query.trim().toLowerCase();
  state.filtered = baseItems.filter((it) => {
    if (state.category !== "全部" && it.category !== state.category) return false;
    if (!q) return true;
    const hay = `${it.name} ${it.description} ${it.domain} ${it.category} ${(it.sources || [])
      .map((s) => SOURCE_LABELS[s]?.name || s)
      .join(" ")}`.toLowerCase();
    return hay.includes(q);
  });

  els.resultCounter.textContent = `共 ${state.filtered.length} 款工具`;

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
    showToast(`已取消收藏 ${item.name}`);
  } else {
    state.favorites.add(item.id);
    showToast(`已收藏 ${item.name}`);
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

function resetClearFavConfirm() {
  clearTimeout(state.clearConfirmTimer);
  state.clearConfirmTimer = null;
  els.clearFavBtn.classList.remove("is-confirm");
  els.clearFavBtn.textContent = "清空收藏";
}

els.clearFavBtn.addEventListener("click", () => {
  if (!els.clearFavBtn.classList.contains("is-confirm")) {
    els.clearFavBtn.classList.add("is-confirm");
    els.clearFavBtn.textContent = "再次点击确认清空";
    state.clearConfirmTimer = setTimeout(resetClearFavConfirm, 4000);
    return;
  }
  state.favorites.clear();
  saveFavorites();
  resetClearFavConfirm();
  showToast("已清空全部收藏");
  applyFilters(false);
});

/* ---------- Dialog details ---------- */
function openDialog(item) {
  state.activeTool = item;
  renderAvatar(els.dialogAvatar, item);
  els.dialogTitle.textContent = item.name;
  els.dialogDomain.textContent = item.domain;
  els.dialogDesc.textContent = item.description || "暂无详细介绍，点击下方按钮前往官网体验。";
  const regs = Array.isArray(item.regions) ? item.regions : [item.region];
  if (regs.includes("domestic") && regs.includes("overseas")) {
    els.dialogRegionBadge.textContent = "国内 · 海外双收录";
  } else {
    els.dialogRegionBadge.textContent = regs[0] === "domestic" ? "国内主流" : "海外主流";
  }
  els.dialogCategoryBadge.textContent = item.category;

  const safeHref = safeHttpUrl(item.url);
  if (safeHref) {
    els.dialogVisitBtn.href = safeHref;
    els.dialogVisitBtn.hidden = false;
  } else {
    els.dialogVisitBtn.removeAttribute("href");
    els.dialogVisitBtn.hidden = true;
  }

  clearTimeout(state.copyResetTimer);
  els.dialogCopyText.textContent = "复制链接";
  els.dialogFavText.textContent = state.favorites.has(item.id) ? "已收藏 ★" : "收藏";

  const frag = document.createDocumentFragment();
  for (const srcId of item.sources || []) {
    const info = SOURCE_LABELS[srcId];
    const srcHref = safeHttpUrl(info?.url);
    const a = document.createElement("a");
    a.className = "source-chip";
    a.href = srcHref || "#";
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.textContent = info?.name || srcId;
    frag.appendChild(a);
  }
  els.dialogSources.replaceChildren(frag);

  els.toolDialog.removeAttribute("data-closing");
  els.toolDialog.showModal();
}

async function copyTextSafe(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
  els.toolDialog.appendChild(ta);
  ta.select();
  const ok = document.execCommand("copy");
  ta.remove();
  if (!ok) throw new Error("copy failed");
}

els.dialogCopyBtn.addEventListener("click", async () => {
  if (!state.activeTool) return;
  try {
    await copyTextSafe(state.activeTool.url);
    clearTimeout(state.copyResetTimer);
    els.dialogCopyText.textContent = "已复制 ✓";
    state.copyResetTimer = setTimeout(() => {
      if (els.toolDialog.open) els.dialogCopyText.textContent = "复制链接";
    }, 1800);
  } catch {
    showToast("复制失败，请手动复制链接");
  }
});

els.dialogFavBtn.addEventListener("click", () => {
  if (state.activeTool) toggleFavorite(state.activeTool);
});

/* ---------- Events & keyboard shortcuts ---------- */
els.themeToggle.addEventListener("click", toggleTheme);

els.regionSegmented.querySelectorAll(".segmented__btn").forEach((btn) => {
  btn.addEventListener("click", () => setRegion(btn.dataset.region));
});

els.sourceFilterClear.addEventListener("click", () => {
  state.sourceFilter = "";
  state.visibleLimit = PAGE_BATCH;
  applyFilters(true);
});

function syncSearchUI() {
  const hasVal = els.searchInput.value.length > 0;
  els.searchBox.classList.toggle("has-value", hasVal);
  els.searchClear.hidden = !hasVal;
}

els.searchInput.addEventListener("input", () => {
  state.query = els.searchInput.value;
  state.visibleLimit = PAGE_BATCH;
  syncSearchUI();
  applyFilters(false);
});

els.searchClear.addEventListener("click", () => {
  els.searchInput.value = "";
  state.query = "";
  state.visibleLimit = PAGE_BATCH;
  syncSearchUI();
  els.searchInput.focus();
  applyFilters(true);
});

els.emptyResetBtn.addEventListener("click", () => {
  if (state.loadFailed) {
    location.reload();
    return;
  }
  state.sourceFilter = "";
  els.searchInput.value = "";
  state.query = "";
  state.category = "全部";
  state.visibleLimit = PAGE_BATCH;
  syncSearchUI();
  if (state.region === "favorites") {
    setRegion("all");
  } else {
    applyFilters(true);
  }
});

els.loadMoreBtn.addEventListener("click", () => {
  state.visibleLimit += PAGE_BATCH;
  applyFilters(false);
});

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea") || els.toolDialog.open || els.mobileDrawer.open) return;
  if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
    e.preventDefault();
    els.searchInput.focus();
    els.searchInput.select();
  }
});

/* ---------- Bootstrap & data fetch ---------- */
function formatSyncDate(isoStr) {
  const dt = isoStr ? new Date(isoStr) : null;
  if (!dt || Number.isNaN(dt.getTime())) return { short: "每日自动同步", full: isoStr || "未知" };
  const short = new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(dt);
  const full = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(dt);
  return { short, full };
}

function renderCrawlSummary(catalog) {
  const { short, full } = formatSyncDate(catalog.generated_at);
  els.syncText.textContent = `最近同步 ${short}`;

  const box = els.crawlSummaryBody;
  box.textContent = "";

  const p = document.createElement("p");
  p.textContent = `更新周期：${catalog.schedule || "每日 04:00 自动爬取"} · 最近完成时间：${full} · 去重后共计 ${catalog.items.length} 款工具（国内覆盖 ${catalog.stats?.domestic ?? 0} / 海外覆盖 ${catalog.stats?.overseas ?? 0}）。`;
  box.appendChild(p);

  const grid = document.createElement("div");
  grid.className = "crawl-source-grid";
  for (const s of catalog.sources_summary || []) {
    const row = document.createElement("div");
    row.className = "crawl-source-item";
    const left = document.createElement("span");
    left.textContent = s.name;
    const right = document.createElement("span");
    right.textContent = s.status === "ok" ? `${s.count} 条` : s.note || s.status;
    row.append(left, right);
    grid.appendChild(row);
  }
  box.appendChild(grid);
}

async function init() {
  syncThemeAria();
  els.regionSegmented.querySelectorAll(".segmented__btn").forEach((b) => {
    const active = b.dataset.region === state.region;
    b.classList.toggle("is-active", active);
    b.setAttribute("aria-selected", String(active));
  });
  positionThumb(true);

  try {
    const res = await fetch("./data/catalog.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const catalog = await res.json();
    state.loadFailed = false;
    state.catalog = catalog;
    state.items = Array.isArray(catalog.items) ? catalog.items : [];
    renderCrawlSummary(catalog);
    applyFilters(true);
  } catch {
    state.loadFailed = true;
    els.resultCounter.textContent = "数据加载失败";
    els.emptyState.hidden = false;
    els.emptyTitle.textContent = "暂时无法读取工具索引";
    els.emptyDesc.textContent = "后台爬虫可能正在初始化，请稍后刷新页面重试。";
    els.emptyResetBtn.textContent = "重新加载";
  }
}

init();
