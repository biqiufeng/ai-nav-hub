import {
  initSiteNav,
  initThemeToggle,
  initTopBarScrollHide,
  createToast,
  initSubmitToolDialog,
  queueToolClickBeacon,
} from "./nav.js?v=7";

const topBar = document.getElementById("topBar");
const themeToggle = document.getElementById("themeToggle");
const themeToggleLabel = document.getElementById("themeToggleLabel");
const toastEl = document.getElementById("toast");
const showToast = createToast(toastEl);

initSiteNav();
initSubmitToolDialog(showToast);
initTopBarScrollHide(topBar);
initThemeToggle(themeToggle, themeToggleLabel, showToast);

document.addEventListener("click", (event) => {
  const link = event.target instanceof Element ? event.target.closest("[data-track-tool]") : null;
  if (link) {
    queueToolClickBeacon(link.getAttribute("data-track-tool"), "/api/click");
  }
});

document.addEventListener(
  "error",
  (event) => {
    const el = event.target;
    if (el instanceof HTMLImageElement && el.closest(".tool-avatar")) {
      el.remove();
    }
  },
  true
);
