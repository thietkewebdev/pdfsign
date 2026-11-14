import { $, invoke, listen, dialog, opener, toast, errText, fileName, renderPdfToDataUrl } from "./api.js";
import { Viewer } from "./viewer.js";
import { state } from "./state.js";

const files = []; // { path, pages }
let active = -1;
let viewer;
const previewCache = new Map();

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

function renderFiles() {
  const ul = $("file-list");
  ul.innerHTML = "";
  if (!files.length) {
    ul.innerHTML = '<li class="muted">Chưa có file. Chọn một hoặc nhiều file để ký hàng loạt.</li>';
  }
  files.forEach((f, i) => {
    const li = document.createElement("li");
    if (i === active) li.className = "active";
    const name = document.createElement("span");
    name.textContent = fileName(f.path);
    name.title = f.path;
    name.onclick = () => showFile(i);
    const pages = document.createElement("span");
    pages.className = "muted";
    pages.textContent = f.pages ? `${f.pages} tr.` : "";
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
    };
    li.append(name, pages, x);
    ul.append(li);
  });
  $("sign-btn").textContent = files.length > 1 ? `Ký ${files.length} file` : "Ký số";
}

function resetViewer() {
  $("viewer").innerHTML = '<p class="empty">Thêm file PDF để xem trước và đặt vị trí chữ ký.</p>';
  $("viewer-file").textContent = "Chưa mở tài liệu";
  $("page-label").textContent = "-";
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
}

async function addFiles() {
  const picked = await dialog.open({ multiple: true, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (!picked) return;
  const list = Array.isArray(picked) ? picked : [picked];
  for (const path of list) {
    if (files.some((f) => f.path === path)) continue;
    const pages = await invoke("page_count", { path }).catch(() => 0);
    files.push({ path, pages });
  }
  renderFiles();
  if (active < 0 && files.length) await showFile(0);
  updateSignEnabled();
}

function renderBoxes(boxes) {
  const ul = $("box-list");
  ul.innerHTML = "";
  boxes.forEach((b, i) => {
    const li = document.createElement("li");
    const lastRule = $("last-page-rule").checked && viewer.numPages && b.page === viewer.numPages;
    li.innerHTML = `<span>Chữ ký ${i + 1}: trang ${b.page}${lastRule ? " (trang cuối)" : ""}</span>`;
    const go = document.createElement("button");
    go.className = "x";
    go.textContent = "↗";
    go.title = "Đi tới trang";
    go.onclick = () => viewer.goto(b.page);
    const x = document.createElement("button");
    x.className = "x";
    x.textContent = "×";
    x.onclick = () => viewer.removeBox(b.id);
    li.append(go, x);
    ul.append(li);
  });
  if (!boxes.length) ul.innerHTML = '<li class="muted">Chưa có ô chữ ký (sẽ ký ẩn nếu để trống).</li>';
  updateSignEnabled();
}

function updateSignEnabled() {
  $("sign-btn").disabled = !(files.length && $("cert-select").value && $("token-select").value);
}

export async function scanTokens() {
  $("scan-tokens").disabled = true;
  setStatus("Đang dò driver PKCS#11 và token…");
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
      opt.textContent = `${s.label || "Token"} · ${m.vendor || fileName(m.path)}${s.pinLocked ? " · PIN BỊ KHÓA" : s.pinFinalTry ? " · còn 1 lần nhập PIN" : ""}`;
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
        ? `Tìm thấy ${drivers} driver nhưng chưa thấy token. Hãy cắm token rồi bấm Dò token.`
        : "Không tìm thấy driver PKCS#11. Cài phần mềm token của nhà cung cấp hoặc bấm Chọn driver….",
      "err",
    );
    $("cert-select").innerHTML = "<option value=''>-</option>";
    $("cert-select").disabled = true;
    updateSignEnabled();
    return;
  }
  setStatus(`Tìm thấy ${sel.options.length} token.`, "ok");
  await loadCerts();
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
    const note = c.isCa ? " (CA, không dùng để ký)" : c.validNow ? "" : " (hết hiệu lực)";
    opt.textContent = `${c.displayName} · hết hạn ${c.validTo}${note}`;
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

async function doSign() {
  const pinEl = $("pin");
  if (!pinEl.value) {
    setStatus("Vui lòng nhập mã PIN.", "err");
    pinEl.focus();
    return;
  }
  const { module, slot } = JSON.parse($("token-select").value);
  const req = {
    job: buildJob(),
    templateId: currentTemplate()?.id || "default",
    module,
    slot,
    certSerial: $("cert-select").value,
    pin: pinEl.value,
  };
  pinEl.value = "";
  $("sign-btn").disabled = true;
  $("results").innerHTML = "";
  $("progress").hidden = false;
  setStatus("Đang ký…");
  try {
    const results = await invoke("sign_job", { req });
    const ok = results.filter((r) => r.ok).length;
    setStatus(
      ok === results.length ? `Đã ký thành công ${ok}/${results.length} file.` : `Ký thành công ${ok}/${results.length} file.`,
      ok === results.length ? "ok" : "err",
    );
    renderResults(results);
    state.settings = await invoke("get_settings");
  } catch (e) {
    setStatus(`${e.code ? e.code + ": " : ""}${errText(e)}`, "err");
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
      open.className = "x";
      open.textContent = "Mở";
      open.onclick = () => opener.openPath(r.output);
      const reveal = document.createElement("button");
      reveal.className = "x";
      reveal.textContent = "Thư mục";
      reveal.onclick = () => opener.revealItemInDir(r.output);
      const check = document.createElement("button");
      check.className = "x";
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
    opt.textContent = `${t.name} (${t.url})`;
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

export function initSign() {
  viewer = new Viewer($("viewer"), {
    onChange: renderBoxes,
    onPage: (n, total) => {
      $("page-label").textContent = `Trang ${n}/${total}`;
      $("prev-page").disabled = n <= 1;
      $("next-page").disabled = n >= total;
    },
    boxLabel: (b, i) => `Chữ ký ${i + 1}`,
    boxImage,
  });
  renderBoxes([]);
  $("add-files").onclick = () => addFiles().catch((e) => setStatus(errText(e), "err"));
  $("clear-files").onclick = () => {
    files.length = 0;
    active = -1;
    renderFiles();
    resetViewer();
    viewer.clearBoxes();
  };
  $("prev-page").onclick = () => viewer.goto(viewer.pageNum - 1);
  $("next-page").onclick = () => viewer.goto(viewer.pageNum + 1);
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
  $("sign-btn").onclick = doSign;
  $("pin").onkeydown = (e) => {
    if (e.key === "Enter" && !$("sign-btn").disabled) doSign();
  };
  listen("sign-progress", (ev) => {
    const { done, total, current } = ev.payload;
    $("progress").querySelector(".bar").style.width = `${(done / Math.max(total, 1)) * 100}%`;
    $("progress").querySelector("span").textContent =
      done < total ? `Đang ký ${done + 1}/${total}: ${fileName(current)}` : `Hoàn tất ${total}/${total}`;
  });
  let resizeTimer;
  let lastWidth = 0;
  new ResizeObserver(() => {
    const w = $("viewer").clientWidth;
    if (!viewer.doc || Math.abs(w - lastWidth) < 8) return;
    lastWidth = w;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => viewer.render(), 150);
  }).observe($("viewer"));
}
