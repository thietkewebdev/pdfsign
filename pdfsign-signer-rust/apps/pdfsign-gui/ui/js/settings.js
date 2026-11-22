import { $, invoke, dialog, errText, fileName, toast } from "./api.js";
import { state } from "./state.js";

function setStatus(text, kind = "") {
  const el = $("settings-status");
  el.textContent = text;
  el.className = `status ${kind}`;
}

function renderTsas() {
  const tbody = $("tsa-rows");
  tbody.innerHTML = "";
  state.settings.tsas.forEach((t, i) => {
    const tr = document.createElement("tr");
    const en = Object.assign(document.createElement("input"), { type: "checkbox", checked: t.enabled });
    en.onchange = () => (t.enabled = en.checked);
    const name = Object.assign(document.createElement("input"), { type: "text", value: t.name });
    name.oninput = () => (t.name = name.value);
    const url = Object.assign(document.createElement("input"), { type: "text", value: t.url });
    url.oninput = () => (t.url = url.value.trim());
    const def = Object.assign(document.createElement("input"), { type: "radio", name: "tsa-default", checked: t.url === state.settings.tsaUrl });
    def.onchange = () => (state.settings.tsaUrl = t.url);
    const test = Object.assign(document.createElement("button"), { className: "ghost", textContent: "Kiểm tra" });
    test.onclick = async () => {
      test.textContent = "…";
      try {
        const r = await invoke("test_tsa", { url: t.url });
        test.textContent = "✓ " + r;
      } catch (e) {
        test.textContent = "✗ lỗi";
        toast(errText(e));
      }
    };
    const del = Object.assign(document.createElement("button"), { className: "x", textContent: "×" });
    del.onclick = () => {
      state.settings.tsas.splice(i, 1);
      renderTsas();
    };
    for (const node of [en, name, url, def]) {
      const td = document.createElement("td");
      td.append(node);
      tr.append(td);
    }
    const td = document.createElement("td");
    td.append(test, del);
    tr.append(td);
    tbody.append(tr);
  });
}

function renderAnchors() {
  const ul = $("anchor-list");
  ul.innerHTML = "";
  if (!state.settings.trustAnchors.length) ul.innerHTML = '<li class="muted">Chưa có. Khi xác minh sẽ báo "chưa kiểm tra tin cậy".</li>';
  state.settings.trustAnchors.forEach((p, i) => {
    const li = document.createElement("li");
    const s = document.createElement("span");
    s.textContent = fileName(p);
    s.title = p;
    const x = Object.assign(document.createElement("button"), { className: "x", textContent: "×" });
    x.onclick = () => {
      state.settings.trustAnchors.splice(i, 1);
      renderAnchors();
    };
    li.append(s, x);
    ul.append(li);
  });
}

function renderRemembered() {
  const s = state.settings;
  $("remembered").textContent = s.lastModule
    ? `Driver: ${s.lastModule} · slot ${s.lastSlot} · serial chứng thư: ${s.lastCertSerial || "-"}`
    : "Chưa nhớ token nào.";
}

export function showSettings() {
  renderTsas();
  renderAnchors();
  renderRemembered();
  $("set-level").value = state.settings.level;
  $("set-suffix").value = state.settings.outputSuffix;
  $("set-location").value = state.settings.location;
  if ($("set-web-api")) $("set-web-api").value = state.settings.webApiBase || "";
}

export function initSettings(onSaved) {
  invoke("config_path").then((p) => ($("config-path").textContent = p));
  $("tsa-add").onclick = () => {
    state.settings.tsas.push({ name: "TSA mới", url: "http://", enabled: true, verified: false });
    renderTsas();
  };
  $("anchor-add").onclick = async () => {
    const p = await dialog.open({ multiple: true, filters: [{ name: "Chứng thư", extensions: ["cer", "crt", "pem", "der"] }] });
    if (!p) return;
    for (const f of Array.isArray(p) ? p : [p]) if (!state.settings.trustAnchors.includes(f)) state.settings.trustAnchors.push(f);
    renderAnchors();
  };
  $("forget-token").onclick = () => {
    state.settings.lastModule = null;
    state.settings.lastCertSerial = null;
    state.settings.lastSlot = 0;
    renderRemembered();
  };
  $("settings-save").onclick = async () => {
    state.settings.level = $("set-level").value;
    state.settings.outputSuffix = $("set-suffix").value || "-da-ky";
    state.settings.location = $("set-location").value;
    if ($("set-web-api")) {
      state.settings.webApiBase = ($("set-web-api").value || "").trim().replace(/\/$/, "")
        || "https://pdfsign.thietkeweb.dev";
    }
    if (!state.settings.tsas.some((t) => t.url === state.settings.tsaUrl && t.enabled)) {
      state.settings.tsaUrl = state.settings.tsas.find((t) => t.enabled)?.url || "";
    }
    try {
      await invoke("save_settings", { settings: state.settings });
      setStatus("Đã lưu.", "ok");
      onSaved();
    } catch (e) {
      setStatus(errText(e), "err");
    }
  };
}
