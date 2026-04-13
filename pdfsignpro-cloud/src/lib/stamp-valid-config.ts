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
  TITLE_SIZE_MIN: 8,
  TITLE_SIZE_MAX: 14,
  CONTENT_SIZE_MIN: 6,
  CONTENT_SIZE_MAX: 12,
  LINE_HEIGHT: 1.25,
  MAX_SIGNER_LINES: 2,
  MAX_TS_LINES: 1,
  TITLE_STAMP: "Đã ký số",
  TITLE_VALID: "",
} as const;

export function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function computeStampValidLayout(
  boxWidth: number,
  boxHeight: number,
  signerText?: string,
  tsText?: string,
  titleText?: string
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
  const textMaxWidth = Math.max(
    0,
    boxWidth - STAMP_VALID_CONFIG.PADDING * 2 - iconSize - STAMP_VALID_CONFIG.GAP
  );
  const textMaxHeight = boxHeight - STAMP_VALID_CONFIG.PADDING * 2;
  const titleSize = clamp(
    Math.round(boxHeight * STAMP_VALID_CONFIG.TITLE_SIZE_RATIO),
    STAMP_VALID_CONFIG.TITLE_SIZE_MIN,
    STAMP_VALID_CONFIG.TITLE_SIZE_MAX
  );
  let contentSize = clamp(
    Math.round(boxHeight * STAMP_VALID_CONFIG.CONTENT_SIZE_RATIO),
    STAMP_VALID_CONFIG.CONTENT_SIZE_MIN,
    STAMP_VALID_CONFIG.CONTENT_SIZE_MAX
  );

  // Adaptive: giảm font khi text dài để hiển thị đủ, không cắt chữ
  if (signerText !== undefined && tsText !== undefined) {
    const signer = `Ký bởi: ${signerText}`;
    const ts = `Thời gian: ${tsText}`;
    const hasTitle = Boolean((titleText ?? "").trim());
    // Ước lượng chars/dòng: tiếng Việt ~0.6em/char
    const charWidthRatio = 0.6;
    const lineHeight = STAMP_VALID_CONFIG.LINE_HEIGHT;
    const titleBlockHeight = hasTitle ? titleSize * lineHeight + 4 : 0;
    const availableHeight = textMaxHeight - titleBlockHeight;

    // Thử giảm contentSize cho đến khi vừa
    for (let size = contentSize; size >= STAMP_VALID_CONFIG.CONTENT_SIZE_MIN; size--) {
      const charsPerLine = Math.max(5, textMaxWidth / (size * charWidthRatio));
      const signerLines = Math.ceil(signer.length / charsPerLine) || 1;
      const tsLines = Math.ceil(ts.length / charsPerLine) || 1;
      const totalLines = signerLines + tsLines;
      const neededHeight = totalLines * size * lineHeight;
      if (neededHeight <= availableHeight) {
        contentSize = size;
        break;
      }
    }
  }

  return {
    iconSize,
    textMaxWidth,
    textMaxHeight,
    titleSize,
    contentSize,
    lineHeight: STAMP_VALID_CONFIG.LINE_HEIGHT,
  };
}
