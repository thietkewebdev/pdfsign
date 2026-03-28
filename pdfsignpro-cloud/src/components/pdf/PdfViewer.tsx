"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
} from "lucide-react";
import { SignatureBox, type SignatureBoxChrome } from "./SignatureBox";
import { PdfScrollPage } from "./PdfScrollPage";
import type { SignaturePlacement } from "@/lib/types";

// Worker for pdf.js (self-hosted from public/pdfjs/)
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
}

interface PdfViewerProps {
  file?: File | null;
  pdfUrl?: string | null;
  currentPage: number;
  onPageChange: (page: number) => void;
  scale: number;
  onScaleChange: (scale: number) => void;
  totalPages: number;
  onTotalPagesChange: (n: number) => void;
  placements: SignaturePlacement[];
  onPlacementUpdate: (
    index: number,
    pageWidth: number,
    pageHeight: number,
    x: number,
    y: number,
    w: number,
    h: number
  ) => void;
  activePageForPlacement: number;
  /** When true, hide signature overlays and disable placement editing (read-only for signed PDFs) */
  readOnly?: boolean;
  /** Selected template id for signature preview */
  selectedTemplateId?: string;
  /** Base64 seal image for the "seal" template */
  sealImageBase64?: string | null;
  /**
   * Stack pages vertically; each page renders when scrolled near viewport (pdfUrl only).
   */
  continuousScroll?: boolean;
  /** Khung ô ký (vd. trang /d/ dùng stitch). */
  signatureChrome?: SignatureBoxChrome;
}

export function PdfViewer({
  file = null,
  pdfUrl = null,
  currentPage,
  onPageChange,
  scale,
  onScaleChange,
  totalPages,
  onTotalPagesChange,
  placements,
  onPlacementUpdate,
  activePageForPlacement,
  readOnly = false,
  selectedTemplateId = "valid",
  sealImageBase64,
  continuousScroll = false,
  signatureChrome = "default",
}: PdfViewerProps) {
  void activePageForPlacement;
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollRafRef = useRef<number | null>(null);
  const currentPageRef = useRef(currentPage);
  currentPageRef.current = currentPage;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageDimensions, setPageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (file) {
      const loadPdf = async () => {
        const arrayBuffer = await file.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        onTotalPagesChange(pdf.numPages);
      };
      loadPdf();
      return () => setPdfDoc(null);
    } else if (pdfUrl) {
      // Use URL + Range requests (server must send Accept-Ranges) so pdf.js can load
      // incrementally instead of fetch()+arrayBuffer() (waits for entire file).
      const loadingTask = pdfjsLib.getDocument({
        url: pdfUrl,
        rangeChunkSize: 65536,
        withCredentials: false,
      });
      loadingTask.promise
        .then((pdf) => {
          setPdfDoc(pdf);
          onTotalPagesChange(pdf.numPages);
        })
        .catch(() => {
          /* destroyed on unmount */
        });
      return () => {
        void loadingTask.destroy();
        setPdfDoc(null);
      };
    }
  }, [file, pdfUrl, onTotalPagesChange]);

  const useContinuous =
    continuousScroll && !!pdfUrl && !file && !!pdfDoc;

  const scrollToPageNum = useCallback(
    (n: number) => {
      const root = scrollContainerRef.current;
      const el = root?.querySelector(`[data-pdf-page="${n}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      onPageChange(n);
    },
    [onPageChange]
  );

  const handleScrollContainerScroll = useCallback(() => {
    if (!useContinuous || !scrollContainerRef.current) return;
    if (scrollRafRef.current != null) {
      cancelAnimationFrame(scrollRafRef.current);
    }
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null;
      const root = scrollContainerRef.current;
      if (!root) return;
      const rootRect = root.getBoundingClientRect();
      const targetY = rootRect.top + rootRect.height * 0.32;
      let best = 1;
      let bestDist = Number.POSITIVE_INFINITY;
      root.querySelectorAll("[data-pdf-page]").forEach((node) => {
        const el = node as HTMLElement;
        const page = parseInt(el.dataset.pdfPage ?? "0", 10);
        if (page < 1) return;
        const r = el.getBoundingClientRect();
        const center = (r.top + r.bottom) / 2;
        const d = Math.abs(center - targetY);
        if (d < bestDist) {
          bestDist = d;
          best = page;
        }
      });
      if (best !== currentPageRef.current) {
        onPageChange(best);
      }
    });
  }, [useContinuous, onPageChange]);

  const renderPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current) return;

      // Cancel any in-flight render before starting a new one
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }

      const page = await pdfDoc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.height = viewport.height;
      canvas.width = viewport.width;
      setPageDimensions({ width: viewport.width, height: viewport.height });

      const renderContext = {
        canvasContext: ctx,
        canvas,
        viewport,
      };
      const renderTask = page.render(renderContext);
      renderTaskRef.current = renderTask;

      try {
        await renderTask.promise;
      } catch {
        // Ignore cancellation when user changes page/scale quickly
      } finally {
        if (renderTaskRef.current === renderTask) {
          renderTaskRef.current = null;
        }
      }
    },
    [pdfDoc, scale]
  );

  useEffect(() => {
    if (useContinuous) return;
    if (pdfDoc && currentPage >= 1) {
      renderPage(currentPage);
    }
    return () => {
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [useContinuous, pdfDoc, currentPage, renderPage]);

  const pagePlacements = placements
    .map((p, i) => ({ placement: p, globalIndex: i }))
    .filter(({ placement }) => placement.page === currentPage);
  const pageWidth = pageDimensions?.width ?? 0;
  const pageHeight = pageDimensions?.height ?? 0;
  const safeTotalPages = Math.max(
    pdfDoc?.numPages ?? 0,
    totalPages,
    1
  );
  const isLastPage = currentPage === safeTotalPages;
  const isFirstPage = currentPage <= 1;

  const goFirst = () => {
    if (useContinuous) scrollToPageNum(1);
    else onPageChange(1);
  };
  const goPrev = () => {
    const n = Math.max(1, currentPage - 1);
    if (useContinuous) scrollToPageNum(n);
    else onPageChange(n);
  };
  const goNext = () => {
    const n = Math.min(safeTotalPages, currentPage + 1);
    if (useContinuous) scrollToPageNum(n);
    else onPageChange(n);
  };
  const goLast = () => {
    if (useContinuous) scrollToPageNum(safeTotalPages);
    else onPageChange(safeTotalPages);
  };

  const handleDragStop = useCallback(
    (globalIndex: number) => (x: number, y: number) => {
      const p = placements[globalIndex];
      if (!p) return;
      onPlacementUpdate(
        globalIndex,
        pageWidth,
        pageHeight,
        x,
        y,
        p.wPct * pageWidth,
        p.hPct * pageHeight
      );
    },
    [placements, pageWidth, pageHeight, onPlacementUpdate]
  );

  const handleResizeStop = useCallback(
    (globalIndex: number) => (x: number, y: number, w: number, h: number) => {
      onPlacementUpdate(globalIndex, pageWidth, pageHeight, x, y, w, h);
    },
    [pageWidth, pageHeight, onPlacementUpdate]
  );

  if (!file && !pdfUrl) {
    return (
      <div className="flex size-full items-center justify-center rounded-md border border-border bg-muted/30">
        <p className="text-sm text-muted-foreground">Chọn file PDF để xem</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-muted/30">
      <div className="flex items-center justify-end gap-2 border-b border-border bg-background/80 px-4 py-2">
        <div className="flex shrink-0 items-center gap-0.5 rounded-full border border-border bg-muted/50 p-0.5">
          <button
            type="button"
            onClick={() => onScaleChange(Math.max(0.5, scale - 0.25))}
            className="rounded-full px-2.5 py-1 text-sm transition-colors hover:bg-accent"
            aria-label="Thu nhỏ"
          >
            −
          </button>
          <span className="min-w-[3rem] text-center text-sm tabular-nums text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => onScaleChange(Math.min(2, scale + 0.25))}
            className="rounded-full px-2.5 py-1 text-sm transition-colors hover:bg-accent"
            aria-label="Phóng to"
          >
            +
          </button>
        </div>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={scrollContainerRef}
          onScroll={handleScrollContainerScroll}
          className="flex min-h-0 flex-1 cursor-default flex-col items-stretch overflow-auto"
        >
          {useContinuous && pdfDoc ? (
            <div className="flex flex-col items-center px-4 pb-28 pt-6 sm:pb-32">
              <p className="mb-4 max-w-xl text-center text-xs text-muted-foreground">
                Cuộn để xem từng trang (tải khi đến gần). Số trang cập nhật theo vị trí
                cuộn; dùng thanh dưới để nhảy trang nhanh.
              </p>
              {Array.from({ length: safeTotalPages }, (_, i) => (
                <PdfScrollPage
                  key={i + 1}
                  pageNum={i + 1}
                  pdfDoc={pdfDoc}
                  scale={scale}
                  scrollRootRef={scrollContainerRef}
                  readOnly={readOnly}
                  placements={placements}
                  onPlacementUpdate={onPlacementUpdate}
                  selectedTemplateId={selectedTemplateId}
                  sealImageBase64={sealImageBase64}
                  signatureChrome={signatureChrome}
                />
              ))}
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 justify-center p-6 pb-28 sm:pb-32">
              <div
                className="relative inline-block min-w-fit rounded-md border border-border bg-white shadow-lg dark:bg-zinc-900"
                ref={containerRef}
              >
                <canvas ref={canvasRef} className="block rounded-md" />
                {!readOnly && pageWidth > 0 && pageHeight > 0 && (
                  <div
                    className="absolute left-0 top-0 size-full"
                    style={{ width: pageWidth, height: pageHeight }}
                  >
                    {pagePlacements.map(({ placement, globalIndex }) => (
                      <SignatureBox
                        key={`${placement.page}-${globalIndex}`}
                        placement={placement}
                        pageWidth={pageWidth}
                        pageHeight={pageHeight}
                        scale={1}
                        templateId={selectedTemplateId}
                        sealImageBase64={sealImageBase64}
                        onDragStop={handleDragStop(globalIndex)}
                        onResizeStop={handleResizeStop(globalIndex)}
                        chrome={signatureChrome}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center pb-4 pt-14 sm:pb-5 sm:pt-16">
          <div
            className="pointer-events-auto flex items-center gap-4 rounded-full border border-white/20 bg-slate-900/95 px-4 py-2.5 text-xs font-bold tracking-widest text-white shadow-2xl backdrop-blur-md ring-1 ring-white/20 sm:gap-6 sm:px-6 sm:py-3"
            role="toolbar"
            aria-label="Chuyển trang"
          >
            <button
              type="button"
              onClick={goFirst}
              disabled={isFirstPage}
              className="text-white transition-colors hover:text-sky-400 disabled:pointer-events-none disabled:opacity-35"
              aria-label="Trang đầu"
            >
              <ChevronsLeft className="size-5 sm:size-6" strokeWidth={2} />
            </button>
            <div className="flex items-center gap-2 sm:gap-3">
              <button
                type="button"
                onClick={goPrev}
                disabled={isFirstPage}
                className="flex size-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-35"
                aria-label="Trang trước"
              >
                <ChevronLeft className="size-5" strokeWidth={2} />
              </button>
              <span className="min-w-[7.5rem] text-center tabular-nums sm:min-w-[9rem]">
                TRANG {currentPage} / {safeTotalPages}
              </span>
              <button
                type="button"
                onClick={goNext}
                disabled={isLastPage}
                className="flex size-8 items-center justify-center rounded-full text-white transition-colors hover:bg-white/10 disabled:pointer-events-none disabled:opacity-35"
                aria-label="Trang sau"
              >
                <ChevronRight className="size-5" strokeWidth={2} />
              </button>
            </div>
            <button
              type="button"
              onClick={goLast}
              disabled={isLastPage || safeTotalPages <= 1}
              className="text-white transition-colors hover:text-sky-400 disabled:pointer-events-none disabled:opacity-35"
              aria-label="Trang cuối"
            >
              <ChevronsRight className="size-5 sm:size-6" strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
