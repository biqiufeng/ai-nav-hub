import { initSiteNav, initThemeToggle } from "../nav.js?v=1";

const GROUP_MAP = {
  tech: new Set(["36kr", "sspai", "ithome", "juejin", "csdn"]),
  social: new Set(["weibo", "zhihu", "baidu", "toutiao", "thepaper"]),
  media: new Set(["bilibili", "douyin", "doubannew", "tieba"]),
};

const els = {
  themeToggle: document.getElementById("themeToggle"),
  themeToggleLabel: document.getElementById("themeToggleLabel"),
  hotlistMeta: document.getElementById("hotlistMeta"),
  hotSearch: document.getElementById("hotSearch"),
  refreshHotBtn: document.getElementById("refreshHotBtn"),
  hotGroups: document.getElementById("hotGroups"),
  hotGrid: document.getElementById("hotGrid"),
  leisureCount: document.getElementById("leisureCount"),
  leisureGrid: document.getElementById("leisureGrid"),
  toast: document.getElementById("toast"),
};

let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2200);
}

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
const expandedSet = new Set();

function formatHotVal(v) {
  const num = Number(v);
  if (!Number.isFinite(num) || num <= 0) return v ? String(v) : "";
  if (num >= 10000) return `${(num / 10000).toFixed(1)}w`;
  return String(num);
}

function renderHotGrid() {
  const q = els.hotSearch.value.trim().toLowerCase();
  const frag = document.createDocumentFragment();

  for (const plat of platforms) {
    if (activeGroup !== "all" && !GROUP_MAP[activeGroup]?.has(plat.id)) continue;

    const matchedItems = q
      ? (plat.items || []).filter((it) => it.title.toLowerCase().includes(q))
      : plat.items || [];
    if (q && matchedItems.length === 0) continue;

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
    const visible = isExpanded ? matchedItems : matchedItems.slice(0, 15);
    const ul = document.createElement("ul");
    ul.className = "hot-card__list";

    visible.forEach((item, idx) => {
      const href = safeUrl(item.url);
      if (!href) return;
      const li = document.createElement("li");
      li.className = "hot-item";
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
      ul.appendChild(li);
    });

    card.append(head, ul);

    if (!q && matchedItems.length > 15) {
      const foot = document.createElement("div");
      foot.className = "hot-card__foot";
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "btn-secondary hot-more-btn";
      moreBtn.textContent = isExpanded ? "收起部分榜单" : `展开全部 ${matchedItems.length} 条`;
      moreBtn.addEventListener("click", () => {
        if (expandedSet.has(plat.id)) expandedSet.delete(plat.id);
        else expandedSet.add(plat.id);
        renderHotGrid();
      });
      foot.appendChild(moreBtn);
      card.appendChild(foot);
    }

    frag.appendChild(card);
  }

  els.hotGrid.replaceChildren(frag);
}

async function loadHotlist(showFeedback = false) {
  els.refreshHotBtn.disabled = true;
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
    els.hotlistMeta.textContent = "热榜加载失败，请稍后刷新重试";
    if (showFeedback) showToast("热榜刷新失败");
  } finally {
    els.refreshHotBtn.disabled = false;
  }
}

async function loadLeisureSites() {
  try {
    const res = await fetch("../data/catalog.json", { cache: "no-cache" });
    if (!res.ok) return;
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
  } catch {}
}

els.hotGroups.querySelectorAll(".cat-pill").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeGroup = btn.dataset.group;
    els.hotGroups.querySelectorAll(".cat-pill").forEach((b) => b.classList.toggle("is-active", b === btn));
    renderHotGrid();
  });
});

els.hotSearch.addEventListener("input", renderHotGrid);
els.refreshHotBtn.addEventListener("click", () => loadHotlist(true));

initSiteNav();
initThemeToggle(els.themeToggle, els.themeToggleLabel, showToast);
loadHotlist(false);
loadLeisureSites();
