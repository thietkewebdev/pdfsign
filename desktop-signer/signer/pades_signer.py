"""
PAdES signing with pyHanko + PKCS#11.
Creates signature field, text appearance, embeds CMS.
"""
import asyncio
import os
from io import BytesIO
from datetime import datetime
from pathlib import Path
from typing import Optional, Tuple, Union

from pyhanko.pdf_utils.incremental_writer import IncrementalPdfFileWriter
from pyhanko.sign import fields, signers
from pyhanko.sign.fields import SigFieldSpec
from pyhanko.sign.pkcs11 import PKCS11Signer
from pyhanko.sign.signers.pdf_signer import PdfSignatureMetadata

from .sig_appearance import get_stamp_style_for_template
import pkcs11
from pkcs11 import Attribute, ObjectClass

from .cert_selector import CertInfo, get_signer_name

# SVG stamp uses NotoSans from assets/fonts/ (see sig_appearance.py)


SANITIZE_REPAIR_HINT = (
    "PDF could not be sanitized. Try: (1) Open in Adobe Reader and 'Save As' a new file, "
    "(2) Print to PDF from your app, or (3) Use qpdf: qpdf --linearize input.pdf output.pdf"
)


def _sanitize_pdf_with_pikepdf(input_path: Path) -> bytes:
    """
    Sanitize PDF with pikepdf: open and save to BytesIO.
    Produces clean bytes that pyHanko can parse reliably.
    """
    try:
        import pikepdf
    except ImportError:
        raise RuntimeError(
            "PDF sanitization requires pikepdf. Install: pip install pikepdf"
        ) from None

    try:
        pdf = pikepdf.open(input_path)
        buf = BytesIO()
        pdf.save(buf)
        pdf.close()
        return buf.getvalue()
    except Exception as e:
        raise RuntimeError(
            f"PDF sanitization failed: {e}. {SANITIZE_REPAIR_HINT}"
        ) from e


# Default A4 size in points (avoid touching page dicts)
_DEFAULT_PAGE_WIDTH = 595.2
_DEFAULT_PAGE_HEIGHT = 841.8


def _get_page_index_and_box(
    page_spec: Union[int, str],
    x_pct: float,
    y_pct: float,
    w_pct: float,
    h_pct: float,
) -> tuple[int, tuple[float, float, float, float]]:
    """
    Convert page_spec and rectPct to (page_idx, box).
    Does NOT touch any PDF objects - uses fixed A4 dimensions for box.
    page_spec: 1-based int or 'LAST' -> 0-based index (-1 for last).
    rectPct: x,y,w,h (0..1) bottom-left origin.
    Returns (page_idx, (x1,y1,x2,y2) in points).
    """
    if isinstance(page_spec, str) and str(page_spec).upper() == "LAST":
        page_idx = -1
    else:
        page_idx = int(page_spec) - 1
        if page_idx < 0:
            raise ValueError(f"Page must be >= 1 or LAST, got {page_spec}")

    width = _DEFAULT_PAGE_WIDTH
    height = _DEFAULT_PAGE_HEIGHT
    x1 = x_pct * width
    y1 = y_pct * height
    x2 = x1 + w_pct * width
    y2 = y1 + h_pct * height
    box = (x1, y1, x2, y2)
    return page_idx, box


def _normalize_key_id(cert_id: Optional[bytes]) -> Optional[bytes]:
    """Strip trailing null bytes; some tokens store cert/key IDs differently."""
    if cert_id is None:
        return None
    cert_id = bytes(cert_id).rstrip(b"\x00")
    return cert_id if cert_id else None


def _ids_match(a: Optional[bytes], b: Optional[bytes]) -> bool:
    """Compare IDs with normalization (strip trailing nulls)."""
    if a is None and b is None:
        return True
    if a is None or b is None:
        return False
    return _normalize_key_id(a) == _normalize_key_id(b)


def _safe_key_attr(obj, attr, default=None):
    """Get attribute from PKCS#11 key object."""
    try:
        v = obj[attr]
        return v
    except (KeyError, TypeError, AttributeError):
        return default


def _list_private_keys(session: pkcs11.Session) -> list[Tuple[Optional[str], Optional[bytes]]]:
    """List all private keys on token as (label, id) tuples."""
    keys = []
    for obj in session.get_objects({Attribute.CLASS: ObjectClass.PRIVATE_KEY}):
        label = _safe_key_attr(obj, Attribute.LABEL)
        label = str(label) if label is not None else None
        kid = _safe_key_attr(obj, Attribute.ID)
        kid = bytes(kid) if kid is not None else None
        keys.append((label, kid))
    return keys


def _find_matching_key(
    session: pkcs11.Session,
    cert_info: CertInfo,
    cert_index: Optional[int] = None,
) -> Optional[Tuple[Optional[str], Optional[bytes]]]:
    """
    Find a private key that matches the cert (by CKA_ID or label).
    Returns (key_label, key_id) or None.
    """
    keys = _list_private_keys(session)
    cert_id_norm = _normalize_key_id(cert_info.cert_id)
    cert_label = cert_info.cert_label or ""

    for key_label, key_id in keys:
        if _ids_match(key_id, cert_info.cert_id):
            return (key_label, key_id)
        if cert_id_norm and key_id is not None and _normalize_key_id(key_id) == cert_id_norm:
            return (key_label, key_id)
        if cert_label and key_label and key_label == cert_label:
            return (key_label, key_id)

    # Single key: assume it pairs with selected cert
    if len(keys) == 1:
        return keys[0]

    # Heuristic: certs and keys often stored in same order (cert[i] pairs with key[i])
    if cert_index is not None and 0 <= cert_index < len(keys):
        return keys[cert_index]

    if os.environ.get("PDFSIGN_DEBUG") and keys:
        print("[DEBUG] Private keys on token:")
        for i, (kl, ki) in enumerate(keys):
            print(f"  [{i}] LABEL={kl!r} ID={repr(ki) if ki else None}")
    return None


def _create_pkcs11_signer(
    session: pkcs11.Session,
    cert_info: CertInfo,
    *,
    key_label: Optional[str] = None,
    key_id: Optional[bytes] = None,
) -> PKCS11Signer:
    """Create pyHanko PKCS11Signer from session and selected cert."""
    from asn1crypto import x509 as asn1_x509

    cert_asn1 = asn1_x509.Certificate.load(cert_info.raw_der)
    kl = key_label if key_label is not None else cert_info.cert_label
    kid = key_id if key_id is not None else _normalize_key_id(cert_info.cert_id)
    return PKCS11Signer(
        pkcs11_session=session,
        signing_cert=cert_asn1,
        cert_label=cert_info.cert_label or None,
        cert_id=cert_info.cert_id,
        key_label=kl,
        key_id=kid,
    )


def _next_sig_field_name(writer: IncrementalPdfFileWriter) -> str:
    """Find next available signature field name (Signature1, Signature2, ...)."""
    existing = set()
    def _normalize_field_name(raw_name) -> Optional[str]:
        if raw_name is None:
            return None
        try:
            name = str(raw_name).strip()
        except Exception:
            return None
        if not name:
            return None
        # Common PDF serializations we may encounter:
        #   /Signature1
        #   (Signature1)
        if name.startswith("/"):
            name = name[1:]
        if name.startswith("(") and name.endswith(")") and len(name) >= 2:
            name = name[1:-1]
        return name or None

    def _collect_sig_fields(field_obj):
        try:
            ft = field_obj.get("/FT")
            name = field_obj.get("/T")
            norm_name = _normalize_field_name(name)
            if ft == "/Sig" and norm_name:
                existing.add(norm_name)

            kids = field_obj.get("/Kids")
            if kids:
                for kid_ref in kids:
                    try:
                        kid = kid_ref.get_object()
                        _collect_sig_fields(kid)
                    except Exception:
                        pass
        except Exception:
            pass

    try:
        reader = writer.prev
        root = reader.root
        acroform = root.get("/AcroForm")
        if acroform:
            field_list = acroform.get("/Fields")
            if field_list:
                for field_ref in field_list:
                    try:
                        field = field_ref.get_object()
                        _collect_sig_fields(field)
                    except Exception:
                        pass
    except Exception:
        pass

    n = 1
    while f"Signature{n}" in existing:
        n += 1
    # Keep human-readable order when possible, but suffix with random token if needed.
    # This guarantees uniqueness even when some PDFs expose field names differently.
    candidate = f"Signature{n}"
    if candidate not in existing:
        return candidate
    return f"Signature_{os.urandom(4).hex()}"


async def sign_pdf(
    input_path: Path,
    output_path: Path,
    lib_path: str,
    cert_info: CertInfo,
    pin: str,
    page_spec: Union[int, str],
    rect_pct: tuple[float, float, float, float],
    slot_no: Optional[int] = None,
    cert_index: Optional[int] = None,
    template_id: str = "valid",
    seal_image_path: Optional[str] = None,
) -> None:
    """
    Sign PDF with PAdES using PKCS#11 token.
    Desktop-signer chỉ xác thực chứng thư số, không nhận mẫu chữ ký.
    """
    from pyhanko.sign.pkcs11 import open_pkcs11_session

    x_pct, y_pct, w_pct, h_pct = rect_pct

    signer_name = get_signer_name(cert_info)
    try:
        import zoneinfo
        tz = zoneinfo.ZoneInfo("Asia/Ho_Chi_Minh")
        ts_str = datetime.now(tz).strftime("%d/%m/%Y %H:%M:%S")
    except ImportError:
        ts_str = datetime.now().strftime("%d/%m/%Y %H:%M:%S")

    with open_pkcs11_session(
        lib_path,
        slot_no=slot_no,
        user_pin=pin,
    ) as session:
        pkcs11_signer = _create_pkcs11_signer(session, cert_info)
        try:
            await pkcs11_signer.ensure_objects_loaded()
        except Exception as e:
            err_msg = str(e)
            if "No key matching" not in err_msg:
                raise
            # Enumerate private keys and try explicit match (or index heuristic)
            match = _find_matching_key(session, cert_info, cert_index=cert_index)
            if match:
                key_label, key_id = match
                pkcs11_signer = _create_pkcs11_signer(
                    session, cert_info, key_label=key_label, key_id=key_id
                )
                await pkcs11_signer.ensure_objects_loaded()
            else:
                raise RuntimeError(
                    f"No private key found for certificate. Cert/key labels or IDs "
                    f"do not match on this token. Run with PDFSIGN_DEBUG=1 to list keys."
                ) from e

        # Sanitize with pikepdf first to avoid pyHanko parse errors
        # (incorrect startxref, Object Streams, Dictionary read error, seek of closed file, etc.)
        pdf_bytes = _sanitize_pdf_with_pikepdf(input_path)

        # Use BytesIO so stream stays in memory; no closed file handles
        pdf_stream = BytesIO(pdf_bytes)
        w = IncrementalPdfFileWriter(pdf_stream, strict=False)

        page_idx, box = _get_page_index_and_box(page_spec, x_pct, y_pct, w_pct, h_pct)

        sig_field_name = _next_sig_field_name(w)

        try:
            fields.append_signature_field(
                w,
                sig_field_spec=SigFieldSpec(
                    sig_field_name=sig_field_name,
                    box=box,
                    on_page=page_idx,
                ),
            )
        except Exception as e:
            # Some PDFs report existing fields in non-standard ways.
            # Fallback to a guaranteed-unique field name and retry once.
            msg = str(e).lower()
            if "appears to be filled already" in msg or "already exists" in msg:
                sig_field_name = f"Signature_{os.urandom(6).hex()}"
                fields.append_signature_field(
                    w,
                    sig_field_spec=SigFieldSpec(
                        sig_field_name=sig_field_name,
                        box=box,
                        on_page=page_idx,
                    ),
                )
            else:
                raise

        meta = PdfSignatureMetadata(field_name=sig_field_name)
        stamp_style = get_stamp_style_for_template(template_id, seal_image_path=seal_image_path)
        pdf_signer = signers.PdfSigner(
            meta,
            signer=pkcs11_signer,
            stamp_style=stamp_style,
        )

        with open(output_path, "wb") as outf:
            await pdf_signer.async_sign_pdf(
                w,
                output=outf,
                appearance_text_params={"signer": signer_name, "ts": ts_str},
            )


def sign_pdf_sync(
    input_path: Path,
    output_path: Path,
    lib_path: str,
    cert_info: CertInfo,
    pin: str,
    page_spec: Union[int, str],
    rect_pct: tuple[float, float, float, float],
    slot_no: Optional[int] = None,
    cert_index: Optional[int] = None,
    template_id: str = "valid",
    seal_image_path: Optional[str] = None,
) -> None:
    """Synchronous wrapper for sign_pdf."""
    asyncio.run(
        sign_pdf(
            input_path=input_path,
            output_path=output_path,
            lib_path=lib_path,
            cert_info=cert_info,
            pin=pin,
            page_spec=page_spec,
            rect_pct=rect_pct,
            slot_no=slot_no,
            cert_index=cert_index,
            template_id=template_id,
            seal_image_path=seal_image_path,
        )
    )
