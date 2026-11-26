import {
  initThemeToggle,
  initTopBarScrollHide,
  createToast,
  setRefreshBusy,
} from "../nav.js?v=3";

const SOURCE_URLS = {
  "ai-bot": "https://ai-bot.cn/",
  "aibase": "https://www.aibase.com/zh/tools",
  "yupi-ai": "https://ai.codefather.cn/",
  "ai-zhiku": "https://ai-zhiku.com/",
  "waytoagi": "https://www.waytoagi.com/zh",
  "baoboxs": "https://www.baoboxs.com/",
  "producthunt": "https://www.producthunt.com/",
  "futuretools": "https://www.futuretools.io/",
  "futurepedia": "https://www.futurepedia.io/",
};

const els = {
  topBar: document.getElementById("topBar"),
  themeToggle: document.getElementById("themeToggle"),
  themeToggleLabel: document.getElementById("themeToggleLabel"),
  refreshBtn: document.getElementById("refreshBtn"),
  adminSubtitle: document.getElementById("adminSubtitle"),
  kpiTotal: document.getElementById("kpiTotal"),
  kpiTotalHint: document.getElementById("kpiTotalHint"),
  kpiCoverage: document.getElementById("kpiCoverage"),
  kpiCoverageHint: document.getElementById("kpiCoverageHint"),
  kpiIcons: document.getElementById("kpiIcons"),
  kpiIconsHint: document.getElementById("kpiIconsHint"),
  kpiSync: document.getElementById("kpiSync"),
  kpiSchedule: document.getElementById("kpiSchedule"),
  sourcesTableBody: document.getElementById("sourcesTableBody"),
  catStatsHeading: document.getElementById("catStatsHeading"),
  categoryStats: document.getElementById("categoryStats"),
  toast: document.getElementById("toast"),
};

const showToast = createToast(els.toast);

function formatDateTime(isoStr) {
  const dt = isoStr ? new Date(isoStr) : null;
  if (!dt || Number.isNaN(dt.getTime())) return isoStr || "未知";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(dt);
}

function renderSourcesTable(sources) {
  const frag = document.createDocumentFragment();
  for (const s of sources) {
    const tr = document.createElement("tr");

    const th = document.createElement("th");
    th.scope = "row";
    const srcUrl = SOURCE_URLS[s.id];
    if (srcUrl) {
      const a = document.createElement("a");
      a.className = "source-link";
      a.href = srcUrl;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = s.name || s.id;
      th.appendChild(a);
    } else {
      th.textContent = s.name || s.id;
    }

    const tdRegion = document.createElement("td");
    tdRegion.textContent = s.region === "domestic" ? "国内主流" : "海外主流";

    const tdStatus = document.createElement("td");
    const pill = document.createElement("span");
    if (s.status === "ok") {
      pill.className = "status-pill status-pill--ok";
      pill.textContent = "正常";
    } else if (s.status === "ref_only") {
      pill.className = "status-pill status-pill--ref";
      pill.textContent = "友链参考";
    } else {
      pill.className = "status-pill status-pill--error";
      pill.textContent = s.status || "异常";
    }
    tdStatus.appendChild(pill);

    const tdCount = document.createElement("td");
    tdCount.textContent = typeof s.count === "number" ? `${s.count.toLocaleString("zh-CN")} 条` : "—";

    const tdElapsed = document.createElement("td");
    tdElapsed.textContent = typeof s.elapsed_s === "number" ? `${s.elapsed_s}s` : "—";

    const tdNote = document.createElement("td");
    tdNote.textContent = s.note || (s.status === "ok" ? "全量并发抓取完成" : "—");

    tr.append(th, tdRegion, tdStatus, tdCount, tdElapsed, tdNote);
    frag.appendChild(tr);
  }
  els.sourcesTableBody.replaceChildren(frag);
}

function renderSourcesErrorRow() {
  const tr = document.createElement("tr");
  const th = document.createElement("th");
  th.scope = "row";
  th.textContent = "加载失败";
  const td = document.createElement("td");
  td.colSpan = 5;
  td.textContent = "无法读取 catalog.json ";
  const retryBtn = document.createElement("button");
  retryBtn.type = "button";
  retryBtn.className = "btn-secondary admin-nav-btn";
  retryBtn.textContent = "重试";
  retryBtn.style.marginLeft = "8px";
  retryBtn.addEventListener("click", () => loadAdminData(true));
  td.appendChild(retryBtn);
  tr.append(th, td);
  els.sourcesTableBody.replaceChildren(tr);
}

function renderCategoryStats(byCategory, total) {
  const entries = Object.entries(byCategory || {}).sort((a, b) => b[1] - a[1]);
  els.catStatsHeading.textContent = `${entries.length} 大分类分布统计`;
  const frag = document.createDocumentFragment();
  const safeTotal = Math.max(total || 1, 1);

  for (const [cat, count] of entries) {
    const row = document.createElement("div");
    row.className = "cat-bar-row";

    const top = document.createElement("div");
    top.className = "cat-bar-row__top";
    const nameEl = document.createElement("span");
    nameEl.textContent = cat;
    const valEl = document.createElement("span");
    const pct = ((count / safeTotal) * 100).toFixed(1);
    valEl.textContent = `${count.toLocaleString("zh-CN")} (${pct}%)`;
    top.append(nameEl, valEl);

    const track = document.createElement("div");
    track.className = "cat-bar-row__track";
    const fill = document.createElement("div");
    fill.className = "cat-bar-row__fill";
    fill.style.setProperty("--bar-ratio", String(Math.max(0.02, count / safeTotal)));
    track.appendChild(fill);

    row.append(top, track);
    frag.appendChild(row);
  }

  els.categoryStats.replaceChildren(frag);
}

async function loadAdminData(showFeedback = false) {
  setRefreshBusy(els.refreshBtn, true, "刷新数据", "刷新中…");
  try {
    const res = await fetch(`../data/catalog.json?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const catalog = await res.json();
    const stats = catalog.stats || {};
    const total = stats.total ?? (catalog.items?.length || 0);
    const domestic = stats.domestic ?? 0;
    const overseas = stats.overseas ?? 0;
    const withIcon = stats.with_icon ?? 0;
    const stripped = stats.placeholder_stripped ?? 0;
    const sources = Array.isArray(catalog.sources_summary) ? catalog.sources_summary : [];
    const activeSources = sources.filter((s) => s.status === "ok").length;

    els.adminSubtitle.textContent = `最近同步：${formatDateTime(catalog.generated_at)} · ${catalog.schedule || "每日 04:00 自动爬取更新"}`;
    els.kpiTotal.textContent = total.toLocaleString("zh-CN");
    els.kpiTotalHint.textContent = `已接入 ${activeSources} 个正常数据源`;
    els.kpiCoverage.textContent = `${domestic.toLocaleString("zh-CN")} / ${overseas.toLocaleString("zh-CN")}`;
    els.kpiCoverageHint.textContent = "国内主流覆盖 / 海外主流覆盖";
    const iconPct = total > 0 ? ((withIcon / total) * 100).toFixed(1) : "0.0";
    els.kpiIcons.textContent = `${withIcon.toLocaleString("zh-CN")} (${iconPct}%)`;
    els.kpiIconsHint.textContent = `已自动过滤 ${stripped} 个站内占位图`;
    els.kpiSync.textContent = formatDateTime(catalog.generated_at);
    els.kpiSchedule.textContent = catalog.schedule || "每日 04:00 自动爬取更新";

    renderSourcesTable(sources);
    renderCategoryStats(stats.by_category, total);
    if (showFeedback) showToast("后台数据已刷新");
  } catch (err) {
    els.adminSubtitle.textContent = `数据加载失败（${err?.message || "未知错误"}）`;
    renderSourcesErrorRow();
    if (showFeedback) showToast("数据刷新失败，请稍后重试");
  } finally {
    setRefreshBusy(els.refreshBtn, false, "刷新数据", "刷新中…");
  }
}

els.refreshBtn.addEventListener("click", () => loadAdminData(true));

initTopBarScrollHide(els.topBar);
initThemeToggle(els.themeToggle, els.themeToggleLabel, showToast);
loadAdminData(false);
