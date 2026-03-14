"use client";

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

interface SignatureTemplateSelectorProps {
  templates: SignatureTemplate[];
  selectedId: string;
  onSelect: (id: string) => void;
  className?: string;
}

export function SignatureTemplateSelector({
  templates,
  selectedId,
  onSelect,
  className,
}: SignatureTemplateSelectorProps) {
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
    </div>
  );
}
