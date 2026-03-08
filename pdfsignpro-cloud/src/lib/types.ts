/** Normalized signature box placement as percentage of page dimensions */
export interface SignaturePlacement {
  page: number;
  xPct: number;
  yPct: number;
  wPct: number;
  hPct: number;
}

/** Bottom-right placement: UI uses top-left origin, PDF uses bottom-left */
export const DEFAULT_PLACEMENT: Omit<SignaturePlacement, "page"> = {
  wPct: 0.32,
  hPct: 0.1,
  xPct: 1 - 0.32 - 0.04, // 0.64 — right side
  yPct: 0.84, // UI top-left: 84% down = bottom; PDF y = 1 - 0.84 - 0.1 = 0.06
};
