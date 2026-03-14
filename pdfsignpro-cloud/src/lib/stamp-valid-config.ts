/**
 * Shared config for stamp_valid template. Must match backend stamp_valid_config.py
 * Single source of truth for layout.
 */

export const STAMP_VALID_CONFIG = {
  PADDING: 6,
  GAP: 8,
  ICON_MIN: 18,
  ICON_MAX: 40,
  ICON_RATIO: 0.55,
  TITLE_SIZE_RATIO: 0.2,
  CONTENT_SIZE_RATIO: 0.16,
  TITLE_SIZE_MIN: 10,
  TITLE_SIZE_MAX: 14,
  CONTENT_SIZE_MIN: 8,
  CONTENT_SIZE_MAX: 12,
  LINE_HEIGHT: 1.25,
  TITLE_STAMP: "Đã ký số",
  TITLE_VALID: "Đã xác thực",
} as const;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeStampValidLayout(
  boxWidth: number,
  boxHeight: number
): {
  iconSize: number;
  textMaxWidth: number;
  textMaxHeight: number;
  titleSize: number;
  contentSize: number;
  lineHeight: number;
} {
  const iconSize = clamp(
    boxHeight * STAMP_VALID_CONFIG.ICON_RATIO,
    STAMP_VALID_CONFIG.ICON_MIN,
    STAMP_VALID_CONFIG.ICON_MAX
  );
  const textMaxWidth = boxWidth - STAMP_VALID_CONFIG.PADDING * 2 - iconSize - STAMP_VALID_CONFIG.GAP;
  const textMaxHeight = boxHeight - STAMP_VALID_CONFIG.PADDING * 2;
  const titleSize = clamp(
    Math.round(boxHeight * STAMP_VALID_CONFIG.TITLE_SIZE_RATIO),
    STAMP_VALID_CONFIG.TITLE_SIZE_MIN,
    STAMP_VALID_CONFIG.TITLE_SIZE_MAX
  );
  const contentSize = clamp(
    Math.round(boxHeight * STAMP_VALID_CONFIG.CONTENT_SIZE_RATIO),
    STAMP_VALID_CONFIG.CONTENT_SIZE_MIN,
    STAMP_VALID_CONFIG.CONTENT_SIZE_MAX
  );
  return {
    iconSize,
    textMaxWidth: Math.max(0, textMaxWidth),
    textMaxHeight,
    titleSize,
    contentSize,
    lineHeight: STAMP_VALID_CONFIG.LINE_HEIGHT,
  };
}
