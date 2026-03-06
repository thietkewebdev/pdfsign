"use client";

import { Rnd } from "react-rnd";
import { cn } from "@/lib/utils";
import type { SignaturePlacement } from "@/lib/types";

interface SignatureBoxProps {
  placement: SignaturePlacement;
  pageWidth: number;
  pageHeight: number;
  scale: number;
  onDragStop: (x: number, y: number) => void;
  onResizeStop: (x: number, y: number, w: number, h: number) => void;
  isActive?: boolean;
}

export function SignatureBox({
  placement,
  pageWidth,
  pageHeight,
  scale,
  onDragStop,
  onResizeStop,
  isActive = true,
}: SignatureBoxProps) {
  const x = placement.xPct * pageWidth;
  const y = placement.yPct * pageHeight;
  const w = placement.wPct * pageWidth;
  const h = placement.hPct * pageHeight;

  return (
    <Rnd
      size={{ width: w, height: h }}
      position={{ x, y }}
      scale={scale}
      onDragStop={(_e, d) => onDragStop(d.x, d.y)}
      onResizeStop={(_e, _d, ref, _delta, pos) =>
        onResizeStop(pos.x, pos.y, ref.offsetWidth, ref.offsetHeight)
      }
      bounds="parent"
      enableResizing={isActive}
      disableDragging={!isActive}
      resizeGrid={[8, 8]}
      dragGrid={[8, 8]}
      className={cn(
        "rounded border-2 border-dashed border-primary/60 bg-primary/5",
        "flex items-center justify-center",
        isActive && "cursor-move"
      )}
      style={{ zIndex: isActive ? 10 : 1 }}
    >
      <span className="text-[10px] text-muted-foreground pointer-events-none">
        Chữ ký
      </span>
    </Rnd>
  );
}
