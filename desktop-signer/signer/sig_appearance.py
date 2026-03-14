# -*- coding: utf-8 -*-
"""
Custom signature appearance: stamp_valid template.
Layout matches frontend StampValidPreview 1:1 (single source of truth: stamp_valid_config).
"""
from __future__ import annotations

import logging
import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Tuple

from pyhanko.pdf_utils import layout
from pyhanko.pdf_utils.content import ImportedPdfPage
from pyhanko.pdf_utils.font.opentype import GlyphAccumulatorFactory
from pyhanko.pdf_utils.writer import PdfFileWriter
from pyhanko.stamp import BaseStamp, BaseStampStyle

from .stamp_valid_config import (
    PADDING,
    TITLE_STAMP,
    SIGNER_PREFIX,
    TS_PREFIX,
    TITLE_SIZE_MAX,
    CONTENT_SIZE_MIN,
    CONTENT_SIZE_MAX,
    LINE_HEIGHT,
    MAX_SIGNER_LINES,
    MAX_TS_LINES,
    compute_layout as config_compute_layout,
)

logger = logging.getLogger(__name__)

_FONT_PATH = Path(__file__).resolve().parent.parent / "assets" / "fonts" / "NotoSans-Regular.ttf"


def _debug_print(*args, **kwargs) -> None:
    if not args and not kwargs:
        return
    try:
        if hasattr(sys.stdout, "reconfigure") and getattr(
            sys.stdout, "encoding", None
        ) not in ("utf-8", "utf8"):
            try:
                sys.stdout.reconfigure(encoding="utf-8", errors="replace")
            except (AttributeError, OSError):
                pass
        print(*args, **kwargs)
    except UnicodeEncodeError:
        print(repr(args) if len(args) == 1 else args, **kwargs)


def _ensure_font() -> Path:
    if not _FONT_PATH.exists():
        raise FileNotFoundError(
            f"Font file not found: {_FONT_PATH}. "
            "Download NotoSans-Regular.ttf to assets/fonts/ (see README)."
        )
    return _FONT_PATH


def _measure_width(font_engine, text: str, font_size: float) -> float:
    if not text:
        return 0.0
    sr = font_engine.shape(text)
    return sr.x_advance * font_size


def _wrap_text(
    font_engine,
    text: str,
    max_width_pt: float,
    font_size: float,
) -> List[str]:
    """Word-wrap text to fit max_width_pt. Breaks long words by character if needed."""
    if not text or max_width_pt <= 0:
        return []

    words = text.split()
    lines: List[str] = []
    current: List[str] = []

    for word in words:
        sep = " " if current else ""
        candidate = sep.join(current + [word])
        w = _measure_width(font_engine, candidate, font_size)
        if w <= max_width_pt:
            current.append(word)
        else:
            if current:
                lines.append(" ".join(current))
                current = []
            ww = _measure_width(font_engine, word, font_size)
            if ww <= max_width_pt:
                current = [word]
            else:
                chars = list(word)
                cur_line: List[str] = []
                for c in chars:
                    cand = "".join(cur_line + [c])
                    if _measure_width(font_engine, cand, font_size) <= max_width_pt:
                        cur_line.append(c)
                    else:
                        if cur_line:
                            lines.append("".join(cur_line))
                        cur_line = [c] if _measure_width(font_engine, c, font_size) <= max_width_pt else []
                if cur_line:
                    current = ["".join(cur_line)]

    if current:
        lines.append(" ".join(current))
    return lines


def _compute_stamp_layout(
    width: float,
    height: float,
    signer: str,
    ts: str,
) -> Tuple[float, float, float, int, int, List[str], List[str]]:
    """
    Compute layout matching StampValidPreview.
    Tự động giảm font khi text dài để hiển thị đủ, không cắt chữ.
    Returns: icon_size, text_x, text_max_width, title_size, content_size, signer_lines, ts_lines.
    """
    font_path = _ensure_font()
    layout_cfg = config_compute_layout(width, height)
    icon_size = layout_cfg["icon_size"]
    text_max_width = layout_cfg["text_max_width"]
    text_x = layout_cfg["text_x"]
    title_size = layout_cfg["title_size"]
    content_size = layout_cfg["content_size"]
    leading_ratio = layout_cfg["line_height"]

    w = PdfFileWriter(init_page_tree=False)
    factory = GlyphAccumulatorFactory(
        str(font_path), font_size=max(TITLE_SIZE_MAX, CONTENT_SIZE_MAX), bcp47_lang_code="vi"
    )
    engine = factory.create_font_engine(w)

    signer_text = f"{SIGNER_PREFIX}{signer}" if signer else SIGNER_PREFIX
    ts_text = f"{TS_PREFIX}{ts}" if ts else TS_PREFIX

    # Adaptive: giảm content_size cho đến khi tất cả text vừa trong box
    pad = PADDING
    title_block_height = title_size * leading_ratio + 4
    available_height = height - 2 * pad - title_block_height

    for try_size in range(int(content_size), CONTENT_SIZE_MIN - 1, -1):
        fs = float(try_size)
        signer_lines = _wrap_text(engine, signer_text, text_max_width, fs)
        signer_lines = signer_lines[:MAX_SIGNER_LINES]
        ts_lines = _wrap_text(engine, ts_text, text_max_width, fs)
        ts_lines = ts_lines[:MAX_TS_LINES]
        leading = try_size * LINE_HEIGHT
        needed = (len(signer_lines) + len(ts_lines)) * leading
        if needed <= available_height:
            content_size = try_size
            break

    signer_lines = _wrap_text(engine, signer_text, text_max_width, float(content_size))
    signer_lines = signer_lines[:MAX_SIGNER_LINES]
    ts_lines = _wrap_text(engine, ts_text, text_max_width, float(content_size))
    ts_lines = ts_lines[:MAX_TS_LINES]

    if os.environ.get("PDFSIGN_DEBUG"):
        _debug_print(
            f"[sig_appearance] stamp_valid: {width}x{height} icon={icon_size:.1f} "
            f"content_size={content_size} signer_lines={signer_lines} ts_lines={ts_lines}"
        )

    return icon_size, text_x, text_max_width, title_size, content_size, signer_lines, ts_lines


def _render_text_via_reportlab(
    width: float,
    height: float,
    title: str,
    signer_lines: List[str],
    ts_lines: List[str],
    text_x: float,
    text_y_start: float,
    title_size: int,
    content_size: int,
    leading_ratio: float,
) -> str:
    """Render text with reportlab. Returns path to temp PDF file."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas

    font_name = "NotoSans"
    if font_name not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(font_name, str(_FONT_PATH)))

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.close()
    path = tmp.name

    c = canvas.Canvas(path, pagesize=(width, height))
    c.setFont(font_name, title_size)
    c.setFillColorRGB(0.863, 0.149, 0.149)  # #dc2626 red
    c.drawString(text_x, text_y_start, title)

    leading = content_size * leading_ratio
    y = text_y_start - title_size * leading_ratio - 2

    c.setFont(font_name, content_size)
    for line in signer_lines:
        c.setFillColorRGB(0.863, 0.149, 0.149)  # #dc2626 red - tên công ty
        c.drawString(text_x, y, line)
        y -= leading

    c.setFillColorRGB(0.29, 0.34, 0.39)  # #4b5563 gray - thời gian
    for line in ts_lines:
        c.drawString(text_x, y, line)
        y -= leading

    c.save()
    return path


def _pdf_circle_path(cx: float, cy: float, r: float) -> bytes:
    k = 0.552284749831 * r
    return (
        b"%g %g m " % (cx + r, cy)
        + b"%g %g %g %g %g %g c " % (cx + r, cy + k, cx + k, cy + r, cx, cy + r)
        + b"%g %g %g %g %g %g c " % (cx - k, cy + r, cx - r, cy + k, cx - r, cy)
        + b"%g %g %g %g %g %g c " % (cx - r, cy - k, cx - k, cy - r, cx, cy - r)
        + b"%g %g %g %g %g %g c " % (cx + k, cy - r, cx + r, cy - k, cx + r, cy)
        + b"h"
    )


def _build_stamp_content(
    width: float,
    height: float,
    signer: str,
    ts: str,
    writer,
    resource_target,
    title: str = TITLE_STAMP,
) -> bytes:
    """
    Build PDF content stream for stamp_valid. Layout matches StampValidPreview 1:1.
    """
    if not _FONT_PATH.exists():
        raise FileNotFoundError(
            f"Font file not found: {_FONT_PATH}. "
            "Download NotoSans-Regular.ttf to assets/fonts/ (see README)."
        )

    pad = PADDING
    icon_size, text_x, _, title_size, content_size, signer_lines, ts_lines = _compute_stamp_layout(
        width, height, signer, ts
    )

    flip_cm = b"1 0 0 -1 0 %g cm" % height

    icon_cx = pad + icon_size / 2
    icon_cy = height / 2
    icon_r = icon_size / 2 - 2

    r = icon_r
    tick_p1 = (icon_cx - 0.40 * r, icon_cy - 0.05 * r)
    tick_p2 = (icon_cx - 0.15 * r, icon_cy + 0.25 * r)
    tick_p3 = (icon_cx + 0.45 * r, icon_cy - 0.30 * r)

    leading = content_size * LINE_HEIGHT
    text_y_baseline = pad + title_size * LINE_HEIGHT

    text_form_y = height - text_y_baseline
    text_pdf_path = _render_text_via_reportlab(
        width, height,
        title,
        signer_lines, ts_lines,
        text_x, text_form_y,
        title_size, content_size,
        LINE_HEIGHT,
    )

    border_r = 4
    ops = [
        b"q",
        flip_cm,
        b"1 w",
        b"0.063 0.722 0.506 RG",
        b"%g %g %g %g re S" % (pad, pad, width - 2 * pad, height - 2 * pad),
    ]

    ops.append(b"0.063 0.722 0.506 rg")
    ops.append(_pdf_circle_path(icon_cx, icon_cy, icon_r))
    ops.append(b"f")

    ops.append(
        b"1 1 1 RG 2 w 1 J 1 j "
        + b"%g %g m %g %g l %g %g l S"
        % (tick_p1[0], tick_p1[1], tick_p2[0], tick_p2[1], tick_p3[0], tick_p3[1])
    )
    ops.append(b"Q")

    try:
        imported = ImportedPdfPage(text_pdf_path, page_ix=0)
        imported.set_writer(writer)
        do_cmd = imported.render()
        resource_target.import_resources(imported.resources)
        ops.append(b"q")
        ops.append(do_cmd)
        ops.append(b"Q")
    finally:
        Path(text_pdf_path).unlink(missing_ok=True)

    return b" ".join(ops)


@dataclass(frozen=True)
class SigAppearanceStampStyle(BaseStampStyle):
    """Stamp_valid style. Desktop-signer chỉ xác thực chứng thư, không nhận mẫu."""

    timestamp_format: str = "%d/%m/%Y %H:%M:%S"
    border_width: int = 0

    def create_stamp(self, writer, box: layout.BoxConstraints, text_params: dict):
        return SigAppearanceStamp(
            writer=writer,
            style=self,
            box=box,
            text_params=text_params,
        )


class SigAppearanceStamp(BaseStamp):
    """Custom stamp rendering - layout matches StampValidPreview."""

    def __init__(self, writer, style: SigAppearanceStampStyle, box, text_params=None):
        super().__init__(writer=writer, style=style, box=box)
        self.text_params = text_params or {}

    def _render_inner_content(self):
        signer = self.text_params.get("signer", "")
        ts = self.text_params.get("ts", "")
        if not ts and hasattr(self.style, "timestamp_format"):
            from datetime import datetime

            try:
                import zoneinfo

                tz = zoneinfo.ZoneInfo("Asia/Ho_Chi_Minh")
                ts = datetime.now(tz).strftime(self.style.timestamp_format)
            except ImportError:
                ts = datetime.now().strftime(self.style.timestamp_format)

        w = self.box.width
        h = self.box.height
        content_bytes = _build_stamp_content(
            w, h, signer, ts, self.writer, resource_target=self
        )
        return [content_bytes]
