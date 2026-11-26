import {
  initSiteNav,
  initThemeToggle,
  initTopBarScrollHide,
  createToast,
  bindTwoStepConfirm,
  copyWithFeedback,
  prefersReducedMotion,
} from "../nav.js?v=3";

const els = {
  topBar: document.getElementById("topBar"),
  themeToggle: document.getElementById("themeToggle"),
  themeToggleLabel: document.getElementById("themeToggleLabel"),
  toolTabs: document.getElementById("toolTabs"),
  workbenchBody: document.getElementById("workbenchBody"),
  toast: document.getElementById("toast"),
};

const showToast = createToast(els.toast);

function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

function mkBtn(label, cls, onClick) {
  const b = el("button", cls, label);
  b.type = "button";
  if (onClick) b.addEventListener("click", onClick);
  return b;
}

function renderJsonTool(host) {
  const actions = el("div", "wb-actions");
  const status = el("span", "wb-status", "输入 JSON 后自动校验与转换");
  const grid = el("div", "wb-grid-2");

  const inWrap = el("div", "wb-field");
  inWrap.append(el("label", "wb-label", "输入 JSON"));
  const taIn = el("textarea", "wb-textarea");
  taIn.placeholder = '{"name":"AI Nav Hub","tools":9000}';
  taIn.value = '{"name":"AI Nav Hub","schedule":"每日 04:00","categories":["对话写作","编程开发","划水摸鱼"]}';
  inWrap.appendChild(taIn);

  const outWrap = el("div", "wb-field");
  outWrap.append(el("label", "wb-label", "输出结果"));
  const taOut = el("textarea", "wb-textarea");
  taOut.readOnly = true;
  outWrap.appendChild(taOut);

  let currentIndent = 2;
  const run = (indent = currentIndent) => {
    currentIndent = indent;
    const raw = taIn.value.trim();
    if (!raw) {
      taOut.value = "";
      status.className = "wb-status";
      status.textContent = "等待输入 JSON…";
      return;
    }
    try {
      const parsed = JSON.parse(raw);
      taOut.value = JSON.stringify(parsed, null, currentIndent);
      status.className = "wb-status wb-status--ok";
      status.textContent = currentIndent ? "JSON 校验通过（格式化 ✓）" : "JSON 校验通过（单行压缩 ✓）";
    } catch (e) {
      status.className = "wb-status wb-status--err";
      status.textContent = `语法错误：${e.message}`;
    }
  };

  taIn.addEventListener("input", () => run(currentIndent));

  const clearBtn = mkBtn("清空", "btn-secondary wb-btn");
  const clearConfirm = bindTwoStepConfirm(clearBtn, {
    idleText: "清空",
    confirmText: "确认清空",
    onConfirm: () => {
      taIn.value = "";
      taOut.value = "";
      status.className = "wb-status";
      status.textContent = "已清空输入";
      taIn.focus();
    },
  });

  const copyBtn = mkBtn("复制结果", "btn-secondary wb-btn", () => {
    copyWithFeedback(taOut.value || taIn.value, copyBtn, showToast);
  });

  taIn.addEventListener("input", () => clearConfirm.reset());

  actions.append(
    mkBtn("格式化 (2空格)", "btn-primary wb-btn", () => run(2)),
    mkBtn("压缩单行", "btn-secondary wb-btn", () => run(0)),
    copyBtn,
    clearBtn,
    status
  );
  grid.append(inWrap, outWrap);
  host.replaceChildren(actions, grid);
  run(2);
}

function renderTimeTool(host) {
  const nowSec = () => Math.floor(Date.now() / 1000);
  const actions = el("div", "wb-actions");
  const live = el("span", "wb-status wb-status--ok", `当前 Unix 秒：${nowSec()} · 毫秒：${Date.now()}`);
  const timer = setInterval(() => {
    if (!document.body.contains(live)) return clearInterval(timer);
    if (host.hidden) return;
    live.textContent = `当前 Unix 秒：${nowSec()} · 毫秒：${Date.now()}`;
  }, 1000);

  const grid = el("div", "wb-grid-2");

  const tsWrap = el("div", "wb-field");
  tsWrap.append(el("label", "wb-label", "时间戳（秒或 13 位毫秒，输入即转换）"));
  const tsInput = el("input", "wb-input");
  tsInput.value = String(nowSec());
  const tsOut = el("input", "wb-input");
  tsOut.readOnly = true;
  const copyDateBtn = mkBtn("复制日期结果", "btn-secondary wb-btn", () => {
    copyWithFeedback(tsOut.value, copyDateBtn, showToast);
  });
  tsWrap.append(tsInput, tsOut, copyDateBtn);

  const dtWrap = el("div", "wb-field");
  dtWrap.append(el("label", "wb-label", "日期时间（YYYY-MM-DD HH:mm:ss，输入即转换）"));
  const dtInput = el("input", "wb-input");
  const fmt = (d) => new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  }).format(d);
  dtInput.value = fmt(new Date());
  const dtOut = el("input", "wb-input");
  dtOut.readOnly = true;
  const copyTsBtn = mkBtn("复制时间戳结果", "btn-secondary wb-btn", () => {
    copyWithFeedback(dtOut.value, copyTsBtn, showToast);
  });
  dtWrap.append(dtInput, dtOut, copyTsBtn);

  const convertTs = () => {
    const raw = tsInput.value.trim();
    if (!raw) { tsOut.value = ""; return; }
    const num = Number(raw);
    if (!Number.isFinite(num)) { tsOut.value = "无效时间戳"; return; }
    const ms = raw.length >= 13 ? num : num * 1000;
    const d = new Date(ms);
    tsOut.value = Number.isNaN(d.getTime()) ? "无效时间" : `北京时间：${fmt(d)} | UTC：${d.toISOString()}`;
  };
  const convertDt = () => {
    const raw = dtInput.value.trim().replace(" ", "T");
    if (!raw) { dtOut.value = ""; return; }
    const d = new Date(raw.includes("Z") || raw.includes("+") ? raw : `${raw}+08:00`);
    dtOut.value = Number.isNaN(d.getTime()) ? "无效日期格式" : `秒：${Math.floor(d.getTime() / 1000)} | 毫秒：${d.getTime()}`;
  };

  tsInput.addEventListener("input", convertTs);
  dtInput.addEventListener("input", convertDt);

  actions.append(
    mkBtn("填入当前时间", "btn-primary wb-btn", () => {
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
  const status = el("span", "wb-status", "支持 UTF-8 中文实时编解码");
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

  let mode = "encode";
  const encode = () => {
    mode = "encode";
    try {
      const bytes = new TextEncoder().encode(taIn.value);
      let bin = "";
      bytes.forEach((b) => { bin += String.fromCharCode(b); });
      taOut.value = btoa(bin);
      status.className = "wb-status wb-status--ok";
      status.textContent = "已实时编码为 Base64 ✓";
    } catch (e) {
      status.className = "wb-status wb-status--err";
      status.textContent = e.message;
    }
  };
  const decode = () => {
    mode = "decode";
    try {
      const bin = atob(taIn.value.trim());
      const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
      taOut.value = new TextDecoder().decode(bytes);
      status.className = "wb-status wb-status--ok";
      status.textContent = "已实时解码为文本 ✓";
    } catch {
      status.className = "wb-status wb-status--err";
      status.textContent = "Base64 格式无效";
    }
  };
  const runActive = () => (mode === "encode" ? encode() : decode());
  taIn.addEventListener("input", runActive);

  const copyBtn = mkBtn("复制结果", "btn-secondary wb-btn", () => {
    copyWithFeedback(taOut.value, copyBtn, showToast);
  });

  actions.append(
    mkBtn("Base64 编码", "btn-primary wb-btn", encode),
    mkBtn("Base64 解码", "btn-secondary wb-btn", decode),
    mkBtn("交换输入/输出", "btn-secondary wb-btn", () => {
      if (!taOut.value) return;
      taIn.value = taOut.value;
      if (mode === "encode") decode();
      else encode();
    }),
    copyBtn,
    status
  );
  grid.append(inWrap, outWrap);
  host.replaceChildren(actions, grid);
  encode();
}

function renderUrlTool(host) {
  const actions = el("div", "wb-actions");
  const status = el("span", "wb-status", "输入 URL 后自动解码并拆解 Query 参数");
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

  let mode = "decode";
  const decode = () => {
    mode = "decode";
    const raw = taIn.value.trim();
    let res = "";
    try { res = decodeURIComponent(raw); } catch { res = raw; }
    try {
      const u = new URL(raw);
      const params = [...u.searchParams.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
      if (params) res += `\n\n--- Query 参数 ---\n${params}`;
    } catch {}
    taOut.value = res;
    status.textContent = "当前模式：解码与拆参";
  };
  const encode = () => {
    mode = "encode";
    taOut.value = encodeURIComponent(taIn.value);
    status.textContent = "当前模式：URL 编码";
  };

  taIn.addEventListener("input", () => (mode === "decode" ? decode() : encode()));

  const copyBtn = mkBtn("复制结果", "btn-secondary wb-btn", () => {
    copyWithFeedback(taOut.value, copyBtn, showToast);
  });

  actions.append(
    mkBtn("URL 解码与拆参", "btn-primary wb-btn", decode),
    mkBtn("encodeURIComponent 编码", "btn-secondary wb-btn", encode),
    copyBtn,
    status
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
    const pad = (4 - (b64u.length % 4)) % 4;
    const b64 = b64u.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  };

  const parse = () => {
    const val = taIn.value.trim();
    if (!val) {
      hOut.value = "";
      pOut.value = "";
      status.className = "wb-status";
      status.textContent = "输入 JWT Token（仅本地解析，不校验签名密钥）";
      return;
    }
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

  const copyHdrBtn = mkBtn("复制 Header", "btn-secondary wb-btn", () => {
    copyWithFeedback(hOut.value, copyHdrBtn, showToast);
  });
  const copyPldBtn = mkBtn("复制 Payload", "btn-secondary wb-btn", () => {
    copyWithFeedback(pOut.value, copyPldBtn, showToast);
  });

  const actions = el("div", "wb-actions");
  actions.append(
    mkBtn("填入示例", "btn-secondary wb-btn", () => {
      taIn.value = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhaS1uYXYtaHViIiwibmFtZSI6IkRldiBVc2VyIiwiaWF0IjoxNzAwMDAwMDAwfQ.signature";
      parse();
    }),
    copyHdrBtn,
    copyPldBtn,
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

  const opts = { noDash: false, upper: false };
  const gen = (noDash = opts.noDash, upper = opts.upper) => {
    opts.noDash = noDash;
    opts.upper = upper;
    const n = Math.min(100, Math.max(1, Number(countIn.value) || 10));
    const list = [];
    for (let i = 0; i < n; i++) {
      let id = crypto.randomUUID();
      if (opts.noDash) id = id.replace(/-/g, "");
      if (opts.upper) id = id.toUpperCase();
      list.push(id);
    }
    taOut.value = list.join("\n");
  };

  countIn.addEventListener("input", () => gen());
  countIn.addEventListener("change", () => gen());

  const copyBtn = mkBtn("复制全部", "btn-secondary wb-btn", () => {
    copyWithFeedback(taOut.value, copyBtn, showToast);
  });

  actions.append(
    el("span", "wb-label", "数量"),
    countIn,
    mkBtn("生成标准 UUID", "btn-primary wb-btn", () => gen(false, false)),
    mkBtn("无连字符", "btn-secondary wb-btn", () => gen(true, false)),
    mkBtn("大写", "btn-secondary wb-btn", () => gen(false, true)),
    copyBtn
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

  lenIn.addEventListener("input", gen);
  lenIn.addEventListener("change", gen);
  chkSym.addEventListener("change", gen);

  const copyBtn = mkBtn("复制全部", "btn-secondary wb-btn", () => {
    copyWithFeedback(taOut.value, copyBtn, showToast);
  });

  actions.append(
    el("span", "wb-label", "长度"),
    lenIn,
    symLabel,
    mkBtn("生成 5 组强密码", "btn-primary wb-btn", gen),
    copyBtn
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
  const copyBtn = mkBtn("复制匹配结果", "btn-secondary wb-btn", () => {
    copyWithFeedback(taRes.value, copyBtn, showToast);
  });
  resWrap.append(resLabel, taRes, copyBtn);
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

  const copyBtn = mkBtn("复制", "btn-secondary wb-btn", () => {
    copyWithFeedback(ta.value, copyBtn, showToast);
  });

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
    copyBtn,
    stats
  );
  host.replaceChildren(actions, ta);
  updateStats();
}

function renderColorTool(host) {
  const wrap = el("div", "wb-grid-2");
  const left = el("div", "wb-field");
  left.append(el("label", "wb-label", "选择或输入 3/6 位 HEX 颜色"));
  const picker = el("input", "wb-input");
  picker.type = "color";
  picker.value = "#0071e3";
  picker.style.height = "46px";
  const hexIn = el("input", "wb-input");
  hexIn.value = "#0071e3";
  const status = el("span", "wb-status", "支持 #rgb 与 #rrggbb");
  left.append(picker, hexIn, status);

  const right = el("div", "wb-field");
  const swatch = el("div", "color-preview");
  const out = el("textarea", "wb-textarea");
  out.style.minHeight = "120px";
  out.readOnly = true;
  const copyBtn = mkBtn("复制颜色值", "btn-secondary wb-btn", () => {
    copyWithFeedback(out.value, copyBtn, showToast);
  });
  right.append(swatch, out, copyBtn);

  const normalizeHex = (raw) => {
    const clean = raw.trim().replace(/^#/, "");
    if (/^[0-9a-f]{6}$/i.test(clean)) return `#${clean.toLowerCase()}`;
    if (/^[0-9a-f]{3}$/i.test(clean)) {
      return `#${clean.split("").map((c) => c + c).join("").toLowerCase()}`;
    }
    return null;
  };

  const sync = (rawHex, fromPicker = false) => {
    const h = normalizeHex(rawHex);
    if (!h) {
      status.className = "wb-status wb-status--err";
      status.textContent = "请输入有效 HEX（如 #07e 或 #0071e3）";
      return;
    }
    status.className = "wb-status wb-status--ok";
    status.textContent = `当前色值 ${h} ✓`;
    const n = parseInt(h.slice(1), 16);
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
    if (fromPicker) hexIn.value = h;
    swatch.style.backgroundColor = h;
    out.value = `HEX: ${h}\nRGB: rgb(${r}, ${g}, ${b})\nHSL: hsl(${Math.round(hue)}, ${Math.round(sat * 100)}%, ${Math.round(l * 100)}%)`;
  };
  picker.addEventListener("input", () => sync(picker.value, true));
  hexIn.addEventListener("input", () => sync(hexIn.value, false));
  wrap.append(left, right);
  host.replaceChildren(wrap);
  sync("#0071e3", true);
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
    const copyBtn = mkBtn("复制", "btn-secondary wb-btn", () => {
      copyWithFeedback(expr, copyBtn, showToast);
    });
    td3.appendChild(copyBtn);
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

  const copyBtn = mkBtn("复制结果", "btn-secondary wb-btn", () => {
    copyWithFeedback(taOut.value, copyBtn, showToast);
  });

  actions.append(
    mkBtn("计算哈希", "btn-primary wb-btn", calc),
    copyBtn
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
const panelCache = new Map();

function activateTab(toolId, updateHash = true) {
  const safeId = RENDERERS[toolId] ? toolId : "json";
  for (const t of tabs) {
    const sel = t.dataset.tool === safeId;
    t.setAttribute("aria-selected", String(sel));
    if (sel) {
      els.workbenchBody.setAttribute("aria-labelledby", t.id);
      t.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
    }
  }

  for (const [k, panel] of panelCache.entries()) {
    panel.hidden = k !== safeId;
    panel.classList.remove("panel-enter");
  }

  let panel = panelCache.get(safeId);
  if (!panel) {
    panel = el("div", "wb-panel");
    panel.dataset.tool = safeId;
    RENDERERS[safeId](panel);
    panelCache.set(safeId, panel);
    els.workbenchBody.appendChild(panel);
  }
  panel.hidden = false;

  if (!prefersReducedMotion()) {
    void panel.offsetWidth;
    panel.classList.add("panel-enter");
  }

  if (updateHash) {
    try {
      history.replaceState(null, "", `#${safeId}`);
    } catch {}
  }
}

tabs.forEach((tab, idx) => {
  tab.addEventListener("click", () => activateTab(tab.dataset.tool, true));
  tab.addEventListener("keydown", (e) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next !== -1) {
      e.preventDefault();
      tabs[next].focus();
      activateTab(tabs[next].dataset.tool, true);
    }
  });
});

initSiteNav();
initTopBarScrollHide(els.topBar);
initThemeToggle(els.themeToggle, els.themeToggleLabel, showToast);
const initialTab = location.hash ? location.hash.slice(1) : "json";
activateTab(RENDERERS[initialTab] ? initialTab : "json", false);
