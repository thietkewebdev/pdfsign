"use client";

import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SignaturePlacement } from "@/lib/types";

type Lang = "vi" | "en";

const copy: Record<
  Lang,
  {
    box: string;
    pageTitle: string;
    pageHint: string;
    lastPage: string;
    multiHint: string;
  }
> = {
  vi: {
    box: "Chỉnh ô",
    pageTitle: "Ký trên trang nào?",
    pageHint:
      "Mặc định là trang cuối. Chọn số trang nếu bạn cần ký ở vị trí khác.",
    lastPage: "Trang cuối",
    multiHint:
      "Một phiên ký tạo một chữ ký. Chọn ô cần dùng rồi bấm Ký; muốn ký thêm vị trí khác, ký xong và tạo phiên mới.",
  },
  en: {
    box: "Edit box",
    pageTitle: "Which page to sign?",
    pageHint:
      "The last page is selected by default. Pick another page if you need the signature elsewhere.",
    lastPage: "Last page",
    multiHint:
      "Each signing session adds one signature. Pick the box to use, then Sign; for another position, sign and start again.",
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

  const middlePages =
    totalPages > 1
      ? Array.from({ length: totalPages - 1 }, (_, i) => i + 1)
      : [];

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

      <div className="space-y-2 rounded-xl border border-border/70 bg-muted/25 p-3 shadow-sm">
        <div>
          <Label className="text-foreground text-sm font-medium">
            {t.pageTitle}
          </Label>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {t.pageHint}
          </p>
        </div>

        <div
          className={cn(
            "flex gap-1.5 overflow-x-auto pb-0.5 pt-1",
            "[scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border"
          )}
          role="listbox"
          aria-label={t.pageTitle}
        >
          {totalPages >= 1 && (
            <Button
              type="button"
              role="option"
              aria-selected={sel.page === totalPages}
              variant={sel.page === totalPages ? "default" : "outline"}
              size="sm"
              className={cn(
                "shrink-0 rounded-full px-3.5 font-medium shadow-none",
                sel.page !== totalPages &&
                  "border-border/80 bg-background/80 hover:bg-accent"
              )}
              onClick={() => onPlacementPageChange(safeIdx, totalPages)}
            >
              {t.lastPage}
            </Button>
          )}
          {middlePages.map((n) => (
            <Button
              key={n}
              type="button"
              role="option"
              aria-selected={sel.page === n}
              variant={sel.page === n ? "default" : "outline"}
              size="sm"
              className={cn(
                "size-8 shrink-0 rounded-full p-0 font-medium tabular-nums shadow-none",
                sel.page !== n &&
                  "border-border/80 bg-background/80 hover:bg-accent"
              )}
              onClick={() => onPlacementPageChange(safeIdx, n)}
            >
              {n}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
