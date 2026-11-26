export function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

let supportsDisplayTransition;
export function canTransitionDisplay() {
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

export function initSiteNav() {
  const header = document.querySelector(".site-header");
  const inner = header?.querySelector(".top-bar__inner");
  const menuList = document.getElementById("site-menu");
  const menuBtn = header?.querySelector(".menu-button");
  if (!header || !inner || !menuList) return;

  const supportsPopover = Object.hasOwn(HTMLElement.prototype, "popover");
  let lastCollapsedWidth = -1;
  let rafId = 0;

  if (!supportsPopover && menuBtn) {
    const closeFallback = (restoreFocus = false) => {
      if (!menuList.classList.contains("is-fallback-open")) return;
      menuList.classList.remove("is-fallback-open");
      menuBtn.setAttribute("aria-expanded", "false");
      if (restoreFocus) menuBtn.focus();
    };
    menuBtn.addEventListener("click", () => {
      const open = menuList.classList.toggle("is-fallback-open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => {
      if (!header.contains(e.target)) closeFallback(false);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeFallback(true);
    });
  }

  function updateLayout(force = false) {
    const currentlyWide = header.classList.contains("is-wide");
    const headerWidth = header.getBoundingClientRect().width;
    if (!force && !currentlyWide && headerWidth <= lastCollapsedWidth) {
      return;
    }

    const wasOpen = supportsPopover && menuList.matches(":popover-open");
    header.classList.add("is-measuring");
    if (wasOpen) {
      try { menuList.hidePopover(); } catch {}
    }

    header.classList.add("is-wide");
    menuList.removeAttribute("popover");
    menuList.classList.remove("is-fallback-open");

    const fits = inner.scrollWidth <= inner.clientWidth + 1;

    if (fits) {
      lastCollapsedWidth = -1;
    } else {
      header.classList.remove("is-wide");
      if (supportsPopover) {
        menuList.setAttribute("popover", "auto");
        if (wasOpen) {
          try { menuList.showPopover(); } catch {}
        }
      }
      lastCollapsedWidth = headerWidth;
    }

    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => header.classList.remove("is-measuring"));
  }

  updateLayout(true);

  if (typeof ResizeObserver === "function") {
    const ro = new ResizeObserver(() => updateLayout(false));
    ro.observe(header);
    ro.observe(menuList);
  } else {
    window.addEventListener("resize", () => updateLayout(true), { passive: true });
  }
}

export function initThemeToggle(btn, labelEl, onToast) {
  if (!btn) return;
  const getMeta = () => document.querySelector('meta[name="color-scheme"]');
  const getEffective = () => {
    const mv = getMeta()?.content;
    if (mv === "light" || mv === "dark") return mv;
    try {
      const s = localStorage.getItem("color-scheme");
      if (s === "light" || s === "dark") return s;
    } catch {}
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  };

  const syncAria = () => {
    const eff = getEffective();
    const nextLabel = eff === "dark" ? "切换到浅色外观" : "切换到深色外观";
    btn.setAttribute("aria-label", nextLabel);
    if (labelEl) labelEl.textContent = nextLabel;
  };

  btn.addEventListener("click", () => {
    const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const cur = getEffective();
    const target = cur === "dark" ? "light" : "dark";
    try {
      if (target === sys) {
        localStorage.removeItem("color-scheme");
        getMeta().content = "light dark";
        onToast?.("已恢复跟随系统外观");
      } else {
        localStorage.setItem("color-scheme", target);
        getMeta().content = target;
        onToast?.(target === "dark" ? "已切换为深色外观" : "已切换为浅色外观");
      }
    } catch {}
    syncAria();
  });

  window.addEventListener("storage", (e) => {
    if (e.key === "color-scheme") {
      const valid = e.newValue === "light" || e.newValue === "dark" ? e.newValue : "light dark";
      getMeta().content = valid;
      syncAria();
    }
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", syncAria);
  syncAria();
}

export function initTopBarScrollHide(topBarEl, { enabled = true } = {}) {
  if (!topBarEl) return;
  if (!enabled) {
    topBarEl.dataset.stickyLocked = "true";
    topBarEl.classList.remove("is-hidden");
    return;
  }
  if (CSS.supports("container-type", "scroll-state")) return;

  let lastY = window.scrollY;
  let barHeight = topBarEl.offsetHeight || 56;
  window.addEventListener("resize", () => {
    barHeight = topBarEl.offsetHeight || 56;
  }, { passive: true });
  window.addEventListener(
    "scroll",
    () => {
      const maxY = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
      const y = Math.max(0, Math.min(window.scrollY, maxY));
      if (Math.abs(y - lastY) < 6 && y > 0) return;
      topBarEl.classList.toggle("is-hidden", y > lastY && y > barHeight);
      lastY = y;
    },
    { passive: true }
  );
}

export function createToast(toastEl) {
  if (!toastEl) return () => {};
  let timer = null;

  async function hideToast() {
    if (toastEl.hidden) return;
    if (canTransitionDisplay()) {
      toastEl.hidden = true;
      return;
    }
    toastEl.setAttribute("data-closing", "");
    const animations = toastEl.getAnimations();
    if (animations.length > 0) {
      await Promise.race([
        Promise.allSettled(animations.map((a) => a.finished)),
        new Promise((r) => setTimeout(r, 350)),
      ]);
    }
    if (toastEl.hasAttribute("data-closing")) {
      toastEl.removeAttribute("data-closing");
      toastEl.hidden = true;
    }
  }

  return function showToast(msg, { force = false } = {}) {
    if (!force && document.querySelector("dialog[open]")) return;
    clearTimeout(timer);
    toastEl.removeAttribute("data-closing");
    toastEl.textContent = msg;
    toastEl.hidden = false;
    try {
      if (typeof document.ariaNotify === "function") {
        document.ariaNotify(msg);
      }
    } catch {}
    timer = setTimeout(hideToast, 2200);
  };
}

export function bindSearchBox({ input, clearBtn, boxEl, onChange, enableGlobalShortcut = true }) {
  if (!input) return { sync: () => {} };

  const sync = () => {
    const hasVal = input.value.length > 0;
    boxEl?.classList.toggle("has-value", hasVal);
    if (clearBtn) clearBtn.hidden = !hasVal;
  };

  input.addEventListener("input", () => {
    sync();
    onChange?.(input.value);
  });

  clearBtn?.addEventListener("click", () => {
    input.value = "";
    sync();
    input.focus();
    onChange?.("");
  });

  input.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (input.value) {
        e.preventDefault();
        input.value = "";
        sync();
        onChange?.("");
      } else {
        input.blur();
      }
    }
  });

  if (enableGlobalShortcut) {
    document.addEventListener("keydown", (e) => {
      if (
        e.target instanceof Element &&
        (e.target.matches("input, textarea, select, [contenteditable]") ||
          document.querySelector("dialog[open]"))
      ) {
        return;
      }
      if (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k")) {
        e.preventDefault();
        input.focus();
        input.select?.();
      }
    });
  }

  sync();
  return { sync };
}

const copyTimers = new WeakMap();

export async function copyWithFeedback(text, btn, onToast, labelEl = null) {
  if (!btn) return false;
  const targetEl = labelEl || btn;
  if (!btn.dataset.idleLabel) {
    btn.dataset.idleLabel = targetEl.textContent;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;opacity:0;pointer-events:none;";
      const mount = btn.closest("dialog") || document.body;
      mount.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      if (!ok) throw new Error("copy failed");
    }

    clearTimeout(copyTimers.get(btn));
    targetEl.textContent = "已复制 ✓";
    btn.classList.add("is-copied");
    const timer = setTimeout(() => {
      targetEl.textContent = btn.dataset.idleLabel;
      btn.classList.remove("is-copied");
    }, 1600);
    copyTimers.set(btn, timer);
    return true;
  } catch {
    onToast?.("复制失败，请手动复制", { force: true });
    return false;
  }
}

export function bindTwoStepConfirm(btn, { idleText, confirmText, timeoutMs = 4000, onConfirm }) {
  if (!btn) return { reset: () => {} };
  let timer = null;

  const reset = () => {
    clearTimeout(timer);
    timer = null;
    btn.classList.remove("is-confirm");
    btn.textContent = idleText;
  };

  btn.addEventListener("click", () => {
    if (!btn.classList.contains("is-confirm")) {
      btn.classList.add("is-confirm");
      btn.textContent = confirmText;
      timer = setTimeout(reset, timeoutMs);
      return;
    }
    reset();
    onConfirm?.();
  });

  return { reset };
}

export function setRefreshBusy(btn, busy, idleLabel = "刷新", busyLabel = "刷新中…") {
  if (!btn) return;
  btn.disabled = busy;
  btn.setAttribute("aria-busy", String(busy));
  btn.classList.toggle("is-loading", busy);
  const lbl = btn.querySelector(".btn-label");
  if (lbl) lbl.textContent = busy ? busyLabel : idleLabel;
}

const AGGREGATOR_HOSTS = new Set([
  "ai.codefather.cn",
  "futuretools.io",
  "futurepedia.io",
  "producthunt.com",
  "ai-bot.cn",
  "ai-zhiku.com",
  "aibase.com",
  "baoboxs.com",
]);

const AVATAR_PALETTE = [
  "#0A84FF", "#5E5CE6", "#BF5AF2", "#FF375F",
  "#FF9F0A", "#30B0C7", "#34C759", "#AF52DE",
];

export function safeHttpUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  try {
    const parsed = new URL(raw.trim(), location.href);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function hashAvatarColor(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length];
}

export function renderToolAvatar(container, item) {
  container.textContent = "";
  const seed = item.domain || item.name || "?";
  const letter = (item.name || item.domain || "?").trim().charAt(0).toUpperCase();
  container.style.setProperty("--avatar-bg", hashAvatarColor(seed));
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

/* ---------- Invoker Commands & Declarative Copy / Submit Dialog ---------- */
let invokersBootstrapped = false;
let lastCopyLiveMsg = "";
const declarativeCopyTimers = new WeakMap();

function legacySyncCopy(text) {
  const previousFocus = document.activeElement;
  const field = Object.assign(document.createElement("textarea"), { value: text });
  field.setAttribute("readonly", "");
  field.style.cssText = "position:fixed;inset-block-start:0;opacity:0;pointer-events:none;";
  (document.querySelector("dialog[open]") || document.body).append(field);
  field.select();
  try {
    return document.execCommand("copy");
  } finally {
    field.remove();
    previousFocus?.focus?.({ preventScroll: true });
  }
}

function reportDeclarativeCopy(button, ok) {
  const tip = button.nextElementSibling;
  clearTimeout(declarativeCopyTimers.get(button));
  button.removeAttribute("data-copied");
  button.removeAttribute("data-failed");
  let message = ok ? "已复制 ✓" : "复制失败";
  if (message === lastCopyLiveMsg) message += "\u00A0";
  lastCopyLiveMsg = message;
  if (tip) tip.textContent = "";
  void button.offsetWidth;
  button.setAttribute(ok ? "data-copied" : "data-failed", "");
  if (tip) {
    requestAnimationFrame(() => {
      tip.textContent = message;
    });
  }
  declarativeCopyTimers.set(
    button,
    setTimeout(() => {
      button.removeAttribute("data-copied");
      button.removeAttribute("data-failed");
      if (tip) tip.textContent = "";
    }, 2000)
  );
}

async function runDeclarativeCopy(button, target) {
  if (!button || !target) return;
  const text = target.matches("input, textarea")
    ? target.value.trim()
    : (target.innerText || target.textContent || "").trim();
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    reportDeclarativeCopy(button, true);
  } catch {
    if (legacySyncCopy(text)) {
      reportDeclarativeCopy(button, true);
    } else {
      reportDeclarativeCopy(button, false);
    }
  }
}

function closeAnimatedDialog(dialogEl) {
  if (!dialogEl?.open) return;
  const supportsExit = Boolean(window.CSS?.supports?.("overlay", "auto") && canTransitionDisplay());
  if (!supportsExit) {
    dialogEl.setAttribute("data-closing", "");
    const animations = dialogEl.getAnimations({ subtree: true });
    Promise.race([
      Promise.allSettled(animations.map((a) => a.finished)),
      new Promise((r) => setTimeout(r, 320)),
    ]).then(() => {
      if (!dialogEl.hasAttribute("data-closing")) return;
      dialogEl.removeAttribute("data-closing");
      dialogEl.close();
    });
    return;
  }
  dialogEl.close();
}

function ensureInvokerSupport() {
  if (invokersBootstrapped) return;
  invokersBootstrapped = true;

  if (!("commandForElement" in HTMLButtonElement.prototype)) {
    import("https://esm.run/invokers-polyfill").catch(() => {});
  }

  document.addEventListener(
    "command",
    (event) => {
      if (typeof event.command === "string" && event.command.startsWith("--copy")) {
        runDeclarativeCopy(event.source, event.target);
      }
    },
    true
  );

  if (!("CommandEvent" in window)) {
    document.addEventListener("click", (event) => {
      if (event.defaultPrevented || "commandForElement" in HTMLButtonElement.prototype) return;
      const btn = event.target instanceof Element ? event.target.closest("button[command][commandfor]") : null;
      if (!btn) return;
      const cmd = btn.getAttribute("command") || "";
      const targetId = btn.getAttribute("commandfor") || "";
      const target = targetId ? document.getElementById(targetId) : null;
      if (!target) return;

      if (cmd.startsWith("--copy")) {
        runDeclarativeCopy(btn, target);
      } else if (cmd === "show-modal" && target instanceof HTMLDialogElement) {
        target.removeAttribute("data-closing");
        if (!target.open) target.showModal();
      } else if (cmd === "close" && target instanceof HTMLDialogElement) {
        closeAnimatedDialog(target);
      }
    });
  }
}

export function initSubmitToolDialog(onToast) {
  ensureInvokerSupport();
  const dialog = document.getElementById("submitToolDialog");
  const form = document.getElementById("submitToolForm");
  if (!(dialog instanceof HTMLDialogElement) || !(form instanceof HTMLFormElement)) return;
  if (dialog.dataset.wired === "true") return;
  dialog.dataset.wired = "true";

  const nameInput = document.getElementById("subToolName");
  const urlInput = document.getElementById("subToolUrl");
  const catSelect = document.getElementById("subToolCat");
  const descInput = document.getElementById("subToolDesc");
  const errEl = document.getElementById("subFormError");
  const snippetEl = document.getElementById("subMarkdownSnippet");
  const mailBtn = document.getElementById("subMailBtn");
  const closeBtn = document.getElementById("submitDialogCloseBtn");

  const buildPayload = () => {
    const name = (nameInput?.value || "").trim() || "（待填写工具名称）";
    const url = (urlInput?.value || "").trim() || "https://";
    const cat = (catSelect?.value || "对话写作").trim();
    const desc = (descInput?.value || "").trim() || "（待填写核心功能与免费额度说明）";
    const markdown = [
      `### AI 工具收录申请`,
      `- **工具名称**：${name}`,
      `- **官网链接**：${url}`,
      `- **推荐分类**：${cat}`,
      `- **核心亮点**：${desc}`,
      `- **来源站点**：https://dlzbkj-ai.pages.dev/`,
    ].join("\n");
    return { name, url, cat, desc, markdown };
  };

  const syncSnippet = () => {
    if (snippetEl) snippetEl.textContent = buildPayload().markdown;
  };
  syncSnippet();

  const validateField = (field) => {
    if (!field) return "";
    const val = field.value.trim();
    if (field === nameInput) {
      if (!val) return "请填写 AI 工具名称。";
    } else if (field === urlInput) {
      if (!val) return "请填写工具官网完整链接（以 https:// 开头）。";
      const safe = safeHttpUrl(val);
      if (!safe) return "官网链接格式不正确，请输入以 https:// 或 http:// 开头的有效网址。";
    } else if (field === descInput) {
      if (!val) return "请用一两句话简述工具的核心功能亮点。";
    }
    return "";
  };

  const fields = [nameInput, urlInput, descInput].filter(Boolean);
  const touched = new WeakSet();

  fields.forEach((field) => {
    field.addEventListener("input", () => {
      touched.add(field);
      syncSnippet();
      if (field.getAttribute("aria-invalid") === "true" && !validateField(field)) {
        field.removeAttribute("aria-invalid");
        if (errEl) errEl.textContent = "";
      }
    });
    field.addEventListener("blur", () => {
      if (!touched.has(field) && !field.value.trim()) return;
      const msg = validateField(field);
      if (msg) {
        field.setAttribute("aria-invalid", "true");
        if (errEl) errEl.textContent = msg;
      } else {
        field.removeAttribute("aria-invalid");
      }
    });
  });

  catSelect?.addEventListener("change", syncSnippet);

  const checkAllValid = () => {
    for (const field of fields) {
      const msg = validateField(field);
      if (msg) {
        field.setAttribute("aria-invalid", "true");
        if (errEl) errEl.textContent = msg;
        field.focus();
        return false;
      }
      field.removeAttribute("aria-invalid");
    }
    if (errEl) errEl.textContent = "";
    return true;
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!checkAllValid()) return;
    const { name, cat, markdown } = buildPayload();
    const issueUrl = new URL("https://github.com/biqiufeng/ai-nav-hub/issues/new");
    issueUrl.searchParams.set("title", `[收录推荐] ${name}（${cat}）`);
    issueUrl.searchParams.set("body", markdown);
    window.open(issueUrl.toString(), "_blank", "noopener,noreferrer");
    closeAnimatedDialog(dialog);
    onToast?.("已打开 GitHub 提交页，感谢推荐！", { force: true });
  });

  mailBtn?.addEventListener("click", async () => {
    if (!checkAllValid()) return;
    const { name, cat, markdown } = buildPayload();
    try {
      await navigator.clipboard?.writeText(markdown);
    } catch {
      legacySyncCopy(markdown);
    }
    const subject = encodeURIComponent(`[AI导航收录推荐] ${name}（${cat}）`);
    const body = encodeURIComponent(markdown);
    window.location.href = `mailto:biqiufeng@gmail.com?subject=${subject}&body=${body}`;
    onToast?.("已唤起邮件并同步复制收录信息至剪贴板", { force: true });
  });

  const supportsExit = Boolean(window.CSS?.supports?.("overlay", "auto") && canTransitionDisplay());
  if (!supportsExit && closeBtn) {
    closeBtn.removeAttribute("command");
    closeBtn.removeAttribute("commandfor");
    closeBtn.addEventListener("click", () => closeAnimatedDialog(dialog));
  }

  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    closeAnimatedDialog(dialog);
  });

  dialog.addEventListener("close", () => {
    dialog.returnValue = "";
  });

  const outside = (e) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  let pressedOutside = false;
  dialog.addEventListener("pointerdown", (e) => {
    pressedOutside = e.target === dialog && outside(e);
  });
  dialog.addEventListener("pointerup", (e) => {
    if (!pressedOutside) return;
    const shouldClose = e.target === dialog && outside(e);
    pressedOutside = false;
    if (shouldClose && (!("closedBy" in HTMLDialogElement.prototype) || !(window.CSS?.supports?.("overlay", "auto") && canTransitionDisplay()))) {
      closeAnimatedDialog(dialog);
    }
  });
}
