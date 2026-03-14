"use client";

import { Rnd } from "react-rnd";
import { cn } from "@/lib/utils";
import type { SignaturePlacement } from "@/lib/types";
import { StampValidPreview } from "./StampValidPreview";

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

function ClassicPreview({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 px-2 overflow-hidden w-full h-full",
        "border-b-2 border-foreground/30 pb-1",
        className
      )}
    >
      <span className="text-xs font-semibold text-foreground leading-tight truncate w-full text-center">
        Nguyễn Văn A
      </span>
      <span className="text-[9px] text-muted-foreground truncate w-full text-center">
        10/12/2026 14:30
      </span>
    </div>
  );
}

function ModernPreview({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-1 px-2 py-1.5 overflow-hidden rounded-md w-full h-full",
        "bg-muted/60 dark:bg-muted/40"
      )}
    >
      <span className="text-xs font-medium text-foreground leading-tight truncate w-full text-center">
        Nguyễn Văn A
      </span>
      <span className="text-[9px] text-muted-foreground truncate w-full text-center">
        Giám đốc
      </span>
    </div>
  );
}

function MinimalPreview({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center px-2 overflow-hidden w-full h-full",
        className
      )}
    >
      <span className="text-sm font-semibold text-foreground truncate w-full text-center">
        Nguyễn Văn A
      </span>
    </div>
  );
}

function TemplatePreview({
  templateId,
  boxWidth,
  boxHeight,
  className,
}: {
  templateId: string;
  boxWidth: number;
  boxHeight: number;
  className?: string;
}) {
  if (templateId === "stamp") {
    return (
      <StampValidPreview
        variant="stamp"
        companyName="Công ty TNHH Cổ phần Xây dựng và Thương mại Việt Nam"
        signedAt="14/03/2026 09:33:58"
        boxWidth={boxWidth}
        boxHeight={boxHeight}
        className={cn("w-full h-full", className)}
      />
    );
  }
  if (templateId === "valid") {
    return (
      <StampValidPreview
        variant="valid"
        companyName="Công ty TNHH Cổ phần Xây dựng và Thương mại Việt Nam"
        signedAt="14/03/2026 09:33:58"
        boxWidth={boxWidth}
        boxHeight={boxHeight}
        className={cn("w-full h-full", className)}
      />
    );
  }
  if (templateId === "classic") {
    return <ClassicPreview className={className} />;
  }
  if (templateId === "modern") {
    return <ModernPreview className={className} />;
  }
  if (templateId === "minimal") {
    return <MinimalPreview className={className} />;
  }
  return <ClassicPreview className={className} />;
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
      <div className="w-full h-full min-w-0 min-h-0 flex items-center justify-center pointer-events-none overflow-hidden">
        <TemplatePreview
          templateId={templateId}
          boxWidth={w}
          boxHeight={h}
          className="max-w-full max-h-full"
        />
      </div>
    </Rnd>
  );
}
