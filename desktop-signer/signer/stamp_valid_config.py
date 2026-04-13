# -*- coding: utf-8 -*-
"""
Shared config for stamp_valid template. Must match frontend StampValidPreview.
Single source of truth for layout - keep in sync with pdfsignpro-cloud/src/lib/stamp-valid-config.ts
"""

# Layout (points - 1pt = 1/72 inch, same as PDF)
PADDING = 6
GAP = 8
ICON_MIN = 18
ICON_MAX = 40
ICON_RATIO = 0.55

# Font sizes (points)
TITLE_SIZE_RATIO = 0.2
CONTENT_SIZE_RATIO = 0.16
TITLE_SIZE_MIN = 8
TITLE_SIZE_MAX = 14
CONTENT_SIZE_MIN = 4
CONTENT_SIZE_MAX = 12
LINE_HEIGHT = 1.25

# Ưu tiên hiển thị đầy đủ nội dung; cho phép xuống nhiều dòng.
MAX_SIGNER_LINES = 99
MAX_TS_LINES = 99

# Labels
TITLE_STAMP = "Đã ký số"
TITLE_VALID = ""
SIGNER_PREFIX = "Ký bởi: "
TS_PREFIX = "Thời gian: "


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def compute_layout(width: float, height: float) -> dict:
    """Compute layout dimensions. Returns icon_size, text_max_width, title_size, content_size."""
    icon_size = clamp(height * ICON_RATIO, ICON_MIN, ICON_MAX)
    text_max_width = max(0, width - 2 * PADDING - icon_size - GAP)
    title_size = clamp(round(height * TITLE_SIZE_RATIO), TITLE_SIZE_MIN, TITLE_SIZE_MAX)
    content_size = clamp(round(height * CONTENT_SIZE_RATIO), CONTENT_SIZE_MIN, CONTENT_SIZE_MAX)
    return {
        "icon_size": icon_size,
        "text_max_width": text_max_width,
        "text_x": PADDING + icon_size + GAP,
        "title_size": int(title_size),
        "content_size": int(content_size),
        "line_height": LINE_HEIGHT,
    }
