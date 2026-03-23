#!/usr/bin/env python3
"""
sign_core.py - CLI for listing certs and signing PDFs.
Output to stdout, errors to stderr, exit 0 on success.
Used by PDFSignProSigner WPF app.
"""
import argparse
import json
import os
import sys
from pathlib import Path

# Force UTF-8 for stdout/stderr (handles Vietnamese and other Unicode in cert names)
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

sys.path.insert(0, str(Path(__file__).resolve().parent))

from signer.pkcs11_discovery import get_pkcs11_dll
from signer.cert_selector import list_certs_from_token, list_certs_try_pkcs11_dlls, get_signer_name
from signer.pades_signer import sign_pdf_sync


def parse_rect_pct(s: str) -> tuple[float, float, float, float]:
    parts = s.split(",")
    if len(parts) != 4:
        raise ValueError("rectPct must be x,y,w,h (4 values 0..1)")
    vals = [float(p.strip()) for p in parts]
    for v in vals:
        if not 0 <= v <= 1:
            raise ValueError(f"rectPct values must be 0..1, got {v}")
    return (vals[0], vals[1], vals[2], vals[3])


def parse_page(s: str):
    if s.upper() == "LAST":
        return "LAST"
    return int(s)


def _print_certs_json(dll_path: str, certs) -> None:
    out = [
        {
            "index": i,
            "subjectO": c.subject_o,
            "subjectCN": c.subject_cn,
            "issuerCN": c.issuer_cn,
            "serial": c.serial,
            "validTo": c.valid_to,
            "displayName": get_signer_name(c),
        }
        for i, c in enumerate(certs)
    ]
    print(json.dumps({"dllPath": dll_path, "certs": out}, ensure_ascii=False))


def list_certs(dll_path: str, pin: str) -> None:
    """List certificates. Output JSON to stdout: {dllPath, certs} for WPF to reuse dllPath when signing."""
    certs, _ = list_certs_from_token(str(dll_path), pin=pin)
    _print_certs_json(dll_path, certs)


def sign_pdf(
    input_path: str,
    output_path: str,
    page_spec,
    rect_pct: tuple[float, float, float, float],
    dll_path: str,
    cert_index: int,
    pin: str,
    template_id: str = "valid",
    seal_image_path: str | None = None,
) -> None:
    """Sign PDF. Output to stdout on success."""
    certs, slot_no = list_certs_from_token(dll_path, pin=pin)
    if cert_index < 0 or cert_index >= len(certs):
        raise ValueError(f"Invalid cert index {cert_index}")
    cert_info = certs[cert_index]
    sign_pdf_sync(
        input_path=Path(input_path),
        output_path=Path(output_path),
        lib_path=dll_path,
        cert_info=cert_info,
        pin=pin,
        page_spec=page_spec,
        rect_pct=rect_pct,
        slot_no=slot_no,
        cert_index=cert_index,
        template_id=template_id,
        seal_image_path=seal_image_path,
    )
    print("OK")


def main() -> int:
    parser = argparse.ArgumentParser(description="PDF signer CLI")
    parser.add_argument("--list-certs", action="store_true", help="List certificates")
    parser.add_argument("--dll", help="Path to PKCS#11 DLL")
    parser.add_argument("--pin", help="PIN for token")
    parser.add_argument("--in", dest="input", help="Input PDF path")
    parser.add_argument("--out", dest="output", help="Output PDF path")
    parser.add_argument("--page", default="LAST", help="Page number or LAST")
    parser.add_argument("--rectPct", default="0.64,0.06,0.32,0.10", help="Rect as x,y,w,h")
    parser.add_argument("--cert-index", type=int, help="Certificate index")
    parser.add_argument("--template", default="valid", help="Template: classic, modern, minimal, stamp, valid, seal")
    parser.add_argument("--seal-image", dest="seal_image", default=None, help="Path to seal image (for seal template)")

    args = parser.parse_args()

    try:
        if args.list_certs:
            if not args.pin:
                print("--list-certs requires --pin", file=sys.stderr)
                return 1
            if args.dll:
                dll = str(get_pkcs11_dll(args.dll))
                list_certs(dll, args.pin)
            else:
                certs, _, dll = list_certs_try_pkcs11_dlls(
                    args.pin, os.environ.get("PKCS11_DLL")
                )
                _print_certs_json(dll, certs)
        else:
            if not all([args.input, args.output, args.rectPct, args.dll, args.cert_index is not None, args.pin]):
                print("Sign mode requires --in, --out, --rectPct, --dll, --cert-index, --pin", file=sys.stderr)
                return 1
            dll = get_pkcs11_dll(args.dll) if args.dll else get_pkcs11_dll(None)
            page_spec = parse_page(args.page)
            rect = parse_rect_pct(args.rectPct)
            template_id = (args.template or "valid").strip().lower()
            sign_pdf(
                args.input,
                args.output,
                page_spec,
                rect,
                str(dll),
                args.cert_index,
                args.pin,
                template_id=template_id,
                seal_image_path=args.seal_image,
            )
    except Exception as e:
        print(str(e), file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
