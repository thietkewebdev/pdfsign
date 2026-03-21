"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { Download, Monitor, Share2, MoreHorizontal, X } from "lucide-react";
import { SignatureBox } from "./SignatureBox";
import { PdfScrollPage } from "./PdfScrollPage";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  /** Toolbar actions - when provided, rendered in viewer toolbar */
  toolbarActions?: {
    downloadUrl: string;
    documentTitle: string;
    shareLink: string;
    onCopyShare: () => void;
  };
  /**
   * Stack pages vertically; each page renders when scrolled near viewport (pdfUrl only).
   */
  continuousScroll?: boolean;
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
  toolbarActions,
  continuousScroll = false,
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
    <div className="flex flex-col size-full bg-muted/30">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2 bg-background/80">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <button
            type="button"
            onClick={goPrev}
            disabled={currentPage <= 1}
            className="rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent disabled:opacity-50 transition-colors shrink-0"
          >
            ←
          </button>
          <div className="flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 shrink-0">
            <span className="text-[11px] font-medium uppercase tracking-wide text-primary/90">
              Trang hiện tại
            </span>
            <span className="rounded-md bg-primary px-2 py-0.5 text-xs font-bold tabular-nums text-primary-foreground">
              {currentPage}
            </span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="rounded-md bg-background px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground border border-border">
              {safeTotalPages}
            </span>
          </div>
          <button
            type="button"
            onClick={goLast}
            disabled={safeTotalPages <= 1 || isLastPage}
            className="rounded-md border border-amber-300/70 bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50 transition-colors shrink-0 dark:border-amber-700/60 dark:bg-amber-900/20 dark:text-amber-300 dark:hover:bg-amber-900/30"
          >
            Tới trang cuối: {safeTotalPages}
          </button>
          {isLastPage && (
            <span className="hidden sm:inline-flex rounded-md border border-emerald-300/70 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800 shrink-0 dark:border-emerald-700/70 dark:bg-emerald-900/20 dark:text-emerald-300">
              Bạn đang ở trang cuối
            </span>
          )}
          <button
            type="button"
            onClick={goNext}
            disabled={currentPage >= safeTotalPages}
            className="rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent disabled:opacity-50 transition-colors shrink-0"
          >
            →
          </button>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-0.5 rounded-full border border-border bg-muted/50 p-0.5">
            <button
              type="button"
              onClick={() => onScaleChange(Math.max(0.5, scale - 0.25))}
              className="rounded-full px-2.5 py-1 text-sm hover:bg-accent transition-colors"
              aria-label="Thu nhỏ"
            >
              −
            </button>
            <span className="min-w-[3rem] text-center text-sm text-muted-foreground tabular-nums">
              {Math.round(scale * 100)}%
            </span>
            <button
              type="button"
              onClick={() => onScaleChange(Math.min(2, scale + 0.25))}
              className="rounded-full px-2.5 py-1 text-sm hover:bg-accent transition-colors"
              aria-label="Phóng to"
            >
              +
            </button>
          </div>
          {toolbarActions && (
            <>
              <div className="hidden sm:flex items-center gap-1">
                <Button variant="ghost" size="sm" asChild className="text-muted-foreground hover:text-foreground h-8">
                  <a href="/api/signer/download">
                    <Monitor className="size-4" />
                    Tải Signer
                  </a>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toolbarActions.onCopyShare}
                  className="text-muted-foreground hover:text-foreground h-8"
                  aria-label="Chia sẻ"
                >
                  <Share2 className="size-4" />
                  Chia sẻ
                </Button>
                <Button variant="ghost" size="sm" asChild className="h-8">
                  <a href={toolbarActions.downloadUrl} download={toolbarActions.documentTitle}>
                    <Download className="size-4" />
                    Tải PDF
                  </a>
                </Button>
                <Button variant="ghost" size="icon" asChild aria-label="Đóng" className="h-8 text-muted-foreground hover:text-foreground">
                  <Link href="/">
                    <X className="size-4" />
                  </Link>
                </Button>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="sm:hidden h-8">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Hành động</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <a href="/api/signer/download">
                      <Monitor className="size-4" />
                      Tải Signer
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={toolbarActions.onCopyShare}>
                    <Share2 className="size-4" />
                    Chia sẻ
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <a href={toolbarActions.downloadUrl} download={toolbarActions.documentTitle}>
                      <Download className="size-4" />
                      Tải PDF
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem asChild>
                    <Link href="/">
                      <X className="size-4" />
                      Đóng
                    </Link>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>
      <div
        ref={scrollContainerRef}
        onScroll={handleScrollContainerScroll}
        className="flex min-h-0 flex-1 cursor-default flex-col items-stretch overflow-auto"
      >
        {useContinuous && pdfDoc ? (
          <div className="flex flex-col items-center px-4 py-6">
            <p className="mb-4 max-w-xl text-center text-xs text-muted-foreground">
              Cuộn để xem từng trang (tải khi đến gần). Số trang trên thanh công cụ theo
              vị trí cuộn.
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
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 justify-center p-6">
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
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
