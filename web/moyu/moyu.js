import {
  initSiteNav,
  initThemeToggle,
  initTopBarScrollHide,
  createToast,
  bindSearchBox,
  setRefreshBusy,
  safeHttpUrl,
  renderToolAvatar,
} from "../nav.js?v=3";

const GROUP_MAP = {
  tech: new Set(["36kr", "sspai", "ithome", "juejin", "csdn"]),
  social: new Set(["weibo", "zhihu", "baidu", "toutiao", "thepaper"]),
  media: new Set(["bilibili", "douyin", "doubannew", "tieba"]),
};

const HOT_LIMIT = 15;
const LEISURE_CATS = ["全部", "影视动漫", "音乐音效", "在线游戏", "磁力与工具", "趣味摸鱼"];
const LEISURE_BATCH = 48;

const els = {
  topBar: document.getElementById("topBar"),
  themeToggle: document.getElementById("themeToggle"),
  themeToggleLabel: document.getElementById("themeToggleLabel"),
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
  leisureCats: document.getElementById("leisureCats"),
  leisureGrid: document.getElementById("leisureGrid"),
  leisureLoadMoreWrap: document.getElementById("leisureLoadMoreWrap"),
  leisureLoadMoreBtn: document.getElementById("leisureLoadMoreBtn"),
  toast: document.getElementById("toast"),
};

const showToast = createToast(els.toast);

let platforms = [];
let activeGroup = "all";
let hotLoadFailed = false;

let leisureItems = [];
let leisureCat = "全部";
let leisureLimit = LEISURE_BATCH;

function formatHotVal(v) {
  const num = Number(v);
  if (!Number.isFinite(num) || num <= 0) return v ? String(v) : "";
  if (num >= 10000) return `${(num / 10000).toFixed(1)}w`;
  return String(num);
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
  return "趣味摸鱼";
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
    card.style.minHeight = "112px";
    card.setAttribute("aria-hidden", "true");
    card.innerHTML = `<div class="skeleton-line skeleton-line--title"></div><div class="skeleton-line"></div><div class="skeleton-line skeleton-line--short"></div>`;
    frag.appendChild(card);
  }
  els.leisureGrid.replaceChildren(frag);
}

function createHotItemLi(item, idx) {
  const href = safeHttpUrl(item.url);
  if (!href) return null;

  const li = document.createElement("li");
  li.className = "hot-item";

  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.title = item.title;

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

    const iconHref = safeHttpUrl(plat.icon);
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

    const visible = matchedItems.slice(0, HOT_LIMIT);
    const ul = document.createElement("ul");
    ul.className = "hot-card__list";

    visible.forEach((item, idx) => {
      const li = createHotItemLi(item, idx);
      if (li) ul.appendChild(li);
    });

    card.append(head, ul);
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
    renderHotGrid();
    if (showFeedback) showToast("热榜已刷新");
  } catch {
    hotLoadFailed = true;
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

function renderLeisureSection() {
  const counts = new Map();
  for (const it of leisureItems) {
    counts.set(it.subCat, (counts.get(it.subCat) || 0) + 1);
  }

  const catsFrag = document.createDocumentFragment();
  for (const c of LEISURE_CATS) {
    const num = c === "全部" ? leisureItems.length : counts.get(c) || 0;
    if (c !== "全部" && num === 0) continue;
    const active = leisureCat === c;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cat-pill" + (active ? " is-active" : "");
    b.setAttribute("aria-pressed", String(active));
    b.textContent = c + " ";
    const span = document.createElement("span");
    span.className = "cat-pill__num";
    span.textContent = String(num);
    b.appendChild(span);
    b.addEventListener("click", () => {
      leisureCat = leisureCat === c && c !== "全部" ? "全部" : c;
      leisureLimit = LEISURE_BATCH;
      renderLeisureSection();
    });
    catsFrag.appendChild(b);
  }
  els.leisureCats.replaceChildren(catsFrag);

  const filtered = leisureCat === "全部"
    ? leisureItems
    : leisureItems.filter((it) => it.subCat === leisureCat);

  els.leisureCount.textContent = `共收录 ${filtered.length} 个精选休闲站点`;

  const shown = filtered.slice(0, leisureLimit);
  const frag = document.createDocumentFragment();
  for (const it of shown) {
    const href = safeHttpUrl(it.url);
    if (!href) continue;
    const a = document.createElement("a");
    a.className = "leisure-card";
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const top = document.createElement("div");
    top.className = "leisure-card__top";

    const head = document.createElement("div");
    head.className = "leisure-card__head";
    const avatar = document.createElement("div");
    avatar.className = "tool-avatar tool-avatar--sm";
    avatar.setAttribute("aria-hidden", "true");
    renderToolAvatar(avatar, it);

    const titles = document.createElement("div");
    titles.className = "leisure-card__titles";
    const h = document.createElement("h3");
    h.className = "leisure-card__name";
    h.textContent = it.name;
    const d = document.createElement("span");
    d.className = "leisure-card__domain";
    d.textContent = it.domain;
    titles.append(h, d);

    head.append(avatar, titles);

    const tag = document.createElement("span");
    tag.className = "tag-chip";
    tag.textContent = it.subCat;

    top.append(head, tag);

    const p = document.createElement("p");
    p.className = "leisure-card__desc";
    p.textContent = it.description || it.domain;

    a.append(top, p);
    frag.appendChild(a);
  }
  els.leisureGrid.replaceChildren(frag);

  const remaining = filtered.length - shown.length;
  els.leisureLoadMoreWrap.hidden = remaining <= 0;
  if (remaining > 0) {
    els.leisureLoadMoreBtn.textContent = `展开更多（还有 ${remaining} 个）`;
  }
}

async function loadLeisureSites() {
  renderLeisureSkeletons();
  try {
    const res = await fetch("../data/catalog.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    leisureItems = (data.items || [])
      .filter((it) => it.category === "划水摸鱼")
      .map((it) => ({ ...it, subCat: classifyLeisure(it) }));
    renderLeisureSection();
  } catch {
    els.leisureGrid.replaceChildren();
    els.leisureLoadMoreWrap.hidden = true;
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

els.leisureLoadMoreBtn.addEventListener("click", () => {
  leisureLimit += LEISURE_BATCH;
  renderLeisureSection();
});

els.refreshHotBtn.addEventListener("click", () => loadHotlist(true));

initSiteNav();
initTopBarScrollHide(els.topBar);
initThemeToggle(els.themeToggle, els.themeToggleLabel, showToast);
loadHotlist(false);
loadLeisureSites();
