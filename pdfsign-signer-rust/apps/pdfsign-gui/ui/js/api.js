import * as pdfjsLib from "../pdfjs/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "./pdfjs/pdf.worker.min.mjs";

export { pdfjsLib };
export const invoke = window.__TAURI__.core.invoke;
export const listen = window.__TAURI__.event.listen;
export const dialog = window.__TAURI__.dialog;
export const opener = window.__TAURI__.opener;

export const $ = (id) => document.getElementById(id);

export function toast(text, ms = 3500) {
  const el = $("toast");
  el.textContent = text;
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
