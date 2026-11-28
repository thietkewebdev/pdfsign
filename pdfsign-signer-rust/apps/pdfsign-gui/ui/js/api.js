import * as pdfjsLib from "../pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdfjs/pdf.worker.min.mjs";

export { pdfjsLib };

/** Resolve withGlobalTauri globals; demo-mock.js installs a shim when absent. */
function tauri() {
  const t = window.__TAURI__;
  if (!t?.core?.invoke) {
    throw new Error("PDFSign chưa sẵn sàng (thiếu Tauri API)");
  }
  return t;
}

export function invoke(cmd, args) {
  return tauri().core.invoke(cmd, args);
}

export function listen(event, handler) {
  const ev = tauri().event;
  if (!ev?.listen) throw new Error("listen is not defined");
  return ev.listen(event, handler);
}

export const dialog = {
  open: (opts) => {
    const d = tauri().dialog;
    if (!d?.open) throw new Error("dialog is not defined");
    return d.open(opts);
  },
};

export const opener = {
  openPath: (path) => {
    const o = tauri().opener;
    if (!o?.openPath) throw new Error("opener is not defined");
    return o.openPath(path);
  },
  revealItemInDir: (path) => {
    const o = tauri().opener;
    if (!o?.revealItemInDir) throw new Error("opener is not defined");
    return o.revealItemInDir(path);
  },
  openUrl: (url) => {
    const o = tauri().opener;
    if (o?.openUrl) return o.openUrl(url);
    window.open(url, "_blank", "noopener,noreferrer");
  },
};

export const $ = (id) => document.getElementById(id);

export function toast(text, ms = 3500) {
  const el = $("toast");
  el.textContent = text;
  el.className = "toast";
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => (el.hidden = true), ms);
}

export function errText(e) {
  if (!e) return "Lỗi không xác định";
  if (typeof e === "string") return e;
  return e.message ? `${e.message}` : JSON.stringify(e);
}

export function fileName(path) {
  return String(path).split(/[\\/]/).pop();
}

/** Render page 1 of a PDF (bytes) to a canvas or a data URL. */
export async function renderPdfToCanvas(bytes, canvas, scale = 2) {
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(bytes) }).promise;
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale });
  canvas.width = vp.width;
  canvas.height = vp.height;
  await page.render({ canvasContext: canvas.getContext("2d"), viewport: vp }).promise;
  doc.destroy();
  return canvas;
}

export async function renderPdfToDataUrl(bytes, scale = 2) {
  const c = document.createElement("canvas");
  await renderPdfToCanvas(bytes, c, scale);
  return c.toDataURL("image/png");
}
