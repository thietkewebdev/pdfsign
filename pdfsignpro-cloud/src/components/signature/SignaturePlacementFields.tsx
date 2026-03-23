"use client";

import { Label } from "@/components/ui/label";
import type { SignaturePlacement } from "@/lib/types";

type Lang = "vi" | "en";

const copy: Record<
  Lang,
  {
    box: string;
    page: string;
    multiHint: string;
    size: string;
  }
> = {
  vi: {
    box: "Chỉnh ô",
    page: "Trang đặt ô này",
    multiHint:
      "Một phiên ký tạo một chữ ký. Chọn ô cần dùng rồi bấm Ký; muốn ký thêm vị trí khác, ký xong và tạo phiên mới.",
    size: "Kích thước ô",
  },
  en: {
    box: "Edit box",
    page: "Page for this box",
    multiHint:
      "Each signing session adds one signature. Pick the box to use, then Sign; for another position, sign and start again.",
    size: "Box size",
  },
};

type Props = {
  placements: SignaturePlacement[];
  totalPages: number;
  selectedIdx: number;
  onSelectIdx: (i: number) => void;
  onPlacementPageChange: (placementIndex: number, page: number) => void;
  lang?: Lang;
};

export function SignaturePlacementFields({
  placements,
  totalPages,
  selectedIdx,
  onSelectIdx,
  onPlacementPageChange,
  lang = "vi",
}: Props) {
  const t = copy[lang];
  if (placements.length === 0 || totalPages < 1) return null;

  const safeIdx = Math.min(Math.max(0, selectedIdx), placements.length - 1);
  const sel = placements[safeIdx];

  return (
    <div className="flex flex-col gap-3 text-sm text-muted-foreground">
      {placements.length > 1 && (
        <>
          <p className="text-xs leading-snug">{t.multiHint}</p>
          <div className="space-y-1">
            <Label className="text-foreground">{t.box}</Label>
            <select
              className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
              value={safeIdx}
              onChange={(e) => onSelectIdx(Number(e.target.value))}
            >
              {placements.map((_, i) => (
                <option key={i} value={i}>
                  {t.box} {i + 1}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      <div className="space-y-1">
        <Label className="text-foreground">{t.page}</Label>
        <select
          className="w-full rounded-md border border-border bg-background px-2 py-2 text-sm text-foreground"
          value={sel.page}
          onChange={(e) => {
            const p = Number(e.target.value);
            onPlacementPageChange(safeIdx, p);
          }}
        >
          {Array.from({ length: totalPages }, (_, i) => {
            const n = i + 1;
            return (
              <option key={n} value={n}>
                {lang === "en" ? `Page ${n}` : `Trang ${n}`}
                {n === totalPages
                  ? lang === "en"
                    ? " (last)"
                    : " (cuối)"
                  : ""}
              </option>
            );
          })}
        </select>
      </div>
      <p className="text-xs">
        {t.size}: {Math.round(sel.wPct * 100)}% × {Math.round(sel.hPct * 100)}%
      </p>
    </div>
  );
}
