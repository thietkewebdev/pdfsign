"use client";

import { useRef, useState, useEffect } from "react";
import { useReducedMotion } from "motion/react";
import { HeroDocumentMock } from "./HeroDocumentMock";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const PARALLAX_FACTOR = 0.015;

/** Hero right side: document mock + depth cards + subtle parallax */
export function HeroIllustration() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const reduceMotion = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  useEffect(() => {
    if (reduceMotion) return;

    const el = containerRef.current;
    if (!el) return;

    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const x = (e.clientX - centerX) * PARALLAX_FACTOR;
      const y = (e.clientY - centerY) * PARALLAX_FACTOR;
      setOffset({ x, y });
    };

    const handleLeave = () => setOffset({ x: 0, y: 0 });

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseleave", handleLeave);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", handleLeave);
    };
  }, [reduceMotion]);

  return (
    <div
      ref={containerRef}
      className="relative flex min-h-[260px] items-center justify-center lg:min-h-[320px]"
    >
      {/* Depth cards — blurred, low opacity, behind main card */}
      <div
        className="absolute left-1/2 top-1/2 h-[180px] w-[200px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border backdrop-blur-xl sm:h-[200px] sm:w-[220px]"
        style={{
          transform: `translate(calc(-50% - 12px + ${offset.x * 0.5}px), calc(-50% - 8px + ${offset.y * 0.5}px))`,
          ...(isDark
            ? {
                borderColor: "rgba(255,255,255,0.06)",
                backgroundColor: "rgba(255,255,255,0.03)",
              }
            : {
                borderColor: "rgba(0,0,0,0.06)",
                backgroundColor: "rgba(255,255,255,0.5)",
              }),
        }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-[160px] w-[180px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border backdrop-blur-xl sm:h-[180px] sm:w-[200px]"
        style={{
          transform: `translate(calc(-50% - 6px + ${offset.x * 0.3}px), calc(-50% - 4px + ${offset.y * 0.3}px))`,
          ...(isDark
            ? {
                borderColor: "rgba(255,255,255,0.08)",
                backgroundColor: "rgba(255,255,255,0.04)",
              }
            : {
                borderColor: "rgba(0,0,0,0.08)",
                backgroundColor: "rgba(255,255,255,0.6)",
              }),
        }}
      />

      {/* Main document mock */}
      <div
        className="relative z-10"
        style={{
          transform: reduceMotion ? undefined : `translate(${offset.x}px, ${offset.y}px)`,
        }}
      >
        <HeroDocumentMock className="w-[280px] sm:w-[320px]" />
      </div>
    </div>
  );
}
