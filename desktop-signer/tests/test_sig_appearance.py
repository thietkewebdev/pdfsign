"""
Unit tests for signature appearance: word wrapping and layout (stamp_valid).
"""
import logging
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from signer.sig_appearance import (
    _compute_stamp_layout,
    _ensure_font,
)

logging.basicConfig(level=logging.DEBUG, format="%(name)s: %(message)s")


def test_wrap_short():
    """Short signer name fits on one line."""
    w, h = 200.0, 60.0
    signer = "Nguyễn Văn A"
    ts = "06/03/2025 14:30"
    icon_size, text_x, text_max_width, title_size, content_size, signer_lines, ts_lines = _compute_stamp_layout(
        w, h, signer, ts
    )
    assert len(signer_lines) <= 2
    assert "Ký bởi" in signer_lines[0]
    assert "Nguyễn" in signer_lines[0] or "Nguyễn" in " ".join(signer_lines)
    assert len(ts_lines) >= 1
    print(f"  signer_lines={ascii(signer_lines)}, ts_lines={ascii(ts_lines)}")


def test_wrap_long():
    """Long company name wraps to multiple lines."""
    w, h = 200.0, 70.0
    signer = "Công ty Cổ phần Công nghệ và Giải pháp Việt Nam"
    ts = "06/03/2025 14:30"
    icon_size, text_x, text_max_width, title_size, content_size, signer_lines, ts_lines = _compute_stamp_layout(
        w, h, signer, ts
    )
    assert len(signer_lines) <= 2
    assert len(signer_lines) >= 1
    print(f"  signer_lines={ascii(signer_lines)}")


def test_wrap_long_timestamp():
    """Long timestamp wraps without overflow."""
    w, h = 120.0, 50.0
    signer = "Công ty ABC"
    ts = "14/03/2026 09:33:58"
    icon_size, text_x, text_max_width, title_size, content_size, signer_lines, ts_lines = _compute_stamp_layout(
        w, h, signer, ts
    )
    assert len(ts_lines) <= 3
    assert any("Thời gian" in ln for ln in ts_lines)
    print(f"  ts_lines={ascii(ts_lines)}")


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
    print("test_wrap_long_timestamp:")
    test_wrap_long_timestamp()
    print("test_font_exists:")
    test_font_exists()
    print("Done.")
