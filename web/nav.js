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
    menuBtn.addEventListener("click", () => {
      const open = menuList.classList.toggle("is-fallback-open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("click", (e) => {
      if (!menuList.classList.contains("is-fallback-open")) return;
      if (!header.contains(e.target)) {
        menuList.classList.remove("is-fallback-open");
        menuBtn.setAttribute("aria-expanded", "false");
      }
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
