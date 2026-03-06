"use client";

import { useState, useCallback, useEffect } from "react";
import type { SignaturePlacement } from "@/lib/types";
import { DEFAULT_PLACEMENT } from "@/lib/types";

const SNAP_GRID = 8;

function snap(v: number) {
  return Math.round(v / SNAP_GRID) * SNAP_GRID;
}

function clampPct(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function useSignaturePlacement(totalPages: number) {
  const [placements, setPlacements] = useState<SignaturePlacement[]>([]);
  const [defaultPlacementEnabled, setDefaultPlacementEnabled] = useState(true);

  const createDefaultPlacement = useCallback(
    (page: number): SignaturePlacement => ({
      page,
      ...DEFAULT_PLACEMENT,
    }),
    []
  );

  useEffect(() => {
    if (totalPages > 0 && placements.length === 0 && defaultPlacementEnabled) {
      const lastPage = totalPages;
      setPlacements([createDefaultPlacement(lastPage)]);
    }
  }, [totalPages, defaultPlacementEnabled, placements.length, createDefaultPlacement]);

  const toggleDefaultPlacement = useCallback(() => {
    setDefaultPlacementEnabled((prev) => {
      const next = !prev;
      if (next && totalPages > 0 && placements.length === 0) {
        setPlacements([createDefaultPlacement(totalPages)]);
      }
      if (!next && placements.length > 0) {
        setPlacements([]);
      }
      return next;
    });
  }, [totalPages, placements.length, createDefaultPlacement]);

  const addSignatureBox = useCallback(() => {
    if (totalPages === 0) return;
    const lastPage = totalPages;
    setPlacements((prev) => [...prev, createDefaultPlacement(lastPage)]);
  }, [totalPages, createDefaultPlacement]);

  const updatePlacement = useCallback(
    (index: number, update: Partial<SignaturePlacement>) => {
      setPlacements((prev) =>
        prev.map((p, i) => {
          if (i !== index) return p;
          const next = { ...p, ...update };
          next.page = Math.max(1, Math.min(totalPages, Math.round(next.page)));
          next.xPct = clampPct(next.xPct);
          next.yPct = clampPct(next.yPct);
          next.wPct = Math.max(0.05, Math.min(0.5, next.wPct));
          next.hPct = Math.max(0.03, Math.min(0.3, next.hPct));
          return next;
        })
      );
    },
    [totalPages]
  );

  const updatePlacementFromPixels = useCallback(
    (
      index: number,
      pageWidth: number,
      pageHeight: number,
      x: number,
      y: number,
      w: number,
      h: number
    ) => {
      const xPct = clampPct(x / pageWidth);
      const yPct = clampPct(y / pageHeight);
      const wPct = clampPct(w / pageWidth);
      const hPct = clampPct(h / pageHeight);
      setPlacements((prev) =>
        prev.map((p, i) =>
          i === index ? { ...p, xPct, yPct, wPct, hPct } : p
        )
      );
    },
    []
  );

  const removePlacement = useCallback((index: number) => {
    setPlacements((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    placements,
    defaultPlacementEnabled,
    toggleDefaultPlacement,
    addSignatureBox,
    updatePlacement,
    updatePlacementFromPixels,
    removePlacement,
    setPlacements,
  };
}
