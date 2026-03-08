"use client";

import * as m from "motion/react-m";
import { useReducedMotion } from "motion/react";
import { FeatureMockCard } from "./FeatureMockCard";
import { cn } from "@/lib/utils";

const MOTION = { duration: 0.2, ease: [0, 0, 0.2, 1] as const };

const CARDS = [
  {
    title: "Tải lên PDF",
    subtitle: "Kéo thả hoặc chọn file từ máy",
    variantType: "upload" as const,
  },
  {
    title: "Đặt vị trí chữ ký",
    subtitle: "Chọn vị trí ô ký trên tài liệu",
    variantType: "place" as const,
  },
  {
    title: "Ký số",
    subtitle: "USB Token, chữ ký chuẩn PAdES",
    variantType: "signed" as const,
  },
  {
    title: "Chia sẻ",
    subtitle: "Liên kết an toàn, tải PDF đã ký",
    variantType: "share" as const,
  },
] as const;

export function FeatureMockStrip({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className={cn(
        "overflow-x-auto overflow-y-hidden pb-2 -mx-6 px-6 md:mx-0 md:px-0",
        "snap-x snap-mandatory md:snap-none",
        "[scrollbar-width:thin]",
        className
      )}
    >
      <div className="flex gap-4 md:grid md:grid-cols-4 md:gap-4 md:max-w-6xl md:mx-auto">
        {CARDS.map((card, i) => (
          <m.div
            key={card.variantType}
            className={cn(
              "shrink-0 snap-center md:shrink",
              "min-w-[200px] max-w-[240px] md:min-w-0 md:max-w-none"
            )}
            whileHover={
              reduceMotion ? undefined : { y: -2, transition: MOTION }
            }
          >
            <FeatureMockCard
              title={card.title}
              subtitle={card.subtitle}
              variantType={card.variantType}
            />
          </m.div>
        ))}
      </div>
    </div>
  );
}
