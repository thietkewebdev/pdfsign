import { $, invoke, listen, dialog, opener, toast, errText, fileName, renderPdfToDataUrl } from "./api.js";
import { Viewer } from "./viewer.js";
import { state } from "./state.js";

const files = []; // { path, pages }
let active = -1;
let viewer;
const previewCache = new Map();
let signStep = 1;

function setStatus(text, kind = "") {
  const el = $("sign-status");
  el.textContent = text;
  el.className = `status ${kind}`;
}

function currentTemplate() {
  return state.templates.find((t) => t.id === $("template-select").value) || state.templates[0];
}

async function boxImage(b) {
  const tpl = currentTemplate();
  if (!tpl || !viewer) return null;
  const pts = viewer.pointsOf(b);
  const key = `${tpl.id}|${JSON.stringify(tpl)}|${Math.round(pts.w)}x${Math.round(pts.h)}`;
  if (!previewCache.has(key)) {
    previewCache.set(
      key,
      invoke("template_preview", { template: tpl, width: pts.w, height: pts.h, signer: selectedCertName() })
        .then((bytes) => renderPdfToDataUrl(bytes, 2))
        .catch(() => null),
    );
  }
  return previewCache.get(key);
}

function selectedCertName() {
  const c = state.certs.find((x) => x.serial === $("cert-select").value);
  return c ? c.displayName : null;
}

function updateStepper() {
  if (files.length) signStep = Math.max(signStep, 1);
  if (viewer?.boxes?.length) signStep = Math.max(signStep, 2);
  if ($("token-select").value && $("cert-select").value) signStep = Math.max(signStep, 3);
  if ($("results").children.length) signStep = 4;
  document.querySelectorAll("#sign-stepper .step").forEach((s) => {
    const n = Number(s.dataset.step);
    s.classList.toggle("active", n === Math.min(signStep, 4));
    s.classList.toggle("done", n < signStep);
  });
}

function renderFiles() {
  const ul = $("file-list");
  ul.innerHTML = "";
  if (!files.length) {
    ul.innerHTML = "";
  }
  files.forEach((f, i) => {
    const li = document.createElement("li");
    if (i === active) li.className = "active";
    const meta = document.createElement("div");
    meta.className = "meta";
    const name = document.createElement("b");
    name.textContent = fileName(f.path);
    name.title = f.path;
    const pages = document.createElement("span");
    pages.className = "muted";
    pages.textContent = f.pages ? `${f.pages} trang` : "";
    meta.append(name, pages);
    meta.onclick = () => showFile(i);
    const x = document.createElement("button");
    x.className = "x";
    x.textContent = "×";
    x.title = "Bỏ file";
    x.onclick = () => {
      files.splice(i, 1);
      if (active >= files.length) active = files.length - 1;
      renderFiles();
      if (active >= 0) showFile(active);
      else resetViewer();
      updateSignEnabled();
      updateStepper();
    };
    li.append(meta, x);
    ul.append(li);
  });
  $("sign-btn").textContent = files.length > 1 ? `Ký ${files.length} file` : "Ký số";
  updateStepper();
}

function resetViewer() {
  $("viewer").innerHTML = `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg>
      <strong>Chọn file PDF để bắt đầu</strong>
      <span>Kéo thả hoặc bấm Thêm file</span>
    </div>`;
  $("viewer-file").textContent = "Chưa mở tài liệu";
  $("page-label").textContent = "—";
  const rail = $("thumb-rail");
  if (rail) {
    rail.hidden = true;
    rail.innerHTML = "";
  }
}

async function showFile(i) {
  active = i;
  renderFiles();
  const bytes = await invoke("read_pdf", { path: files[i].path });
  const keep = viewer.boxes;
  await viewer.load(bytes);
  viewer.boxes = keep;
  viewer.drawBoxes();
  $("viewer-file").textContent = fileName(files[i].path);
  signStep = Math.max(signStep, 2);
  updateStepper();
}

async function addFiles(paths) {
  let list = paths;
  if (!list) {
    const picked = await dialog.open({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] });
    if (!picked) return;
    list = Array.isArray(picked) ? picked : [picked];
  }
  for (const path of list) {
    if (!String(path).toLowerCase().endsWith(".pdf")) continue;
    if (files.some((f) => f.path === path)) continue;
    const pages = await invoke("page_count", { path }).catch(() => 0);
    files.push({ path, pages });
  }
  renderFiles();
  if (active < 0 && files.length) await showFile(0);
  updateSignEnabled();
  updateStepper();
}

function renderBoxes(boxes) {
  const ul = $("box-list");
  ul.innerHTML = "";
  boxes.forEach((b, i) => {
    const li = document.createElement("li");
    const lastRule = $("last-page-rule").checked && viewer.numPages && b.page === viewer.numPages;
    const span = document.createElement("span");
    span.textContent = `Ô ${i + 1} · trang ${b.page}${lastRule ? " (cuối)" : ""}`;
    const go = document.createElement("button");
    go.className = "x";
    go.textContent = "↗";
    go.title = "Đi tới trang";
    go.onclick = () => viewer.goto(b.page);
    const x = document.createElement("button");
    x.className = "x";
    x.textContent = "×";
    x.onclick = () => viewer.removeBox(b.id);
    li.append(span, go, x);
    ul.append(li);
  });
  if (!boxes.length) {
    const li = document.createElement("li");
    li.innerHTML = '<span class="muted">Kéo trên trang để đặt ô</span>';
    ul.append(li);
  }
  updateSignEnabled();
  updateStepper();
}

function updateSignEnabled() {
  $("sign-btn").disabled = !(files.length && $("cert-select").value && $("token-select").value);
}

export async function scanTokens() {
  $("scan-tokens").disabled = true;
  setStatus("Đang dò token…");
  try {
    state.modules = await invoke("list_tokens", { extraModule: state.extraModule || null });
  } finally {
    $("scan-tokens").disabled = false;
  }
  const sel = $("token-select");
  sel.innerHTML = "";
  for (const m of state.modules) {
    for (const s of m.slots) {
      const opt = document.createElement("option");
      opt.value = JSON.stringify({ module: m.path, slot: s.index });
      opt.textContent = `${s.label || "Token"} · ${m.vendor || fileName(m.path)}${s.pinLocked ? " · PIN BỊ KHÓA" : s.pinFinalTry ? " · còn 1 lần PIN" : ""}`;
      if (state.settings.lastModule === m.path && state.settings.lastSlot === s.index) opt.selected = true;
      sel.append(opt);
    }
  }
  const found = sel.options.length > 0;
  sel.disabled = !found;
  if (!found) {
    sel.innerHTML = "<option value=''>Không tìm thấy token</option>";
    const drivers = state.modules.length;
    setStatus(
      drivers
        ? `Có ${drivers} driver nhưng chưa thấy token.`
        : "Không tìm thấy driver PKCS#11.",
      "err",
    );
    $("cert-select").innerHTML = "<option value=''>—</option>";
    $("cert-select").disabled = true;
    updateSignEnabled();
    return;
  }
  setStatus(`Tìm thấy ${sel.options.length} token.`, "ok");
  await loadCerts();
  updateStepper();
}

async function loadCerts() {
  const v = $("token-select").value;
  if (!v) return;
  const { module, slot } = JSON.parse(v);
  const sel = $("cert-select");
  try {
    state.certs = await invoke("list_certs", { module, slot });
  } catch (e) {
    setStatus(`${e.code || ""} ${errText(e)}`, "err");
    return;
  }
  sel.innerHTML = "";
  for (const c of state.certs) {
    const opt = document.createElement("option");
    opt.value = c.serial;
    opt.disabled = !c.validNow || c.isCa;
    const note = c.isCa ? " (CA)" : c.validNow ? "" : " (hết hạn)";
    opt.textContent = `${c.displayName} · ${c.validTo}${note}`;
    if (c.serial === state.settings.lastCertSerial && !opt.disabled) opt.selected = true;
    sel.append(opt);
  }
  if (sel.selectedOptions[0]?.disabled) {
    const firstOk = [...sel.options].find((o) => !o.disabled);
    if (firstOk) firstOk.selected = true;
  }
  sel.disabled = !state.certs.length;
  previewCache.clear();
  viewer.drawBoxes();
  updateSignEnabled();
  updateStepper();
}

function buildJob() {
  const lastRule = $("last-page-rule").checked;
  const placements = viewer.boxes.map((b) => ({
    page: lastRule && b.page === viewer.numPages ? 0 : b.page,
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
  }));
  const level = $("level-select").value;
  const outDir = $("out-dir").value.trim();
  return {
    inputs: files.map((f) => f.path),
    output: { kind: "folder", dir: outDir || null, suffix: $("suffix").value || "-da-ky" },
    placements,
    level,
    tsaUrl: level === "B-B" ? null : $("tsa-select").value || null,
    reason: $("reason").value || null,
    location: $("location").value || null,
    overwrite: false,
  };
}

function openPinModal() {
  const modal = $("pin-modal");
  const pin = $("pin");
  pin.value = "";
  modal.hidden = false;
  setTimeout(() => pin.focus(), 50);
}

function closePinModal() {
  $("pin-modal").hidden = true;
  $("pin").value = "";
}

async function doSign(pin) {
  if (!pin) {
    setStatus("Vui lòng nhập mã PIN.", "err");
    return;
  }
  const { module, slot } = JSON.parse($("token-select").value);
  const req = {
    job: buildJob(),
    templateId: currentTemplate()?.id || "default",
    module,
    slot,
    certSerial: $("cert-select").value,
    pin,
  };
  $("sign-btn").disabled = true;
  $("results").innerHTML = "";
  $("progress").hidden = false;
  signStep = 4;
  updateStepper();
  setStatus("Đang ký…");
  try {
    const results = await invoke("sign_job", { req });
    const ok = results.filter((r) => r.ok).length;
    setStatus(
      ok === results.length ? `Đã ký ${ok}/${results.length} file.` : `Ký thành công ${ok}/${results.length} file.`,
      ok === results.length ? "ok" : "err",
    );
    renderResults(results);
    state.settings = await invoke("get_settings");
    toast(ok === results.length ? "Ký thành công" : "Có file lỗi", 3500);
  } catch (e) {
    setStatus(`${e.code ? e.code + ": " : ""}${errText(e)}`, "err");
    toast(errText(e), 5000);
  } finally {
    $("progress").hidden = true;
    updateSignEnabled();
  }
}

function renderResults(results) {
  const ul = $("results");
  ul.innerHTML = "";
  for (const r of results) {
    const li = document.createElement("li");
    li.className = r.ok ? "ok" : "err";
    const info = document.createElement("div");
    const title = document.createElement("b");
    title.textContent = fileName(r.output || r.input);
    title.title = r.output || r.input;
    const sub = document.createElement("span");
    sub.className = "muted";
    sub.textContent = r.ok
      ? `${r.level} · ${r.signatures} chữ ký${r.warnings.length ? " · " + r.warnings.length + " cảnh báo" : ""}`
      : r.error;
    if (r.warnings.length) sub.title = r.warnings.join("\n");
    info.append(title, sub);
    li.append(info);
    if (r.ok) {
      const actions = document.createElement("span");
      actions.className = "actions";
      const open = document.createElement("button");
      open.textContent = "Mở";
      open.onclick = () => opener.openPath(r.output);
      const reveal = document.createElement("button");
      reveal.textContent = "Thư mục";
      reveal.onclick = () => opener.revealItemInDir(r.output);
      const check = document.createElement("button");
      check.textContent = "Xác minh";
      check.onclick = () => window.dispatchEvent(new CustomEvent("verify-file", { detail: r.output }));
      actions.append(open, reveal, check);
      li.append(actions);
    }
    ul.append(li);
  }
}

export function refreshTemplates() {
  const sel = $("template-select");
  const keep = sel.value || state.settings.templateId;
  sel.innerHTML = "";
  for (const t of state.templates) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    if (t.id === keep) opt.selected = true;
    sel.append(opt);
  }
  previewCache.clear();
  if (viewer) viewer.drawBoxes();
}

export function refreshTsas() {
  const sel = $("tsa-select");
  sel.innerHTML = "";
  for (const t of state.settings.tsas.filter((x) => x.enabled)) {
    const opt = document.createElement("option");
    opt.value = t.url;
    opt.textContent = `${t.name}`;
    if (t.url === state.settings.tsaUrl) opt.selected = true;
    sel.append(opt);
  }
  $("level-select").value = state.settings.level;
  $("suffix").value = state.settings.outputSuffix;
  $("location").value = $("location").value || state.settings.location || "";
  $("out-dir").value = state.settings.outputDir || "";
  syncTsaEnabled();
}

function syncTsaEnabled() {
  $("tsa-select").disabled = $("level-select").value === "B-B";
}

function bindDropzone(el, onFiles) {
  if (!el) return;
  el.addEventListener("click", () => onFiles());
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onFiles();
    }
  });
  el.addEventListener("dragover", (e) => {
    e.preventDefault();
    el.classList.add("dragover");
  });
  el.addEventListener("dragleave", () => el.classList.remove("dragover"));
  el.addEventListener("drop", (e) => {
    e.preventDefault();
    el.classList.remove("dragover");
    // Browser demo / HTML5 paths unavailable; fall back to picker.
    onFiles();
  });
}

export function initSign() {
  viewer = new Viewer($("viewer"), {
    onChange: renderBoxes,
    onPage: (n, total) => {
      $("page-label").textContent = `${n} / ${total}`;
      $("prev-page").disabled = n <= 1;
      $("next-page").disabled = n >= total;
    },
    boxLabel: (b, i) => `Chữ ký ${i + 1}`,
    boxImage,
    thumbRail: $("thumb-rail"),
  });
  renderBoxes([]);
  bindDropzone($("drop-files"), () => addFiles().catch((e) => setStatus(errText(e), "err")));
  $("add-files").onclick = () => addFiles().catch((e) => setStatus(errText(e), "err"));
  $("clear-files").onclick = () => {
    files.length = 0;
    active = -1;
    signStep = 1;
    renderFiles();
    resetViewer();
    viewer.clearBoxes();
    updateStepper();
  };
  $("prev-page").onclick = () => viewer.goto(viewer.pageNum - 1);
  $("next-page").onclick = () => viewer.goto(viewer.pageNum + 1);
  $("zoom-in").onclick = () => viewer.zoomBy(0.15);
  $("zoom-out").onclick = () => viewer.zoomBy(-0.15);
  $("zoom-fit").onclick = () => viewer.fitToWidth();
  $("scan-tokens").onclick = () => scanTokens().catch((e) => setStatus(errText(e), "err"));
  $("pick-module").onclick = async () => {
    const p = await dialog.open({ multiple: false, filters: [{ name: "PKCS#11", extensions: ["dll", "so", "dylib"] }] });
    if (!p) return;
    state.extraModule = p;
    await scanTokens();
  };
  $("token-select").onchange = loadCerts;
  $("cert-select").onchange = () => {
    previewCache.clear();
    viewer.drawBoxes();
    updateSignEnabled();
    updateStepper();
  };
  $("template-select").onchange = () => {
    previewCache.clear();
    viewer.drawBoxes();
  };
  $("level-select").onchange = syncTsaEnabled;
  $("last-page-rule").onchange = () => renderBoxes(viewer.boxes);
  $("pick-out-dir").onclick = async () => {
    const d = await dialog.open({ directory: true });
    if (d) $("out-dir").value = d;
  };
  $("sign-btn").onclick = () => {
    if ($("sign-btn").disabled) return;
    openPinModal();
  };
  $("pin-cancel").onclick = closePinModal;
  $("pin-confirm").onclick = () => {
    const pin = $("pin").value;
    closePinModal();
    doSign(pin);
  };
  $("pin").onkeydown = (e) => {
    if (e.key === "Enter") {
      const pin = $("pin").value;
      closePinModal();
      doSign(pin);
    }
    if (e.key === "Escape") closePinModal();
  };
  $("pin-modal").addEventListener("click", (e) => {
    if (e.target === $("pin-modal")) closePinModal();
  });
  document.querySelectorAll("#sign-stepper .step").forEach((s) => {
    s.onclick = () => {
      const n = Number(s.dataset.step);
      const target = document.querySelector(`[data-sign-step="${n}"]`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    };
  });
  listen("sign-progress", (ev) => {
    const { done, total, current } = ev.payload;
    $("progress").querySelector(".bar").style.width = `${(done / Math.max(total, 1)) * 100}%`;
    $("progress").querySelector("span").textContent =
      done < total ? `Đang ký ${done + 1}/${total}: ${fileName(current)}` : `Hoàn tất ${total}/${total}`;
  });
  // Tauri file drop (paths)
  try {
    const webview = window.__TAURI__?.webview?.getCurrentWebview?.();
    webview?.onDragDropEvent?.((event) => {
      const payload = event.payload;
      if (payload?.type === "drop" && payload.paths?.length) {
        addFiles(payload.paths).catch((e) => setStatus(errText(e), "err"));
      }
    });
  } catch (_) {
    /* browser demo */
  }
  let resizeTimer;
  let lastWidth = 0;
  new ResizeObserver(() => {
    const w = $("viewer").clientWidth;
    if (!viewer.doc || Math.abs(w - lastWidth) < 8) return;
    lastWidth = w;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => viewer.render(), 150);
  }).observe($("viewer"));

  // Expose for keyboard shortcuts / demo
  window.__pdfsignSign = { addFiles, openPinModal, doSign, files, getViewer: () => viewer };
  updateStepper();
}
