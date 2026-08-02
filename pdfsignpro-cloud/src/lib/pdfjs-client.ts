/**
 * Load pdf.js from the self-hosted public build.
 * Avoids webpack/SSR evaluating `pdfjs-dist` (Object.defineProperty crash).
 */

export type PdfjsLib = {
  getDocument: (src: unknown) => {
    promise: Promise<import("pdfjs-dist").PDFDocumentProxy>;
    destroy: () => Promise<void>;
  };
  GlobalWorkerOptions: { workerSrc: string };
  AnnotationMode?: { ENABLE?: number; DISABLE?: number };
};

let cached: Promise<PdfjsLib> | null = null;

export function loadPdfjs(): Promise<PdfjsLib> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("pdf.js is browser-only"));
  }
  if (!cached) {
    cached = (async () => {
      // Load from /public/pdfjs — bypass webpack so pdfjs-dist is not evaluated in SSR/bundler.
      const mod: unknown = await (0, eval)('import("/pdfjs/pdf.min.mjs")');
      const lib = (mod as { default?: PdfjsLib } & PdfjsLib).default
        ? (mod as { default: PdfjsLib }).default
        : (mod as PdfjsLib);
      lib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
      return lib;
    })();
  }
  return cached;
}
