"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { SignatureBox } from "./SignatureBox";
import type { SignaturePlacement } from "@/lib/types";

// Worker for pdf.js (use CDN for Next.js compatibility)
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
}

interface PdfViewerProps {
  file: File | null;
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
}

export function PdfViewer({
  file,
  currentPage,
  onPageChange,
  scale,
  onScaleChange,
  totalPages,
  onTotalPagesChange,
  placements,
  onPlacementUpdate,
  activePageForPlacement,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pageDimensions, setPageDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  useEffect(() => {
    if (!file) return;
    const loadPdf = async () => {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      setPdfDoc(pdf);
      onTotalPagesChange(pdf.numPages);
    };
    loadPdf();
    return () => setPdfDoc(null);
  }, [file, onTotalPagesChange]);

  const renderPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDoc || !canvasRef.current) return;
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
      await page.render(renderContext).promise;
    },
    [pdfDoc, scale]
  );

  useEffect(() => {
    if (pdfDoc && currentPage >= 1) {
      renderPage(currentPage);
    }
  }, [pdfDoc, currentPage, renderPage]);

  const pagePlacements = placements
    .map((p, i) => ({ placement: p, globalIndex: i }))
    .filter(({ placement }) => placement.page === currentPage);
  const pageWidth = pageDimensions?.width ?? 0;
  const pageHeight = pageDimensions?.height ?? 0;

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

  if (!file) {
    return (
      <div className="flex size-full items-center justify-center rounded-lg border border-border bg-muted/20">
        <p className="text-muted-foreground">Chọn file PDF để xem</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col size-full">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage <= 1}
            className="rounded border border-border px-2 py-1 text-sm hover:bg-accent disabled:opacity-50"
          >
            ←
          </button>
          <span className="text-sm text-muted-foreground">
            Trang {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage >= totalPages}
            className="rounded border border-border px-2 py-1 text-sm hover:bg-accent disabled:opacity-50"
          >
            →
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onScaleChange(Math.max(0.5, scale - 0.25))}
            className="rounded border border-border px-2 py-1 text-sm hover:bg-accent"
          >
            −
          </button>
          <span className="text-sm text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <button
            type="button"
            onClick={() => onScaleChange(Math.min(2, scale + 0.25))}
            className="rounded border border-border px-2 py-1 text-sm hover:bg-accent"
          >
            +
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <div className="relative inline-block" ref={containerRef}>
          <canvas ref={canvasRef} className="block" />
          {pageWidth > 0 && pageHeight > 0 && (
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
                  onDragStop={handleDragStop(globalIndex)}
                  onResizeStop={handleResizeStop(globalIndex)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
