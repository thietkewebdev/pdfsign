/** Normalized signature box placement as percentage of page dimensions */
export interface SignaturePlacement {
  page: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

export const DEFAULT_PLACEMENT: Omit<SignaturePlacement, "page"> = {
  wPct: 0.32,
  hPct: 0.1,
  xPct: 1 - 0.32 - 0.04, // 0.64
  yPct: 0.86, // from top; bottom 0.04 = 1 - 0.1 - 0.04 => y = 0.86
};
