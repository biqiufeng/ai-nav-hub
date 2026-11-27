import {
  initSiteNav,
  initThemeToggle,
  initTopBarScrollHide,
  createToast,
  initSubmitToolDialog,
} from "./nav.js?v=6";

const topBar = document.getElementById("topBar");
const themeToggle = document.getElementById("themeToggle");
const themeToggleLabel = document.getElementById("themeToggleLabel");
const toastEl = document.getElementById("toast");
const showToast = createToast(toastEl);

initSiteNav();
initSubmitToolDialog(showToast);
initTopBarScrollHide(topBar);
initThemeToggle(themeToggle, themeToggleLabel, showToast);

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
