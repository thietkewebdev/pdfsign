import * as pdfjsLib from "./pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdfjs/pdf.worker.min.mjs";

const { invoke } = window.__TAURI__.core;
const dialog = window.__TAURI__.dialog;
const $ = (id) => document.getElementById(id);

const DEFAULT_BOX = { w: 0.32, h: 0.1 };
const state = { path: null, doc: null, page: 1, rect: null, modules: [], certs: [] };

function setStatus(text, kind = "") {
  const el = $("status");
  el.textContent = text;
  el.className = `status ${kind}`;
}

function updateSignEnabled() {
  $("sign").disabled = !(state.doc && state.rect && $("cert-select").value !== "");
}

async function pickPdf() {
  const path = await dialog.open({ multiple: false, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (!path) return;
  const buf = await invoke("read_pdf", { path });
  state.path = path;
  state.doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
  state.page = state.doc.numPages;
  state.rect = null;
  $("pdf-name").textContent = path.split(/[\\/]/).pop();
  $("empty").hidden = true;
  await renderPage();
}

async function renderPage() {
  const page = await state.doc.getPage(state.page);
  const viewport = page.getViewport({ scale: 1.25 });
  const canvas = $("page-canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  $("page-label").textContent = `Trang ${state.page}/${state.doc.numPages}`;
  $("prev-page").disabled = state.page <= 1;
  $("next-page").disabled = state.page >= state.doc.numPages;
  drawBox();
  updateSignEnabled();
}

// rectPct: fractions of the displayed page, bottom-left origin (same contract as the cloud job API).
function drawBox() {
  const box = $("sig-box");
  const canvas = $("page-canvas");
  if (!state.rect) {
    box.hidden = true;
    $("rect-label").textContent = "Khung: chưa đặt";
    return;
  }
  const { x, y, w, h } = state.rect;
  box.hidden = false;
  box.style.left = `${x * canvas.width}px`;
  box.style.top = `${(1 - y - h) * canvas.height}px`;
  box.style.width = `${w * canvas.width}px`;
  box.style.height = `${h * canvas.height}px`;
  $("rect-label").textContent = `Khung (rectPct): ${[x, y, w, h].map((v) => v.toFixed(3)).join(", ")}`;
}

function setupPlacement() {
  const wrap = $("page-wrap");
  let start = null;
  const point = (ev) => {
    const r = $("page-canvas").getBoundingClientRect();
    return {
      x: Math.min(Math.max((ev.clientX - r.left) / r.width, 0), 1),
      y: Math.min(Math.max((ev.clientY - r.top) / r.height, 0), 1),
    };
  };
  const toRect = (a, b) => ({
    x: Math.min(a.x, b.x),
    y: 1 - Math.max(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  });
  wrap.addEventListener("mousedown", (ev) => {
    if (!state.doc) return;
    start = point(ev);
  });
  wrap.addEventListener("mousemove", (ev) => {
    if (!start) return;
    state.rect = toRect(start, point(ev));
    drawBox();
  });
  window.addEventListener("mouseup", (ev) => {
    if (!start) return;
    const end = point(ev);
    let rect = toRect(start, end);
    if (rect.w < 0.02 || rect.h < 0.01) {
      const x = Math.min(Math.max(end.x - DEFAULT_BOX.w / 2, 0), 1 - DEFAULT_BOX.w);
      const top = Math.min(Math.max(end.y - DEFAULT_BOX.h / 2, 0), 1 - DEFAULT_BOX.h);
      rect = { x, y: 1 - top - DEFAULT_BOX.h, w: DEFAULT_BOX.w, h: DEFAULT_BOX.h };
    }
    state.rect = rect;
    start = null;
    drawBox();
    updateSignEnabled();
  });
}

async function scanTokens() {
  setStatus("Đang dò module PKCS#11…");
  state.modules = await invoke("list_tokens", { extraModule: null });
  const sel = $("token-select");
  sel.innerHTML = "";
  for (const m of state.modules) {
    for (const s of m.slots) {
      const opt = document.createElement("option");
      opt.value = JSON.stringify({ module: m.path, slot: s.index });
      opt.textContent = `${s.label || "Token"} (${m.vendor || "?"}) slot ${s.index}`;
      sel.appendChild(opt);
    }
  }
  const found = sel.options.length > 0;
  sel.disabled = !found;
  $("load-certs").disabled = !found;
  setStatus(found ? `Tìm thấy ${sel.options.length} token.` : "Không tìm thấy token. Cắm token và cài driver của CA.", found ? "ok" : "err");
}

async function loadCerts() {
  const { module, slot } = JSON.parse($("token-select").value);
  try {
    state.certs = await invoke("list_certs", { module, slot });
  } catch (e) {
    setStatus(`${e.code}: ${e.message}`, "err");
    return;
  }
  const sel = $("cert-select");
  sel.innerHTML = "";
  for (const c of state.certs) {
    const opt = document.createElement("option");
    opt.value = c.serial;
    opt.disabled = !c.validNow || c.isCa;
    const note = c.isCa ? " (chứng thư CA, không dùng để ký)" : c.validNow ? "" : " (hết hiệu lực)";
    opt.textContent = `${c.displayName} | hết hạn ${c.validTo}${note}`;
    sel.appendChild(opt);
  }
  sel.disabled = state.certs.length === 0;
  updateSignEnabled();
  setStatus(`Đã đọc ${state.certs.length} chứng thư.`, "ok");
}

async function doSign() {
  const pinEl = $("pin");
  if (!pinEl.value) {
    setStatus("Vui lòng nhập mã PIN.", "err");
    return;
  }
  const base = state.path.replace(/\.pdf$/i, "");
  const output = await dialog.save({ defaultPath: `${base}-signed.pdf`, filters: [{ name: "PDF", extensions: ["pdf"] }] });
  if (!output) return;
  const { module, slot } = JSON.parse($("token-select").value);
  const { x, y, w, h } = state.rect;
  const req = {
    input: state.path,
    output,
    module,
    slot,
    certSerial: $("cert-select").value,
    page: state.page,
    rect: [x, y, w, h],
    pin: pinEl.value,
    tsa: $("tsa").value || null,
  };
  pinEl.value = "";
  $("sign").disabled = true;
  setStatus("Đang ký…");
  try {
    const res = await invoke("sign", { req });
    setStatus(`Đã ký (${res.level}, ${res.fieldName}).\n${res.output}`, "ok");
  } catch (e) {
    setStatus(`${e.code}: ${e.message}`, "err");
  } finally {
    updateSignEnabled();
  }
}

$("pick-pdf").addEventListener("click", () => pickPdf().catch((e) => setStatus(String(e?.message ?? e), "err")));
$("prev-page").addEventListener("click", () => { state.page -= 1; renderPage(); });
$("next-page").addEventListener("click", () => { state.page += 1; renderPage(); });
$("scan-tokens").addEventListener("click", () => scanTokens().catch((e) => setStatus(String(e), "err")));
$("load-certs").addEventListener("click", loadCerts);
$("cert-select").addEventListener("change", updateSignEnabled);
$("sign").addEventListener("click", doSign);
setupPlacement();
