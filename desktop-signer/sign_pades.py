#!/usr/bin/env python3
"""
PDFSignPro Desktop Signer - PAdES signing with USB token (PKCS#11).

Example:
    python sign_pades.py --in input.pdf --out signed.pdf --page LAST --rectPct 0.64,0.06,0.32,0.10
"""
import argparse
import getpass
import os
import sys
from pathlib import Path

# Add package to path when run as script
sys.path.insert(0, str(Path(__file__).resolve().parent))

from signer.pkcs11_discovery import get_pkcs11_dll
from signer.cert_selector import (
    list_certs_from_token,
    CertInfo,
    get_signer_name,
)
from signer.pades_signer import sign_pdf_sync


def parse_rect_pct(s: str) -> tuple[float, float, float, float]:
    """Parse 'x,y,w,h' into tuple of floats."""
    parts = s.split(",")
    if len(parts) != 4:
        raise ValueError("rectPct must be x,y,w,h (4 values 0..1)")
    vals = [float(p.strip()) for p in parts]
    for v in vals:
        if not 0 <= v <= 1:
            raise ValueError(f"rectPct values must be 0..1, got {v}")
    return (vals[0], vals[1], vals[2], vals[3])


def parse_page(s: str):
    """Parse page: 1-based int or 'LAST'."""
    if s.upper() == "LAST":
        return "LAST"
    return int(s)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Sign PDF with PAdES using USB token (PKCS#11)"
    )
    parser.add_argument("--in", dest="input", required=True, help="Input PDF path")
    parser.add_argument("--out", dest="output", required=True, help="Output signed PDF path")
    parser.add_argument(
        "--page",
        default="LAST",
        help="Page number (1-based) or LAST for last page",
    )
    parser.add_argument(
        "--rectPct",
        default="0.64,0.06,0.32,0.10",
        help="Signature box as x,y,w,h (0..1, bottom-left origin). Default: 0.64,0.06,0.32,0.10",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"Error: Input file not found: {input_path}", file=sys.stderr)
        return 1

    # 1. Discover PKCS#11 DLL
    try:
        dll_path = get_pkcs11_dll(os.environ.get("PKCS11_DLL"))
        print(f"Using PKCS#11: {dll_path}")
    except FileNotFoundError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    # 2. Get PIN
    pin = getpass.getpass("Enter token PIN: ")
    if not pin:
        print("Error: PIN is required.", file=sys.stderr)
        return 1

    # 3. List certs
    try:
        certs, slot_no = list_certs_from_token(str(dll_path), pin=pin)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    # 4. Display and select
    print("\nCertificates on token:")
    for i, c in enumerate(certs):
        name = get_signer_name(c)
        print(f"  [{i}] {name}")
        print(f"      Serial: {c.serial}  Valid: {c.valid_from} - {c.valid_to}")

    if len(certs) == 1:
        idx = 0
        print(f"\nUsing certificate [0] (only one available)")
    else:
        try:
            idx = int(input("\nSelect certificate by index: "))
            if idx < 0 or idx >= len(certs):
                print("Error: Invalid index.", file=sys.stderr)
                return 1
        except ValueError:
            print("Error: Enter a number.", file=sys.stderr)
            return 1

    cert_info: CertInfo = certs[idx]

    # 5. Parse page and rect
    try:
        page_spec = parse_page(args.page)
        rect_pct = parse_rect_pct(args.rectPct)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1

    # 6. Sign
    print(f"\nSigning {input_path} -> {output_path}...")
    try:
        sign_pdf_sync(
            input_path=input_path,
            output_path=output_path,
            lib_path=str(dll_path),
            cert_info=cert_info,
            pin=pin,
            page_spec=page_spec,
            rect_pct=rect_pct,
            slot_no=slot_no,
            cert_index=idx,
        )
    except Exception as e:
        print(f"Error signing: {e}", file=sys.stderr)
        return 1

    print(f"Done. Signed PDF saved to {output_path}")
    print("Open with Adobe Reader to view signature and certificate details.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
