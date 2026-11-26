import { initSiteNav, initThemeToggle } from "../nav.js?v=1";

const els = {
  themeToggle: document.getElementById("themeToggle"),
  themeToggleLabel: document.getElementById("themeToggleLabel"),
  toolTabs: document.getElementById("toolTabs"),
  workbenchBody: document.getElementById("workbenchBody"),
  dirCount: document.getElementById("dirCount"),
  dirSearch: document.getElementById("dirSearch"),
  dirCats: document.getElementById("dirCats"),
  dirGrid: document.getElementById("dirGrid"),
  toast: document.getElementById("toast"),
};

let toastTimer = null;
function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.hidden = true; }, 2200);
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.cssText = "position:fixed;opacity:0;";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    showToast("已复制到剪贴板");
  } catch {
    showToast("复制失败，请手动复制");
  }
}

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function mkBtn(label, cls, onClick) {
  const b = el("button", cls, label);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

function renderJsonTool(host) {
  const actions = el("div", "wb-actions");
  const status = el("span", "wb-status", "粘贴 JSON 后点击格式化或压缩");
  const grid = el("div", "wb-grid-2");

  const inWrap = el("div", "wb-field");
  inWrap.append(el("label", "wb-label", "输入 JSON"));
  const taIn = el("textarea", "wb-textarea");
  taIn.placeholder = '{"name":"AI Nav Hub","tools":8361}';
  taIn.value = '{"name":"AI Nav Hub","schedule":"每日 04:00","categories":["对话写作","编程开发","划水摸鱼"]}';
  inWrap.appendChild(taIn);

  const outWrap = el("div", "wb-field");
  outWrap.append(el("label", "wb-label", "输出结果"));
  const taOut = el("textarea", "wb-textarea");
  taOut.readOnly = true;
  outWrap.appendChild(taOut);

  const run = (indent) => {
    try {
      const parsed = JSON.parse(taIn.value);
      taOut.value = JSON.stringify(parsed, null, indent);
      status.className = "wb-status wb-status--ok";
      status.textContent = "JSON 校验通过 ✓";
    } catch (e) {
      status.className = "wb-status wb-status--err";
      status.textContent = `语法错误：${e.message}`;
    }
  };

  actions.append(
    mkBtn("格式化 (2空格)", "btn-primary wb-btn", () => run(2)),
    mkBtn("压缩单行", "btn-secondary wb-btn", () => run(0)),
    mkBtn("复制结果", "btn-secondary wb-btn", () => copyText(taOut.value || taIn.value)),
    mkBtn("清空", "btn-secondary wb-btn", () => { taIn.value = ""; taOut.value = ""; status.textContent = ""; }),
    status
  );
  grid.append(inWrap, outWrap);
  host.replaceChildren(actions, grid);
  run(2);
}

function renderTimeTool(host) {
  const nowSec = () => Math.floor(Date.now() / 1000);
  const actions = el("div", "wb-actions");
  const live = el("span", "wb-status wb-status--ok", `当前 Unix 秒：${nowSec()}`);
  const timer = setInterval(() => {
    if (!document.body.contains(live)) return clearInterval(timer);
    live.textContent = `当前 Unix 秒：${nowSec()} · 毫秒：${Date.now()}`;
  }, 1000);

  const grid = el("div", "wb-grid-2");

  const tsWrap = el("div", "wb-field");
  tsWrap.append(el("label", "wb-label", "时间戳（秒或 13 位毫秒）"));
  const tsInput = el("input", "wb-input");
  tsInput.value = String(nowSec());
  const tsOut = el("input", "wb-input");
  tsOut.readOnly = true;
  tsWrap.append(tsInput, tsOut);

  const dtWrap = el("div", "wb-field");
  dtWrap.append(el("label", "wb-label", "日期时间（YYYY-MM-DD HH:mm:ss）"));
  const dtInput = el("input", "wb-input");
  const fmt = (d) => new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(d);
  dtInput.value = fmt(new Date());
  const dtOut = el("input", "wb-input");
  dtOut.readOnly = true;
  dtWrap.append(dtInput, dtOut);

  const convertTs = () => {
    const raw = tsInput.value.trim();
    const num = Number(raw);
    if (!Number.isFinite(num)) { tsOut.value = "无效时间戳"; return; }
    const ms = raw.length >= 13 ? num : num * 1000;
    const d = new Date(ms);
    tsOut.value = Number.isNaN(d.getTime()) ? "无效时间" : `北京时间：${fmt(d)} | UTC：${d.toISOString()}`;
  };
  const convertDt = () => {
    const raw = dtInput.value.trim().replace(" ", "T");
    const d = new Date(raw.includes("Z") || raw.includes("+") ? raw : `${raw}+08:00`);
    dtOut.value = Number.isNaN(d.getTime()) ? "无效日期格式" : `秒：${Math.floor(d.getTime() / 1000)} | 毫秒：${d.getTime()}`;
  };

  actions.append(
    mkBtn("时间戳 → 日期", "btn-primary wb-btn", convertTs),
    mkBtn("日期 → 时间戳", "btn-secondary wb-btn", convertDt),
    mkBtn("填入当前时间", "btn-secondary wb-btn", () => {
      const d = new Date();
      tsInput.value = String(Math.floor(d.getTime() / 1000));
      dtInput.value = fmt(d);
      convertTs();
      convertDt();
    }),
    live
  );
  grid.append(tsWrap, dtWrap);
  host.replaceChildren(actions, grid);
  convertTs();
  convertDt();
}

function renderBase64Tool(host) {
  const actions = el("div", "wb-actions");
  const status = el("span", "wb-status", "支持 UTF-8 中文双向编解码");
  const grid = el("div", "wb-grid-2");

  const inWrap = el("div", "wb-field");
  inWrap.append(el("label", "wb-label", "原文 / Base64"));
  const taIn = el("textarea", "wb-textarea");
  taIn.value = "Hello 程序员与 AI 工具站！";
  inWrap.appendChild(taIn);

  const outWrap = el("div", "wb-field");
  outWrap.append(el("label", "wb-label", "转换结果"));
  const taOut = el("textarea", "wb-textarea");
  taOut.readOnly = true;
  outWrap.appendChild(taOut);

  const encode = () => {
    try {
      const bytes = new TextEncoder().encode(taIn.value);
      let bin = "";
      bytes.forEach((b) => { bin += String.fromCharCode(b); });
      taOut.value = btoa(bin);
      status.className = "wb-status wb-status--ok";
      status.textContent = "编码成功 ✓";
    } catch (e) {
      status.className = "wb-status wb-status--err";
      status.textContent = e.message;
    }
  };
  const decode = () => {
    try {
      const bin = atob(taIn.value.trim());
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      taOut.value = new TextDecoder().decode(bytes);
      status.className = "wb-status wb-status--ok";
      status.textContent = "解码成功 ✓";
    } catch {
      status.className = "wb-status wb-status--err";
      status.textContent = "Base64 格式无效";
    }
  };

  actions.append(
    mkBtn("Base64 编码", "btn-primary wb-btn", encode),
    mkBtn("Base64 解码", "btn-secondary wb-btn", decode),
    mkBtn("复制结果", "btn-secondary wb-btn", () => copyText(taOut.value)),
    status
  );
  grid.append(inWrap, outWrap);
  host.replaceChildren(actions, grid);
  encode();
}

function renderUrlTool(host) {
  const actions = el("div", "wb-actions");
  const grid = el("div", "wb-grid-2");
  const inWrap = el("div", "wb-field");
  inWrap.append(el("label", "wb-label", "输入 URL 或编码文本"));
  const taIn = el("textarea", "wb-textarea");
  taIn.value = "https://example.com/search?q=AI%20%E5%B7%A5%E5%85%B7&tab=dev";
  inWrap.appendChild(taIn);

  const outWrap = el("div", "wb-field");
  outWrap.append(el("label", "wb-label", "输出 / 参数拆解"));
  const taOut = el("textarea", "wb-textarea");
  taOut.readOnly = true;
  outWrap.appendChild(taOut);

  const decode = () => {
    const raw = taIn.value.trim();
    let res = "";
    try { res = decodeURIComponent(raw); } catch { res = raw; }
    try {
      const u = new URL(raw);
      const params = [...u.searchParams.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
      if (params) res += `\n\n--- Query 参数 ---\n${params}`;
    } catch {}
    taOut.value = res;
  };
  const encode = () => {
    taOut.value = encodeURIComponent(taIn.value);
  };

  actions.append(
    mkBtn("URL 解码与拆参", "btn-primary wb-btn", decode),
    mkBtn("encodeURIComponent 编码", "btn-secondary wb-btn", encode),
    mkBtn("复制结果", "btn-secondary wb-btn", () => copyText(taOut.value))
  );
  grid.append(inWrap, outWrap);
  host.replaceChildren(actions, grid);
  decode();
}

function renderJwtTool(host) {
  const status = el("span", "wb-status", "输入 JWT Token（仅本地解析，不校验签名密钥）");
  const inWrap = el("div", "wb-field");
  inWrap.append(el("label", "wb-label", "JWT Token"));
  const taIn = el("textarea", "wb-textarea");
  taIn.style.minHeight = "96px";
  taIn.placeholder = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";
  inWrap.appendChild(taIn);

  const grid = el("div", "wb-grid-2");
  const hWrap = el("div", "wb-field");
  hWrap.append(el("label", "wb-label", "Header"));
  const hOut = el("textarea", "wb-textarea");
  hOut.readOnly = true;
  hWrap.appendChild(hOut);

  const pWrap = el("div", "wb-field");
  pWrap.append(el("label", "wb-label", "Payload"));
  const pOut = el("textarea", "wb-textarea");
  pOut.readOnly = true;
  pWrap.appendChild(pOut);

  const decodePart = (b64u) => {
    const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((-b64u.length) % 4);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  };

  const parse = () => {
    const val = taIn.value.trim();
    if (!val) { hOut.value = ""; pOut.value = ""; return; }
    const parts = val.split(".");
    if (parts.length < 2) {
      status.className = "wb-status wb-status--err";
      status.textContent = "Token 段数不足";
      return;
    }
    try {
      const hdr = decodePart(parts[0]);
      const pld = decodePart(parts[1]);
      hOut.value = JSON.stringify(hdr, null, 2);
      pOut.value = JSON.stringify(pld, null, 2);
      status.className = "wb-status wb-status--ok";
      status.textContent = pld.exp
        ? (Date.now() / 1000 > pld.exp ? "解析成功（注意：exp 已过期）" : "解析成功（未过期 ✓）")
        : "解析成功 ✓";
    } catch {
      status.className = "wb-status wb-status--err";
      status.textContent = "JWT 格式无效";
    }
  };
  taIn.addEventListener("input", parse);

  const actions = el("div", "wb-actions");
  actions.append(
    mkBtn("填入示例", "btn-secondary wb-btn", () => {
      taIn.value = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhaS1uYXYtaHViIiwibmFtZSI6IkRldiBVc2VyIiwiaWF0IjoxNzAwMDAwMDAwfQ.signature";
      parse();
    }),
    status
  );
  grid.append(hWrap, pWrap);
  host.replaceChildren(actions, inWrap, grid);
}

function renderUuidTool(host) {
  const actions = el("div", "wb-actions");
  const countIn = el("input", "wb-input");
  countIn.type = "number";
  countIn.min = "1";
  countIn.max = "100";
  countIn.value = "10";
  countIn.style.width = "88px";

  const taOut = el("textarea", "wb-textarea");
  taOut.readOnly = true;

  const gen = (noDash = false, upper = false) => {
    const n = Math.min(100, Math.max(1, Number(countIn.value) || 10));
    const list = [];
    for (let i = 0; i < n; i++) {
      let id = crypto.randomUUID();
      if (noDash) id = id.replace(/-/g, "");
      if (upper) id = id.toUpperCase();
      list.push(id);
    }
    taOut.value = list.join("\n");
  };

  actions.append(
    el("span", "wb-label", "数量"),
    countIn,
    mkBtn("生成标准 UUID", "btn-primary wb-btn", () => gen(false, false)),
    mkBtn("无连字符", "btn-secondary wb-btn", () => gen(true, false)),
    mkBtn("大写", "btn-secondary wb-btn", () => gen(false, true)),
    mkBtn("复制全部", "btn-secondary wb-btn", () => copyText(taOut.value))
  );
  host.replaceChildren(actions, taOut);
  gen(false, false);
}

function renderPwdTool(host) {
  const actions = el("div", "wb-actions");
  const lenIn = el("input", "wb-input");
  lenIn.type = "number";
  lenIn.min = "6";
  lenIn.max = "64";
  lenIn.value = "16";
  lenIn.style.width = "84px";

  const chkSym = document.createElement("input");
  chkSym.type = "checkbox";
  chkSym.checked = true;
  const symLabel = el("label", "wb-label");
  symLabel.style.cssText = "display:inline-flex;align-items:center;gap:5px;cursor:pointer;";
  symLabel.append(chkSym, document.createTextNode("含特殊符号"));

  const taOut = el("textarea", "wb-textarea");
  taOut.readOnly = true;

  const gen = () => {
    const len = Math.min(64, Math.max(6, Number(lenIn.value) || 16));
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789" + (chkSym.checked ? "!@#$%^&*-_=+" : "");
    const lines = [];
    for (let r = 0; r < 5; r++) {
      const buf = new Uint32Array(len);
      crypto.getRandomValues(buf);
      let s = "";
      for (let i = 0; i < len; i++) s += chars[buf[i] % chars.length];
      lines.push(s);
    }
    taOut.value = lines.join("\n");
  };

  actions.append(
    el("span", "wb-label", "长度"),
    lenIn,
    symLabel,
    mkBtn("生成 5 组强密码", "btn-primary wb-btn", gen),
    mkBtn("复制全部", "btn-secondary wb-btn", () => copyText(taOut.value))
  );
  host.replaceChildren(actions, taOut);
  gen();
}

function renderRegexTool(host) {
  const top = el("div", "wb-grid-2");
  const patWrap = el("div", "wb-field");
  patWrap.append(el("label", "wb-label", "正则表达式（不含首尾斜杠）"));
  const patIn = el("input", "wb-input");
  patIn.value = "([a-z0-9-]+)\\.(com|cn|io)";
  patWrap.appendChild(patIn);

  const flagWrap = el("div", "wb-field");
  flagWrap.append(el("label", "wb-label", "修饰符（Flags）"));
  const flagIn = el("input", "wb-input");
  flagIn.value = "gi";
  flagWrap.appendChild(flagIn);
  top.append(patWrap, flagWrap);

  const grid = el("div", "wb-grid-2");
  const textWrap = el("div", "wb-field");
  textWrap.append(el("label", "wb-label", "测试文本"));
  const taText = el("textarea", "wb-textarea");
  taText.value = "deepseek.com\nai-bot.cn\nfuturetools.io\nbaoboxs.com";
  textWrap.appendChild(taText);

  const resWrap = el("div", "wb-field");
  const resLabel = el("label", "wb-label", "匹配结果");
  const taRes = el("textarea", "wb-textarea");
  taRes.readOnly = true;
  resWrap.append(resLabel, taRes);
  grid.append(textWrap, resWrap);

  const run = () => {
    try {
      const flags = flagIn.value.includes("g") ? flagIn.value : `${flagIn.value}g`;
      const re = new RegExp(patIn.value, flags);
      const matches = [...taText.value.matchAll(re)];
      resLabel.textContent = `匹配结果（共 ${matches.length} 项）`;
      taRes.value = matches.map((m, idx) => `#${idx + 1}: ${m[0]}${m.length > 1 ? `  [分组: ${m.slice(1).join(", ")}]` : ""}`).join("\n");
    } catch (e) {
      resLabel.textContent = "正则语法错误";
      taRes.value = e.message;
    }
  };
  [patIn, flagIn, taText].forEach((x) => x.addEventListener("input", run));
  host.replaceChildren(top, grid);
  run();
}

function renderTextTool(host) {
  const actions = el("div", "wb-actions");
  const stats = el("span", "wb-status", "");
  const ta = el("textarea", "wb-textarea");
  ta.value = "DeepSeek\nKimi\nDeepSeek\nClaude\nGemini";

  const updateStats = () => {
    const v = ta.value;
    const lines = v ? v.split(/\r?\n/).length : 0;
    const nonEmpty = v.split(/\r?\n/).filter((l) => l.trim()).length;
    stats.textContent = `字符：${v.length} · 总行数：${lines} · 非空行：${nonEmpty}`;
  };
  ta.addEventListener("input", updateStats);

  actions.append(
    mkBtn("按行去重", "btn-primary wb-btn", () => {
      const seen = new Set();
      ta.value = ta.value.split(/\r?\n/).filter((l) => {
        if (seen.has(l)) return false;
        seen.add(l);
        return true;
      }).join("\n");
      updateStats();
    }),
    mkBtn("去除空行", "btn-secondary wb-btn", () => {
      ta.value = ta.value.split(/\r?\n/).filter((l) => l.trim() !== "").join("\n");
      updateStats();
    }),
    mkBtn("转大写", "btn-secondary wb-btn", () => { ta.value = ta.value.toUpperCase(); updateStats(); }),
    mkBtn("转小写", "btn-secondary wb-btn", () => { ta.value = ta.value.toLowerCase(); updateStats(); }),
    mkBtn("复制", "btn-secondary wb-btn", () => copyText(ta.value)),
    stats
  );
  host.replaceChildren(actions, ta);
  updateStats();
}

function renderColorTool(host) {
  const wrap = el("div", "wb-grid-2");
  const left = el("div", "wb-field");
  left.append(el("label", "wb-label", "选择或输入 HEX 颜色"));
  const picker = el("input", "wb-input");
  picker.type = "color";
  picker.value = "#0071e3";
  picker.style.height = "46px";
  const hexIn = el("input", "wb-input");
  hexIn.value = "#0071e3";
  left.append(picker, hexIn);

  const right = el("div", "wb-field");
  const swatch = el("div", "color-preview");
  const out = el("textarea", "wb-textarea");
  out.style.minHeight = "120px";
  out.readOnly = true;
  right.append(swatch, out);

  const sync = (hex) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return;
    const h = `#${m[1].toLowerCase()}`;
    const n = parseInt(m[1], 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn), d = max - min;
    let hue = 0, sat = 0;
    const l = (max + min) / 2;
    if (d !== 0) {
      sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === rn) hue = (gn - bn) / d + (gn < bn ? 6 : 0);
      else if (max === gn) hue = (bn - rn) / d + 2;
      else hue = (rn - gn) / d + 4;
      hue *= 60;
    }
    picker.value = h;
    hexIn.value = h;
    swatch.style.backgroundColor = h;
    out.value = `HEX: ${h}\nRGB: rgb(${r}, ${g}, ${b})\nHSL: hsl(${Math.round(hue)}, ${Math.round(sat * 100)}%, ${Math.round(l * 100)}%)`;
  };
  picker.addEventListener("input", () => sync(picker.value));
  hexIn.addEventListener("input", () => sync(hexIn.value));
  wrap.append(left, right);
  host.replaceChildren(wrap);
  sync("#0071e3");
}

function renderCronTool(host) {
  const examples = [
    ["* * * * *", "每分钟执行一次"],
    ["0 * * * *", "每小时整点执行"],
    ["0 4 * * *", "每天凌晨 04:00 执行"],
    ["0 9 * * 1-5", "工作日每天 09:00 执行"],
    ["0 4 * * 1", "每周一凌晨 04:00 执行"],
    ["0 0 1 * *", "每月 1 号 00:00 执行"],
    ["*/15 * * * *", "每 15 分钟执行一次"],
  ];
  const tbl = el("table", "cron-table");
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  ["Cron 表达式（分 时 日 月 周）", "含义说明", "操作"].forEach((t) => hr.appendChild(el("th", "", t)));
  thead.appendChild(hr);
  const tbody = document.createElement("tbody");
  for (const [expr, desc] of examples) {
    const tr = document.createElement("tr");
    const td1 = document.createElement("td");
    td1.appendChild(el("code", "", expr));
    const td2 = el("td", "", desc);
    const td3 = document.createElement("td");
    td3.appendChild(mkBtn("复制", "btn-secondary wb-btn", () => copyText(expr)));
    tr.append(td1, td2, td3);
    tbody.appendChild(tr);
  }
  tbl.append(thead, tbody);
  host.replaceChildren(tbl);
}

function renderHashTool(host) {
  const actions = el("div", "wb-actions");
  const taIn = el("textarea", "wb-textarea");
  taIn.style.minHeight = "110px";
  taIn.value = "ai-nav-hub";
  const taOut = el("textarea", "wb-textarea");
  taOut.style.minHeight = "120px";
  taOut.readOnly = true;

  const calc = async () => {
    const data = new TextEncoder().encode(taIn.value);
    const digest = async (alg) => {
      const buf = await crypto.subtle.digest(alg, data);
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    };
    const [s256, s512, s1] = await Promise.all([digest("SHA-256"), digest("SHA-512"), digest("SHA-1")]);
    taOut.value = `SHA-256:\n${s256}\n\nSHA-512:\n${s512}\n\nSHA-1:\n${s1}`;
  };
  taIn.addEventListener("input", calc);
  actions.append(
    mkBtn("计算哈希", "btn-primary wb-btn", calc),
    mkBtn("复制结果", "btn-secondary wb-btn", () => copyText(taOut.value))
  );
  host.replaceChildren(actions, taIn, taOut);
  calc();
}

const RENDERERS = {
  json: renderJsonTool,
  time: renderTimeTool,
  base64: renderBase64Tool,
  url: renderUrlTool,
  jwt: renderJwtTool,
  uuid: renderUuidTool,
  pwd: renderPwdTool,
  regex: renderRegexTool,
  text: renderTextTool,
  color: renderColorTool,
  cron: renderCronTool,
  hash: renderHashTool,
};

const tabs = [...els.toolTabs.querySelectorAll(".tab-btn")];
function activateTab(toolId) {
  for (const t of tabs) {
    const sel = t.dataset.tool === toolId;
    t.setAttribute("aria-selected", String(sel));
    if (sel) {
      els.workbenchBody.setAttribute("aria-labelledby", t.id);
      t.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }
  const fn = RENDERERS[toolId] || renderJsonTool;
  fn(els.workbenchBody);
}

tabs.forEach((tab, idx) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tool));
  tab.addEventListener("keydown", (e) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next !== -1) {
      e.preventDefault();
      tabs[next].focus();
      activateTab(tabs[next].dataset.tool);
    }
  });
});

/* ---------- Curated Tools Directory ---------- */
const TOOL_CATS = ["全部", "编程开发", "办公效率", "图像设计", "Agent与自动化"];
let dirItems = [];
let dirCat = "全部";

function safeUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

function renderDir() {
  const catsFrag = document.createDocumentFragment();
  for (const c of TOOL_CATS) {
    const b = el("button", "cat-pill" + (dirCat === c ? " is-active" : ""), c);
    b.type = "button";
    b.addEventListener("click", () => { dirCat = c; renderDir(); });
    catsFrag.appendChild(b);
  }
  els.dirCats.replaceChildren(catsFrag);

  const q = els.dirSearch.value.trim().toLowerCase();
  const list = dirItems.filter((it) => {
    if (dirCat === "全部") {
      if (!TOOL_CATS.includes(it.category)) return false;
    } else if (it.category !== dirCat) {
      return false;
    }
    if (!q) return true;
    return `${it.name} ${it.description} ${it.domain} ${it.category}`.toLowerCase().includes(q);
  });

  els.dirCount.textContent = `共筛选 ${list.length} 款在线工具（默认展示前 60 款）`;
  const frag = document.createDocumentFragment();
  for (const it of list.slice(0, 60)) {
    const href = safeUrl(it.url);
    if (!href) continue;
    const card = el("a", "dir-card");
    card.href = href;
    card.target = "_blank";
    card.rel = "noopener noreferrer";

    const top = el("div", "dir-card__top");
    top.append(el("h3", "dir-card__name", it.name), el("span", "tag-chip", it.category));
    const desc = el("p", "dir-card__desc", it.description || it.domain);
    const dom = el("span", "dir-card__domain", it.domain);

    card.append(top, desc, dom);
    frag.appendChild(card);
  }
  els.dirGrid.replaceChildren(frag);
}

els.dirSearch.addEventListener("input", renderDir);

async function loadDir() {
  try {
    const res = await fetch("../data/catalog.json", { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    dirItems = Array.isArray(data.items) ? data.items : [];
    renderDir();
  } catch {
    els.dirCount.textContent = "目录加载失败，请稍后刷新重试";
  }
}

initSiteNav();
initThemeToggle(els.themeToggle, els.themeToggleLabel, showToast);
activateTab("json");
loadDir();
