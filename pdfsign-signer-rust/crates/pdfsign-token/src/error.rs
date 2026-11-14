use cryptoki::error::{Error as CkError, RvError};
use thiserror::Error;

/// Stable codes shared with the WPF host / web (same strings as `signer/errors.py`).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorCode {
    PinIncorrect,
    PinLocked,
    PinExpired,
    PinInvalid,
    TokenNotFound,
    TokenRemoved,
    NoCerts,
    CertExpired,
    CertNotYetValid,
    NoPkcs11Dll,
    UserCancelled,
    DeviceError,
    General,
}

impl ErrorCode {
    pub fn as_str(self) -> &'static str {
        match self {
            ErrorCode::PinIncorrect => "PIN_INCORRECT",
            ErrorCode::PinLocked => "PIN_LOCKED",
            ErrorCode::PinExpired => "PIN_EXPIRED",
            ErrorCode::PinInvalid => "PIN_INVALID",
            ErrorCode::TokenNotFound => "TOKEN_NOT_FOUND",
            ErrorCode::TokenRemoved => "TOKEN_REMOVED",
            ErrorCode::NoCerts => "NO_CERTS",
            ErrorCode::CertExpired => "CERT_EXPIRED",
            ErrorCode::CertNotYetValid => "CERT_NOT_YET_VALID",
            ErrorCode::NoPkcs11Dll => "NO_PKCS11_DLL",
            ErrorCode::UserCancelled => "USER_CANCELLED",
            ErrorCode::DeviceError => "DEVICE_ERROR",
            ErrorCode::General => "GENERAL",
        }
    }

    /// Vietnamese user message (same wording as `signer/errors.py`).
    pub fn message_vi(self) -> &'static str {
        match self {
            ErrorCode::PinIncorrect => "Mã PIN không đúng. Cảnh báo: nhập sai nhiều lần có thể khóa token.",
            ErrorCode::PinLocked => "Token đã bị KHÓA do nhập sai PIN quá nhiều lần. Vui lòng dùng phần mềm của nhà cung cấp token để mở khóa (PUK) trước khi ký.",
            ErrorCode::PinExpired => "Mã PIN đã hết hạn và cần được đổi bằng phần mềm của nhà cung cấp token trước khi ký.",
            ErrorCode::PinInvalid => "Mã PIN không hợp lệ (sai định dạng hoặc độ dài). Vui lòng kiểm tra lại.",
            ErrorCode::TokenNotFound => "Không tìm thấy USB token chữ ký số. Hãy cắm token vào máy và thử lại.",
            ErrorCode::TokenRemoved => "Token đã bị rút ra khỏi máy trong quá trình ký. Hãy cắm lại token và thử lại.",
            ErrorCode::NoCerts => "Không tìm thấy chứng thư số trên token. Một số token cần cài/nhập chứng thư bằng phần mềm nhà cung cấp trước khi ký.",
            ErrorCode::CertExpired => "Chứng thư số đã HẾT HẠN nên không thể ký. Vui lòng gia hạn chứng thư với nhà cung cấp.",
            ErrorCode::CertNotYetValid => "Chứng thư số chưa đến thời điểm có hiệu lực nên không thể ký.",
            ErrorCode::NoPkcs11Dll => "Không tìm thấy trình điều khiển (driver PKCS#11) của token trên máy. Hãy cài phần mềm token của nhà cung cấp (Viettel-CA, VNPT-CA, FPT-CA, BKAV-CA, ...).",
            ErrorCode::UserCancelled => "Đã hủy thao tác ký.",
            ErrorCode::DeviceError => "Lỗi thiết bị token. Hãy rút và cắm lại token, hoặc thử cổng USB khác.",
            ErrorCode::General => "Đã xảy ra lỗi khi ký. Vui lòng thử lại.",
        }
    }
}

#[derive(Debug, Error)]
#[error("{code:?}: {detail}")]
pub struct TokenError {
    pub code: ErrorCode,
    pub detail: String,
}

impl TokenError {
    pub fn new(code: ErrorCode, detail: impl Into<String>) -> Self {
        Self {
            code,
            detail: detail.into(),
        }
    }
}

pub type Result<T> = std::result::Result<T, TokenError>;

pub fn classify(rv: RvError) -> ErrorCode {
    match rv {
        RvError::PinIncorrect | RvError::UserNotLoggedIn => ErrorCode::PinIncorrect,
        RvError::PinLocked => ErrorCode::PinLocked,
        RvError::PinExpired => ErrorCode::PinExpired,
        RvError::PinInvalid | RvError::PinLenRange => ErrorCode::PinInvalid,
        RvError::TokenNotPresent | RvError::TokenNotRecognized | RvError::SlotIdInvalid => {
            ErrorCode::TokenNotFound
        }
        RvError::DeviceRemoved => ErrorCode::TokenRemoved,
        RvError::FunctionCanceled => ErrorCode::UserCancelled,
        RvError::DeviceError | RvError::DeviceMemory => ErrorCode::DeviceError,
        _ => ErrorCode::General,
    }
}

impl From<CkError> for TokenError {
    fn from(e: CkError) -> Self {
        let code = match &e {
            CkError::Pkcs11(rv, _) => classify(*rv),
            CkError::LibraryLoading(_) | CkError::MissingSymbol(_) => ErrorCode::NoPkcs11Dll,
            _ => ErrorCode::General,
        };
        TokenError::new(code, e.to_string())
    }
}
