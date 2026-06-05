"""
Centralized PKCS#11 / signing error classification.

Maps low-level pkcs11 exceptions (and pyHanko-wrapped errors) into a small set of
stable, machine-readable error codes plus user-friendly Vietnamese messages.

The codes are emitted on stderr by sign_core.py (prefixed ``ERRCODE:``) so the WPF
host can show the right message without string-matching the whole exception text.
"""
from __future__ import annotations

from typing import Optional


# Stable error codes shared with the WPF host.
ERR_PIN_INCORRECT = "PIN_INCORRECT"
ERR_PIN_LOCKED = "PIN_LOCKED"
ERR_PIN_EXPIRED = "PIN_EXPIRED"
ERR_PIN_INVALID = "PIN_INVALID"
ERR_TOKEN_NOT_FOUND = "TOKEN_NOT_FOUND"
ERR_TOKEN_REMOVED = "TOKEN_REMOVED"
ERR_NO_CERTS = "NO_CERTS"
ERR_CERT_EXPIRED = "CERT_EXPIRED"
ERR_CERT_NOT_YET_VALID = "CERT_NOT_YET_VALID"
ERR_NO_PKCS11_DLL = "NO_PKCS11_DLL"
ERR_USER_CANCELLED = "USER_CANCELLED"
ERR_DEVICE_ERROR = "DEVICE_ERROR"
ERR_GENERAL = "GENERAL"


MESSAGES = {
    ERR_PIN_INCORRECT: "Mã PIN không đúng. Cảnh báo: nhập sai nhiều lần có thể khóa token.",
    ERR_PIN_LOCKED: "Token đã bị KHÓA do nhập sai PIN quá nhiều lần. Vui lòng dùng phần mềm của nhà cung cấp token để mở khóa (PUK) trước khi ký.",
    ERR_PIN_EXPIRED: "Mã PIN đã hết hạn và cần được đổi bằng phần mềm của nhà cung cấp token trước khi ký.",
    ERR_PIN_INVALID: "Mã PIN không hợp lệ (sai định dạng hoặc độ dài). Vui lòng kiểm tra lại.",
    ERR_TOKEN_NOT_FOUND: "Không tìm thấy USB token chữ ký số. Hãy cắm token vào máy và thử lại.",
    ERR_TOKEN_REMOVED: "Token đã bị rút ra khỏi máy trong quá trình ký. Hãy cắm lại token và thử lại.",
    ERR_NO_CERTS: "Không tìm thấy chứng thư số trên token. Một số token cần cài/nhập chứng thư bằng phần mềm nhà cung cấp trước khi ký.",
    ERR_CERT_EXPIRED: "Chứng thư số đã HẾT HẠN nên không thể ký. Vui lòng gia hạn chứng thư với nhà cung cấp.",
    ERR_CERT_NOT_YET_VALID: "Chứng thư số chưa đến thời điểm có hiệu lực nên không thể ký.",
    ERR_NO_PKCS11_DLL: "Không tìm thấy trình điều khiển (driver PKCS#11) của token trên máy. Hãy cài phần mềm token của nhà cung cấp (Viettel-CA, VNPT-CA, FPT-CA, BKAV-CA, ...).",
    ERR_USER_CANCELLED: "Đã hủy thao tác ký.",
    ERR_DEVICE_ERROR: "Lỗi thiết bị token. Hãy rút và cắm lại token, hoặc thử cổng USB khác.",
    ERR_GENERAL: "Đã xảy ra lỗi khi ký. Vui lòng thử lại.",
}


class SignerError(RuntimeError):
    """Signing error carrying a stable error code + friendly message."""

    def __init__(self, code: str, message: Optional[str] = None, cause: Optional[BaseException] = None):
        self.code = code
        self.message = message or MESSAGES.get(code, MESSAGES[ERR_GENERAL])
        super().__init__(self.message)
        if cause is not None:
            self.__cause__ = cause


def message_for(code: str) -> str:
    return MESSAGES.get(code, MESSAGES[ERR_GENERAL])


def classify_exception(exc: BaseException) -> str:
    """
    Map an arbitrary exception (pkcs11.* or pyHanko-wrapped) to a stable error code.
    Falls back to substring matching when the exception type is not a known pkcs11 type
    (pyHanko sometimes re-wraps token errors as generic exceptions).
    """
    # Already classified.
    if isinstance(exc, SignerError):
        return exc.code

    # Prefer exact pkcs11 exception types when available.
    try:
        from pkcs11 import exceptions as pk

        if isinstance(exc, pk.PinLocked):
            return ERR_PIN_LOCKED
        if isinstance(exc, pk.PinExpired):
            return ERR_PIN_EXPIRED
        if isinstance(exc, pk.PinIncorrect):
            return ERR_PIN_INCORRECT
        if isinstance(exc, (pk.PinInvalid, pk.PinLenRange, pk.PinTooWeak)):
            return ERR_PIN_INVALID
        if isinstance(exc, (pk.TokenNotPresent, pk.NoSuchToken)):
            return ERR_TOKEN_NOT_FOUND
        if isinstance(exc, pk.DeviceRemoved):
            return ERR_TOKEN_REMOVED
        if isinstance(exc, pk.FunctionCancelled):
            return ERR_USER_CANCELLED
        if isinstance(exc, (pk.DeviceError, pk.DeviceMemory)):
            return ERR_DEVICE_ERROR
        if isinstance(exc, pk.UserNotLoggedIn):
            # Surfaces when PIN was not accepted / session not logged in.
            return ERR_PIN_INCORRECT
    except Exception:
        pass

    # Substring fallback (pyHanko-wrapped or vendor messages).
    text = str(exc).upper()
    if "CKR_PIN_LOCKED" in text or "PIN LOCKED" in text or "PINLOCKED" in text:
        return ERR_PIN_LOCKED
    if "CKR_PIN_EXPIRED" in text or "PIN EXPIRED" in text:
        return ERR_PIN_EXPIRED
    if "CKR_PIN_INCORRECT" in text or "PININCORRECT" in text or "PIN INCORRECT" in text:
        return ERR_PIN_INCORRECT
    if "CKR_PIN_INVALID" in text or "CKR_PIN_LEN_RANGE" in text:
        return ERR_PIN_INVALID
    if "CKR_TOKEN_NOT_PRESENT" in text or "NO TOKEN" in text or "INSERT USB" in text:
        return ERR_TOKEN_NOT_FOUND
    if "CKR_DEVICE_REMOVED" in text:
        return ERR_TOKEN_REMOVED
    if "CKR_DEVICE_ERROR" in text:
        return ERR_DEVICE_ERROR
    if "CKR_FUNCTION_CANCELED" in text or "CANCEL" in text:
        return ERR_USER_CANCELLED
    if "NO PKCS#11 DLL" in text or "NO PKCS11 DLL" in text or "TOKEN DRIVER" in text:
        return ERR_NO_PKCS11_DLL
    return ERR_GENERAL


def to_signer_error(exc: BaseException) -> SignerError:
    """Convert any exception into a SignerError (preserving original as cause)."""
    if isinstance(exc, SignerError):
        return exc
    code = classify_exception(exc)
    return SignerError(code, cause=exc)
