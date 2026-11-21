import { $, invoke, dialog, errText, renderPdfToCanvas } from "./api.js";
import { state } from "./state.js";

let current = null;
let previewTimer;

function setStatus(text, kind = "") {
  const el = $("tpl-status");
  el.textContent = text;
  el.className = `status ${kind}`;
}

const urlCache = new Map();

async function imageUrl(path) {
  if (!path) return "";
  if (!urlCache.has(path)) {
    const bytes = await invoke("read_pdf", { path });
    urlCache.set(path, URL.createObjectURL(new Blob([bytes])));
  }
  return urlCache.get(path);
}

function renderList() {
  const ul = $("tpl-list");
  ul.innerHTML = "";
  for (const t of state.templates) {
    const li = document.createElement("li");
    li.textContent = t.name;
    if (current && t.id === current.id) li.className = "active";
    li.onclick = () => select(t.id);
    ul.append(li);
  }
}

function fill(t) {
  $("tpl-name").value = t.name;
  $("tpl-lines").value = t.lines.join("\n");
  $("tpl-layout").value = t.layout;
  $("tpl-align").value = t.align;
  $("tpl-accent").value = t.accentColor;
  $("tpl-text").value = t.textColor;
  $("tpl-font").value = t.fontSize ?? "";
  const dateSel = $("tpl-date");
  if (![...dateSel.options].some((o) => o.value === t.dateFormat)) {
    dateSel.append(new Option(t.dateFormat, t.dateFormat));
  }
  dateSel.value = t.dateFormat;
  $("tpl-border").checked = t.showBorder;
  $("tpl-icon").checked = t.showCheckIcon;
  imageUrl(t.sealImage).then((u) => ($("tpl-seal-img").src = u)).catch(() => ($("tpl-seal-img").src = ""));
  imageUrl(t.signatureImage).then((u) => ($("tpl-sig-img").src = u)).catch(() => ($("tpl-sig-img").src = ""));
}

function read() {
  const font = parseFloat($("tpl-font").value);
  return {
    ...current,
    name: $("tpl-name").value.trim() || "Mẫu chưa đặt tên",
    lines: $("tpl-lines").value.split("\n").map((l) => l.trimEnd()).filter((l) => l.length),
    layout: $("tpl-layout").value,
    align: $("tpl-align").value,
    accentColor: $("tpl-accent").value,
    textColor: $("tpl-text").value,
    fontSize: Number.isFinite(font) ? font : null,
    dateFormat: $("tpl-date").value,
    showBorder: $("tpl-border").checked,
    showCheckIcon: $("tpl-icon").checked,
  };
}

async function preview() {
  if (!current) return;
  try {
    const bytes = await invoke("template_preview", { template: read(), width: 220, height: 70, signer: null });
    await renderPdfToCanvas(bytes, $("tpl-preview"), 2.2);
    $("tpl-preview").style.width = "440px";
  } catch (e) {
    setStatus(errText(e), "err");
  }
}

function schedulePreview() {
  clearTimeout(previewTimer);
  previewTimer = setTimeout(preview, 200);
}

function select(id) {
  current = state.templates.find((t) => t.id === id) || state.templates[0];
  renderList();
  fill(current);
  setStatus("");
  preview();
}

async function reload(selectId) {
  state.templates = await invoke("list_templates");
  select(selectId || current?.id);
  window.dispatchEvent(new Event("templates-changed"));
}

async function save() {
  try {
    const saved = await invoke("save_template", { template: read() });
    current = saved;
    await reload(saved.id);
    setStatus("Đã lưu mẫu.", "ok");
  } catch (e) {
    setStatus(errText(e), "err");
  }
}

async function pickImage(slot) {
  const path = await dialog.open({ multiple: false, filters: [{ name: "Ảnh", extensions: ["png", "jpg", "jpeg"] }] });
  if (!path) return;
  await invoke("save_template", { template: read() });
  const t = await invoke("set_template_image", { id: current.id, slot, path });
  await reload(t.id);
  if (slot === "seal" && read().layout === "textOnly") $("tpl-layout").value = "imageLeft";
}

async function clearImage(slot) {
  await invoke("save_template", { template: read() });
  const t = await invoke("set_template_image", { id: current.id, slot, path: null });
  await reload(t.id);
}

export function initTemplates() {
  for (const id of ["tpl-name", "tpl-lines", "tpl-font"]) $(id).oninput = schedulePreview;
  for (const id of ["tpl-layout", "tpl-align", "tpl-accent", "tpl-text", "tpl-date", "tpl-border", "tpl-icon"]) {
    $(id).onchange = schedulePreview;
    $(id).oninput = schedulePreview;
  }
  $("tpl-save").onclick = save;
  $("tpl-new").onclick = async () => {
    const t = await invoke("save_template", {
      template: { ...state.templates[0], id: "", name: "Mẫu mới", sealImage: null, signatureImage: null },
    });
    await reload(t.id);
  };
  $("tpl-delete").onclick = async () => {
    if (state.templates.length <= 1) return setStatus("Cần giữ ít nhất một mẫu.", "err");
    await invoke("delete_template", { id: current.id });
    current = null;
    await reload();
  };
  $("tpl-seal-pick").onclick = () => pickImage("seal").catch((e) => setStatus(errText(e), "err"));
  $("tpl-sig-pick").onclick = () => pickImage("signature").catch((e) => setStatus(errText(e), "err"));
  $("tpl-seal-clear").onclick = () => clearImage("seal");
  $("tpl-sig-clear").onclick = () => clearImage("signature");
}

export function showTemplates() {
  select(current?.id);
}
