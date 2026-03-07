"""
Token and certificate selection via PKCS#11.
Lists slots, certs, parses X.509 for display.
"""
import getpass
import os
from dataclasses import dataclass
from typing import Optional

from cryptography import x509
from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives import serialization
import pkcs11
from pkcs11 import ObjectClass, Attribute


@dataclass
class CertInfo:
    """Parsed certificate info for display."""
    subject_o: Optional[str]
    subject_cn: Optional[str]
    serial: str
    valid_from: str
    valid_to: str
    cert_label: str
    cert_id: Optional[bytes]
    key_id: Optional[bytes]
    raw_der: bytes


def _get_rdn(cert: x509.Certificate, oid: x509.ObjectIdentifier) -> Optional[str]:
    """Extract first RDN value from cert subject as Unicode str."""
    try:
        attrs = cert.subject.get_attributes_for_oid(oid)
        if not attrs:
            return None
        val = attrs[0].value
        if isinstance(val, bytes):
            return val.decode("utf-8", errors="replace")
        return str(val) if val is not None else None
    except Exception:
        return None


def parse_cert_der(der_bytes: bytes, label: str = "", cert_id: Optional[bytes] = None) -> CertInfo:
    """Parse X.509 cert DER to CertInfo."""
    cert = x509.load_der_x509_certificate(der_bytes, default_backend())
    subject_o = _get_rdn(cert, x509.NameOID.ORGANIZATION_NAME)
    subject_cn = _get_rdn(cert, x509.NameOID.COMMON_NAME)
    serial = format(cert.serial_number, "x").upper()
    valid_from = cert.not_valid_before_utc.strftime("%Y-%m-%d %H:%M")
    valid_to = cert.not_valid_after_utc.strftime("%Y-%m-%d %H:%M")
    return CertInfo(
        subject_o=subject_o,
        subject_cn=subject_cn,
        serial=serial,
        valid_from=valid_from,
        valid_to=valid_to,
        cert_label=label,
        cert_id=cert_id,
        key_id=None,
        raw_der=der_bytes,
    )


def _safe_attr(obj, attr, default=None):
    """Get attribute from PKCS#11 object (uses [], not .get())."""
    try:
        return obj[attr]
    except (KeyError, TypeError, AttributeError):
        return default


def _debug_list_objects(token, pin: Optional[str]) -> None:
    """Print all objects on token (when PDFSIGN_DEBUG=1)."""
    try:
        with token.open(user_pin=pin or "") as session:
            objs = list(session.get_objects())
            print(f"[DEBUG] Token has {len(objs)} object(s)")
            for i, obj in enumerate(objs):
                cls = _safe_attr(obj, Attribute.CLASS, "?")
                label = _safe_attr(obj, Attribute.LABEL, "")
                oid = _safe_attr(obj, Attribute.ID, "")
                v = _safe_attr(obj, Attribute.VALUE)
                val_preview = ""
                if v is not None:
                    v = bytes(v)
                    val_preview = f" len={len(v)}" + (f" start={v[:4].hex()}" if len(v) >= 4 else "")
                print(f"  [{i}] CLASS={cls} LABEL={label!r} ID={oid!r}{val_preview}")
    except Exception as e:
        print(f"[DEBUG] Could not list objects: {e}")


def get_signer_name(cert_info: CertInfo) -> str:
    """Get display name: O if present, else CN."""
    return cert_info.subject_o or cert_info.subject_cn or "Unknown"


def list_certs_from_token(
    lib_path: str,
    pin: Optional[str] = None,
    slot_no: Optional[int] = None,
) -> tuple[list[CertInfo], int]:
    """
    List certificates from token. Requires PIN for most tokens.
    Returns (list of CertInfo, slot_no used).
    """
    lib = pkcs11.lib(lib_path)
    slots = lib.get_slots(token_present=True)
    if not slots:
        raise RuntimeError("No token found. Please insert USB token.")

    slot_idx = slot_no if slot_no is not None and 0 <= slot_no < len(slots) else 0
    slot = slots[slot_idx]
    token = slot.get_token()
    used_slot = slot_idx

    certs: list[CertInfo] = []
    try:
        with token.open(user_pin=pin or "") as session:
            # Try explicit CERTIFICATE class first
            for obj in session.get_objects({Attribute.CLASS: ObjectClass.CERTIFICATE}):
                try:
                    der_raw = _safe_attr(obj, Attribute.VALUE)
                    if der_raw is None:
                        continue
                    der = bytes(der_raw)
                    label = str(_safe_attr(obj, Attribute.LABEL) or "")
                    cert_id = _safe_attr(obj, Attribute.ID)
                    if cert_id is not None:
                        cert_id = bytes(cert_id) if isinstance(cert_id, (bytes, bytearray)) else None
                    info = parse_cert_der(der, label=label, cert_id=cert_id)
                    certs.append(info)
                except Exception:
                    continue

            # Fallback: list ALL objects, find any that contain valid X.509 DER
            if not certs:
                for obj in session.get_objects():
                    try:
                        der_raw = _safe_attr(obj, Attribute.VALUE)
                        if der_raw is None:
                            continue
                        der = bytes(der_raw)
                        # X.509 DER: starts with 0x30 (SEQUENCE), 0x82 (long form length)
                        if len(der) < 4 or der[0] != 0x30 or der[1] not in (0x81, 0x82):
                            continue
                        label = str(_safe_attr(obj, Attribute.LABEL) or "")
                        cert_id = _safe_attr(obj, Attribute.ID)
                        if cert_id is not None:
                            cert_id = bytes(cert_id) if isinstance(cert_id, (bytes, bytearray)) else None
                        info = parse_cert_der(der, label=label, cert_id=cert_id)
                        certs.append(info)
                    except Exception:
                        continue
    except pkcs11.exceptions.PinIncorrect:
        raise RuntimeError("Wrong PIN. Please try again.")
    except pkcs11.exceptions.UserNotLoggedIn:
        raise RuntimeError("Token requires PIN. Please run again and enter PIN when prompted.")

    if not certs:
        if os.environ.get("PDFSIGN_DEBUG"):
            _debug_list_objects(token, pin)
        raise RuntimeError(
            "No certificates found on token. "
            "Ensure the token has a signing certificate installed. "
            "Some tokens require certificate import via vendor software first. "
            "Run with PDFSIGN_DEBUG=1 to list token objects."
        )

    return certs, used_slot
