#!/usr/bin/env python3
"""Print structural facts about the last signature in a PDF as JSON (for docs/COMPARE.md).

Requires pyHanko (and its asn1crypto dependency).
"""
import json
import re
import sys

from asn1crypto import cms
from pyhanko.pdf_utils.reader import PdfFileReader


def main(path: str) -> None:
    data = open(path, "rb").read()
    reader = PdfFileReader(open(path, "rb"), strict=False)
    sig = reader.embedded_signatures[-1]
    sd = sig.sig_object
    widget = sig.sig_field
    signed = sig.signer_info["signed_attrs"]
    unsigned = sig.signer_info["unsigned_attrs"]
    contents_hex_len = len(re.findall(rb"/Contents\s*<([0-9A-Fa-f]*)>", data)[-1]) // 2
    ap = widget.get("/AP")
    ap_n = ap["/N"] if ap else None
    fonts = []
    if ap_n is not None:
        res = ap_n.get("/Resources", {})

        def deref(o):
            return o.get_object() if hasattr(o, "get_object") else o

        def walk(r, depth=0):
            r = deref(r)
            for _, f in deref(r.get("/Font") or {}).items():
                f = f.get_object()
                fonts.append(f"{f.get('/Subtype')} {f.get('/BaseFont')}")
            for _, x in deref(r.get("/XObject") or {}).items():
                x = x.get_object()
                if depth < 4 and "/Resources" in x:
                    walk(x["/Resources"], depth + 1)

        walk(res)
    rect = [round(float(v), 2) for v in widget["/Rect"]]
    sd_cms = sig.signed_data
    out = {
        "file": path,
        "incrementalUpdates": data.count(b"%%EOF"),
        "filter": str(sd.get("/Filter")),
        "subFilter": str(sd.get("/SubFilter")),
        "sigDictKeys": sorted(str(k) for k in sd.keys()),
        "M": str(sd.get("/M")),
        "contentsReservedBytes": contents_hex_len,
        "cmsBytes": len(sig.pkcs7_content),
        "cmsVersion": sd_cms["version"].native,
        "digestAlgorithms": [a["algorithm"].native for a in sd_cms["digest_algorithms"]],
        "encapContentType": sd_cms["encap_content_info"]["content_type"].native,
        "certificatesEmbedded": len(sd_cms["certificates"]),
        "signerInfoVersion": sig.signer_info["version"].native,
        "sid": sig.signer_info["sid"].name,
        "digestAlgorithm": sig.signer_info["digest_algorithm"]["algorithm"].native,
        "signatureAlgorithm": sig.signer_info["signature_algorithm"]["algorithm"].native,
        "signatureAlgorithmParams": repr(sig.signer_info["signature_algorithm"]["parameters"].native),
        "signedAttributes": [a["type"].native for a in signed],
        "unsignedAttributes": [a["type"].native for a in unsigned] if unsigned.native else [],
        "widgetRect": rect,
        "widgetF": int(widget.get("/F", 0)),
        "fieldName": str(widget.get("/T")),
        "appearanceFonts": fonts,
        "dssPresent": "/DSS" in reader.root,
    }
    for a in signed:
        if a["type"].native == "signing_certificate_v2":
            cid = a["values"][0]["certs"][0]
            out["essCertIdV2"] = {
                "hashAlgorithm": cid["hash_algorithm"]["algorithm"].native,
                "issuerSerialPresent": cid["issuer_serial"].native is not None,
            }
        if a["type"].native == "signing_time":
            out["signingTimeAttr"] = str(a["values"][0].native)
    print(json.dumps(out, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main(sys.argv[1])
