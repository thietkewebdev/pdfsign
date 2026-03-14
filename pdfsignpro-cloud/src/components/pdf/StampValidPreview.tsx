"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import {
  STAMP_VALID_CONFIG,
  computeStampValidLayout,
} from "@/lib/stamp-valid-config";

interface StampValidPreviewProps {
  variant: "stamp" | "valid";
  companyName?: string;
  signedAt?: string;
  boxWidth: number;
  boxHeight: number;
  className?: string;
}

export function StampValidPreview({
  variant,
  companyName = "Công ty ABC",
  signedAt = "14/03/2026 09:33:58",
  boxWidth,
  boxHeight,
  className,
}: StampValidPreviewProps) {
  const { iconSize, textMaxWidth, textMaxHeight, titleSize, contentSize, lineHeight } =
    useMemo(
      () => computeStampValidLayout(boxWidth, boxHeight),
      [boxWidth, boxHeight]
    );

  const title =
    variant === "valid"
      ? STAMP_VALID_CONFIG.TITLE_VALID
      : STAMP_VALID_CONFIG.TITLE_STAMP;

  return (
    <div
      className={cn(
        "flex items-stretch overflow-hidden rounded",
        variant === "valid"
          ? "bg-emerald-50/90 dark:bg-emerald-950/40 border border-emerald-500/50"
          : "bg-white/90 dark:bg-zinc-800/90 border border-emerald-500/30",
        className
      )}
      style={{
        padding: STAMP_VALID_CONFIG.PADDING,
        gap: STAMP_VALID_CONFIG.GAP,
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
      }}
    >
      {/* Icon tick - left */}
      <div
        className="shrink-0 flex items-center justify-center rounded-full bg-emerald-500/20"
        style={{ width: iconSize, height: iconSize, minWidth: iconSize }}
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="text-emerald-600 dark:text-emerald-400"
          style={{ width: iconSize * 0.6, height: iconSize * 0.6 }}
        >
          <path
            d="M5 13l4 4L19 7"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      {/* Text - right, clipped, wrap */}
      <div
        className="flex flex-col justify-center min-w-0 overflow-hidden shrink"
        style={{
          maxWidth: Math.max(0, textMaxWidth),
          maxHeight: textMaxHeight,
          gap: 2,
        }}
      >
        <div
          className="font-semibold text-red-600 dark:text-red-400 truncate"
          style={{ fontSize: titleSize, lineHeight }}
        >
          {title}
        </div>
        <div
          className="text-muted-foreground"
          style={{
            fontSize: contentSize,
            lineHeight,
            whiteSpace: "normal",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          Ký bởi: {companyName}
        </div>
        <div
          className="text-muted-foreground"
          style={{
            fontSize: contentSize,
            lineHeight,
            whiteSpace: "normal",
            overflowWrap: "anywhere",
            wordBreak: "break-word",
          }}
        >
          Thời gian: {signedAt}
        </div>
      </div>
    </div>
  );
}
