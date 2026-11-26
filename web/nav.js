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
