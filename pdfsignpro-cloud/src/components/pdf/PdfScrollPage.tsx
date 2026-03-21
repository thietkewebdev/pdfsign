"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { SignatureBox } from "./SignatureBox";
import type { SignaturePlacement } from "@/lib/types";

type PdfDoc = PDFDocumentProxy;

interface PdfScrollPageProps {
  pageNum: number;
  pdfDoc: PdfDoc;
  scale: number;
  scrollRootRef: React.RefObject<HTMLDivElement | null>;
  readOnly: boolean;
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
  selectedTemplateId: string;
  sealImageBase64: string | null;
}

export function PdfScrollPage({
  pageNum,
  pdfDoc,
  scale,
  scrollRootRef,
  readOnly,
  placements,
  onPlacementUpdate,
  selectedTemplateId,
  sealImageBase64,
}: PdfScrollPageProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<{ cancel: () => void } | null>(null);
  const [shouldDraw, setShouldDraw] = useState(false);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const root = scrollRootRef.current;
    const el = wrapRef.current;
    if (!root || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setShouldDraw(true);
      },
      { root, rootMargin: "400px 0px 80px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [scrollRootRef]);

  useEffect(() => {
    if (!shouldDraw || !pdfDoc || !canvasRef.current) return;
    let cancelled = false;

    const draw = async () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
      const page = await pdfDoc.getPage(pageNum);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      setDims({ w: viewport.width, h: viewport.height });

      const renderTask = page.render({
        canvasContext: ctx,
        canvas,
        viewport,
      });
      renderTaskRef.current = renderTask;
      try {
        await renderTask.promise;
      } catch {
        /* cancelled */
      } finally {
        if (renderTaskRef.current === renderTask) {
          renderTaskRef.current = null;
        }
      }
    };

    void draw();
    return () => {
      cancelled = true;
      if (renderTaskRef.current) {
        renderTaskRef.current.cancel();
        renderTaskRef.current = null;
      }
    };
  }, [shouldDraw, pdfDoc, pageNum, scale]);

  const pagePlacements = placements
    .map((p, i) => ({ placement: p, globalIndex: i }))
    .filter(({ placement }) => placement.page === pageNum);

  const pageWidth = dims?.w ?? 0;
  const pageHeight = dims?.h ?? 0;

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

  return (
    <div
      ref={wrapRef}
      data-pdf-page={pageNum}
      className="relative mx-auto mb-8 scroll-mt-20 rounded-md border border-border bg-white shadow-lg dark:bg-zinc-900"
    >
      <div className="absolute left-2 top-2 z-10 rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-sm border border-border">
        Trang {pageNum}
      </div>
      {!shouldDraw && (
        <div
          className="flex min-h-[420px] w-[min(100%,595px)] items-center justify-center bg-muted/40"
          aria-hidden
        >
          <span className="text-sm text-muted-foreground">Cuộn để tải trang…</span>
        </div>
      )}
      <div className={`relative inline-block ${!shouldDraw ? "hidden" : ""}`}>
        <canvas ref={canvasRef} className="block rounded-md" />
        {shouldDraw && !readOnly && pageWidth > 0 && pageHeight > 0 && (
          <div
            className="absolute left-0 top-0"
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
  );
}
