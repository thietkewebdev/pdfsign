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
    issuer_cn: Optional[str]
    serial: str
    valid_from: str
    valid_to: str
    cert_label: str
    cert_id: Optional[bytes]
    key_id: Optional[bytes]
    raw_der: bytes


def _get_rdn_from_name(name: x509.Name, oid: x509.ObjectIdentifier) -> Optional[str]:
    """Extract first RDN value from X.509 Name as Unicode str."""
    try:
        attrs = name.get_attributes_for_oid(oid)
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
    subject_o = _get_rdn_from_name(cert.subject, x509.NameOID.ORGANIZATION_NAME)
    subject_cn = _get_rdn_from_name(cert.subject, x509.NameOID.COMMON_NAME)
    issuer_cn = _get_rdn_from_name(cert.issuer, x509.NameOID.COMMON_NAME)
    serial = format(cert.serial_number, "x").upper()
    valid_from = cert.not_valid_before_utc.strftime("%Y-%m-%d %H:%M")
    valid_to = cert.not_valid_after_utc.strftime("%Y-%m-%d %H:%M")
    return CertInfo(
        subject_o=subject_o,
        subject_cn=subject_cn,
        issuer_cn=issuer_cn,
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


def _slots_with_token_indices(lib) -> list[tuple[int, object]]:
    """
    Slots where a token is reachable via C_GetTokenInfo (matches pyHanko open_pkcs11_session).

    Some drivers (e.g. Viettel) omit TOKEN_PRESENT in C_GetSlotList(CK_TRUE), so
    token_present=True returns [] while the token still works.
    """
    all_slots = lib.get_slots(token_present=False)
    out: list[tuple[int, object]] = []
    for i, slot in enumerate(all_slots):
        try:
            slot.get_token()
        except Exception:
            continue
        out.append((i, slot))
    return out


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
    indexed = _slots_with_token_indices(lib)
    if not indexed:
        raise RuntimeError("No token found. Please insert USB token.")

    pick = (
        slot_no
        if slot_no is not None and 0 <= slot_no < len(indexed)
        else 0
    )
    used_slot, slot = indexed[pick]
    token = slot.get_token()

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


def list_certs_try_pkcs11_dlls(
    pin: str, env_override: Optional[str] = None
) -> tuple[list[CertInfo], int, str]:
    """
    Try each discovered PKCS#11 module (vendor order) until one sees the token.
    Returns (certs, slot_index_for_pyhanko, dll_path_used).
    """
    from .pkcs11_discovery import ordered_pkcs11_dll_candidates

    last: Optional[RuntimeError] = None
    for dll in ordered_pkcs11_dll_candidates(env_override):
        try:
            certs, slot = list_certs_from_token(str(dll), pin=pin)
            return certs, slot, str(dll)
        except RuntimeError as e:
            em = str(e)
            if "No token found" in em or "Please insert" in em:
                last = e
                continue
            raise
    if last is not None:
        raise last
    raise RuntimeError("No token found. Please insert USB token.")
