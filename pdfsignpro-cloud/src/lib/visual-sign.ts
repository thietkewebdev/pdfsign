import { PDFDocument } from "pdf-lib";

export type VisualPlacement = {
  page: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
};

/** Convert data URL (png/jpeg) to Uint8Array */
export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error("Invalid data URL");
  const b64 = dataUrl.slice(comma + 1);
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function isPngDataUrl(dataUrl: string): boolean {
  return /^data:image\/png/i.test(dataUrl);
}

/** Embed a visual signature image into a PDF (client-side, no USB token). */
export async function embedVisualSignature(
  pdfBytes: ArrayBuffer | Uint8Array,
  signatureDataUrl: string,
  placement: VisualPlacement
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();
  const pageIndex = Math.max(0, Math.min(pageCount - 1, placement.page - 1));
  const page = pdfDoc.getPage(pageIndex);
  const { width, height } = page.getSize();

  const imgBytes = dataUrlToBytes(signatureDataUrl);
  const image = isPngDataUrl(signatureDataUrl)
    ? await pdfDoc.embedPng(imgBytes)
    : await pdfDoc.embedJpg(imgBytes);

  const boxW = placement.wPct * width;
  const boxH = placement.hPct * height;
  const x = placement.xPct * width;
  // UI top-left → PDF bottom-left
  const y = (1 - placement.yPct - placement.hPct) * height;

  // Fit image inside the box while preserving aspect ratio
  const imgAspect = image.width / image.height;
  const boxAspect = boxW / boxH;
  let drawW = boxW;
  let drawH = boxH;
  if (imgAspect > boxAspect) {
    drawH = boxW / imgAspect;
  } else {
    drawW = boxH * imgAspect;
  }
  const drawX = x + (boxW - drawW) / 2;
  const drawY = y + (boxH - drawH) / 2;

  page.drawImage(image, {
    x: drawX,
    y: drawY,
    width: drawW,
    height: drawH,
  });

  return pdfDoc.save();
}

/** Draw typed name as a signature PNG data URL. */
export async function renderTypedSignature(
  text: string,
  color = "#0f172a",
  fontFamily = 'var(--font-signature), "Great Vibes", cursive'
): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Empty signature text");

  // Ensure web font is ready when available
  try {
    if (typeof document !== "undefined" && "fonts" in document) {
      await document.fonts.load(`64px ${fontFamily}`);
    }
  } catch {
    /* ignore */
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");

  const fontSize = 72;
  ctx.font = `${fontSize}px ${fontFamily}`;
  const metrics = ctx.measureText(trimmed);
  const padX = 24;
  const padY = 28;
  const w = Math.ceil(metrics.width + padX * 2);
  const h = Math.ceil(fontSize * 1.6 + padY);
  canvas.width = Math.max(w, 120);
  canvas.height = Math.max(h, 80);

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(trimmed, padX, canvas.height / 2);

  return canvas.toDataURL("image/png");
}

/** Normalize any image file to a transparent-friendly PNG data URL. */
export async function fileToPngDataUrl(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas unavailable");
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas.toDataURL("image/png");
}

export function downloadBytes(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
