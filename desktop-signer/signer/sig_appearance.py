# -*- coding: utf-8 -*-
"""
Custom signature appearance: native PDF with embedded NotoSans font.
Tick icon, word-wrapped text (via reportlab for correct spacing), green border.
"""
from __future__ import annotations

import logging
import os
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import List, Optional, Tuple

from pyhanko.pdf_utils import content, layout
from pyhanko.pdf_utils.content import ImportedPdfPage


def _debug_print(*args, **kwargs) -> None:
    """Print Unicode strings correctly; reconfigure stdout to UTF-8 if needed."""
    if not args and not kwargs:
        return
    try:
        # Ensure stdout can handle Unicode (e.g. Vietnamese diacritics)
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
from pyhanko.pdf_utils.font.opentype import GlyphAccumulatorFactory
from pyhanko.pdf_utils.generic import pdf_name
from pyhanko.pdf_utils.writer import PdfFileWriter
from pyhanko.stamp import BaseStamp, BaseStampStyle

logger = logging.getLogger(__name__)

_FONT_PATH = Path(__file__).resolve().parent.parent / "assets" / "fonts" / "NotoSans-Regular.ttf"

# Layout constants (all in top-left coords, y increases down)
_PADDING = 8
_TEXT_PADDING = 16
_MAX_SIGNER_LINES = 3
_MAX_TS_LINES = 3
_MIN_FONT_SIZE = 8
_MAX_FONT_SIZE = 10
_LEADING_RATIO = 1.2  # leading = font_size * this
_GAP_BEFORE_TIME = 2  # extra gap between signer block and time line


def _ensure_font() -> Path:
    if not _FONT_PATH.exists():
        raise FileNotFoundError(
            f"Font file not found: {_FONT_PATH}. "
            "Download NotoSans-Regular.ttf to assets/fonts/ (see README)."
        )
    return _FONT_PATH


def _measure_width(font_engine, text: str, font_size: float) -> float:
    """Measure text width in points (pt)."""
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
    """
    Word-wrap text to fit max_width_pt. Breaks long words by character if needed.
    Returns list of lines.
    """
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
            # Word alone
            ww = _measure_width(font_engine, word, font_size)
            if ww <= max_width_pt:
                current = [word]
            else:
                # Break long word by character
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


def _compute_layout(
    width: float,
    height: float,
    signer: str,
    ts: str,
) -> Tuple[float, float, float, float, List[str], List[str], int]:
    """
    Compute layout in top-left coords. Text area: [padding, W-padding] x [padding, H-padding].
    Returns: icon_size, text_x, text_width, leading, signer_lines, ts_lines, font_size.
    """
    font_path = _ensure_font()
    pad = _PADDING
    text_area_w = width - 2 * pad
    text_area_h = height - 2 * pad
    icon_size = min(text_area_w * 0.25, text_area_h * 0.8)
    text_x = pad + icon_size + _TEXT_PADDING
    text_width = width - pad - text_x  # right edge at width - pad
    text_height = text_area_h - pad  # reserve top for first baseline

    w = PdfFileWriter(init_page_tree=False)
    factory = GlyphAccumulatorFactory(
        str(font_path), font_size=_MAX_FONT_SIZE, bcp47_lang_code="vi"
    )
    engine = factory.create_font_engine(w)

    signer_text = f"Ký số bởi: {signer}" if signer else "Ký số bởi:"
    ts_text = f"Thời gian: {ts}" if ts else "Thời gian:"

    for sz in range(_MAX_FONT_SIZE, _MIN_FONT_SIZE - 1, -1):
        leading = sz * _LEADING_RATIO
        signer_lines = _wrap_text(engine, signer_text, text_width, float(sz))
        if len(signer_lines) > _MAX_SIGNER_LINES:
            continue
        ts_lines = _wrap_text(engine, ts_text, text_width, float(sz))
        ts_lines = ts_lines[:_MAX_TS_LINES]
        total_lines = len(signer_lines) + len(ts_lines)
        # First baseline at pad + font_size; block height = (n-1)*leading + font_size + gap
        block_height = (total_lines - 1) * leading + sz + _GAP_BEFORE_TIME
        if block_height <= text_height:
            if os.environ.get("PDFSIGN_DEBUG"):
                _debug_print(f"[sig_appearance] wrap: font_size={sz}, signer_lines={signer_lines}")
            return icon_size, text_x, text_width, leading, signer_lines, ts_lines, sz

    sz = _MIN_FONT_SIZE
    leading = sz * _LEADING_RATIO
    signer_lines = _wrap_text(engine, signer_text, text_width, float(sz))
    signer_lines = signer_lines[:_MAX_SIGNER_LINES]
    ts_lines = _wrap_text(engine, ts_text, text_width, float(sz))
    ts_lines = ts_lines[:_MAX_TS_LINES]
    if os.environ.get("PDFSIGN_DEBUG"):
        _debug_print(f"[sig_appearance] wrap (fallback): font_size={sz}, signer_lines={signer_lines}, ts_lines={ts_lines}")
    return icon_size, text_x, text_width, leading, signer_lines, ts_lines, sz


def _render_text_via_reportlab(
    width: float,
    height: float,
    signer_lines: List[str],
    ts_lines: List[str],
    text_x: float,
    text_y_start: float,
    font_size: int,
    leading: float,
) -> str:
    """
    Render text with reportlab (correct spacing for Vietnamese).
    Returns path to temp PDF file. Caller must delete.
    """
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
    c.setFont(font_name, font_size)
    c.setFillColorRGB(1, 0, 0)  # red for signer

    y = text_y_start
    for line in signer_lines:
        c.drawString(text_x, y, line)
        y -= leading

    c.setFillColorRGB(0.145, 0.388, 0.922)
    for line in ts_lines:
        c.drawString(text_x, y, line)
        y -= leading

    c.save()
    return path


def _pdf_circle_path(cx: float, cy: float, r: float) -> bytes:
    """PDF path for circle (4 cubic Bezier approximation)."""
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
    resource_target,  # object with import_resources() for merging fonts/xobjects
) -> bytes:
    """
    Build PDF content stream for stamp. All drawing in top-left coords (y down).
    Single transform at root: cm 1 0 0 -1 0 H. NotoSans embedded for Unicode.
    """
    if not _FONT_PATH.exists():
        raise FileNotFoundError(
            f"Font file not found: {_FONT_PATH}. "
            "Download NotoSans-Regular.ttf to assets/fonts/ (see README)."
        )

    debug = os.environ.get("PDFSIGN_DEBUG")
    pad = _PADDING

    icon_size, text_x, text_width, leading, signer_lines, ts_lines, font_size = _compute_layout(
        width, height, signer, ts
    )

    # Top-left coords: cm 1 0 0 -1 0 height cm
    flip_cm = b"1 0 0 -1 0 %g cm" % height

    # Icon: center in left padded area
    icon_cx = pad + icon_size / 2
    icon_cy = height / 2
    icon_r = icon_size / 2 - 2

    # Tick: ✓ shape in top-left coords (y down). y pattern small->large->small.
    r = icon_r
    tick_p1 = (icon_cx - 0.40 * r, icon_cy - 0.05 * r)
    tick_p2 = (icon_cx - 0.15 * r, icon_cy + 0.25 * r)
    tick_p3 = (icon_cx + 0.45 * r, icon_cy - 0.30 * r)

    # Text baseline: first at pad + font_size, then +leading per line
    text_y_baseline = pad + font_size
    total_lines = len(signer_lines) + len(ts_lines)
    text_block_height = (total_lines - 1) * leading + font_size

    if debug:
        _debug_print(
            f"[sig_appearance] box: {width}x{height} | transform: 1 0 0 -1 0 {height}"
        )
        _debug_print(
            f"[sig_appearance] font_size={font_size} leading={leading} | "
            f"lines={total_lines} text_block_height={text_block_height:.1f}"
        )
        _debug_print(f"[sig_appearance] signer_lines={signer_lines} ts_lines={ts_lines}")
        _debug_print(
            f"[sig_appearance] tick (top-left coords): {tick_p1} -> {tick_p2} -> {tick_p3}"
        )

    ops = [
        b"q",
        flip_cm,
        b"1 w",
        b"0.133 0.773 0.369 RG",
        b"%g %g %g %g re S" % (pad, pad, width - 2 * pad, height - 2 * pad),
    ]

    ops.append(b"0.133 0.773 0.369 rg")
    ops.append(_pdf_circle_path(icon_cx, icon_cy, icon_r))
    ops.append(b"f")

    ops.append(
        b"1 1 1 RG 2 w 1 J 1 j "
        + b"%g %g m %g %g l %g %g l S"
        % (tick_p1[0], tick_p1[1], tick_p2[0], tick_p2[1], tick_p3[0], tick_p3[1])
    )
    ops.append(b"Q")  # end flip block (tick/border/circle done)

    # Text: use reportlab for correct Vietnamese spacing (no glyph spacing issues)
    text_form_y = height - text_y_baseline
    text_pdf_path = _render_text_via_reportlab(
        width, height, signer_lines, ts_lines,
        text_x, text_form_y, font_size, leading,
    )
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
    """Stamp style: tick icon, word-wrapped text, green border. No SVG."""

    timestamp_format: str = "%d/%m/%Y %H:%M"
    border_width: int = 0

    def create_stamp(self, writer, box: layout.BoxConstraints, text_params: dict):
        return SigAppearanceStamp(
            writer=writer,
            style=self,
            box=box,
            text_params=text_params,
        )


class SigAppearanceStamp(BaseStamp):
    """Custom stamp rendering native PDF with embedded NotoSans font."""

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
