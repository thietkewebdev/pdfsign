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
    TITLE_VALID,
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
_STAMP_RED_RGB = (0.937, 0.231, 0.384)  # #ef3b62


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


def _ellipsize_to_width(font_engine, text: str, max_width_pt: float, font_size: float) -> str:
    """Trim text to max width and add ellipsis when needed."""
    if _measure_width(font_engine, text, font_size) <= max_width_pt:
        return text
    ellipsis = "..."
    if _measure_width(font_engine, ellipsis, font_size) > max_width_pt:
        return ""
    base = text
    while base and _measure_width(font_engine, base + ellipsis, font_size) > max_width_pt:
        base = base[:-1]
    return (base + ellipsis).rstrip()


def _compute_stamp_layout(
    width: float,
    height: float,
    signer: str,
    ts: str,
    title: str = TITLE_VALID,
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

    # Adaptive: giảm title_size nếu title quá rộng
    title_text = (title or "").strip()
    has_title = bool(title_text)
    if has_title:
        for try_title in range(int(title_size), 6, -1):
            if _measure_width(engine, title_text, float(try_title)) <= text_max_width:
                title_size = try_title
                break

    # Adaptive: giảm content_size cho đến khi tất cả text vừa trong box
    pad = PADDING
    title_block_height = (title_size * leading_ratio + 4) if has_title else 0
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

    raw_signer_lines = _wrap_text(engine, signer_text, text_max_width, float(content_size))
    raw_ts_lines = _wrap_text(engine, ts_text, text_max_width, float(content_size))

    # Hard cap to prevent any text from escaping box in very small placements.
    leading = content_size * LINE_HEIGHT
    max_total_lines = max(1, int(available_height // leading)) if leading > 0 else 1
    has_ts_text = bool(ts_text.strip())

    if has_ts_text and max_total_lines >= 2:
        signer_budget = max(1, min(MAX_SIGNER_LINES, max_total_lines - 1))
        ts_budget = min(MAX_TS_LINES, 1)
    else:
        signer_budget = max(1, min(MAX_SIGNER_LINES, max_total_lines))
        ts_budget = 0

    signer_overflow = len(raw_signer_lines) > signer_budget
    ts_overflow = len(raw_ts_lines) > ts_budget
    signer_lines = raw_signer_lines[:signer_budget]
    ts_lines = raw_ts_lines[:ts_budget]

    if signer_overflow and signer_lines:
        if signer_budget <= 1:
            signer_lines[0] = _ellipsize_to_width(
                engine, signer_text, text_max_width, float(content_size)
            )
        else:
            remaining_signer = " ".join(raw_signer_lines[signer_budget - 1 :])
            signer_lines[-1] = _ellipsize_to_width(
                engine, remaining_signer, text_max_width, float(content_size)
            )
    if ts_overflow and ts_lines:
        ts_lines[-1] = _ellipsize_to_width(
            engine, ts_text, text_max_width, float(content_size)
        )

    # Guard against renderer measurement drift: never draw a line wider than content area.
    signer_lines = [
        _ellipsize_to_width(engine, line, text_max_width, float(content_size))
        for line in signer_lines
    ]
    ts_lines = [
        _ellipsize_to_width(engine, line, text_max_width, float(content_size))
        for line in ts_lines
    ]

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
    leading = content_size * leading_ratio
    total_lines = len(signer_lines) + len(ts_lines)
    text_block_h = total_lines * leading
    y = max(PADDING + content_size, (height + text_block_h) / 2 - content_size)
    if title:
        c.setFont(font_name, title_size)
        c.setFillColorRGB(*_STAMP_RED_RGB)
        c.drawString(text_x, text_y_start, title)
        y = min(y, text_y_start - title_size * leading_ratio - 2)

    c.setFont(font_name, content_size)
    for line in signer_lines:
        c.setFillColorRGB(*_STAMP_RED_RGB)
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
    title: str,
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
        width, height, signer, ts, title
    )

    flip_cm = b"1 0 0 -1 0 %g cm" % height

    icon_cx = pad + icon_size / 2
    icon_cy = height / 2
    icon_r = icon_size / 2 - 2

    r = icon_r
    tick_p1 = (icon_cx - 0.40 * r, icon_cy - 0.05 * r)
    tick_p2 = (icon_cx - 0.15 * r, icon_cy + 0.25 * r)
    tick_p3 = (icon_cx + 0.45 * r, icon_cy - 0.30 * r)

    text_y_baseline = pad
    if title:
        text_y_baseline += title_size * LINE_HEIGHT + 2

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
        b"%g %g %g RG" % _STAMP_RED_RGB,
        b"%g %g %g %g re S" % (pad, pad, width - 2 * pad, height - 2 * pad),
    ]

    ops.append(b"%g %g %g rg" % _STAMP_RED_RGB)
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


def get_stamp_style_for_template(template_id: str, seal_image_path: str | None = None):
    """Return stamp style for template: classic, modern, minimal, stamp, valid, seal."""
    tid = (template_id or "valid").strip().lower()
    if tid == "seal" and seal_image_path:
        return SealStampStyle(seal_image_path=seal_image_path)
    if tid in ("stamp", "valid"):
        title = TITLE_VALID if tid == "valid" else TITLE_STAMP
        return SigAppearanceStampStyle(title=title)
    return SimpleTextStampStyle(template_id=tid)


@dataclass(frozen=True)
class SigAppearanceStampStyle(BaseStampStyle):
    """Stamp/valid style - icon + text. title: TITLE_STAMP or TITLE_VALID."""

    title: str = TITLE_VALID
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
        title = getattr(self.style, "title", TITLE_VALID)
        content_bytes = _build_stamp_content(
            w, h, signer, ts, self.writer, resource_target=self, title=title
        )
        return [content_bytes]


# --- Simple text stamps (classic, modern, minimal) ---

SIMPLE_FONT_SIZE_MIN = 6
SIMPLE_FONT_SIZE_MAX = 14
SIMPLE_LINE_HEIGHT = 1.25


def _get_font_engine():
    """Get pyHanko font engine for accurate text measurement (Vietnamese-safe)."""
    font_path = _ensure_font()
    w = PdfFileWriter(init_page_tree=False)
    factory = GlyphAccumulatorFactory(
        str(font_path), font_size=SIMPLE_FONT_SIZE_MAX, bcp47_lang_code="vi"
    )
    return factory.create_font_engine(w)


def _compute_simple_layout(
    width: float,
    height: float,
    signer: str,
    ts: str,
    template_id: str,
) -> Tuple[int, List[str], List[str]]:
    """Compute font size and wrapped lines so text fits in box. Uses pyHanko engine for accurate Vietnamese measurement."""
    pad = 6
    max_w = max(20, width - 2 * pad)
    has_ts = template_id != "minimal" and bool(ts)
    signer_text = signer or "—"
    ts_text = ts or ""

    engine = _get_font_engine()

    for font_size in range(SIMPLE_FONT_SIZE_MAX, SIMPLE_FONT_SIZE_MIN - 1, -1):
        leading = font_size * SIMPLE_LINE_HEIGHT
        signer_lines = _wrap_text(engine, signer_text, max_w, float(font_size))
        ts_lines = _wrap_text(engine, ts_text, max_w, float(font_size)) if has_ts else []

        needed_h = len(signer_lines) * leading
        if has_ts:
            needed_h += len(ts_lines) * leading + 2
        available_h = height - 2 * pad
        if needed_h <= available_h:
            return font_size, signer_lines, ts_lines

    fs = SIMPLE_FONT_SIZE_MIN
    signer_lines = _wrap_text(engine, signer_text, max_w, float(fs))
    ts_lines = _wrap_text(engine, ts_text, max_w, float(fs)) if has_ts else []
    return fs, signer_lines, ts_lines


def _render_simple_text_pdf(
    width: float,
    height: float,
    signer: str,
    ts: str,
    template_id: str,
) -> str:
    """Render simple text stamp via reportlab. Auto-size font, wrap text to fit box."""
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas

    font_path = _ensure_font()
    font_name = "NotoSans"
    if font_name not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(font_name, str(font_path)))

    font_size, signer_lines, ts_lines = _compute_simple_layout(
        width, height, signer, ts, template_id
    )
    leading = font_size * SIMPLE_LINE_HEIGHT

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.close()
    path = tmp.name

    c = canvas.Canvas(path, pagesize=(width, height))
    pad = 6

    # Vertically center all lines
    total_h = len(signer_lines) * leading
    if ts_lines:
        total_h += len(ts_lines) * leading + 2
    y_start = (height + total_h) / 2

    if template_id == "modern":
        c.setFillColorRGB(0.94, 0.94, 0.94)
        c.roundRect(pad, pad, width - 2 * pad, height - 2 * pad, 4, fill=1, stroke=0)

    c.setFont(font_name, font_size)
    c.setFillColorRGB(0.22, 0.23, 0.27)
    y = y_start
    for line in signer_lines:
        c.drawCentredString(width / 2, y - font_size, line)
        y -= leading

    if ts_lines:
        c.setFillColorRGB(0.55, 0.58, 0.63)
        y -= 2
        for line in ts_lines:
            c.drawCentredString(width / 2, y - font_size, line)
            y -= leading

    if template_id == "classic":
        c.setStrokeColorRGB(0.2, 0.2, 0.2)
        c.setLineWidth(1)
        c.line(pad, pad + 2, width - pad, pad + 2)

    c.save()
    return path


@dataclass(frozen=True)
class SimpleTextStampStyle(BaseStampStyle):
    """Simple text stamp for classic, modern, minimal."""

    template_id: str = "classic"
    timestamp_format: str = "%d/%m/%Y %H:%M:%S"
    border_width: int = 0

    def create_stamp(self, writer, box: layout.BoxConstraints, text_params: dict):
        return SimpleTextStamp(
            writer=writer,
            style=self,
            box=box,
            text_params=text_params,
        )


class SimpleTextStamp(BaseStamp):
    """Simple text-only stamp."""

    def __init__(self, writer, style: SimpleTextStampStyle, box, text_params=None):
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
        tid = getattr(self.style, "template_id", "classic")
        pdf_path = _render_simple_text_pdf(w, h, signer, ts, tid)
        try:
            imported = ImportedPdfPage(pdf_path, page_ix=0)
            imported.set_writer(self.writer)
            do_cmd = imported.render()
            self.import_resources(imported.resources)
            return [b"q", do_cmd, b"Q"]
        finally:
            Path(pdf_path).unlink(missing_ok=True)


# --- Seal stamp (con dấu + text) ---

def _render_seal_pdf(
    width: float,
    height: float,
    signer: str,
    ts: str,
    seal_image_path: str,
) -> str:
    """Render seal stamp: image on left, text on right. Returns temp PDF path."""
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    from reportlab.pdfgen import canvas

    font_path = _ensure_font()
    font_name = "NotoSans"
    if font_name not in pdfmetrics.getRegisteredFontNames():
        pdfmetrics.registerFont(TTFont(font_name, str(font_path)))

    pad = PADDING
    img_reader = ImageReader(seal_image_path)
    img_w, img_h = img_reader.getSize()

    available_h = height - 2 * pad
    img_area_w = min(width * 0.45, available_h)
    img_scale = min(img_area_w / img_w, available_h / img_h)
    draw_w = img_w * img_scale
    draw_h = img_h * img_scale

    img_x = pad
    img_y = (height - draw_h) / 2

    text_x = pad + img_area_w + pad
    text_max_w = max(20, width - text_x - pad)

    engine = _get_font_engine()
    signer_text = signer or "—"
    ts_text = ts or ""

    for font_size in range(SIMPLE_FONT_SIZE_MAX, SIMPLE_FONT_SIZE_MIN - 1, -1):
        leading = font_size * SIMPLE_LINE_HEIGHT
        s_lines = _wrap_text(engine, signer_text, text_max_w, float(font_size))
        t_lines = _wrap_text(engine, ts_text, text_max_w, float(font_size)) if ts_text else []
        needed = len(s_lines) * leading + len(t_lines) * leading + (2 if t_lines else 0)
        if needed <= available_h:
            break
    else:
        font_size = SIMPLE_FONT_SIZE_MIN
        leading = font_size * SIMPLE_LINE_HEIGHT
        s_lines = _wrap_text(engine, signer_text, text_max_w, float(font_size))
        t_lines = _wrap_text(engine, ts_text, text_max_w, float(font_size)) if ts_text else []

    total_text_h = len(s_lines) * leading + len(t_lines) * leading + (2 if t_lines else 0)
    text_y_start = (height + total_text_h) / 2

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.close()
    path = tmp.name

    c = canvas.Canvas(path, pagesize=(width, height))

    c.drawImage(img_reader, img_x, img_y, width=draw_w, height=draw_h, preserveAspectRatio=True, mask="auto")

    c.setFont(font_name, font_size)
    c.setFillColorRGB(0.863, 0.149, 0.149)
    y = text_y_start
    for line in s_lines:
        c.drawString(text_x, y - font_size, line)
        y -= leading

    if t_lines:
        c.setFillColorRGB(0.29, 0.34, 0.39)
        y -= 2
        for line in t_lines:
            c.drawString(text_x, y - font_size, line)
            y -= leading

    c.save()
    return path


@dataclass(frozen=True)
class SealStampStyle(BaseStampStyle):
    """Seal stamp: company seal image + signer text."""

    seal_image_path: str = ""
    timestamp_format: str = "%d/%m/%Y %H:%M:%S"
    border_width: int = 0

    def create_stamp(self, writer, box: layout.BoxConstraints, text_params: dict):
        return SealStamp(
            writer=writer,
            style=self,
            box=box,
            text_params=text_params,
        )


class SealStamp(BaseStamp):
    """Seal stamp rendering: image left + text right."""

    def __init__(self, writer, style: SealStampStyle, box, text_params=None):
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
        seal_path = getattr(self.style, "seal_image_path", "")
        if not seal_path or not Path(seal_path).exists():
            pdf_path = _render_simple_text_pdf(w, h, signer, ts, "classic")
        else:
            pdf_path = _render_seal_pdf(w, h, signer, ts, seal_path)
        try:
            imported = ImportedPdfPage(pdf_path, page_ix=0)
            imported.set_writer(self.writer)
            do_cmd = imported.render()
            self.import_resources(imported.resources)
            return [b"q", do_cmd, b"Q"]
        finally:
            Path(pdf_path).unlink(missing_ok=True)
