# -*- coding: utf-8 -*-
"""
Demo: Create a PDF with the signature stamp appearance (no actual signing).
Run: python demo_stamp_appearance.py
Output: demo_stamped.pdf with the stamp on page 1.
"""
import asyncio
from io import BytesIO
from pathlib import Path

from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.pdf_utils import layout

from signer.sig_appearance import SigAppearanceStampStyle


def main():
    # Create minimal PDF with pikepdf
    import pikepdf
    pdf = pikepdf.Pdf.new()
    pdf.add_blank_page(page_size=(595, 842))
    buf = BytesIO()
    pdf.save(buf)
    pdf.close()
    buf.seek(0)

    w = IncrementalPdfFileWriter(buf, strict=False)
    box = layout.BoxConstraints(width=200, height=60)
    style = SigAppearanceStampStyle()
    stamp = style.create_stamp(
        w,
        box,
        {
            "signer": "Công ty Cổ phần Công nghệ Việt Nam",
            "ts": "06/03/2025 14:30",
        },
    )
    stamp.apply(dest_page=0, x=100, y=700)

    out_path = Path("demo_stamped.pdf")
    with open(out_path, "wb") as f:
        w.write(f)

    print(f"Created {out_path}. Open in Adobe/Foxit to verify appearance.")


if __name__ == "__main__":
    main()
