"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";
import type { SignatureTemplate } from "@/lib/signature-templates";

function GreenTickIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-emerald-600 dark:text-emerald-400", className)}
      aria-hidden
    >
      <path
        d="M5 13l4 4L19 7"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SealIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-red-600 dark:text-red-400", className)}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="12" r="5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

interface SignatureTemplateSelectorProps {
  templates: SignatureTemplate[];
  selectedId: string;
  onSelect: (id: string) => void;
  sealImageBase64?: string | null;
  onSealImageChange?: (base64: string | null) => void;
  className?: string;
}

export function SignatureTemplateSelector({
  templates,
  selectedId,
  onSelect,
  sealImageBase64,
  onSealImageChange,
  className,
}: SignatureTemplateSelectorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isSealSelected = selectedId === "seal";

  const handleSealFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onSealImageChange) return;
    if (!file.type.startsWith("image/")) {
      onSealImageChange(null);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      onSealImageChange(null);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onSealImageChange(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className={cn("space-y-2", className)}>
      <p className="text-xs font-medium text-muted-foreground">Mẫu chữ ký</p>
      <div className="flex flex-wrap gap-2">
        {templates.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onSelect(t.id)}
            className={cn(
              "flex flex-col items-start rounded-md border p-2.5 text-left transition-colors min-w-[88px] max-w-[100px]",
              "hover:border-primary/50 hover:bg-accent/30",
              selectedId === t.id
                ? "border-primary bg-primary/10 ring-1 ring-primary/20"
                : "border-border bg-card"
            )}
          >
            {t.showTick ? (
              <div className="flex items-center gap-1.5 w-full">
                <div className="size-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <GreenTickIcon className="size-3" />
                </div>
                <span className="text-xs font-semibold text-foreground truncate">
                  {t.displayName}
                </span>
              </div>
            ) : t.showSealUpload ? (
              <div className="flex items-center gap-1.5 w-full">
                <div className="size-5 rounded-full bg-red-500/20 flex items-center justify-center shrink-0">
                  <SealIcon className="size-3" />
                </div>
                <span className="text-xs font-semibold text-foreground truncate">
                  {t.displayName}
                </span>
              </div>
            ) : (
              <span className="text-xs font-semibold text-foreground">
                {t.displayName}
              </span>
            )}
            <span className="mt-1 text-[10px] text-muted-foreground line-clamp-2 break-words">
              {t.previewText}
            </span>
          </button>
        ))}
      </div>

      {isSealSelected && onSealImageChange && (
        <div className="space-y-2 pt-1">
          <p className="text-xs font-medium text-muted-foreground">
            Tải ảnh con dấu (PNG/JPG, tối đa 2MB)
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleSealFileChange}
            className="hidden"
          />
          {sealImageBase64 ? (
            <div className="flex items-center gap-2">
              <img
                src={sealImageBase64}
                alt="Con dấu"
                className="size-12 rounded border border-border object-contain bg-white"
              />
              <button
                type="button"
                onClick={() => {
                  onSealImageChange(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="text-xs text-destructive hover:underline"
              >
                Xóa
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              Chọn ảnh con dấu...
            </button>
          )}
        </div>
      )}
    </div>
  );
}
