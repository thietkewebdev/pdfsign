#!/usr/bin/env python3
"""Write small dependency-free sample PDFs for signing tests.

sample.pdf          2 pages (A4 + Letter), classic xref table
sample-rotated.pdf  1 A4 page with /Rotate 90
(sample-xrefstream.pdf is produced from sample.pdf with qpdf, see tests/README in docs.)
"""
import sys
from pathlib import Path


def build(pages):
    objs = []

    def add(body: bytes) -> int:
        objs.append(body)
        return len(objs)

    font = add(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")
    page_ids = []
    pages_id = len(pages) * 2 + 2  # reserved below
    for i, (w, h, rot, text) in enumerate(pages):
        content = (
            f"BT /F1 20 Tf 60 {h - 100} Td ({text}) Tj ET\n"
            f"BT /F1 11 Tf 60 {h - 130} Td (Trang {i + 1} - PDFSign Rust sample) Tj ET\n"
            f"0.8 0.8 0.8 RG 40 40 {w - 80} {h - 80} re S\n"
        ).encode()
        cid = add(b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream")
        rot_s = f" /Rotate {rot}" if rot else ""
        pid = add(
            (
                f"<< /Type /Page /Parent {pages_id} 0 R /MediaBox [0 0 {w} {h}]{rot_s} "
                f"/Resources << /Font << /F1 {font} 0 R >> >> /Contents {cid} 0 R >>"
            ).encode()
        )
        page_ids.append(pid)
    kids = " ".join(f"{p} 0 R" for p in page_ids)
    assert add(f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode()) == pages_id
    catalog = add(f"<< /Type /Catalog /Pages {pages_id} 0 R >>".encode())
    info = add(b"<< /Producer (pdfsign-signer-rust sample generator) /Title (Sample) >>")

    out = bytearray(b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n")
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n".encode() + body + b"\nendobj\n"
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n".encode()
    out += b"0000000000 65535 f\r\n"
    for off in offsets:
        out += f"{off:010d} 00000 n\r\n".encode()
    out += (
        f"trailer\n<< /Size {len(objs) + 1} /Root {catalog} 0 R /Info {info} 0 R "
        f"/ID [<00112233445566778899AABBCCDDEEFF> <00112233445566778899AABBCCDDEEFF>] >>\n"
        f"startxref\n{xref}\n%%EOF\n"
    ).encode()
    return bytes(out)


def main():
    out_dir = Path(sys.argv[1] if len(sys.argv) > 1 else "tests/fixtures")
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "sample.pdf").write_bytes(
        build([(595, 842, 0, "Hop dong mau so 1"), (612, 792, 0, "Phu luc (Letter)")])
    )
    (out_dir / "sample-rotated.pdf").write_bytes(build([(595, 842, 90, "Trang xoay 90 do")]))
    print(f"wrote samples to {out_dir}")


if __name__ == "__main__":
    main()
