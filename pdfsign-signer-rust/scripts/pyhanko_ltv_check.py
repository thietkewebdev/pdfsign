#!/usr/bin/env python3
"""Validate signatures with pyHanko in LTV mode (only data embedded in the PDF is used).

Usage: pyhanko_ltv_check.py FILE.pdf TRUST_ROOT.pem {lt|lta}
Exit code 0 when every regular signature validates as intact, trusted and LTV-complete.
"""
import sys

from asn1crypto import pem, x509
from pyhanko.pdf_utils.reader import PdfFileReader
from pyhanko.sign.validation import RevocationInfoValidationType, validate_pdf_ltv_signature  # pyHanko <= 0.29


def load_cert(path):
    data = open(path, "rb").read()
    if pem.detect(data):
        _, _, data = pem.unarmor(data)
    return x509.Certificate.load(data)


def main():
    path, root_path, mode = sys.argv[1], sys.argv[2], sys.argv[3]
    vtype = {"lt": RevocationInfoValidationType.PADES_LT, "lta": RevocationInfoValidationType.PADES_LTA}[mode]
    root = load_cert(root_path)
    reader = PdfFileReader(open(path, "rb"))
    ok = True
    sigs = reader.embedded_regular_signatures
    print(f"{path}: {len(sigs)} signature(s), mode PADES_{mode.upper()}")
    for sig in sigs:
        status = validate_pdf_ltv_signature(
            sig, vtype, validation_context_kwargs={"trust_roots": [root]}
        )
        print("=" * 60)
        print(status.pretty_print_details())
        good = status.bottom_line and status.trusted and status.intact
        print(f"RESULT {sig.field_name}: {'VALID (LTV)' if good else 'INVALID'}")
        ok &= bool(good)
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
