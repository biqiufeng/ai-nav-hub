import {
  initSiteNav,
  initThemeToggle,
  initTopBarScrollHide,
  createToast,
  bindSearchBox,
  bindTwoStepConfirm,
  setRefreshBusy,
  prefersReducedMotion,
} from "../nav.js?v=2";

const DEFAULT_MODELS = [
  { id: "deepseek", name: "DeepSeek", short: "DS", color: "#4d6bfe", url: "https://chat.deepseek.com", desc: "深度求索 · 开源推理与编程旗舰大模型", embeddable: false },
  { id: "chatgpt", name: "ChatGPT", short: "GP", color: "#10a37f", url: "https://chatgpt.com", desc: "OpenAI · 多模态通用 AI 助手", embeddable: false },
  { id: "claude", name: "Claude", short: "CL", color: "#d97757", url: "https://claude.ai", desc: "Anthropic · 深度写作与代码工程专家", embeddable: false },
  { id: "gemini", name: "Gemini", short: "GM", color: "#1a73e8", url: "https://gemini.google.com/app", desc: "Google DeepMind · 多模态推理与长上下文", embeddable: false },
  { id: "kimi", name: "Kimi", short: "KM", color: "#1f1f1f", url: "https://www.kimi.com", desc: "月之暗面 · 长文本解析与联网深度思考", embeddable: true },
  { id: "doubao", name: "豆包", short: "豆", color: "#3b5cff", url: "https://www.doubao.com/chat/", desc: "字节跳动 · 高效全能日常 AI 助手", embeddable: true },
  { id: "qwen", name: "通义千问", short: "问", color: "#615ced", url: "https://www.qianwen.com", desc: "阿里云 · 千问系列开源与生产力大模型", embeddable: false },
  { id: "yuanbao", name: "腾讯元宝", short: "元", color: "#0053e0", url: "https://yuanbao.tencent.com", desc: "腾讯混元 + DeepSeek 双引擎 AI 助手", embeddable: true },
  { id: "zhipu", name: "智谱清言", short: "智", color: "#1f6feb", url: "https://chatglm.cn", desc: "智谱 AI · GLM 系列通用对话与智能体", embeddable: true },
  { id: "wenxin", name: "文心一言", short: "文", color: "#2932e1", url: "https://yiyan.baidu.com", desc: "百度文心大模型 · 中文知识与创作助手", embeddable: true },
  { id: "xinghuo", name: "讯飞星火", short: "火", color: "#00a693", url: "https://xinghuo.xfyun.cn/desk", desc: "科大讯飞 · 语音与办公生产力大模型", embeddable: true },
  { id: "tiangong", name: "天工", short: "天", color: "#3370ff", url: "https://www.tiangong.cn", desc: "昆仑万维 · AI 搜索与文档研究工作台", embeddable: true },
  { id: "wps", name: "WPS 灵犀", short: "W", color: "#e5484d", url: "https://ai.wps.cn", desc: "金山办公 · 文档写作与 PPT 辅助创作", embeddable: true },
  { id: "shangliang", name: "商量", short: "商", color: "#6d28d9", url: "https://chat.sensetime.com", desc: "商汤科技 · 日日新通用大模型助手", embeddable: true },
];

const ORDER_KEY = "ai_nav_hub_ai_order_v1";
const ACTIVE_KEY = "ai_nav_hub_ai_active_v1";

const els = {
  topBar: document.getElementById("topBar"),
  themeToggle: document.getElementById("themeToggle"),
  themeToggleLabel: document.getElementById("themeToggleLabel"),
  resetOrderBtn: document.getElementById("resetOrderBtn"),
  modelFilterBox: document.getElementById("modelFilterBox"),
  modelFilter: document.getElementById("modelFilter"),
  modelFilterClear: document.getElementById("modelFilterClear"),
  modelList: document.getElementById("modelList"),
  modelEmpty: document.getElementById("modelEmpty"),
  modelEmptyClearBtn: document.getElementById("modelEmptyClearBtn"),
  stageAvatar: document.getElementById("stageAvatar"),
  stageTitle: document.getElementById("stageTitle"),
  stageDesc: document.getElementById("stageDesc"),
  reloadFrameBtn: document.getElementById("reloadFrameBtn"),
  openNewTabBtn: document.getElementById("openNewTabBtn"),
  stageNotice: document.getElementById("stageNotice"),
  stageLoading: document.getElementById("stageLoading"),
  stageSlowOpenBtn: document.getElementById("stageSlowOpenBtn"),
  modelFrame: document.getElementById("modelFrame"),
  stageLaunch: document.getElementById("stageLaunch"),
  stageLaunchCard: document.getElementById("stageLaunchCard"),
  launchAvatar: document.getElementById("launchAvatar"),
  launchTitle: document.getElementById("launchTitle"),
  launchDesc: document.getElementById("launchDesc"),
  launchPrimaryBtn: document.getElementById("launchPrimaryBtn"),
  toast: document.getElementById("toast"),
};

const showToast = createToast(els.toast);

function loadOrder() {
  try {
    const raw = localStorage.getItem(ORDER_KEY);
    const ids = JSON.parse(raw || "[]");
    if (!Array.isArray(ids) || ids.length === 0) return [...DEFAULT_MODELS];
    const byId = new Map(DEFAULT_MODELS.map((m) => [m.id, m]));
    const ordered = [];
    for (const id of ids) {
      if (byId.has(id)) {
        ordered.push(byId.get(id));
        byId.delete(id);
      }
    }
    for (const rem of byId.values()) ordered.push(rem);
    return ordered;
  } catch {
    return [...DEFAULT_MODELS];
  }
}

function saveOrder(list) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(list.map((m) => m.id)));
  } catch {}
}

let models = loadOrder();
let activeId = (() => {
  try {
    const saved = localStorage.getItem(ACTIVE_KEY);
    if (saved && models.some((m) => m.id === saved)) return saved;
  } catch {}
  return models[0].id;
})();

function isDefaultOrder() {
  return models.length === DEFAULT_MODELS.length && models.every((m, i) => m.id === DEFAULT_MODELS[i].id);
}

const resetConfirm = bindTwoStepConfirm(els.resetOrderBtn, {
  idleText: "重置",
  confirmText: "确认重置",
  onConfirm: () => {
    models = [...DEFAULT_MODELS];
    try { localStorage.removeItem(ORDER_KEY); } catch {}
    syncResetBtn();
    renderModelList();
    showToast("已恢复默认模型顺序");
  },
});

function syncResetBtn() {
  const def = isDefaultOrder();
  els.resetOrderBtn.hidden = def;
  if (def) resetConfirm.reset();
}

function moveModel(idx, delta, dirBtnType) {
  const next = idx + delta;
  if (next < 0 || next >= models.length) return;
  const movedId = models[idx].id;

  const oldTops = new Map();
  if (!prefersReducedMotion()) {
    els.modelList.querySelectorAll("[data-model-id]").forEach((row) => {
      oldTops.set(row.dataset.modelId, row.getBoundingClientRect().top);
    });
  }

  const copy = [...models];
  const [item] = copy.splice(idx, 1);
  copy.splice(next, 0, item);
  models = copy;
  saveOrder(models);
  syncResetBtn();
  renderModelList();

  const movedRow = els.modelList.querySelector(`[data-model-id="${CSS.escape(movedId)}"]`);
  if (movedRow) {
    const targetBtn =
      movedRow.querySelector(`[data-op="${dirBtnType}"]:not(:disabled)`) ||
      movedRow.querySelector(`[data-op]:not(:disabled)`);
    targetBtn?.focus();
  }

  if (!prefersReducedMotion() && oldTops.size > 0) {
    els.modelList.querySelectorAll("[data-model-id]").forEach((row) => {
      const prevTop = oldTops.get(row.dataset.modelId);
      if (prevTop === undefined) return;
      const dy = prevTop - row.getBoundingClientRect().top;
      if (Math.abs(dy) > 0.5) {
        row.animate(
          [{ transform: `translateY(${dy}px)` }, { transform: "translateY(0)" }],
          { duration: 220, easing: "cubic-bezier(0.22, 1, 0.36, 1)" }
        );
      }
    });
  }
}

let slowTimer = null;
let reloadFailsafe = null;

function clearLoadingTimers() {
  clearTimeout(slowTimer);
  clearTimeout(reloadFailsafe);
  slowTimer = null;
  reloadFailsafe = null;
}

function finishFrameLoad() {
  clearLoadingTimers();
  els.stageLoading.hidden = true;
  els.stageSlowOpenBtn.hidden = true;
  els.modelFrame.classList.add("is-loaded");
  setRefreshBusy(els.reloadFrameBtn, false, "刷新", "刷新中…");
}

els.modelFrame.addEventListener("load", () => {
  if (els.modelFrame.hidden || els.modelFrame.src === "about:blank") return;
  finishFrameLoad();
});

function selectModel(id, forceReload = false) {
  const model = models.find((m) => m.id === id) || models[0];
  const changed = activeId !== model.id;
  activeId = model.id;
  try { localStorage.setItem(ACTIVE_KEY, model.id); } catch {}

  els.stageAvatar.textContent = model.short;
  els.stageAvatar.style.backgroundColor = model.color;
  els.stageTitle.textContent = model.name;
  els.stageDesc.textContent = model.desc;
  els.openNewTabBtn.href = model.url;
  els.stageSlowOpenBtn.href = model.url;

  if (model.embeddable) {
    els.stageNotice.hidden = false;
    els.stageLaunch.hidden = true;
    els.modelFrame.hidden = false;
    els.reloadFrameBtn.hidden = false;

    if (forceReload || els.modelFrame.src !== model.url) {
      clearLoadingTimers();
      els.modelFrame.classList.remove("is-loaded");
      els.stageLoading.hidden = false;
      els.stageSlowOpenBtn.hidden = true;
      setRefreshBusy(els.reloadFrameBtn, true, "刷新", "刷新中…");

      slowTimer = setTimeout(() => {
        if (!els.stageLoading.hidden) els.stageSlowOpenBtn.hidden = false;
      }, 6000);
      reloadFailsafe = setTimeout(finishFrameLoad, 10000);

      if (forceReload && els.modelFrame.src === model.url) {
        els.modelFrame.src = "about:blank";
        requestAnimationFrame(() => {
          els.modelFrame.src = model.url;
        });
      } else {
        els.modelFrame.src = model.url;
      }
    }
  } else {
    clearLoadingTimers();
    setRefreshBusy(els.reloadFrameBtn, false, "刷新", "刷新中…");
    els.stageLoading.hidden = true;
    els.stageSlowOpenBtn.hidden = true;
    els.stageNotice.hidden = true;
    els.modelFrame.hidden = true;
    els.modelFrame.classList.remove("is-loaded");
    els.modelFrame.src = "about:blank";
    els.reloadFrameBtn.hidden = true;

    els.stageLaunch.hidden = false;
    els.launchAvatar.textContent = model.short;
    els.launchAvatar.style.backgroundColor = model.color;
    els.launchTitle.textContent = model.name;
    els.launchDesc.textContent = model.desc;
    els.launchPrimaryBtn.href = model.url;

    if (changed && !prefersReducedMotion()) {
      els.stageLaunchCard.classList.remove("panel-enter");
      void els.stageLaunchCard.offsetWidth;
      els.stageLaunchCard.classList.add("panel-enter");
    }
  }

  renderModelList();
}

function renderModelList() {
  const q = els.modelFilter.value.trim().toLowerCase();
  const frag = document.createDocumentFragment();
  let rendered = 0;

  models.forEach((m, idx) => {
    if (q && !`${m.name} ${m.desc} ${m.id}`.toLowerCase().includes(q)) return;
    rendered++;

    const li = document.createElement("li");
    li.className = "model-row" + (m.id === activeId ? " is-active" : "");
    li.dataset.modelId = m.id;

    const pick = document.createElement("button");
    pick.type = "button";
    pick.className = "model-row__pick";
    pick.setAttribute("aria-current", m.id === activeId ? "true" : "false");

    const badge = document.createElement("span");
    badge.className = "model-row__badge";
    badge.style.backgroundColor = m.color;
    badge.textContent = m.short;

    const name = document.createElement("span");
    name.className = "model-row__name";
    name.textContent = m.name;

    pick.append(badge, name);
    pick.addEventListener("click", () => selectModel(m.id));

    const ops = document.createElement("div");
    ops.className = "model-row__ops";

    if (!q) {
      const upBtn = document.createElement("button");
      upBtn.type = "button";
      upBtn.className = "mini-op-btn";
      upBtn.dataset.op = "up";
      upBtn.title = "上移";
      upBtn.setAttribute("aria-label", `上移 ${m.name}`);
      upBtn.textContent = "↑";
      upBtn.disabled = idx === 0;
      upBtn.addEventListener("click", () => moveModel(idx, -1, "up"));

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "mini-op-btn";
      downBtn.dataset.op = "down";
      downBtn.title = "下移";
      downBtn.setAttribute("aria-label", `下移 ${m.name}`);
      downBtn.textContent = "↓";
      downBtn.disabled = idx === models.length - 1;
      downBtn.addEventListener("click", () => moveModel(idx, 1, "down"));

      ops.append(upBtn, downBtn);
    }

    const ext = document.createElement("a");
    ext.className = "mini-op-btn";
    ext.href = m.url;
    ext.target = "_blank";
    ext.rel = "noopener noreferrer";
    ext.title = "新标签页打开";
    ext.setAttribute("aria-label", `新标签页打开 ${m.name}`);
    ext.textContent = "↗";

    ops.appendChild(ext);
    li.append(pick, ops);
    frag.appendChild(li);
  });

  els.modelList.replaceChildren(frag);
  els.modelEmpty.hidden = rendered > 0;
}

const filterController = bindSearchBox({
  input: els.modelFilter,
  clearBtn: els.modelFilterClear,
  boxEl: els.modelFilterBox,
  onChange: renderModelList,
  enableGlobalShortcut: true,
});

els.modelEmptyClearBtn.addEventListener("click", () => {
  els.modelFilter.value = "";
  filterController.sync();
  renderModelList();
  els.modelFilter.focus();
});

els.reloadFrameBtn.addEventListener("click", () => selectModel(activeId, true));

initSiteNav();
initTopBarScrollHide(els.topBar, { enabled: false });
initThemeToggle(els.themeToggle, els.themeToggleLabel, showToast);
syncResetBtn();
selectModel(activeId);
