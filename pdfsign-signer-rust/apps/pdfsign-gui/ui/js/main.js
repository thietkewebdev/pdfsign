import { $, invoke, errText, toast } from "./api.js";
import { state } from "./state.js";
import { initSign, refreshTemplates, refreshTsas, scanTokens } from "./sign.js";
import { initTemplates, showTemplates } from "./templates.js";
import { initVerify, verifyPath } from "./verify.js";
import { initSettings, showSettings } from "./settings.js";

const TITLES = {
  sign: "Ký số",
  templates: "Mẫu chữ ký",
  verify: "Xác minh",
  settings: "Cài đặt",
};

export function showView(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.view === name));
  document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${name}`));
  $("page-title").textContent = TITLES[name] || name;
  const stepper = $("sign-stepper");
  if (stepper) stepper.hidden = name !== "sign";
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
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      const modal = $("pin-modal");
      if (modal && !modal.hidden) {
        modal.hidden = true;
        return;
      }
    }
    const meta = e.ctrlKey || e.metaKey;
    if (meta && e.key.toLowerCase() === "o") {
      e.preventDefault();
      showView("sign");
      window.__pdfsignSign?.addFiles?.();
    }
    if (meta && e.key === "Enter") {
      const btn = $("sign-btn");
      if (btn && !btn.disabled && document.getElementById("view-sign")?.classList.contains("active")) {
        e.preventDefault();
        btn.click();
      }
    }
    if (!meta && !e.altKey && !e.ctrlKey && ["1", "2", "3", "4"].includes(e.key)) {
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const map = { 1: "sign", 2: "templates", 3: "verify", 4: "settings" };
      showView(map[e.key]);
    }
  });
  scanTokens().catch((e) => toast(errText(e)));
  window.__pdfsignShowView = showView;
}

boot().catch((e) => toast(`Lỗi khởi động: ${errText(e)}`, 10000));
