"use client";

import { Rnd } from "react-rnd";
import { CheckCircle2, History } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SignaturePlacement } from "@/lib/types";
import { StampValidPreview } from "./StampValidPreview";

export type SignatureBoxChrome = "default" | "stitch";

/** Xem trước kiểu Stitch kyso (chữ ký số USB Token + Digitally Signed By). */
function StitchValidPreview() {
  return (
    <div className="flex flex-col items-center gap-1 px-1 text-center">
      <p className="text-[9px] font-bold uppercase tracking-tighter text-slate-400 sm:text-[10px]">
        Digitally Signed By
      </p>
      <p className="text-sm font-black leading-tight tracking-tight text-primary sm:text-base">
        NGUYỄN VĂN A
      </p>
      <div className="flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5">
        <History className="size-3 shrink-0 text-primary" aria-hidden />
        <span className="text-[9px] font-mono font-bold text-primary tabular-nums">
          14/03/2026 09:33:05
        </span>
      </div>
    </div>
  );
}

function KySoPlaceholderPreview() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 text-center">
      <div className="leading-none text-[#ef3b62]">
        <div className="text-[24px] font-extrabold tracking-tight sm:text-[28px]">01</div>
        <div className="-mt-1 flex items-center justify-center">
          <span className="text-[24px] font-extrabold tracking-tight sm:text-[28px]">1C</span>
          <CheckCircle2 className="-ml-1 size-4 fill-current sm:size-5" aria-hidden />
        </div>
      </div>
      <p className="text-sm font-semibold text-[#4f5878] sm:text-base">Ký số</p>
    </div>
  );
}

interface SignatureBoxProps {
  placement: SignaturePlacement;
  pageWidth: number;
  pageHeight: number;
  scale: number;
  templateId?: string;
  sealImageBase64?: string | null;
  onDragStop: (x: number, y: number) => void;
  onResizeStop: (x: number, y: number, w: number, h: number) => void;
  isActive?: boolean;
  /** Trang ký /d/: khung giống Stitch (viền xanh, banner, bóng). */
  chrome?: SignatureBoxChrome;
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

function SealPreview({
  sealImageBase64,
  className,
}: {
  sealImageBase64?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 overflow-hidden w-full h-full",
        className
      )}
    >
      {sealImageBase64 ? (
        <img
          src={sealImageBase64}
          alt="Seal"
          className="h-full max-h-[90%] w-auto object-contain shrink-0"
        />
      ) : (
        <div className="size-10 rounded-full border-2 border-red-400 flex items-center justify-center shrink-0">
          <span className="text-[8px] text-red-400 font-bold">Dấu</span>
        </div>
      )}
      <div className="flex flex-col items-start justify-center min-w-0 flex-1">
        <span className="text-[10px] font-semibold text-red-600 leading-tight truncate w-full">
          CÔNG TY TNHH...
        </span>
        <span className="text-[8px] text-muted-foreground truncate w-full">
          14/03/2026 09:33
        </span>
      </div>
    </div>
  );
}

function TemplatePreview({
  templateId,
  boxWidth,
  boxHeight,
  sealImageBase64,
  className,
}: {
  templateId: string;
  boxWidth: number;
  boxHeight: number;
  sealImageBase64?: string | null;
  className?: string;
}) {
  if (templateId === "seal") {
    return <SealPreview sealImageBase64={sealImageBase64} className={className} />;
  }
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

export function SignatureBox({
  placement,
  pageWidth,
  pageHeight,
  scale,
  templateId = "valid",
  sealImageBase64,
  onDragStop,
  onResizeStop,
  isActive = true,
  chrome = "default",
}: SignatureBoxProps) {
  const x = placement.xPct * pageWidth;
  const y = placement.yPct * pageHeight;
  const w = placement.wPct * pageWidth;
  const h = placement.hPct * pageHeight;

  const isStitch = chrome === "stitch";
  const useKySoPlaceholder = templateId === "valid";

  const stitchBody =
    useKySoPlaceholder ? (
      <StitchValidPreview />
    ) : templateId === "seal" ? (
      <SealPreview sealImageBase64={sealImageBase64} className="max-h-full" />
    ) : (
      <TemplatePreview
        templateId={templateId}
        boxWidth={w}
        boxHeight={h}
        sealImageBase64={sealImageBase64}
        className="max-h-full max-w-full"
      />
    );

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
        isStitch
          ? useKySoPlaceholder
            ? "overflow-hidden rounded border border-[#ef3b62] bg-[#fcfcfd]"
            : "overflow-hidden rounded-xl border-2 border-primary bg-white shadow-2xl ring-[6px] ring-primary/10 transition-transform hover:scale-[1.01]"
          : useKySoPlaceholder
            ? "overflow-hidden rounded border border-[#ef3b62] bg-[#fcfcfd]"
            : "overflow-hidden rounded border-2 border-dashed border-primary/60 bg-primary/5",
        "flex flex-col",
        isActive && "cursor-move"
      )}
      style={{ zIndex: isActive ? 10 : 1 }}
    >
      {isStitch ? (
        useKySoPlaceholder ? (
          <div className="flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden p-1 pointer-events-none">
            <div className="flex h-full w-full items-center justify-center rounded-[2px] border border-dashed border-[#ef3b62]">
              <KySoPlaceholderPreview />
            </div>
          </div>
        ) : (
          <>
            <div className="pointer-events-none shrink-0 border-b border-primary/15 bg-primary py-1 text-center text-[8px] font-black uppercase tracking-widest text-white sm:text-[9px]">
              Chữ ký số USB Token
            </div>
            <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden p-1.5">
              <div className="pointer-events-none max-h-full max-w-full">{stitchBody}</div>
            </div>
          </>
        )
      ) : (
        <div className="flex h-full w-full min-h-0 min-w-0 items-center justify-center overflow-hidden p-1 pointer-events-none">
          {useKySoPlaceholder ? (
            <div className="flex h-full w-full items-center justify-center rounded-[2px] border border-dashed border-[#ef3b62]">
              <KySoPlaceholderPreview />
            </div>
          ) : (
            <TemplatePreview
              templateId={templateId}
              boxWidth={w}
              boxHeight={h}
              sealImageBase64={sealImageBase64}
              className="max-h-full max-w-full"
            />
          )}
        </div>
      )}
    </Rnd>
  );
}
