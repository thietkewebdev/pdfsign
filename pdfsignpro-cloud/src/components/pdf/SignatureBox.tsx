"use client";

import { Rnd } from "react-rnd";
import { cn } from "@/lib/utils";
import type { SignaturePlacement } from "@/lib/types";
import { SignatureStamp } from "@/components/marketing/SignatureStamp";

interface SignatureBoxProps {
  placement: SignaturePlacement;
  pageWidth: number;
  pageHeight: number;
  scale: number;
  templateId?: string;
  onDragStop: (x: number, y: number) => void;
  onResizeStop: (x: number, y: number, w: number, h: number) => void;
  isActive?: boolean;
}

function TemplatePreview({ templateId, className }: { templateId: string; className?: string }) {
  const isStamp = templateId === "stamp" || templateId === "valid";

  if (isStamp) {
    return (
      <SignatureStamp
        companyName="Công ty ABC"
        signedAt="10/12/2026 14:30"
        variant="light"
        className={cn("w-full h-full min-w-0 min-h-0 object-contain", className)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-0.5 text-center px-1 overflow-hidden",
        className
      )}
    >
      <span className="text-[9px] font-medium text-foreground leading-tight truncate w-full">
        {templateId === "minimal" ? "Nguyễn Văn A" : "Nguyễn Văn A"}
      </span>
      {(templateId === "classic" || templateId === "modern") && (
        <span className="text-[8px] text-muted-foreground truncate w-full">
          {templateId === "classic" ? "10/12/2026 14:30" : "Giám đốc"}
        </span>
      )}
    </div>
  );
}

export function SignatureBox({
  placement,
  pageWidth,
  pageHeight,
  scale,
  templateId = "classic",
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
        "rounded border-2 border-dashed border-primary/60 bg-primary/5 overflow-hidden",
        "flex items-center justify-center p-1",
        isActive && "cursor-move"
      )}
      style={{ zIndex: isActive ? 10 : 1 }}
    >
      <div className="w-full h-full min-w-0 min-h-0 flex items-center justify-center pointer-events-none">
        <TemplatePreview templateId={templateId} className="max-w-full max-h-full" />
      </div>
    </Rnd>
  );
}
