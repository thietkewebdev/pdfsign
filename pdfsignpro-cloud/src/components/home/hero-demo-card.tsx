"use client";

import * as m from "motion/react-m";
import { useReducedMotion } from "motion/react";
import { FileText } from "lucide-react";
import { SignatureStamp } from "@/components/marketing/SignatureStamp";

const MOTION = { duration: 0.2, ease: [0, 0, 0.2, 1] as const };

/** Mini PDF preview mock + signature stamp — pure UI mock for hero */
export function HeroDemoCard() {
  const reduceMotion = useReducedMotion();
  return (
    <m.div
      className="relative overflow-hidden rounded-xl border border-white/10 bg-white/5 shadow-2xl shadow-black/20 backdrop-blur-sm"
      initial={{ opacity: 0, y: reduceMotion ? 0 : 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...MOTION, delay: 0.15 }}
    >
      {/* Fake PDF content */}
      <div className="relative flex h-[200px] flex-col gap-3 p-4 sm:h-[240px] sm:p-5">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-white/10">
            <FileText className="size-4 text-zinc-400" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="h-3 w-24 rounded bg-white/20" />
            <div className="mt-1 h-2 w-16 rounded bg-white/10" />
          </div>
        </div>
        <div className="flex-1 space-y-2">
          <div className="h-2 w-full rounded bg-white/10" />
          <div className="h-2 w-[90%] rounded bg-white/10" />
          <div className="h-2 w-[75%] rounded bg-white/10" />
          <div className="h-2 w-[85%] rounded bg-white/10" />
        </div>

        {/* Signature stamp overlay — like a real signed PDF */}
        <div
          className="absolute bottom-3 right-3 w-[140px] sm:bottom-4 sm:right-4 sm:w-[160px]"
          style={{
            transform: "rotate(-2deg)",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))",
          }}
        >
          <SignatureStamp
            companyName="Công ty TNHH ABC"
            signedAt="12/10/2026 14:30"
            variant="dark"
            className="w-full h-auto"
          />
        </div>
      </div>
    </m.div>
  );
}
