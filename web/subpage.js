import {
  initSiteNav,
  initThemeToggle,
  initTopBarScrollHide,
  createToast,
  initSubmitToolDialog,
} from "./nav.js?v=5";

const topBar = document.getElementById("topBar");
const themeToggle = document.getElementById("themeToggle");
const themeToggleLabel = document.getElementById("themeToggleLabel");
const toastEl = document.getElementById("toast");
const showToast = createToast(toastEl);

initSiteNav();
initSubmitToolDialog(showToast);
initTopBarScrollHide(topBar);
initThemeToggle(themeToggle, themeToggleLabel, showToast);
