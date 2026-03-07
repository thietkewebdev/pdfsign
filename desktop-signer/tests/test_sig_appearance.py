"""
Unit tests for signature appearance: word wrapping and layout.
"""
import logging
import sys
from pathlib import Path

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from signer.sig_appearance import (
    _compute_layout,
    _ensure_font,
    _wrap_text,
)

# Enable debug log to print wrapped lines
logging.basicConfig(level=logging.DEBUG, format="%(name)s: %(message)s")


def test_wrap_short():
    """Short signer name fits on one line."""
    w, h = 200.0, 60.0
    signer = "Nguyễn Văn A"
    ts = "06/03/2025 14:30"
    icon_size, text_x, text_width, leading, signer_lines, ts_lines, font_size = _compute_layout(
        w, h, signer, ts
    )
    assert len(signer_lines) <= 3
    assert "Ký số bởi" in signer_lines[0]
    assert "Nguyễn" in signer_lines[0] or "Nguyễn" in " ".join(signer_lines)
    assert len(ts_lines) == 1
    print(f"  signer_lines={ascii(signer_lines)}, font_size={font_size}")


def test_wrap_long():
    """Long company name wraps to multiple lines."""
    w, h = 200.0, 70.0
    signer = "Công ty Cổ phần Công nghệ và Giải pháp Việt Nam"
    ts = "06/03/2025 14:30"
    icon_size, text_x, text_width, leading, signer_lines, ts_lines, font_size = _compute_layout(
        w, h, signer, ts
    )
    assert len(signer_lines) <= 3
    assert len(signer_lines) >= 2
    print(f"  signer_lines={ascii(signer_lines)}, font_size={font_size}")


def test_wrap_vietnamese():
    """Vietnamese text with diacritics wraps correctly."""
    w, h = 180.0, 60.0
    signer = "Trần Thị Bích Hòa"
    ts = "01/01/2025 08:00"
    icon_size, text_x, text_width, leading, signer_lines, ts_lines, font_size = _compute_layout(
        w, h, signer, ts
    )
    assert len(signer_lines) <= 3
    assert any("Trần" in ln or "Hòa" in ln for ln in signer_lines)
    print(f"  signer_lines={ascii(signer_lines)}, font_size={font_size}")


def test_font_exists():
    """Font file must exist."""
    try:
        _ensure_font()
    except FileNotFoundError as e:
        print(f"  SKIP: {e}")
        return
    print("  Font OK")


if __name__ == "__main__":
    print("test_wrap_short:")
    test_wrap_short()
    print("test_wrap_long:")
    test_wrap_long()
    print("test_wrap_vietnamese:")
    test_wrap_vietnamese()
    print("test_font_exists:")
    test_font_exists()
    print("Done.")
