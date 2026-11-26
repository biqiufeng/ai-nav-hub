import { initSiteNav, initThemeToggle } from "../nav.js?v=1";

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
  themeToggle: document.getElementById("themeToggle"),
  themeToggleLabel: document.getElementById("themeToggleLabel"),
  resetOrderBtn: document.getElementById("resetOrderBtn"),
  modelFilter: document.getElementById("modelFilter"),
  modelList: document.getElementById("modelList"),
  stageAvatar: document.getElementById("stageAvatar"),
  stageTitle: document.getElementById("stageTitle"),
  stageDesc: document.getElementById("stageDesc"),
  reloadFrameBtn: document.getElementById("reloadFrameBtn"),
  openNewTabBtn: document.getElementById("openNewTabBtn"),
  stageNotice: document.getElementById("stageNotice"),
  modelFrame: document.getElementById("modelFrame"),
  stageLaunch: document.getElementById("stageLaunch"),
  launchAvatar: document.getElementById("launchAvatar"),
  launchTitle: document.getElementById("launchTitle"),
  launchDesc: document.getElementById("launchDesc"),
  launchPrimaryBtn: document.getElementById("launchPrimaryBtn"),
  toast: document.getElementById("toast"),
};

let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2200);
}

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

function saveOrder(models) {
  try {
    localStorage.setItem(ORDER_KEY, JSON.stringify(models.map((m) => m.id)));
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

function moveModel(idx, delta) {
  const next = idx + delta;
  if (next < 0 || next >= models.length) return;
  const copy = [...models];
  const [item] = copy.splice(idx, 1);
  copy.splice(next, 0, item);
  models = copy;
  saveOrder(models);
  renderModelList();
}

function selectModel(id, forceReload = false) {
  const model = models.find((m) => m.id === id) || models[0];
  activeId = model.id;
  try { localStorage.setItem(ACTIVE_KEY, model.id); } catch {}

  els.stageAvatar.textContent = model.short;
  els.stageAvatar.style.backgroundColor = model.color;
  els.stageTitle.textContent = model.name;
  els.stageDesc.textContent = model.desc;
  els.openNewTabBtn.href = model.url;

  if (model.embeddable) {
    els.stageNotice.hidden = false;
    els.stageLaunch.hidden = true;
    els.modelFrame.hidden = false;
    els.reloadFrameBtn.hidden = false;
    if (forceReload || els.modelFrame.src !== model.url) {
      els.modelFrame.src = model.url;
    }
  } else {
    els.stageNotice.hidden = true;
    els.modelFrame.hidden = true;
    els.modelFrame.src = "about:blank";
    els.reloadFrameBtn.hidden = true;
    els.stageLaunch.hidden = false;
    els.launchAvatar.textContent = model.short;
    els.launchAvatar.style.backgroundColor = model.color;
    els.launchTitle.textContent = model.name;
    els.launchDesc.textContent = model.desc;
    els.launchPrimaryBtn.href = model.url;
  }

  renderModelList();
}

function renderModelList() {
  const q = els.modelFilter.value.trim().toLowerCase();
  const frag = document.createDocumentFragment();
  models.forEach((m, idx) => {
    if (q && !`${m.name} ${m.desc} ${m.id}`.toLowerCase().includes(q)) return;

    const li = document.createElement("li");
    li.className = "model-row" + (m.id === activeId ? " is-active" : "");

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
      upBtn.title = "上移";
      upBtn.setAttribute("aria-label", `上移 ${m.name}`);
      upBtn.textContent = "↑";
      upBtn.disabled = idx === 0;
      upBtn.addEventListener("click", () => moveModel(idx, -1));

      const downBtn = document.createElement("button");
      downBtn.type = "button";
      downBtn.className = "mini-op-btn";
      downBtn.title = "下移";
      downBtn.setAttribute("aria-label", `下移 ${m.name}`);
      downBtn.textContent = "↓";
      downBtn.disabled = idx === models.length - 1;
      downBtn.addEventListener("click", () => moveModel(idx, 1));

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
}

els.modelFilter.addEventListener("input", renderModelList);
els.reloadFrameBtn.addEventListener("click", () => selectModel(activeId, true));
els.resetOrderBtn.addEventListener("click", () => {
  models = [...DEFAULT_MODELS];
  try { localStorage.removeItem(ORDER_KEY); } catch {}
  renderModelList();
  showToast("已恢复默认模型顺序");
});

initSiteNav();
initThemeToggle(els.themeToggle, els.themeToggleLabel, showToast);
selectModel(activeId);
