"use client";

import * as m from "motion/react-m";
import { useReducedMotion } from "motion/react";
import { FileText } from "lucide-react";
import { SignatureStamp } from "@/components/marketing/SignatureStamp";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const MOTION = { duration: 0.2, ease: [0, 0, 0.2, 1] as const };

/** Glassy document card mock for hero — works in dark and light modes */
export function HeroDocumentMock({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <m.div
      className={cn(
        "relative overflow-hidden rounded-2xl border backdrop-blur-xl",
        "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]",
        isDark
          ? "border-white/10 bg-white/[0.06] shadow-xl shadow-black/20"
          : "border-zinc-200/80 bg-white/80 shadow-lg shadow-zinc-900/5",
        className
      )}
      initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...MOTION, delay: 0.15 }}
    >
      {/* Fake document content */}
      <div className="relative flex h-[200px] flex-col gap-3 p-4 sm:h-[240px] sm:p-5">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex size-8 items-center justify-center rounded-lg",
              isDark ? "bg-white/10" : "bg-zinc-100"
            )}
          >
            <FileText
              className={cn("size-4", isDark ? "text-zinc-400" : "text-zinc-500")}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div
              className={cn(
                "h-3 w-24 rounded",
                isDark ? "bg-white/20" : "bg-zinc-200/80"
              )}
            />
            <div
              className={cn(
                "h-2 w-16 rounded",
                isDark ? "bg-white/10" : "bg-zinc-100"
              )}
            />
          </div>
        </div>
        <div className="flex-1 space-y-2">
          <div
            className={cn(
              "h-2 w-full rounded",
              isDark ? "bg-white/10" : "bg-zinc-100"
            )}
          />
          <div
            className={cn(
              "h-2 w-[90%] rounded",
              isDark ? "bg-white/10" : "bg-zinc-100"
            )}
          />
          <div
            className={cn(
              "h-2 w-[75%] rounded",
              isDark ? "bg-white/10" : "bg-zinc-100"
            )}
          />
        </div>

        {/* Signature stamp pill at bottom */}
        <div
          className="absolute bottom-3 right-3 w-[140px] sm:bottom-4 sm:right-4 sm:w-[160px]"
          style={{
            transform: "rotate(-2deg)",
            filter: isDark
              ? "drop-shadow(0 2px 4px rgba(0,0,0,0.2))"
              : "drop-shadow(0 1px 2px rgba(0,0,0,0.08))",
          }}
        >
          <SignatureStamp
            companyName="Công ty TNHH ABC"
            signedAt="12/10/2026 14:30"
            variant={isDark ? "dark" : "light"}
            className="w-full h-auto"
          />
        </div>
      </div>
    </m.div>
  );
}
