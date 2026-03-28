"use client";

import {
  useCallback,
  useState,
  useRef,
  forwardRef,
  useImperativeHandle,
} from "react";
import { FileUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type UploadDropzoneCardHandle = {
  /** Mở hộp thoại chọn file (PDF) */
  openFilePicker: () => void;
};

interface UploadDropzoneCardProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSize?: number;
  disabled?: boolean;
  className?: string;
  /** Dark hero variant | Stitch marketing hero */
  variant?: "default" | "dark" | "stitch";
}

export const UploadDropzoneCard = forwardRef<
  UploadDropzoneCardHandle,
  UploadDropzoneCardProps
>(function UploadDropzoneCard(
  {
    onFileSelect,
    accept = ".pdf,application/pdf",
    maxSize = 50 * 1024 * 1024, // 50MB
    disabled = false,
    className,
    variant = "default",
  },
  ref
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useImperativeHandle(ref, () => ({
    openFilePicker: () => {
      if (!disabled) inputRef.current?.click();
    },
  }));

  const validateAndEmit = useCallback(
    (file: File) => {
      setError(null);
      if (!file.type.includes("pdf")) {
        setError("Chỉ chấp nhận file PDF");
        return;
      }
      if (file.size > maxSize) {
        setError(`File không được vượt quá ${Math.round(maxSize / 1024 / 1024)}MB`);
        return;
      }
      onFileSelect(file);
    },
    [maxSize, onFileSelect]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (!disabled) setIsDragActive(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      if (disabled) return;
      const file = e.dataTransfer.files?.[0];
      if (file) validateAndEmit(file);
    },
    [disabled, validateAndEmit]
  );

  const isDark = variant === "dark";
  const isStitch = variant === "stitch";

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) validateAndEmit(file);
      e.target.value = "";
    },
    [validateAndEmit]
  );

  return (
    <label
      className={cn(
        "group relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-all duration-150",
        isStitch &&
          (isDragActive
            ? "border-stitch-primary-strong/50 bg-stitch-primary-fixed/40"
            : "border-stitch-outline/30 bg-white hover:border-stitch-primary/40 hover:bg-stitch-container-low/80"),
        !isStitch &&
          (isDragActive
            ? isDark
              ? "border-violet-400/50 bg-violet-500/10"
              : "border-primary bg-primary/5"
            : isDark
              ? "border-white/25 hover:border-white/40 hover:bg-white/5"
              : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"),
        disabled && "cursor-not-allowed opacity-60",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        disabled={disabled}
        className="sr-only"
      />
      <div
        className={cn(
          "flex size-14 items-center justify-center rounded-xl transition-colors",
          isStitch
            ? isDragActive
              ? "bg-stitch-primary-fixed"
              : "bg-stitch-primary-fixed"
            : isDragActive
              ? isDark
                ? "bg-violet-500/20"
                : "bg-primary/20"
              : isDark
                ? "bg-white/10"
                : "bg-muted"
        )}
      >
        <FileUp
          className={cn(
            "size-7",
            isStitch
              ? "text-stitch-primary-strong group-hover:text-stitch-primary"
              : isDark
                ? "text-zinc-400 group-hover:text-zinc-200"
                : "text-muted-foreground group-hover:text-foreground"
          )}
        />
      </div>
      <div className="space-y-1 text-center">
        <p
          className={cn(
            "text-sm font-medium",
            isStitch
              ? "text-stitch-on-surface"
              : isDark
                ? "text-zinc-200"
                : "text-foreground"
          )}
        >
          {isDragActive ? "Thả file vào đây" : "Kéo thả file PDF hoặc nhấn để chọn"}
        </p>
        <p
          className={cn(
            "text-xs",
            isStitch ? "text-stitch-muted" : isDark ? "text-zinc-500" : "text-muted-foreground"
          )}
        >
          Hỗ trợ file PDF, tối đa 50MB
        </p>
      </div>
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </label>
  );
});

UploadDropzoneCard.displayName = "UploadDropzoneCard";
