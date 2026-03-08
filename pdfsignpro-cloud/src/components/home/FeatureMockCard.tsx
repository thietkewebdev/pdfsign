"use client";

import { FileUp, Link2, Check } from "lucide-react";
import { SignatureStamp } from "@/components/marketing/SignatureStamp";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

export type FeatureMockVariant = "upload" | "place" | "signed" | "share";

export interface FeatureMockCardProps {
  title: string;
  subtitle: string;
  variantType: FeatureMockVariant;
  className?: string;
}

function MiniIllustration({
  variant,
  isDark,
}: {
  variant: FeatureMockVariant;
  isDark: boolean;
}) {
  const base = isDark ? "bg-white/10" : "bg-zinc-200/80";
  const accent = isDark ? "border-white/20" : "border-zinc-300";

  if (variant === "upload") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex size-8 items-center justify-center rounded-lg",
              base
            )}
          >
            <FileUp className={cn("size-4", isDark ? "text-zinc-400" : "text-zinc-500")} />
          </div>
          <span className={cn("text-xs", isDark ? "text-zinc-500" : "text-zinc-500")}>
            hop-dong.pdf
          </span>
        </div>
        <div
          className={cn(
            "h-1.5 w-full overflow-hidden rounded-full",
            isDark ? "bg-white/10" : "bg-zinc-200"
          )}
        >
          <div
            className={cn(
              "h-full w-[65%] rounded-full",
              isDark ? "bg-violet-500/60" : "bg-violet-500"
            )}
          />
        </div>
      </div>
    );
  }

  if (variant === "place") {
    return (
      <div
        className={cn(
          "flex aspect-[4/3] w-full flex-col gap-2 rounded-lg border p-2",
          base,
          accent
        )}
      >
        <div className={cn("h-1.5 w-[75%] rounded", base)} />
        <div className={cn("h-1.5 w-1/2 rounded", base)} />
        <div className="mt-auto flex justify-end">
          <div
            className={cn(
              "h-8 w-16 rounded border-2 border-dashed",
              isDark ? "border-violet-400/40" : "border-violet-500/50"
            )}
          />
        </div>
      </div>
    );
  }

  if (variant === "signed") {
    return (
      <div className="flex justify-center">
        <div className="w-[100px] scale-75 origin-center">
          <SignatureStamp
            companyName="Công ty ABC"
            signedAt="12/10/2026"
            variant={isDark ? "dark" : "light"}
            className="w-full h-auto"
          />
        </div>
      </div>
    );
  }

  if (variant === "share") {
    return (
      <div className="flex items-center gap-2">
        <div
          className={cn(
            "flex flex-1 items-center gap-1.5 rounded-full border px-2.5 py-1.5",
            base,
            accent
          )}
        >
          <Link2 className={cn("size-3.5 shrink-0", isDark ? "text-zinc-400" : "text-zinc-500")} />
          <span className={cn("truncate text-xs", isDark ? "text-zinc-400" : "text-zinc-600")}>
            pdfsignpro.cloud/d/abc123
          </span>
        </div>
        <div
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md",
            isDark ? "bg-emerald-500/20" : "bg-emerald-500/30"
          )}
        >
          <Check className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        </div>
      </div>
    );
  }

  return null;
}

export function FeatureMockCard({
  title,
  subtitle,
  variantType,
  className,
}: FeatureMockCardProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <div
      className={cn(
        "flex h-full min-h-[180px] min-w-[200px] max-w-[240px] flex-1 flex-col gap-3 rounded-xl border p-4 shadow-sm backdrop-blur-sm transition-shadow",
        "bg-gradient-to-br from-white/80 to-white/40 dark:from-white/[0.08] dark:to-white/[0.02]",
        "border-zinc-200/80 dark:border-white/10",
        "shadow-zinc-900/5 dark:shadow-black/20",
        "hover:shadow-md hover:shadow-zinc-900/10 dark:hover:shadow-xl dark:hover:shadow-black/30",
        className
      )}
    >
      <div className="flex min-h-0 flex-1 flex-col">
        <MiniIllustration variant={variantType} isDark={isDark} />
      </div>
      <div className="mt-auto shrink-0">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">
          {title}
        </h3>
        <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
          {subtitle}
        </p>
      </div>
    </div>
  );
}
