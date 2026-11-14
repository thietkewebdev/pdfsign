import { $, invoke, errText, toast } from "./api.js";
import { state } from "./state.js";
import { initSign, refreshTemplates, refreshTsas, scanTokens } from "./sign.js";
import { initTemplates, showTemplates } from "./templates.js";
import { initVerify, verifyPath } from "./verify.js";
import { initSettings, showSettings } from "./settings.js";

function showView(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  if (name === "templates") showTemplates();
  if (name === "settings") showSettings();
}

async function boot() {
  state.settings = await invoke("get_settings");
  state.templates = await invoke("list_templates");
  document.querySelectorAll(".tab").forEach((t) => (t.onclick = () => showView(t.dataset.view)));
  initSign();
  initTemplates();
  initVerify();
  initSettings(() => refreshTsas());
  refreshTemplates();
  refreshTsas();
  window.addEventListener("templates-changed", refreshTemplates);
  window.addEventListener("verify-file", (e) => {
    showView("verify");
    verifyPath(e.detail);
  });
  scanTokens().catch((e) => toast(errText(e)));
}

boot().catch((e) => toast(`Lỗi khởi động: ${errText(e)}`, 10000));
